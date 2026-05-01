# KeeperHub keepers — design spec

**Date:** 2026-05-01
**Status:** design (pre-implementation)
**Goal:** finish the lend-intent demo by letting wishd agent recommend, deploy, and manage KeeperHub workflows ("keepers") that act on the user's Compound V3 position via Porto session keys.

---

## 1. Context

- Wishd already supports the lend intent end-to-end (Steps 01–03: WishComposer → CompoundSummary → CompoundExecute). On confirmation, `SuccessCard` already exposes a `keeperOffers` slot — currently stubbed (`comingSoon: true`) for "Auto-compound yield".
- KeeperHub already hosts a working Sepolia auto-compound workflow ("Demo: Auto-Compound COMP Rewards") that claims COMP, swaps to USDC on Uniswap V3, and supplies into the user's Compound V3 position via Porto session keys (EIP-7715). Workflow ID `dtfc9u39mkgq0h3yy5apr` w/ `permissionsId` + `userPortoAddress` placeholders.
- KeeperHub ships RFC-compliant OAuth 2.1 + PKCE + dynamic client registration + scopes (`mcp:read|write|admin`) + refresh tokens. `app/.well-known/oauth-authorization-server`, `app/.well-known/oauth-protected-resource`, `app/oauth/authorize`, `app/api/oauth/{register,token}` all present.
- Wishd is single-tenant: one wishd deployment = one user. No user database, no session IDs. The connected Porto wallet is the chain-side identity; OAuth tokens are server-global.
- `keepers/` directory exists at the wishd repo root, scaffolded for top-level multi-protocol artifacts. v0 ships zero keepers. Keeper type intended to live in `@wishd/plugin-sdk`.

## 2. Goals + non-goals

**Goals (this iteration):**
- Ship `keepers/auto-compound-comp/` as the first verified-tier keeper (port of the existing KH demo workflow).
- Wire it into the lend-intent SuccessCard so users see a real, deployable offer instead of the `comingSoon` stub.
- Deploy = grant Porto session permission (client-side `wallet_grantPermissions`) + create + enable workflow on KH (server, via Agent SDK MCP client).
- Agent decides whether and how to recommend, using a small set of wishd-defined tools layered over the auto-imported KH MCP toolset.
- Reconcile keeper state by reading KH (`list_workflows`) and Porto (`wallet_getPermissions`) at recommendation time — no wishd database.

**Non-goals (deferred):**
- Agent-authored keepers (writing new `keepers/<id>/` from prompts). Stretch only.
- Multi-tenant wishd, user accounts, session management.
- Promotion path (ephemeral KH workflow → committed `keepers/<id>/` PR).
- Liquidation guard, rebalancers, Aave keepers.
- Selector-level Porto permissions (contract-level only for v0; selector when KH supports).
- Custom token store with disk persistence (in-memory for hackathon).

## 3. Architecture overview

```
keepers/auto-compound-comp/         # first verified keeper
  manifest.ts        # KeeperManifest: id, name, version, chains, plugins, trust, appliesTo
  delegation.ts      # DelegationSpec — fixed allowlist + bounds + defaults + expiryPolicy
  workflow.ts        # buildWorkflow(params) → KhWorkflowJson — pure
  addresses.ts       # Sepolia constants
  index.ts           # re-exports { manifest, delegation, buildWorkflow }

packages/plugin-sdk/src/keeper.ts   # types only, no runtime
  Keeper, KeeperManifest, DelegationSpec, PortoPermissionsSpec,
  KhWorkflowJson, WorkflowParams, ExpiryPolicy

apps/web/server/keepers/            # server runtime
  registry.ts        # static imports, exposes keepersForIntent(intentId)
  state.ts           # getKeeperState(keeper, userPortoAddress) — reads KH list_workflows + extracts permissionsId
  agent-tools.ts     # recommend_keeper, inject_keeper_offer, propose_delegation

apps/web/components/wish/
  KeeperDeployFlow.tsx   # modal: review delegation → grant Porto perms → server deploy → confirmed

# Auth: no wishd OAuth code. Agent SDK's MCP client connects to ${KH_BASE}/mcp.
# On 401, SDK does discovery + dynamic registration + PKCE + emits auth URL to agent.
# Agent surfaces URL in chat. User clicks, OAuth completes, SDK retries blocked tool call.
# Token in-memory in SDK MCP client; survives across messages within a server lifetime.
```

### Data + control flow (one demo run)

1. User executes lend intent (Steps 01–03 unchanged).
2. `CompoundExecute` confirms tx → emits `intent.confirmed` event onto StreamBus carrying `{ intent, userPortoAddress, txHash, stepCardId }`.
3. `runAgent.ts` listens; on `intent.confirmed` it pushes a system-routed nudge to the agent: "User just confirmed {intent}. If a keeper makes sense here, recommend it."
4. Agent calls `recommend_keeper(intentId, userPortoAddress)` (wishd tool).
   - Server reads keeper registry → for `compound-v3.lend|deposit`, gets `auto-compound-comp`.
   - Server calls KH `list_workflows`. If KH MCP not yet authorized → 401 → SDK surfaces auth URL → agent emits a chat message: "Connect KeeperHub to continue: [Authorize]" → user authorizes → SDK retries silently → list returns.
   - Server filters by name convention `wishd:auto-compound-comp:{userPortoAddress}` → derives state.
   - Returns `{ keeperId, title, desc, badge, state, permissionsId? }`.
5. Agent (optional) calls `propose_delegation(keeperId, ctx)` → server returns delegation values clamped to bounds.
6. Agent calls `inject_keeper_offer(stepCardId, offer)` → server pushes widget-update event over StreamBus → `SuccessCard` re-renders w/ real offer (replaces stub).
7. Agent emits a one-line chat message: "While we're here — want to auto-compound your COMP rewards weekly?"
8. User clicks `deploy ✦` → `KeeperDeployFlow` modal opens.
9. Modal Step 1 — Review delegation: render decoded contract allowlist + spend cap controls + expiry surface (slider OR "no expiry · revoke anytime" badge depending on `expiryPolicy`). Pre-fill with agent's `propose_delegation` output if present, else `delegation.defaults`. User adjusts within `delegation.bounds`. CTA "Continue →".
10. Modal Step 2 — Grant Porto permission: client calls `wallet_grantPermissions(spec)` w/ values from form → Porto returns `permissionsId`.
11. Modal Step 3 — Deploy on KH: client POSTs `/api/keepers/deploy` w/ `{ keeperId, userPortoAddress, permissionsId, delegation }` → server calls `buildWorkflow({ userPortoAddress, permissionsId })` → KH MCP `create_workflow` → KH MCP `update_workflow` to set trigger.config.enabled=true and root enabled=true → returns `{ workflowId }`.
12. Modal Step 4 — Confirmed: SuccessCard transitions to "auto-compound active ✓" state.

### State reconciliation

Three independent axes:

```
KH workflow:    not_deployed | deployed_disabled | deployed_enabled
Porto perms:    none         | active            | expired | revoked
Net status:     idle | live | needs_perms_regrant | paused | broken
```

Sources:
- KH workflow: `list_workflows` filtered by name convention. Workflow JSON nodes carry `permissionsId` — extract it.
- Porto perms: client-side `wallet_getPermissions({ permissionsId })`, expiry + revocation check.
- Cache: in-memory map `{ userPortoAddress, keeperId } → { state, fetchedAt }` w/ ~30s TTL.

Reconciliation surface in SuccessCard:

| KH state          | Perms         | UI                                                       |
|-------------------|---------------|----------------------------------------------------------|
| not_deployed      | n/a           | offer card → full deploy flow                            |
| deployed_enabled  | active        | "auto-compound active ✓" + "manage" link                 |
| deployed_enabled  | expired/revoked | warning → "re-grant permission" → grant + update_workflow |
| deployed_disabled | active        | "paused" → "resume" → update_workflow enable=true        |
| deployed_disabled | expired/revoked | "broken" → re-grant + patch + enable                   |

## 4. Keeper structure

`keepers/auto-compound-comp/`:

| File          | Responsibility                                                                                                                          |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `manifest.ts` | id, name, description, version, chains, composed plugins, trust tier, `appliesTo[]` (intent IDs that trigger recommendation).            |
| `delegation.ts` | Standalone. Fixed (allowlist + feeToken), bounds (max caps + allowed periods), defaults (starting suggestions), expiryPolicy.           |
| `workflow.ts` | `buildWorkflow(params: WorkflowParams): KhWorkflowJson`. Pure. Substitutes `userPortoAddress` + `permissionsId`. Workflow `name = wishd:{keeperId}:{userPortoAddress}`. |
| `addresses.ts` | Sepolia constants — Comet, COMP, USDC, Uniswap router, CometRewards.                                                                    |
| `index.ts`    | Re-exports `{ manifest, delegation, buildWorkflow }` for registry consumption.                                                          |

### `delegation.ts` shape

```
{
  fixed: {
    calls: Address[],          // immutable allowlist; widening = new keeper version
    feeToken: Address,
  },
  expiryPolicy:
    | { kind: "unlimited" }                       // far-future timestamp; user revokes via Porto
    | { kind: "bounded", maxDays: number }        // user picks within range
    | { kind: "fixed", days: number },            // keeper-author locked
  spend: {
    bounds: Array<{ token: Address; maxLimit: bigint; periods: ("day"|"week"|"month")[] }>,
    defaults: Array<{ token: Address; limit: bigint; period: "day"|"week"|"month" }>,
  },
}
```

For `auto-compound-comp`:
- `fixed.calls`: CometRewards, COMP, Uniswap router, USDC, Comet USDC.
- `expiryPolicy: { kind: "unlimited" }` — auto-compound is naturally indefinite. UI badge: "no expiry · revoke anytime in your Porto wallet". Implementation note: Porto requires uint expiry; "unlimited" maps to far-future sentinel (verify w/ reference impl in `crypto-bro-calls/frontend` during build).
- `spend.bounds`: COMP ≤1000/month, USDC ≤10000/month.
- `spend.defaults`: COMP 100/month, USDC 1000/month.

### Trust boundary

- `fixed.calls` cannot be widened by agent or runtime. Adding addresses requires a new keeper version + review.
- `delegation.bounds` is the hard ceiling. Server `propose_delegation` validator rejects out-of-range agent suggestions (defense against prompt injection).
- User reviews and confirms final values in deploy modal before signing. User signature is the final security gate.

## 5. SDK additions

`packages/plugin-sdk/src/keeper.ts` — types only:

- `Address`, `ChainId`
- `ExpiryPolicy` (discriminated union: `unlimited | bounded | fixed`)
- `PortoPermissionsSpec` — runtime grant shape (allowlist subset, spend, expiry)
- `DelegationSpec` — discriminated union: `porto-permissions | comet-allow`
- `KeeperManifest` — see Section 4
- `KhWorkflowJson` — mirrors KH MCP `create_workflow` input shape: `{ name, description?, nodes, edges }`. Nodes are loose objects, validated server-side by KH.
- `WorkflowParams` — `{ userPortoAddress, permissionsId }` for v0; future per-keeper knobs.
- `Keeper` — `{ manifest, delegation, buildWorkflow, setupWidget? }`.

No runtime, no validation logic in SDK. Helpers (e.g. `defineKeeper`) optional.

## 6. Server runtime

### `apps/web/server/keepers/registry.ts`

- Static imports of each keeper from `keepers/*/index.ts`. Hackathon: explicit list (`[autoCompoundComp]`); replace with glob later.
- `keepersForIntent(intentId): Keeper[]` filters by `manifest.appliesTo`.
- `getKeeperById(id): Keeper | null`.

### `apps/web/server/keepers/state.ts`

- `getKeeperState({ keeper, userPortoAddress }): KeeperState`
  - calls KH MCP `list_workflows` (will block on auth if not authorized — handled by SDK)
  - filters by name = `wishd:${keeper.manifest.id}:${userPortoAddress}`
  - if no match → `{ kind: "not_deployed" }`
  - if match → walks nodes for `config.permissionsId` (any node carrying it) → returns `{ kind: "deployed_enabled" | "deployed_disabled", workflowId, permissionsId }`
- ~30s TTL in-memory cache keyed by `userPortoAddress` + `keeperId`.

### `apps/web/server/keepers/agent-tools.ts`

Three Agent SDK custom tools:

- `recommend_keeper(intentId, userPortoAddress) → KeeperOffer | null` — read-only.
- `inject_keeper_offer(stepCardId, offer) → ack` — pushes widget update over StreamBus.
- `propose_delegation(keeperId, intentContext) → DelegationProposal` — clamps suggestions to bounds.

### `apps/web/app/api/keepers/deploy/route.ts`

POST handler:
1. Validate body: `{ keeperId, userPortoAddress, permissionsId, delegation }`. Re-validate delegation against bounds.
2. Look up keeper. Build workflow JSON via `buildWorkflow({ userPortoAddress, permissionsId })`.
3. Call KH MCP `create_workflow`. Receive `{ workflowId }`.
4. Call KH MCP `update_workflow` w/ patched trigger node `config.enabled=true` (and root `enabled=true` if accepted) — needs empirical verification during impl.
5. Return `{ workflowId }`. Client transitions modal to confirmed state.

## 7. Client

### `apps/web/components/wish/KeeperDeployFlow.tsx`

Modal w/ 4 phases: review → grant → deploy → confirmed.

- Phase "review": render `delegation.fixed.calls` decoded (resolve to human labels via address book — fall back to address); spend cap inputs bounded by `delegation.bounds`; expiry surface keyed off `expiryPolicy` (slider OR "no expiry · revoke anytime" badge OR fixed display); pre-fill from agent's `propose_delegation` output or `delegation.defaults`; rationale string from agent if present.
- Phase "grant": call `wallet_grantPermissions(spec)`; loading state; receive `permissionsId`.
- Phase "deploy": POST `/api/keepers/deploy`; show progress (creating workflow → enabling).
- Phase "confirmed": show summary + close. Triggers SuccessCard re-render via StreamBus update.

### `SuccessCard` changes

- `keeperOffers` source becomes the agent-injected payload (not hardcoded). On confirmed lend, initially empty; agent injects via `inject_keeper_offer` tool. If agent never calls (e.g. KH offline), card silently stays without offers.
- New surfaces for `deployed_enabled`, `deployed_disabled`, `needs_regrant` states.
- `deploy ✦` button opens `KeeperDeployFlow` (replaces current `comingSoon` disabled state).

## 8. Auth (single-tenant via Agent SDK MCP)

- Wishd server boot: register KH as remote MCP server in Agent SDK config (`${KH_BASE}/mcp`, transport `streamable-http`).
- First KH tool call → 401 → SDK does discovery (`/.well-known/oauth-protected-resource` → `/.well-known/oauth-authorization-server`) → dynamic registration via `/api/oauth/register` (or pre-registered `KH_CLIENT_ID` env) → constructs PKCE authorize URL.
- SDK exposes URL to wishd agent runtime instead of opening server-side browser.
- Agent system prompt rule: "If a tool requires authorization, share the auth link clearly with the user and pause."
- User clicks → KH OAuth page → callback → SDK gets token → silently retries blocked tool call.
- Token persists in MCP client memory for wishd server lifetime. Restart → re-auth once.
- Stretch: custom token store hooked into SDK to persist refresh token to disk (`apps/web/.cache/keeperhub.json`).

## 9. Agent system prompt additions

- "Wishd has a `recommend_keeper` tool. After a user's intent confirms (you'll see an `intent.confirmed` system note), call it. If it returns a non-null offer, optionally call `propose_delegation`, then call `inject_keeper_offer` to surface it on the success card. Send a one-line chat message inviting the user to set it up."
- "If a KeeperHub tool requires authorization, post the auth link as a chat message and wait for the user to complete it before retrying."
- "Never widen `delegation.fixed.calls`. Never propose spend caps or expiry outside `delegation.bounds`."

## 10. Testing

- Unit: `buildWorkflow` snapshot tests for `auto-compound-comp` (substitution + naming).
- Unit: `propose_delegation` clamp logic — out-of-range suggestions get rejected.
- Unit: `state.ts` reconciliation — fake KH responses, assert state mapping table.
- Integration: deploy route happy path against KH MCP test instance (or recorded fixtures).
- E2E (manual, hackathon): full lend → recommend → grant → deploy → confirmed loop on Sepolia w/ Porto.

## 11. Open questions / verify during impl

- **`update_workflow` enable.** `create_workflow` schema has no `enabled` flag. Demo workflow JSON shows `enabled: false` at root + on trigger node `config`. Confirm `update_workflow` w/ patched trigger node actually flips it on. If not, may need a different KH endpoint.
- **Porto `wallet_grantPermissions` shape.** Spec ↔ Porto SDK input mapping. Reference impl exists in `crypto-bro-calls/frontend` — port the mapper.
- **"Unlimited" expiry.** Porto/EIP-7715 typically requires uint expiry. Verify far-future sentinel (year 2100? uint64-max?) against reference.
- **Agent SDK pending-auth event surface.** Verify the API for "MCP tool blocked on auth" emission. Anthropic Agent SDK docs.
- **SDK redirect URI.** Whether SDK runs an internal listener or wishd hosts callback. Determines what URI to register w/ KH.
- **KH `/mcp` server-to-server.** Confirm public endpoint accepts non-claude-code MCP clients via OAuth. Should — RFC 9728 metadata route exists.
- **Selector-level Porto perms.** Out for v0, contract-level only.

## 12. Out of scope (post-hackathon)

- Agent-authored ephemeral keepers (write `keepers/<id>/`, deploy via MCP).
- Promotion path (ephemeral → committed PR).
- Multi-tenant wishd.
- Custom token persistence (disk).
- Liquidation guard, Aave, rebalancers.
- "My automations" tab — list/pause/disable across keepers.
- `deploy_template` optimization (publish master template on KH, clone per user).

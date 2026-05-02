# Resume brainstorm — wishd post-execution UX + multi-agent vision

> Paste the block below into a fresh Claude Code session at the wishd repo root. It loads context, sets scope, and invokes the brainstorming skill.

---

I want to brainstorm the next iteration of wishd's UX and agent architecture. We just merged the KeeperHub keepers feature (39 commits, branch `worktree-keeperhub-keepers` → `main`). Before drilling into details, please:

1. Read `CLAUDE.md` if present.
2. Read `docs/superpowers/specs/2026-05-01-keeperhub-keepers-design.md` and skim `docs/superpowers/plans/2026-05-01-keeperhub-keepers.md` (just to know what was shipped — do not re-implement).
3. Inspect the just-merged commit `81792d9` and the keeper-related files: `keepers/auto-compound-comp/`, `apps/web/server/keepers/`, `apps/web/components/wish/Keeper*.tsx`, `apps/web/server/systemPrompt.ts` (canonical flows A–G), `apps/web/widgetRegistry.ts`.
4. Use the `superpowers:brainstorming` skill — invoke it before asking any clarifying questions.

## What is shipped (so you don't propose re-doing it)

- `keepers/auto-compound-comp/` — workspace package (manifest, delegation w/ fixed allowlist + spend bounds, KhWorkflowJson builder for hourly claim → swap COMP→USDC → supply on Compound V3 Sepolia, runs via Porto session keys).
- Server keeper runtime: `registry`, `getKeeperState` (now uses semantic match on node config — finds non-wishd-named workflows), `proposeDelegation` clamp, three Agent SDK tools `recommend_keeper` / `propose_delegation` / `inject_keeper_offer` exposed via inline MCP server `mcp__wishd_keepers__*`.
- KeeperHub MCP wired via the official `@modelcontextprotocol/sdk` Streamable HTTP client (proper `initialize` + `mcp-session-id` handshake). Token persistence keyed on `globalThis` to survive Next dev HMR.
- Own OAuth 2.1 PKCE + RFC 7591 dynamic client registration client for KeeperHub (`apps/web/server/keepers/khOAuth.ts`, `kh-auth/start`, `kh-callback`). Surfaces an in-app `KeeperhubAuthCard` widget when `recommend_keeper` catches `KhUnauthorizedError`. After approve, popup posts back, widget re-dispatches a `wishd:wish` event to retry flow G.
- `KeeperDeployFlow` modal: review → grant (Porto `wallet_grantPermissions`) → deploy (`/api/keepers/deploy` calls KH `create_workflow` then `update_workflow` to enable) → confirmed.
- `SuccessCard` renders keeper offers; surfaces `active ✓` / `paused` / `deploy ✦` based on `state.kind`.
- Canonical flow G in system prompt: post-execution recommendation triggered by `context.confirmed === true`. Auth handled silently (no chat URLs).
- Two recent fixes (already in): modal opacity (`bg-surface-1` → `bg-surface`); semantic workflow matching so existing demo workflows count as deployed.

## My (kirill's) vision (don't lose this)

> Replace Claude Code for non-technical users. Make UI/UX smoother. Funds stay in the user's browser wallet (Porto session keys, never on server). The agent is **truly personal — it evolves with the user**. Where Claude Code requires installing MCPs, writing custom subagents, and chatting with the model, wishd should hide all of that and present a single concierge persona that grows with you.

User-quoted situations to design for:

- User has no workflow + no permissions → first-time deploy.
- User has workflow deployed but Porto permissions expired or insufficient for the new amount they just deposited → raise/regrant.
- User has workflow deployed and permissions are sufficient → just show "active", that's all.
- User wants to **create a new workflow and discuss it** with the agent → free-form conversation, agent helps shape the workflow.
- User wants to **ask about all workflows deployed** → conversational query, summarized response.

User instinct: a **chat component, possibly a sidebar**, that the user can invoke any time. Possibly a **separate kind of agent (concierge)** that routes to specialized sub-agents (strategy / execution / keeper-mgr / portfolio / education).

## Brainstorm scope (multi-subsystem — please decompose)

The vision spans more than one spec. I think the subsystems are:

1. **Keeper offer state machine** — full enumeration: `not_recommended`, `not_deployed`, `deployed_active_sufficient`, `deployed_active_insufficient_for_amount`, `deployed_active_expiring`, `deployed_paused`, `deployed_no_permissions` (revoked), `deployed_orphaned` (stale permissionsId not in Porto). Each → its own SuccessCard surface or inline chat affordance. Detection split: server reads workflow state via KH MCP; **client cross-checks Porto `wallet_getPermissions`** because the server can't query the browser wallet.
2. **Sidebar conversational agent** — persistent chat dock. Free-form: "what workflows do I have?", "create a new one", "raise my COMP cap to 200/month", "why did keeper X fail?". Wizard becomes one of N affordances inside the chat, not the sole entry. Cards/widgets render inline in chat or pop into the workspace per intent.
3. **Multi-agent dispatcher** — concierge top-level + specialists (strategy / execution / keeper-mgr / portfolio / education). Concierge routes via a dispatch tool, synthesizes responses. Solves system-prompt brittleness: today a single prompt does flows A–G; this grows unboundedly per feature. Specialists keep prompts focused.
4. **Personal evolving memory** — anchored to wallet address, server-side, signed-message auth. Captures: risk tone, asset preferences, time patterns, stated goals, conversation history. Brought into agent context per turn. User-visible "what I know about you" panel; editable.
5. **Browser-wallet custody guarantees + multi-tenancy** — server never holds keys. Currently MCP tokens (KH OAuth etc.) are single-tenant in-memory on `globalThis`. Multi-user requires per-wallet token store keyed by signed message proving wallet ownership. (Adjacent to memory — same auth primitive.)

## Recommended order to brainstorm

1. **B1 + B2 together** — state machine + sidebar agent. They co-design: state surfaces become entry points TO chat ("manage", "raise cap"). State machine without chat forces every divergent state into a static UI — proliferation. Chat handles edge cases verbally and escalates to widgets when structure helps. **Start here.**
2. B3 multi-agent dispatcher — emerges from B2's prompt growth. Don't pre-build until B2 prompt sprawls.
3. B4 + B5 memory + multi-tenancy together — both need wallet-signed auth.

## Open questions that should be resolved before code

- Where does the sidebar chat live in the layout? Persistent right-rail, or invokable from a single FAB? (Affects mobile.)
- Does the chat replace the wizard or coexist? If coexist, what's the bridge? (Likely chat triggers wizard widgets; wizard widgets emit events back to chat.)
- For state cross-check (Porto permissions), does the SuccessCard already mounted have access to a wagmi connector to call `wallet_getPermissions` on every render, or do we cache the result?
- Concierge model size — Haiku 4.5 (current) is fine for routing; specialists could vary by task. Cost tradeoff?
- Memory storage — DB choice for multi-tenant? Postgres on the existing stack? KV?
- Auth primitive — SIWE (sign-in with Ethereum) for wallet-bound session cookie? Or keep `wagmi.store` cookie alone?
- For the "raise cap to N" conversational flow, do we re-grant Porto permissions in-place, or revoke + regrant? Porto's `wallet_grantPermissions` semantics matter.

## Deliverable I want from this session

- One brainstorm conversation
- One spec written to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` covering B1+B2 (or whatever scope we land on)
- Then transition to writing-plans to produce the implementation plan

Use the `superpowers:brainstorming` skill end-to-end. Don't write code yet. Decompose the scope, ask one clarifying question at a time, propose 2–3 approaches, then present the design.

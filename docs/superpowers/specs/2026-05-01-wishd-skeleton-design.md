# wishd — v0 Skeleton Design

**Date:** 2026-05-01
**Status:** Draft (pending user review)
**Scope:** Minimal end-to-end skeleton that proves agent → dynamic widget → wallet → chain pipeline, plugin-shaped from day one. Single user story, single plugin, single chain. Forward-compat primitives baked in to avoid retrofits.

## Goal

Ship a vertical slice of "defi by wishing it" that:

1. User opens app, types or picks a wish ("deposit 10 USDC into Compound on Sepolia").
2. Agent (Claude Agent SDK) parses intent, calls a plugin MCP tool, emits a workspace widget over SSE.
3. Widget renders, owns its own state machine via wagmi (Connect → Switch → Approve → Approving… → Deposit → Depositing… → Confirmed). Agent is not in the loop for clicks.
4. UX matches the existing prototype's single-column, step-card aesthetic.

The skeleton is the load-bearing seam for everything later: more plugins, Mode B (insights/analytics), persistent panels, onboarding-as-wish, reflection, KeeperHub. None of those ship in v0; all are additive on this backbone.

## Non-goals (v0)

- No memory, skills, reflection, Stop hooks
- No KeeperHub deploys (the keeper SDK type ships in plugin-sdk, but no keeper folder)
- No persistent panels, onboarding flow, analytics widgets
- No tool routing / dynamic plugin activation
- No more than one plugin (compound-v3 only)
- No more than one chain (Sepolia only; fallback to Base Sepolia if Porto connector fails)
- No bidirectional widget→agent events (SSE one-way only)

## Architecture (five layers, only L0–L2 implemented)

- **L0 shell** — Next.js App Router page. Single-column 760px layout matching the prototype. Owns no dynamic content.
- **L1 workspace** — list of widget instances (`WidgetInstance[]`), rendered top-to-bottom. Reads from Zustand store. Looks up React component in widget registry. v0 only ever uses one slot (`"flow"`); type carries `slot` field for future use.
- **L2 widget internals** — plugin-owned React components running their own state machine via wagmi hooks. Agent does not micro-manage clicks.
- **L3 profile** — *not implemented*. Reserved file path `users/<id>/CLAUDE.md`. System prompt builder will read-if-present, ignore if absent (one try/catch).
- **L4 events** — *not implemented*. Reserved SSE event `notification.*` for future KeeperHub run notifications.

## Process boundaries

- **Browser:** Next.js 15 + React 19 + TS + Tailwind. wagmi v2 + viem v2 + Porto connector. Widget registry merged from plugins at build time. fetch+ReadableStream consumes SSE from `/api/chat`.
- **Next.js API route `/api/chat`:** SSE endpoint. Spawns `query()` from `@anthropic-ai/claude-agent-sdk` per request. Loads plugins via the loader, builds `mcpServers` map, runs the agent loop, streams typed events.
- **Plugin runtime (in-process MCP servers):** each plugin exports `createSdkMcpServer(...)` factory. Same Node process — zero IPC. Plugins also export React widgets imported by the client bundle.
- **No WebSocket, no separate gateway, no separate process.** Agent → browser SSE only. Sign actions handled inside the widget against Porto/wagmi locally; no agent round-trip per click.

## Plugin-shape (concrete types ship in v0)

`packages/plugin-sdk/src/index.ts` exports:

- `definePlugin(p: Plugin): Plugin` — passthrough
- `defineKeeper<T>(k: Keeper<T>): Keeper<T>` — passthrough (no keeper ships in v0; type is reserved so adding `keepers/auto-compound-comp/` later is a drop-in)
- Types: `Manifest`, `Plugin`, `Keeper`, `KhWorkflowJson`, `DelegationSpec` (`comet-allow` | `porto-permissions`), `PluginCtx`, `TrustTier` (`"verified" | "community" | "unverified"`), `ServerEvent`

`ServerEvent` union — SSE event vocabulary. v0 only emits `chat.delta`, `tool.call`, `ui.render`, `result`, `error`. Reader handles all listed variants from day one to avoid retrofit:

```ts
export type ServerEvent =
  | { type: "chat.delta"; delta: string }
  | { type: "tool.call"; name: string; input: unknown }
  | { type: "ui.render"; widget: { id: string; type: string; slot?: WidgetSlot; props: unknown } }
  | { type: "ui.patch"; id: string; props: Record<string, unknown> }
  | { type: "ui.dismiss"; id: string }
  | { type: "notification"; level: "info" | "warn" | "error"; text: string }
  | { type: "result"; ok: boolean; cost?: number }
  | { type: "error"; message: string };

export type WidgetSlot = "flow" | "results" | "pinned" | "panel";
```

Keepers (`Keeper<TParams>`) declare `manifest.plugins: string[]` so they live at top-level `keepers/<id>/` and can compose multiple protocols. Type is exported in v0; no keeper folder is built.

## Compound-v3 plugin (the only plugin shipped)

```
plugins/compound-v3/
├── package.json
├── index.ts                  # exports plugin (definePlugin) + widgets re-export
├── manifest.ts
├── addresses.ts              # per-chain (Sepolia: USDC, cUSDCv3, CometRewards, COMP)
├── abis/
│   ├── erc20.ts
│   └── comet.ts
├── prepare.ts                # prepareDeposit({ amount, user, chainId }) → { calls, meta }
├── mcp/
│   └── server.ts             # createSdkMcpServer({ name:"compound", tools:[prepare_deposit] })
└── widgets/
    ├── CompoundSummary.tsx   # Step 02 — materialized preview
    └── CompoundExecute.tsx   # Step 03/04 — state machine + terminal confirmed phase
```

Sepolia addresses (verified in `crypto-bro-calls/project-docs/keeperhub-workflow.md`):
- USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- cUSDCv3 (Comet): `0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e`
- chainId: `11155111`
- (CometRewards `0x8bF5b658bdF0388E8b482ED51B14aef58f90abfD`, COMP `0xA6c8D1c55951e8AC44a0EaA959Be5Fd21cc07531` — declared for the future auto-compound keeper, unused by v0 deposit flow.)

`prepare.ts` reads `allowance(user, comet)` via a viem public client and returns:

```ts
{
  calls: [
    // present only when needsApprove:
    { to: USDC, data: encodeFunctionData({abi:erc20, functionName:"approve", args:[COMET, MAX_UINT256]}), value: "0x0" },
    { to: COMET, data: encodeFunctionData({abi:comet, functionName:"supply", args:[USDC, amountWei]}), value: "0x0" }
  ],
  meta: { needsApprove: boolean, amountWei: hex, asset: "USDC", market: "cUSDCv3" }
}
```

`mcp/server.ts` exposes one tool `prepare_deposit({ amount: string, user: 0x..., chainId: number })`. Returns the prepared object as a `text` content block (JSON-stringified).

### CompoundSummary widget (Step 02)

Read-only materialized preview. Props: `{ amount, asset, market, needsApprove, gasEstimate?, summaryId }`. Renders inside a `<StepCard>` with badge "STEP 02", title from a labels map (`"your supply, materialized"`), and a primary "execute" button. Clicking "execute" POSTs to `/api/chat` with a follow-up wish (`"execute deposit ${summaryId}"`), which causes the agent to emit `CompoundExecute`.

### CompoundExecute widget (Step 03 → 04)

The L2 state machine using:
- `useAccount()` — `address`, `isConnected`, `chainId`
- `useConnect()` — Porto connector
- `useSwitchChain()`
- `useReadContract()` — live `allowance(user, comet)`
- `useSendCalls()` + `useWaitForCallsStatus()` — submit + track

Single button label flips through `Connect Wallet` / `Switch Network` / `Approve` / `Approving…` / `Deposit` / `Depositing…` / `Confirmed (n)`. If `allowance >= amountWei` at click time, sends supply call only. Else sends approve, waits, re-reads allowance, then user clicks again to send supply (stepwise, not a hidden batch).

Internal `phase` state machine: `"connect" | "switch-chain" | "approve" | "approving" | "deposit" | "depositing" | "confirmed" | "error"`. Transitions driven by wagmi hook outputs. Terminal `confirmed` phase replaces button area with tx hash + n confirmations link to Sepolia Etherscan. Visually mirrors the prototype's Step 04 "complete" card. Same widget instance, different phase — no separate Step 04 widget in v0.

## Generic widget-renderer MCP (lives in app, not in any plugin)

`apps/web/server/mcps/widgetRenderer.ts` — `createSdkMcpServer({ name:"widget", tools:[render] })`:

```ts
tool(
  "render",
  "Render a widget into the user workspace. Use AFTER preparing data with a plugin tool.",
  {
    type: z.string().describe("Widget type, e.g. compound-summary, compound-execute"),
    props: z.record(z.any()).describe("Props for the widget."),
    slot: z.enum(["flow","results","pinned","panel"]).optional().default("flow"),
  },
  async (args) => {
    const id = crypto.randomUUID();
    emit({ type: "ui.render", widget: { id, type: args.type, slot: args.slot, props: args.props } });
    return { content: [{ type: "text", text: `rendered ${args.type} as ${id}` }] };
  }
);
```

Plugin-agnostic. One channel for L1 updates.

## Decimals — single source of truth

`apps/web/lib/tokens.ts`:

```ts
export const TOKENS = {
  "11155111": {
    USDC: { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", symbol: "USDC", decimals: 6 } as const,
  },
} as const;
```

`apps/web/lib/amount.ts`:

```ts
import { parseUnits, formatUnits } from "viem";
export const toWei   = (h: string, t: { decimals: number }) => parseUnits(h, t.decimals);
export const fromWei = (w: bigint, t: { decimals: number }) => formatUnits(w, t.decimals);
```

No bare `6` / `18`, no `* 10n ** 18n`. Plugin's `prepare.ts` calls `toWei(amount, TOKENS[chainId].USDC)`. Widget reads the same registry to format displays.

## Repo layout

```
wishd/
├── pnpm-workspace.yaml             # apps/*, packages/*, plugins/*, keepers/*
├── tsconfig.base.json
├── package.json
├── README.md
├── .env.local.example              # ANTHROPIC_API_KEY=
├── prototype/
│   └── wishd-intent.html           # existing visual reference (untouched)
├── apps/
│   └── web/
│       ├── app/
│       │   ├── api/chat/route.ts
│       │   ├── layout.tsx
│       │   ├── providers.tsx
│       │   ├── page.tsx
│       │   └── globals.css         # imports prototype CSS variables + fonts
│       ├── components/
│       │   ├── wish/WishComposer.tsx
│       │   ├── wish/EventStream.ts
│       │   ├── workspace/StepStack.tsx
│       │   └── primitives/StepCard.tsx
│       ├── widgetRegistry.ts
│       ├── store/workspace.ts
│       ├── lib/
│       │   ├── wagmi.ts
│       │   ├── tokens.ts
│       │   └── amount.ts
│       ├── server/
│       │   ├── runAgent.ts
│       │   ├── systemPrompt.ts
│       │   ├── pluginLoader.ts
│       │   └── mcps/widgetRenderer.ts
│       ├── tailwind.config.ts
│       ├── next.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── plugin-sdk/
│       ├── src/index.ts            # definePlugin, defineKeeper, types
│       ├── package.json
│       └── tsconfig.json
├── plugins/
│   └── compound-v3/
│       ├── index.ts
│       ├── manifest.ts
│       ├── addresses.ts
│       ├── abis/{erc20.ts,comet.ts}
│       ├── prepare.ts
│       ├── mcp/server.ts
│       ├── widgets/{CompoundSummary.tsx, CompoundExecute.tsx}
│       ├── package.json
│       └── tsconfig.json
└── keepers/
    └── README.md                   # explains keeper artifact shape; v0 ships zero
```

Path aliases: `@/...` for app, `@plugins/...` for plugins, `@keepers/...` for keepers, `@plugin-sdk` for the SDK.

## Frontend layout (matches prototype)

Single column, max-width 760px, cream/peach palette. Lifted from `prototype/wishd-intent.html`:
- CSS custom properties (`--bg`, `--surface`, `--ink`, `--accent`, `--mint`, etc.)
- Fonts: Plus Jakarta Sans (UI), Caveat (logo), JetBrains Mono (numerics)
- Step-card structure: badge, title, status pill, sub, body
- Background gradients

Components:
- `<StepCard>` — shared primitive. Props: `step` (badge label e.g. "STEP 02"), `title`, `status`, `sub`, `children`, `phase` (`"locked"|"in-progress"|"complete"`).
- `<WishComposer>` — always-mounted at top. Action chips (swap/lend/borrow/earn/bridge/find-vault) + free-text input. Only "lend" is wired to a working flow in v0; the other chips are rendered visibly disabled with a "coming soon" tooltip. On submit: POST to `/api/chat`.
- `<StepStack>` — reads `workspaceWidgets` from store filtered by `slot === "flow"`, renders each via widget registry, ordered by `createdAt`.

Agent narration appears as the `sub` line of each emitted step-card. No separate chat pane.

## Agent orchestration (v0)

System prompt encodes the canonical sequence for the deposit-into-Compound intent:

> You are a DeFi assistant on Sepolia. Tools available: `mcp__compound__prepare_deposit`, `mcp__widget__render`.
>
> For "deposit/lend/supply X USDC into Compound" intents:
> 1. Call `prepare_deposit({amount, user, chainId})`.
> 2. Call `widget.render({type:"compound-summary", props:{...prepared, summaryId}})`.
> 3. Emit one short narration line.
>
> For "execute deposit <summaryId>" follow-up wishes (sent by the summary widget's execute button):
> 1. Call `widget.render({type:"compound-execute", props:{...preparedFromContext}})`.
> 2. Emit one short narration line.
>
> Stop after rendering. The widget owns the rest.

Two agent emissions per wish. SSE one-way is sufficient — both transitions are user-initiated POSTs.

## Forward-compat primitives baked into v0

Cheap to add now (~30 LoC), expensive to retrofit:

1. **Workspace as a list with slots.** `workspaceWidgets: WidgetInstance[]` where `WidgetInstance = { id, type, slot, props, createdAt }`. v0 only ever appends to `slot === "flow"`. Adding a positions panel later is `setWorkspaceWidgets(prev => [...prev, panel])` — no refactor.
2. **Event protocol covers `ui.render | ui.patch | ui.dismiss`.** Reader dispatches all three even though v0 agent only emits `ui.render`.
3. **Profile path reserved.** `apps/web/server/systemPrompt.ts` reads `users/<id>/CLAUDE.md` if present, ignores if absent. No directory created in v0.

## Verification

Manual end-to-end on Sepolia:

1. `pnpm i && pnpm --filter web dev`. Open `http://localhost:3000`.
2. Connect Porto. Account funded with Sepolia ETH + USDC.
3. Type or pick: "deposit 10 USDC into Compound on Sepolia."
4. `WishComposer` POSTs. Agent runs.
5. Step 02 card appears: "your supply, materialized" — amount=10 USDC, market=cUSDCv3, "execute" button.
6. Click "execute". Step 03 card appears below: "execute" with state-machine button.
7. Disconnect → "Connect Wallet". Reconnect.
8. Wrong chain → "Switch Network" works.
9. Allowance is 0 → "Approve". Click. Approving… → button flips to "Deposit".
10. Click "Deposit". Depositing… → terminal phase: "Confirmed (n)" + tx hash linking to Sepolia Etherscan.
11. Refresh, repeat with allowance > 0 → Approve step skipped.
12. Visual check: each step-card matches prototype's typography, palette, badge layout.

Plugin-shape sanity:
- Add `plugins/null-protocol/` with manifest, no-op MCP, one trivial widget. Register in loader + registry. App builds + behaves identically.

Failure modes to spot-check:
- Wrong chain → Switch button works.
- Insufficient USDC → tx error surfaces inside widget; agent loop unaffected.
- `ANTHROPIC_API_KEY` missing → server emits `error` SSE frame; UI surfaces in-card.
- Porto connector refuses Sepolia → switch to Base Sepolia (one-line config change; `addresses.ts` already keys by chainId).

## Open risks

- Porto wagmi connector on Ethereum Sepolia — confirmed for Base Sepolia in their example, not yet verified on Ethereum Sepolia. First action during wagmi setup: spike. Fallback: Base Sepolia.
- Streaming SDK messages → SSE: small adapter mapping `assistant` partials → `chat.delta`, `tool_use` → `tool.call`, tool-result-driven `ui.render` events emitted from the widget MCP via captured `emit`. Watch ordering; flush after every event.
- In-process MCPs in Next.js dev mode: HMR may double-instantiate. Construct MCPs per-request inside the route handler (not module-scope) to avoid leaks.
- Summary→Execute round-trip via follow-up POST: agent must have access to the prepared call data in turn 2. Solutions in priority order: (a) `summaryId` keyed in a server-side request-scoped Map populated when `prepare_deposit` runs; (b) widget posts the full `prepared` payload back in the follow-up wish body. Pick (a) first; (b) is fallback.

---

## Appendix A — Scaling notes (NOT built in v0)

Mental model from brainstorming. Recorded so future-you doesn't lose the thread. Do not implement any of this in v0.

### Two product modes

| | Mode A — Wish/Action | Mode B — Living surfaces |
|---|---|---|
| Examples | deposit, swap, bridge, borrow | "show whale flows", positions, alerts, KH execution feed |
| Lifecycle | start → execute → end | open-ended, may persist or update |
| v0 scope | yes (compound deposit) | no |

### Three widget classes

| Class | Lifecycle | Slot |
|---|---|---|
| Action widgets | ephemeral, 4-phase | `"flow"` |
| Insight widgets | one-shot result, optionally re-runnable | `"results"` or `"pinned"` |
| Persistent panels | always mounted, react to events | `"panel"` |

The slot field on `WidgetInstance` exists from day one to make adding (2)/(3) a non-event.

### Onboarding as just another wish

First-launch state: agent's system prompt sees "no profile yet" → emits `welcome-onboarding` widget. Widget asks 3–4 questions: experience, risk, wallet address (read-only, for analysis), notification prefs. Submitting calls an MCP tool that:
- Writes initial `users/<id>/CLAUDE.md`
- If wallet provided, kicks a background subagent to analyze last 90 days via Dune + Blockscout, appends to profile
- Mounts default persistent panels (positions, alerts)

Same primitives. No special-cased flow. Re-runnable.

### Reflection (Hermes minimal)

- Per-session reflection: `Stop` hook fires a subagent that reads the session log + profile, appends preference updates to `users/<id>/CLAUDE.md`. One Claude call per session.
- Weekly digest reflector (later): scheduled remote agent scans logs, refactors profile, prunes redundancy.

### Tool sprawl (when plugin count >> 1)

Three layered strategies:

1. **Manifest gating** — system prompt only loads tools from plugins relevant to user's chain + profile + recent intent. Cuts 60–80% tool tokens.
2. **Dynamic activation** — meta-tool `discover_plugins(keywords)` + `activate_plugin(name)` attaches MCP for next turn.
3. **Skill markdown** — long-form how-tos on disk. `read_skill(topic)` retrieves on demand. RAG-light. Already in plugin-sdk type as `Plugin.skills?: Record<string, string>`.

### Bidirectional widget→agent events

When Mode B widgets need to ping the agent ("re-run", "alert me if X"), add `/api/event` POST endpoint that resumes the same agent session. SSE one-way still suffices for emission. No WebSocket needed unless agent-initiated mid-flow prompts arrive.

### Auto-compound-comp keeper (first multi-protocol composition)

Add `keepers/auto-compound-comp/`:
- `manifest.ts` with `plugins: ["compound-v3","uniswap-v3"]`, `chains: [11155111]`
- `workflow.ts` — `buildWorkflow(params)` returns `KhWorkflowJson` (drafted in `crypto-bro-calls/project-docs/keeperhub-workflow.md`)
- `delegation.ts` — `{ kind: "comet-allow", comet, manager: KH_TURNKEY_ADDR }`
- `widgets/AutoCompoundSetup.tsx` — walks user through approve → supply → allow(KH) → "Deploy workflow"

Requires a sibling `plugins/uniswap-v3/` plugin. Compound plugin needs zero edits.

### Generic `keeperhub` MCP

`apps/web/server/mcps/keeperhub.ts` wraps hosted KH MCP (`mcp__keeperhub__create_workflow` etc.). Tools: `deploy({keeperId, params, delegationProof})`, `list`, `status`, `revoke`. Only built when first keeper ships.

## Appendix B — Critical references

- `prototype/wishd-intent.html` — visual language source of truth
- `porto/examples/next.js/src/app/{config.ts,providers.tsx,page.tsx}` — wagmi+Porto setup, `useConnect`, `useSendCalls`, `useWaitForCallsStatus`
- `porto/examples/permissions/src/{config.ts,App.tsx}` — session-key (`grantPermissions`) shape (reference only, not used v0)
- `crypto-bro-calls/frontend/app/compound-deposit/page.tsx:19-22, 29-77, 247-293` — addresses, ABI fragments, allowance/approve/supply flow. Lift carefully; **discard** the hardcoded-decimals smell (line 251 `parseUnits(amount, 6)`, line 417 `* 1e12`)
- `crypto-bro-calls/project-docs/keeperhub-workflow.md` — full keeper node graph + KH gotchas
- `crypto-bro-calls/project-docs/demo-flow.md` — higher-level setup-and-monitor UX for future keeper widget
- `keeperhub/plugins/{web3,uniswap,compound,protocol}/steps/*-core.ts` — authoritative input-schema source for KH actions
- Claude Agent SDK: `query()`, `createSdkMcpServer`, `tool()`, `allowedTools` wildcards, `permissionMode: "bypassPermissions"`, `mcp_servers` system-init verification

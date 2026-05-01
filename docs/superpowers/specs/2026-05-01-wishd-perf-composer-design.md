# wishd — Perf Patch + Structured Composer Design

**Date:** 2026-05-01
**Status:** Draft (pending user review)
**Scope:** Cut click-to-visible latency from ~29s to under 3s (perceived) and ~1–2s (real on the hot path) by introducing a structured intent composer with a deterministic server-side prepare path, while keeping the LLM agent in the loop as a parallel narrator. Establishes the registry seam that v0.2 self-extension will write into.

## Problem

The v0 skeleton (merged at `main` `5d72587`) takes ~29s from chip click to visible Step 02 widget. Three Anthropic API turns (ToolSearch → `prepare_*` → `widget.render`) plus per-turn roundtrip dominate. Sepolia RPC is negligible. Users abandon before feedback. Defeats the "feels magical" pitch and hides successful server-side execution behind a quiet spinner.

## Goal

Two latency targets, both under 3s:

| Path | Click-to-skeleton | Click-to-hydrated widget |
|---|---|---|
| Composer (structured intent) | ~50ms | ~1–2s (RPC + prepare only) |
| Free-text wish | ~50ms | ~5–7s (Haiku full agent loop) |

Plus one architectural target: introduce an **intent schema registry** as the seam that v0.2 will use for agent self-extension (e.g., agent learns Morpho → registers a Morpho schema → composer grows a new option). Don't *build* self-extension; build the seam it plugs into.

## Non-goals

- Not adding more plugins. Compound-v3 stays the only plugin (deposit + withdraw only).
- Not adding more chains. Sepolia only.
- Not building agent self-extension, plugin generation, schema generation. v0.2.
- Not building Mode B insight widgets, persistent panels, reflection. Unchanged from v0 spec.
- Not removing the free-text path. It remains the escape hatch and the "agent dispatches widgets" demo surface.
- Not introducing parallel tool calls, warm SDK sessions, or multi-agent routing. Reserved for higher plugin counts per Appendix A of the v0 spec.

## Relationship to v0 spec Appendix A

This spec **does not contradict** Appendix A. It anchors three of its concepts to a concrete v0.1 surface:

- **Mode A action widgets.** Composer + fast path is the canonical Mode A flow. Lifecycle (`prepare → review → execute → result`) is unchanged; only the *trigger* of the prepare phase moves out of the agent.
- **Tool sprawl mitigation.** The intent registry is the v0.1 progenitor of "manifest gating" (§Tool sprawl). Plugins declare both their tools *and* their intent schemas; the composer reads schemas.
- **Onboarding-as-wish, KH workflows, etc.** Unaffected. Free-text path remains for non-registered intents and is the substrate those features will land on.

Self-extension (the long-term punchline: "agent extends itself to Morpho") is explicitly Appendix-A-aligned: it becomes "agent generates a new `IntentSchema` + plugin scaffold and registers them." Out of scope for this spec.

## Architecture changes

### New: `IntentSchema` in `packages/plugin-sdk`

A schema describes everything the composer and the fast-path route need to render and prepare an intent without involving the agent.

```ts
export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset";  required?: boolean; default?: string; options: string[] }
  | { key: string; type: "chain";  required?: boolean; default: string;  options: string[] };

export type IntentSchema = {
  /** Plugin-namespaced id, e.g. "compound-v3.deposit". */
  intent: string;
  /** Composer label / verb, e.g. "deposit", "withdraw". Maps to prototype's action dropdown. */
  verb: string;
  /** Sentence-case description used in dropdown row, e.g. "supply tokens to earn yield". */
  description: string;
  /** Ordered list of fields rendered after the verb, prototype-style: `I want to [verb] [amount] [asset] on [chain]`. */
  fields: IntentField[];
  /** Widget name passed to `ui.render` / mounted by the registry. */
  widget: string;
  /** Slot for forward-compat. v0.1 always "flow". */
  slot?: WidgetSlot;
};
```

`Plugin` gains an `intents?: IntentSchema[]` field. `compound-v3` exports two: `compound-v3.deposit` and `compound-v3.withdraw`. Both have a single `amount` field (asset = USDC fixed, chain = ethereum-sepolia fixed) — the field array is short, but the *shape* matches the prototype's general layout so adding a future plugin (e.g., a swap plugin) doesn't require composer changes.

The registry is assembled at `apps/web` boot by reading `plugin.intents` from each loaded plugin and flattening to a single `IntentSchema[]` exported alongside the existing widget/MCP loader output.

### New: `/api/prepare/[intent]` server route

A Next.js route handler that bypasses the agent entirely. Request body matches the schema's `fields` shape:

```
POST /api/prepare/compound-v3.deposit
{ "amount": "100", "asset": "USDC", "chain": "ethereum-sepolia", "address": "0x..." }
→ 200
{ "prepared": { ...same payload as today's mcp__compound__prepare_deposit returns... },
  "widget":   { "id": "w_…", "type": "compound-deposit", "slot": "flow", "props": {...} } }
```

Implementation: dispatch table keyed by `intent` string → calls existing plugin `prepareDeposit` / `prepareWithdraw` functions directly (already pure Node, no MCP wrapping). The same functions the MCP tool currently wraps. Zero new business logic; this route is a thin HTTP shell.

Errors map to 400 (validation), 422 (insufficient balance, etc.), 502 (RPC failure). Validation uses the schema's `fields` definition so adding a field never requires route changes.

### Client: structured composer in `WishComposer`

The composer adopts the prototype's full Step 01 layout (`prototype/wishd-intent.html` lines 763–800):

- Inline single-row form: **`I want to [action dropdown] [amount input] [asset chip] on [chain chip]`**.
- Action dropdown is rendered from `IntentSchema[]` registry — one row per schema, `verb` + `description`. v0.1 ships with two rows (deposit, withdraw). Empty-state CTA reads "pick an action — we pre-fill the rest".
- Selecting an action collapses the form to the schema's declared fields. Fields hydrate from `default` and become editable per their type.
- Chip strip ("or try: …") below the form. Each chip pre-fills the composer with a registered schema + sample fields and immediately submits the fast path. Chips for v0.1: `deposit 10 USDC into Compound on Sepolia`, `withdraw 10 USDC from Compound on Sepolia`. Chips for verbs that have no plugin (swap, bridge, etc.) are omitted — chips and registry stay in lockstep.
- Free-text input remains as a secondary affordance. UI: a "type instead" toggle below the chips (or a tab; final affordance picked during implementation). When toggled, submission goes to `/api/chat` (existing path) instead of `/api/prepare`.

### Client: skeleton lifecycle

On submit (composer **or** free-text), the client immediately appends a Step 02 skeleton card to `WorkspaceCanvas`:

- Skeleton carries known fields (asset, amount) so it shows real values, not lorem ipsum. Buttons are disabled with a subtle shimmer.
- Skeleton has a `pending` state (waiting for prepare) and an `error` state.
- Composer path: skeleton is replaced when `/api/prepare/[intent]` returns. Skeleton has a unique `id`; the response carries the same id; render swaps in place.
- Free-text path: skeleton waits for `ui.render` SSE event. Same swap-by-id mechanic.
- Failure: 5s timeout (composer) / agent `error` event (free-text) flips skeleton to error with retry button.

Skeleton is shared UI; only the trigger differs. No widget duplication.

### Agent: narrator-only on the composer path

When the user submits via the composer, the client opens **two** parallel requests:

1. `POST /api/prepare/[intent]` — fast path, returns prepared payload + widget render directive.
2. `POST /api/chat` — existing SSE endpoint, but with a system-prompt mode flag `narrate-only` (e.g., extra header or body field). In this mode the agent:
   - Receives the structured intent and prepared payload as input context.
   - **Does not** call `prepare_*` (already done) or `widget.render` (already rendered).
   - Streams `chat.delta` text into the chat bubble: "supplying 100 USDC on Compound v3 — current rate ~4.2%, allowance OK, ready to sign".
   - Bounded by `maxTurns: 1` in this mode.

The chat bubble is purely additive — it doesn't gate the widget. The widget renders and becomes interactive based on `prepare` alone. If the agent narration is slow or fails, the widget still works.

### Agent: free-text path tightening

For the free-text path (existing `/api/chat` flow without the `narrate-only` flag):

- **Default model: Haiku 4.5** (`claude-haiku-4-5-20251001`). ~5x faster per turn vs Sonnet.
- **Escalation hook reserved.** A simple ambiguity check (e.g., agent's first reply contains a known sentinel like a confidence-low signal in a lightweight tool-result) can re-issue the query with Sonnet. Not built in v0.1; the hook is a TODO with a single `if` site. The model is otherwise a constant.
- **System prompt rewritten** to discourage `ToolSearch` for known intents. Prompt enumerates the registered intent schemas and the canonical sequence (`prepare_* → widget.render → done`). `ToolSearch` only used for genuinely novel free-text wishes the prompt cannot handle directly.
- **`maxTurns: 3`** (down from 4). Three turns suffice for prepare → render → final.

### Agent: stays in the chat narration role for both paths

This is the "agent paradigm visible" guarantee. The chat bubble shows token-streamed agent output on every submission, composer or free-text. Composer submissions get bubble + widget in parallel; free-text gets bubble first, widget when the agent emits `ui.render`. The agent is never invisible.

## Data flow (composer path)

```
User picks "deposit", types 100, hits "looks good →"
  │
  ├─► Client appends skeleton#abc to workspace                            (~50ms)
  │
  ├─► POST /api/prepare/compound-v3.deposit
  │     → server runs prepareDeposit(amount, address) (~1s viem RPC)
  │     ← { prepared, widget }
  │   Client swaps skeleton#abc → CompoundDeposit(props)                  (~1–2s total)
  │
  └─► POST /api/chat (mode: narrate-only, intent + prepared in input)
        → Haiku streams chat.delta tokens                                  (~3–5s, in parallel)
        Client streams into chat bubble. Widget already interactive.
```

## Data flow (free-text path)

```
User types "deposit 100 USDC into Compound on Sepolia", submits
  │
  ├─► Client appends skeleton#abc with parsed/guessed asset+amount        (~50ms)
  │     Skeleton shows "thinking..." overlay until parse confirmed.
  │
  └─► POST /api/chat (default mode, Haiku)
        → turn 1: prepare_deposit                                          (~3s)
        → turn 2: widget.render → ui.render event                          (~3s)
        Client swaps skeleton#abc → CompoundDeposit(props)
        chat.delta tokens stream into bubble continuously.                 (~5–7s total)
```

## Components & files

### New

- `packages/plugin-sdk/src/index.ts` — add `IntentSchema`, `IntentField`, extend `Plugin` type.
- `plugins/compound-v3/src/intents.ts` (or co-located in `index.ts`) — export deposit + withdraw schemas.
- `apps/web/app/api/prepare/[intent]/route.ts` — fast-path handler.
- `apps/web/server/intentRegistry.ts` — boot-time flattening of `plugin.intents` into a typed registry. Exposes `getIntentSchema(id)` for the route handler.
- `apps/web/components/wish/StructuredComposer.tsx` — prototype Step 01 inline form. Pure presentational; receives `IntentSchema[]` as prop.
- `apps/web/components/workspace/SkeletonStepCard.tsx` — pending/error skeleton.

### Modified

- `apps/web/components/wish/WishComposer.tsx` — host structured composer + free-text toggle + chip row driven by registry.
- `apps/web/components/workspace/StepStack.tsx` — render skeleton entries; swap-by-id on hydrate.
- `apps/web/server/runAgent.ts` — accept `mode: "narrate-only" | "default"`; switch model to Haiku 4.5; lower `maxTurns` to 3 for default mode and 1 for narrate-only.
- `apps/web/server/systemPrompt.ts` — rewrite to enumerate registered intents and discourage ToolSearch for known shapes; add narrate-only branch.
- `apps/web/app/api/chat/route.ts` — accept `mode` field in request body, pass through.
- `apps/web/components/wish/StreamBus.tsx` — surface `chat.delta` tokens into a chat-bubble UI element above (or alongside) the workspace. Currently bubble UI doesn't render visibly; this exposes it.

### Untouched

- `plugins/compound-v3/prepare.ts` — already pure functions, called from new HTTP route as-is. No new logic.
- `plugins/compound-v3/widgets/*` — same widgets render via either path. Skeleton is a separate component.
- `plugins/compound-v3/mcp/server.ts` — kept for free-text path. The MCP tool still exists; it just isn't called on the composer path.

## Error handling

| Failure | Composer path | Free-text path |
|---|---|---|
| Validation error (bad amount) | Client form refuses submit, no request fires. | Agent's `prepare_*` call returns validation error; agent emits `error` event; skeleton → error. |
| RPC failure | `/api/prepare` returns 502. Skeleton → error with "retry" CTA. | Agent retries once, then `error`. |
| Insufficient balance | `/api/prepare` returns 422 with `prepared.warnings`. Widget renders with warning banner (existing behavior). | Same payload via `ui.render`. |
| Agent narration fails | Bubble shows "narration unavailable"; widget unaffected. | Whole flow fails; skeleton → error. |
| Unknown intent in route | 404. Should never happen if registry + composer are in lockstep; surface as 500 in logs. | N/A. |

## Testing

- **Unit:** schema validation (each `IntentField` type), registry flattening, dispatch table on the route handler. Skeleton swap-by-id reducer.
- **Integration:** `/api/prepare/compound-v3.deposit` against mocked RPC (existing prepare tests already mock viem; reuse).
- **E2E (manual on Sepolia):** chip click → skeleton visible <100ms → widget hydrated <2s → chat bubble streams text in parallel → execute deposit → confirm. Withdraw same. Free-text wish "deposit 5 USDC into Compound on Sepolia" → skeleton + agent + widget chain. Error case: amount > balance.
- **Latency budget assertion:** add a Playwright (or simple Vitest+`fetch`) check that hits `/api/prepare/compound-v3.deposit` against a known address and asserts response < 2.5s. CI-skipped if no RPC URL.

## Telemetry (lightweight)

Console-only, structured `wishd:perf` log lines for: composer-submit, prepare-roundtrip-ms, skeleton-to-hydrate-ms, agent-first-token-ms, agent-final-ms, free-text-roundtrip-ms. Single object per event so downstream parsing is trivial. No external sink; `console.info` on server, `performance.mark` mirrored to console on client.

## What we deliberately don't build

| Variant from brainstorm | Decision | Reason |
|---|---|---|
| Specialist subagent / multi-agent routing | Defer | Pays off only at plugin count ≥ 3. |
| Warm SDK session | Defer | Bigger refactor; v0.1 budget doesn't need it once Haiku + composer are in. |
| Parallel tool calls in one turn | Defer | Composer path makes the per-turn savings irrelevant; free-text path is short enough at 3 turns. |
| RPC read cache | Defer | RPC isn't the bottleneck. Premature. |
| Pre-warm prepare on chip mouseover | Defer | Composer path already ~1–2s; not worth the complexity. |
| Skip widget.render MCP tool entirely | Partial | On composer path, yes (no MCP call). On free-text path, kept — preserves the agent-dispatches-widgets demo. |
| Agent self-extension (Morpho-style) | Defer to v0.2 | Substantial work (schema generation, plugin scaffolding, runtime tool registration). The registry seam shipped here is the v0.2 plug-in point. |

## Out-of-scope cleanups noted in v0 spec

These remain known smells; not addressed in this spec:

- `BigInt.prototype.toJSON` polyfill in agent serialization.
- Two `as any` casts in `CompoundExecute`.
- `multiInjectedProviderDiscovery: false` in wagmi config.

## Migration / rollout

Single PR, single branch. No feature flag — the composer is the new default UI. Free-text remains accessible via the toggle. Manual Sepolia e2e and the existing 16 unit tests must still pass; new unit tests added per the Testing section.

## Open questions

None blocking. Resolved during brainstorm:

- ~~Real vs perceived latency split~~ → both, with composer = real, free-text = perceived.
- ~~Strict vs loose chip semantics~~ → loose; chips = composer pre-fills.
- ~~Composer scope~~ → full prototype Step 01 layout.
- ~~Agent on composer path~~ → narrator only, parallel SSE side stream.
- ~~Self-extension scope~~ → seam only, not the feature.

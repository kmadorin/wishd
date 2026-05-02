# wishd hackathon demo — script + prerequisites

**Date:** 2026-05-02
**Scope:** the ~60-second app-demo segment of a recorded 3-minute Open Agents (ETHGlobal) hackathon submission. Slide deck (title / problem / solution / how-built / team / thanks) is OUT OF SCOPE.
**Sponsors targeted:** Uniswap (Best API Integration, $5k pool) + KeeperHub (Best Use, $4.5k pool) + general track.

---

## 1. Strategic frame

### 1.1 Judges' open questions to address

From earlier feedback session:

1. *"Could this be hardcoded UI? Why does it need an agent?"* — answered by visible agent activity sidebar, free-text intent input, agent-generated keeper recommendation.
2. *"How is this better than running KeeperHub MCP from Claude Code yourself?"* — answered by closing voiceover hitting four differentiators: no CLI, no skill authoring, non-custodial Porto session-keys (vs KH-custodial wallets), and roadmap of self-evolving learning.

### 1.2 Hackathon name = product test

The event is **Open Agents**. The agent must be the visible protagonist throughout the 60s, not an invisible API behind clicks. This drives every demo decision below.

### 1.3 Narrative arc — "Two wishes, one self-running agent"

Two real onchain wishes (swap → Uniswap, lend → Compound), then the agent recommends + deploys a KeeperHub workflow that itself uses Uniswap on a recurring basis. The keeper's recurring use of Uniswap binds both sponsors into a single closing line.

---

## 2. Beat-by-beat shot list (60s)

| # | Time | On-screen | Voiceover |
|---|---|---|---|
| 1 | 0–6s | Split layout: composer left, **agent activity sidebar right** (empty initially). User types in free-text mode: `swap 0.001 eth for usdc on sepolia`. Sidebar streams: `agent.parse_intent` → `uniswap.intents.match`. Sentence-box pills auto-fill from agent output. | "I tell the agent what I want — natural language, not a form." |
| 2 | 6–18s | Click "looks good →". Sidebar streams: `uniswap.quote` → `uniswap.check_approval` → `porto.prepare_swap` → `widget.render`. Step 02 swap widget loads with agent-fetched data. Click execute → Porto sign → confirmed. Tx-hash chip flashes. | "agent calls Uniswap's Trading API, prepares the Porto bundle, renders the widget. I just sign." |
| 3 | 18–32s | New wish: chip click `lend 50 USDC on Compound · Sepolia` (or free-text). Sidebar: `agent.parse` → `compound-v3.intents` → `compound.prepare_deposit` → `widget.render`. Step 02 lend widget. Execute → sign → confirmed. | "different protocol, same agent. composer is the agent's output, not a hardcoded form." |
| 4 | 32–50s | After confirm, sidebar streams: `keeperhub.recommend_keeper(context=just_deposited_compound)` → `keeperhub.list_workflows` → `propose: auto-compound-comp` → `propose_delegation(...)`. Step 04 surfaces the chosen keeper card. Click deploy → Porto delegation modal (visible scope: token / cap / expiry) → grant → toast "deployed via KeeperHub MCP". Quick cmd-tab to KH dashboard tab showing the live workflow. | "agent watches what I just did, recommends a keeper, scopes the session-key, deploys it through the KeeperHub MCP. workflow is live in KeeperHub now." |
| 5 | 50–60s | Slow-motion replay over agent activity sidebar scrolling its full call-log. | "no CLI, no skills to write, no funds transferred to a custodian. agent did the work, you signed once. it runs on Uniswap weekly without you. next: agent proposes new keepers from your patterns and scaffolds plugins for protocols you mention." |

### 2.1 Why this answers the judges

- Beats 1, 3 (free-text input + agent-streamed parse): rebuts "hardcoded UI."
- Beats 2, 3 (live agent tool-call stream visible): rebuts "no agent at all."
- Beat 4 (agent-generated keeper recommendation in context): rebuts "you could just write a workflow yourself in Claude Code."
- Beat 4 (Porto delegation with explicit scope) + Beat 5 closing: rebuts "custodial KH wallet."
- Beat 5 closing roadmap: honest framing of self-evolution as next step (does not over-claim).

### 2.2 Sponsor coverage scoring

- Uniswap: 9/10 — one-shot real swap (beat 2) + recurring use inside the deployed keeper (beat 4–5).
- KeeperHub: 10/10 — full deploy via MCP, agent-recommended, Porto session-key delegation, live in KH dashboard.
- General Open Agents: 9/10 — agent is visible protagonist for all 60 seconds.

---

## 3. Prerequisites — what must ship before recording

Listed in priority order. Each item is a precondition for the demo working as scripted.

### 3.1 Composer empty initial state

- **What:** `apps/web/components/wish/WishComposer.tsx:49` — initialize `intentId = ""` instead of `CLIENT_INTENT_SCHEMAS[0]`. Render placeholder "I want to … pick action" matching the prototype empty state.
- **Why:** current pre-fill to `compound-v3.deposit` makes the app look like a form with a default rather than an agent waiting for input.

### 3.2 FEEDBACK.md at repo root (Uniswap prize blocker)

- **What:** Create `/FEEDBACK.md` covering Uniswap Trading API DX: what worked, bugs hit, docs gaps, missing endpoints, what we wish existed. Pull from build experience. Concrete starter notes:
  - Trading API does not expose a Permit2-signed swap path that fits into a single bundle for AA wallets — forced separate approve + swap txs in the Porto bundle.
  - No batch-quote endpoint for comparing multiple routes / fee tiers in one call.
  - No agent-discoverable intent format that would let other agents respond to a swap intent.
  - Sepolia coverage gaps — fell back to direct V3 contracts (QuoterV2 / SwapRouter02) at addresses that aren't documented in the Trading API docs.
- **Why:** REQUIRED for prize eligibility. Submission without it is auto-disqualified.

### 3.3 Agent activity sidebar (MVP)

- **What:** New `<AgentActivityPanel />` component, mounted as right-side 280px panel via grid layout in `apps/web/app/page.tsx`. Subscribes to existing SSE channel via `StreamBus`. Listens for `tool.call` events emitted at `apps/web/server/runAgent.ts:101`. Renders an append-only scrolling list: `timestamp · toolName(brief args)`.
- **MVP excludes:** tool results (only call names). Pad gaps with `chat.delta` text events (agent reasoning lines), already in stream.
- **Why:** the agent is invisible today. Without this panel the demo fails the Open Agents test.
- **Files:** `apps/web/components/wish/AgentActivityPanel.tsx` (new), `apps/web/app/page.tsx` (mount point), optional small extension to `apps/web/store/workspace.ts` for log state.

### 3.4 Four mocked intents

- **What:** Add to `apps/web/lib/intentRegistry.client.ts`: `borrow`, `earn`, `bridge`, `find-vault`. Each as `kind: "demo"` with sentence-box schema (amount + asset + protocol/chain pills) per prototype `ACTION_META`. Add 3 widget components to `apps/web/widgetRegistry.ts` (`find-vault` reuses `EarnVaultWidget`):
  - `BorrowWidget` — BORROW APY, MAX LTV, HEALTH FACTOR, REQUIRED collateral, LIQUIDATION price, gas
  - `EarnVaultWidget` — vault list (Morpho / Aave / Compound / Yearn) APY/TVL/risk + deposit input. Also rendered for `find-vault` with scanner framing.
  - `BridgeWidget` — From → To chain boxes, ETA, bridge fee, you-receive
- **Execute button on demo intents:** short-circuit in `prepareIntent` to surface a `widget.render` for a "demo only — wire next sprint" toast widget. No real prepare/execute path.
- **Why:** visible breadth in dropdown matches prototype's 6 actions; demo voiceover "six wishes available" is honest.

### 3.5 Lend framing — option (c)

- **What:** Add a new wired intent `lend` to `intentRegistry.client.ts`. Sentence schema: `lend [amount] [asset] on [protocol] · [chain]`. Protocol pill defaults to `Compound v3` (wired, maps to existing `compound-v3.deposit` prepare path). Other protocol options in dropdown (`Aave V3`, `Morpho`, `Spark`) render the "demo only" toast on execute.
- **Keep `deposit` / `withdraw` intents** in the registry for backward compat but they need not appear in the primary dropdown if it makes the demo cleaner — your call.
- **Why:** matches prototype shape; voiceover "lend on Compound" is clean; protocol pill demos plugin-style extensibility without requiring real Aave/Morpho wiring.

### 3.6 Free-text input parser polish

- **What:** Confirm "type instead" mode reliably parses each of these phrasings into all required fields:
  - `swap 0.001 eth for usdc on sepolia`
  - `lend 50 usdc on compound`
- **If parser drops fields:** improve the agent prompt OR pick demo phrasings that parse 100% in rehearsal.
- **Why:** beat 1 of the script depends on free-text → pills working on camera.

### 3.7 Porto delegation modal — recording-clean

- **What:** Modal will exist via separate workstream. Ensure scope details (token / spend cap / expiry) are visible at recording resolution and the modal is held on screen long enough (~2s) for voiceover to land. CSS pass if needed.
- **Why:** this is the proof-shot for "non-custodial Porto session-key" rebuttal.

### 3.8 KeeperHub dashboard tab

- **What:** Pre-open `app.keeperhub.com` in second browser tab, logged into the same account the demo deploys to. After deploy in beat 4, cmd-tab → 2s on the live workflow row → cmd-tab back.
- **Why:** external-system proof shot. Judges see KH actually receiving the workflow.

### 3.9 Wallet / funds fixture

- **What:** Porto wallet on Sepolia, prefunded with enough ETH (gas) and USDC. Verify the Compound v3 USDC market on Sepolia is reachable. Verify the `auto-compound-comp` keeper renders with sensible cron + nodes after deploy.

### 3.10 Recording cosmetics

- **What:** `next start` build (no Next.js dev overlay). New Chrome profile (no extensions, no notifications). 1080p browser viewport. Cursor-highlight extension. Use `http://localhost:3000` not `https://localhost:3000` to skip cert warnings.

---

## 4. Open items / decisions deferred

- **Plugin-author hero moment** (agent scaffolds new protocol on stage): out of scope for this 60s demo; flagged as roadmap in closing voiceover (beat 5).
- **General-purpose chat sidebar agent** (separate from composer agent): user is implementing in parallel; not required for this demo arc.
- **Memory / Soul / CLAUDE.md panel** (per openclaw pattern): out of scope for this demo; flagged as roadmap.
- **Workflow-builder meta-agent**: already in implementation/planning per user; not surfaced in this demo arc.
- **Self-deployable container for judges**: separate sub-project (sub-project C from original brainstorm); separate spec.

---

## 5. Sub-project context

This spec covers sub-project A (demo narrative). Earlier brainstorm identified two siblings:

- **Sub-project B — Minimal agentic tweaks beyond demo prerequisites:** plugin-author sub-agent, memory/Soul files panel, sidebar chat, reflector loop. Will need its own design doc.
- **Sub-project C — Deployment infrastructure for judges to spin up own instance:** docker-compose path, FEEDBACK.md for KH bounty, hosted shared demo. Will need its own design doc.

Order: complete A → execute A's prerequisites → record demo → then design B and C.

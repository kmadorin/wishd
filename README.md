# wishd

**The AI co-pilot for self-custody DeFi.** *Wish it. Sign it. Automate it.*

You type a wish — *"swap 0.1 SOL for USDC"*, *"bridge USDC from Ethereum to Solana"*, *"auto-compound my USDC every week"* — and a server-side agent figures out which protocol applies, prepares a transaction bundle, and renders a custom DeFi widget back to your browser. You sign in your own wallet. Recurring jobs run deterministically off-LLM under scoped session-keys, so a bad prompt can't drain you.

Built for the [Solana Colosseum Frontier Hackathon](https://colosseum.com/frontier). Solana-first, multi-chain by design — cross-chain wishes route through [Li.Fi](https://li.fi).

- **Live app:** https://wishd.sumula.online
- **Forked KeeperHub instance:** https://kh.sumula.online
- **Forked KeeperHub repo (adds Porto plugin):** https://github.com/kmadorin/keeperhub

---

## Why wishd

Today, active DeFi users face a forced choice — keep your keys and babysit ten tabs across Jupiter, Kamino, Drift, and the rest, or hand them to a vault or AI agent and pray. Costs you hours per week, or full position-loss to one bad prompt.

wishd ends that tradeoff:

- **Generative DeFi UI** — every wish renders its own widget. No chat dump, no static dashboard. The interface adapts to the intent.
- **Non-custodial throughout** — agent proposes, you sign, keepers execute *off the LLM* under scoped session-keys (token + spend cap + expiry). Funds never leave your wallet.
- **Wallet-agnostic** — Solana wallet for Solana wishes, Porto / EVM wallet for EVM wishes, one app.
- **Plugin host** — adding a new protocol is dropping a folder under `plugins/`. Each plugin is a permanent capability of the agent, not a prompt.

## What's shipped

| Plugin | Chain | What it does |
|---|---|---|
| `plugins/jupiter` | Solana | DEX swaps via Jupiter aggregator |
| `plugins/lifi` | Cross-chain | Bridge assets (e.g. USDC ETH ↔ Solana) via Li.Fi |
| `plugins/uniswap` | Ethereum / L2s | DEX swaps via Uniswap Trading API + V3 fallback |
| `plugins/compound-v3` | Ethereum | Lend / withdraw on Compound v3 |
| `keepers/auto-compound-comp` | Ethereum | Recurring USDC → cUSDCv3 auto-compound |

A typical cross-chain wish (*"bridge USDC from Ethereum to Solana, then deposit somewhere yielding"*) lights up two plugins in one signed bundle: Li.Fi for the bridge leg, then a Solana plugin for the destination action.

## Quick start

Requires Node ≥ 20 and pnpm ≥ 9.

```bash
pnpm install
cp .env.local.example apps/web/.env.local
# pick one auth method:
#   CLAUDE_CODE_OAUTH_TOKEN=...   (uses your Claude Pro/Max sub; get via `claude setup-token`)
#   ANTHROPIC_API_KEY=sk-ant-...  (pay-per-token via console.anthropic.com)
# plus, for EVM mainnet/L2 swaps:
#   UNISWAP_API_KEY=...
pnpm dev
```

Open http://localhost:3000. Connect your Solana wallet (or Porto for EVM). Type a wish or pick one from the composer.

## How it's wired

```
┌─Browser──────────────────┐         ┌─Server (Next.js + Claude Agent SDK)──┐
│ Composer / Activity      │ ◀──SSE──│ agent loop                            │
│ Generative widgets       │         │  ├─ MCP: keeperhub.*                  │
│ Solana + Porto wallets   │         │  ├─ MCP: wishd_keepers.*              │
│ (sign in your wallet)    │         │  ├─ plugins/jupiter (Solana)          │
└──────────────────────────┘         │  ├─ plugins/lifi (cross-chain)        │
       │                             │  ├─ plugins/uniswap (EVM)             │
       │ scoped session-key          │  ├─ plugins/compound-v3 (EVM)         │
       ▼                             │  └─ keepers/auto-compound-comp        │
┌─KeeperHub (off-app)──────┐         └───────────────────────────────────────┘
│ deterministic DAG        │ ──────▶ Jupiter / Uniswap / Compound onchain
│ cron-scheduled execution │
│ no LLM at runtime        │
└──────────────────────────┘
```

The server emits a typed event stream — `tool.call`, `chat.delta`, `widget.render`, `widget.patch` — and the client renders widgets from those events. There are no hardcoded UI routes for "swap" or "lend"; the page is whatever the agent rendered last. `widget.patch` lets the agent mutate widgets that are already on screen, which is how a quote refreshes without unmount and how the swap card visibly fills in as tool calls return.

## Sponsor integrations

**Jupiter** (`plugins/jupiter`) — Solana DEX. Quote, route, and prepare swap transactions for the user's wallet to sign.

**Li.Fi** (`plugins/lifi`) — cross-chain routing. A wish like *"move USDC from Ethereum to Solana"* compiles into a single signed bundle; Li.Fi handles the bridge leg, wishd renders progress and chains a follow-up action on the destination chain.

**KeeperHub MCP** (`apps/web/server/keepers/`, `keepers/auto-compound-comp`) — the agent loads the KeeperHub MCP at boot and uses it to recommend, deploy, and inspect workflows. We forked KeeperHub to add a first-class Porto plugin so workflows can request and consume session-key delegations natively — fork lives at [github.com/kmadorin/keeperhub](https://github.com/kmadorin/keeperhub).

**Uniswap Trading API** (`plugins/uniswap`) — EVM swap fallback. Mainnet and L2 routes through `/quote`, `/check_approval`, `/swap`. On testnet, the same plugin falls back to V3 contracts directly (`QuoterV2`, `SwapRouter02`) and prepends the ERC-20 approval into the bundle so the user signs once instead of twice.

## Layout

```
apps/web                       Next.js 15 app, agent route, UI, SSE bus
  server/runAgent.ts             Claude Agent SDK loop, MCP wiring
  server/keepers/                KH MCP integration + custom recommend tools
  components/wish/               composer, generative widgets, activity sidebar
  app/api/uniswap/               EVM quote + swap routes
packages/plugin-sdk            shared types (Plugin, Keeper, ServerEvent)
packages/wishd-tokens          cross-chain token registry
plugins/jupiter                Jupiter (Solana DEX)
plugins/lifi                   Li.Fi (cross-chain bridge)
plugins/uniswap                Uniswap (EVM swap)
plugins/compound-v3            Compound v3 (EVM lend / withdraw)
plugins/demo-stubs             placeholder intents shown in composer dropdown
keepers/auto-compound-comp     recurring USDC → cUSDCv3 keeper
prototype                      original visual reference
docs/superpowers/              specs + plans
```

## Tests

```bash
pnpm test          # unit tests (vitest) across workspaces
pnpm typecheck     # strict TS across workspaces
pnpm build         # next build + per-package builds
```

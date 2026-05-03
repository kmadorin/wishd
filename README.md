# wishd

**DeFi by wishing it.** A browser-native agent for DeFi: type what you want, the agent picks the right widget, you sign in your own wallet. Built for [ETHGlobal Open Agents 2026](https://ethglobal.com/events/agents).

- **Live app:** https://wishd.sumula.online (Sepolia)
- **Forked KeeperHub instance:** https://kh.sumula.online
- **Forked KeeperHub repo (adds Porto plugin):** https://github.com/kmadorin/keeperhub
- **Sepolia USDC faucet:** https://faucet.circle.com

---

## What it is

You type or click an intent — *"swap 0.001 ETH for USDC"*, *"lend 50 USDC on Compound"* — and a server-side Claude Agent SDK loop figures out which protocol applies, fetches a quote, prepares a transaction bundle, and renders a typed widget back to your browser over SSE. You sign in your own [Porto](https://porto.sh) wallet. There is no agent wallet holding your money.

For recurring jobs (auto-compound, DCA), the agent recommends a [KeeperHub](https://keeperhub.dev) workflow and asks you to grant a scoped Porto session-key (token, spend cap, expiry) for it. KeeperHub then runs the workflow deterministically off-app — no LLM at runtime, so a bad prompt can't drain you.

The whole thing is non-custodial, the agent's tool calls stream into a sidebar so you can watch it work, and adding a new protocol is dropping a folder under `plugins/`.

## Quick start

Requires Node ≥ 20 and pnpm ≥ 9.

```bash
pnpm install
cp .env.local.example apps/web/.env.local
# pick one auth method:
#   CLAUDE_CODE_OAUTH_TOKEN=...   (uses your Claude Pro/Max sub; get via `claude setup-token`)
#   ANTHROPIC_API_KEY=sk-ant-...  (pay-per-token via console.anthropic.com)
# plus, for mainnet/L2 swaps:
#   UNISWAP_API_KEY=...
pnpm dev
```

Open http://localhost:3000. Connect Porto. Fund with Sepolia ETH and Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`). Type a wish or pick one from the composer.

## How it's wired

```
┌─Browser──────────────┐         ┌─Server (Next.js + Claude Agent SDK)──┐
│ Composer / Activity  │ ◀──SSE──│ agent loop                            │
│ Widgets / Modal      │         │  ├─ MCP: keeperhub.*                  │
│ Porto wallet (sign)  │         │  ├─ MCP: wishd_keepers.*              │
└──────────────────────┘         │  ├─ plugins/uniswap                   │
       │                         │  ├─ plugins/compound-v3               │
       │ Porto session-key       │  └─ keepers/auto-compound-comp        │
       ▼                         └───────────────────────────────────────┘
┌─KeeperHub (off-app)──┐
│ deterministic DAG    │ ──────▶ Uniswap / Compound onchain
│ cron-scheduled exec  │
└──────────────────────┘
```

The server emits a typed event stream — `tool.call`, `chat.delta`, `widget.render`, `widget.patch` — and the client renders widgets from those events. There are no hardcoded UI routes for "swap" or "lend"; the page is whatever the agent rendered last. `widget.patch` lets the agent mutate widgets that are already on screen, which is how a quote refreshes without unmount and how the swap card visibly fills in as tool calls return.

## Sponsor integrations

**Uniswap Trading API** (`plugins/uniswap`). Mainnet and L2 swaps go through `/quote`, `/check_approval`, `/swap`. Sepolia isn't covered there, so on testnet the same plugin falls back to V3 contracts directly (`QuoterV2`, `SwapRouter02`) and prepends the ERC-20 approval into the Porto bundle so the user signs once instead of twice. Builder DX feedback in [`FEEDBACK.md`](./FEEDBACK.md).

**KeeperHub MCP** (`apps/web/server/keepers/`, `keepers/auto-compound-comp`). The agent loads the KeeperHub MCP at boot and uses it to recommend, deploy, and inspect workflows. We forked KeeperHub to add a first-class Porto plugin so workflows can request and consume Porto session-key delegations natively — fork lives at [github.com/kmadorin/keeperhub](https://github.com/kmadorin/keeperhub).

## Layout

```
apps/web                     Next.js 15 app, agent route, UI, SSE bus
  server/runAgent.ts           Claude Agent SDK loop, MCP wiring
  server/keepers/              KH MCP integration + custom recommend tools
  components/wish/             composer, widgets, activity sidebar
  app/api/uniswap/             quote + swap routes
packages/plugin-sdk          shared types (Plugin, Keeper, ServerEvent)
packages/wishd-tokens        cross-chain token registry
plugins/uniswap              Uniswap plugin (Trading API + direct V3 fallback)
plugins/compound-v3          Compound v3 plugin (deposit / withdraw)
plugins/demo-stubs           placeholder intents shown in composer dropdown
keepers/auto-compound-comp   recurring USDC → cUSDCv3 keeper, used in demo
prototype                    original visual reference
docs/superpowers/            specs + plans
```

## Tests

```bash
pnpm test          # unit tests (vitest) across workspaces
pnpm typecheck     # strict TS across workspaces
pnpm build         # next build + per-package builds
```

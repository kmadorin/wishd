# `@wishd/plugin-lifi`

Cross-chain bridge-swap plugin for wishd. Wraps the Li.Fi REST API to produce
a single user-signed source-chain `EvmCall` (optionally preceded by an ERC-20
approval) plus a `LifiStatusObservation` that the executor poller drives until
destination delivery — surviving page refresh via a zustand-persist store.

## Provides

- **Intent:** `lifi.bridge-swap` (verb `bridge`)
- **Widgets:** `lifi-bridge-summary`, `lifi-bridge-execute`, `lifi-bridge-progress`
- **MCP tools:** `prepare_bridge_swap`, `get_bridge_status`
- **Plugin tool:** `refresh_quote` (called via `callPluginTool("lifi", "refresh_quote", ...)`)
- **Chains:** Ethereum, Base, Arbitrum, Optimism, Polygon (source) → any of those + Solana mainnet (destination). SVM source is rejected (Pattern X).

## Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `LIFI_API_KEY` | optional | Higher rate limits on `https://li.quest/v1` |
| `SOLANA_RPC_URL_SERVER` | optional | Server-side Solana RPC (destination reads) |
| `ETHEREUM_RPC_URL` / `BASE_RPC_URL` / `ARBITRUM_RPC_URL` / `OPTIMISM_RPC_URL` / `POLYGON_RPC_URL` | optional | Per-chain EVM RPC overrides |

## Demo

1. Boot `apps/web`. Connect Porto on Ethereum mainnet + Phantom on Solana mainnet.
2. In the wish composer: **"swap 10 USDC on Ethereum to SOL on Solana via Li.Fi"**.
3. The agent emits `lifi-bridge-summary` (route, fees, ETA). Click Execute.
4. If USDC allowance < amount, sign the approval first; then sign the bridge.
5. `lifi-bridge-progress` mounts and renders the timeline; on `DONE` it shows source + destination explorer links.
6. Mid-poll hard-reload (Cmd+Shift+R): `BridgeProgress` rehydrates from `localStorage` and resumes polling.

## Tests

Unit-only. No integration tests against live Li.Fi (per spec D6 — keep CI deterministic). Mocks cover the REST surface, viem clients, store persistence, and the poller's fake-timer cadence.

```bash
pnpm --filter @wishd/plugin-lifi test
pnpm --filter @wishd/plugin-lifi typecheck
```

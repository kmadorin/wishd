# PR2: `@wishd/plugin-jupiter` — first Solana plugin on the chain-agnostic SDK

**Status:** brainstormed, pending review → implementation plan
**Scope:** First concrete SVM plugin built on the SDK extensions from `2026-05-06-svm-fork-a-sdk-design.md` (PR1). Token swaps on Solana mainnet via Jupiter REST v6. Validates that PR1's `SvmCall`, `PluginCtx { family: "svm" }`, blockhash refresh path, priority fees, and CAIP-19 asset model actually work end-to-end with a real plugin.
**Out of scope:** cross-chain (PR3 — Li.Fi), Solana keepers, Jupiter DCA / limit orders, Magic Eden / Tensor (separate plugin if ever), shared Swap widget primitives (extract only after PR3 lands a second SVM swap UI).
**Prereq:** PR1 merged. All `SvmCall` / `PluginCtx` / CAIP / explorer / `priorityFees` types referenced below are defined in the PR1 spec — not redefined here.

## Goal

Ship `@wishd/plugin-jupiter` as the first Solana plugin under the new SDK. Surface a `jupiter.swap` intent that mirrors the UX shape of `uniswap.swap` (amount + assetIn + assetOut + chain), prepares server-side via Jupiter `/quote` + `/swap`, returns an `SvmTxCall { kind: "tx", base64, lastValidBlockHeight, staleAfter }`, and is executed client-side by signing the decoded `VersionedTransaction` with the connected `WalletSession` from `@solana/react-hooks` and submitting via `useSolanaClient().rpc.sendTransaction(...)`.

The plugin doubles as the conformance test for PR1 — anywhere PR1's types or helpers fall short, this spec lists the gap under "Feedback to PR1".

## Non-goals

- Devnet swap support. v1 is **mainnet-only** (Jupiter has no first-class devnet aggregator). Justified in §Decisions/D5.
- Generic SVM swap widget shared with future plugins. Per-plugin widgets (`jupiter-swap-summary`, `jupiter-swap-execute`). Extract later if PR3 brings a second SVM swap surface.
- Token allowlist governance. v1 ships a small curated list inline + falls back to Jupiter's token API for long-tail; no on-chain registry.
- Limit orders, DCA, Jupiter Perps, Jupiter staking. Swap only.
- WSOL pre-funding UX. Jupiter `/swap` handles wrap/unwrap implicitly when `wrapAndUnwrapSol: true` (default); we rely on that. See §Decisions/D6.

## Decisions locked

| # | Q | Answer |
|---|---|---|
| D1 | Executor flow for `SvmTxCall { kind: "tx" }` | Decode base64 → `Transaction` via `@solana/transactions` (`getTransactionDecoder()`); build a `WalletTransactionSigner` via `createWalletTransactionSigner(session)` from `@solana/client` (already in workspace); call `signer.signAndSendTransactions([decodedTx])` — kit's signer abstraction internally handles `mode: "partial" | "send"` based on the wallet's wallet-standard capabilities (no manual probing). Confirmation polled via `useSolanaClient().rpc.getSignatureStatuses([sig]).send()` until `lastValidBlockHeight` passes or `commitment="confirmed"`. Detail in §Architecture/Executor. |
| D2 | `SvmTxCall` payload Jupiter emits | `{ family: "svm", caip2: SOLANA_MAINNET, kind: "tx", base64, lastValidBlockHeight: bigint, staleAfter: number }`. No extra plugin-private fields on the Call itself; Jupiter-specific routing/fee data lives in `JupiterSwapPrepared` (PR1's `Prepared<TExtras>` shape). Returned in `calls: [oneCall]` per PR1's plural convention. |
| D3 | `refresh()` transport | Plugin registers a server fn `refreshSwap` via `registerPluginTool("jupiter", "refresh_swap", refreshSwap)` from PR1's `@wishd/plugin-sdk/routes`. Widget calls it via PR1's `callPluginTool("jupiter", "refresh_swap", { config, summaryId })` helper, which POSTs to the generic `/api/wish/[plugin]/[tool]` Next route. Re-runs `/quote` + `/swap`, returns a fresh `JupiterSwapPrepared`. No agent round-trip. Detail in §Transport. |
| D4 | Token list | Hybrid: small inline curated list (USDC, USDT, SOL, BONK, JUP, JTO, mSOL, jupSOL) shipped in `addresses.ts` for the typeahead options + intent schema. At resolve time, unknown symbols fall back to a server-side cached fetch of `https://tokens.jup.ag/tokens?tags=verified` (1 h LRU). Curated list keeps cold-path UX snappy and gives the agent a stable enum; fallback gives long-tail coverage. |
| D5 | Devnet | **Not supported in v1.** Manifest declares `chains: [SOLANA_MAINNET]` only. Jupiter aggregates against mainnet pools; there is no equivalent aggregator on devnet, and stubbing one (Orca devnet pool, mock route) would test infra, not Jupiter. Devnet integration tests on this plugin are deliberately skipped — see D8. The SDK's devnet support (PR1) is exercised by future plugins (e.g. an Orca devnet stake demo) without needing this plugin to claim it. |
| D6 | WSOL wrap/unwrap | Jupiter handles it inside the returned tx via the SOL ↔ WSOL ATA dance. We pass `wrapAndUnwrapSol: true` (the API default — set explicitly so the contract is documented). User sees only "SOL"; no separate WSOL approval / wrap step. |
| D7 | Slippage | Default `slippageBps: 50` (matches uniswap). Field exposed on the intent (`type: "select"`, options `["0.1%", "0.5%", "1%", "auto"]`, default `"0.5%"`). `"auto"` → pass `dynamicSlippage: true` to `/quote`. |
| D8 | Integration tests | **v1 ships unit tests only** — mocked `@solana/client` RPC and mocked `fetch` for Jupiter REST. No devnet integration test (D5: Jupiter is mainnet-only). No mainnet integration test (cost + risk). The opt-in `@integration` tag from PR1's testing strategy stays available for future SVM plugins; this one declares "no integration suite" in its README. |
| D9 | Priority fees | `prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 5_000_000, priorityLevel: "high" } }` — Jupiter's recommended preset (~0.005 SOL ceiling, dynamic within). Strictly stronger than `"auto"`: bounded worst case + market-aware. Plugin does NOT call PR1's `getPriorityFeeEstimate` — Jupiter owns priority fee policy here. Documented to plugin authors so the helper isn't seen as mandatory. |
| D10 | MCP server name & widget keys | Server name: `jupiter`. Widgets: `jupiter-swap-summary`, `jupiter-swap-execute`. Manifest `provides.mcps: ["jupiter"]`. Per-plugin namespacing prevents collision with `uniswap`'s `swap-summary` / `swap-execute` keys. |

## Architecture

### File-level layout

```
plugins/jupiter/
  index.ts                ← definePlugin({ manifest, mcp, widgets, intents })
  manifest.ts             ← { chains: [SOLANA_MAINNET], provides: { intents: ["jupiter.swap"], widgets: [...], mcps: ["jupiter"] } }
  intents.ts              ← jupiterIntents: IntentSchema[]; validateSwapValues
  prepare.ts              ← prepareSwap(input) → JupiterSwapPrepared (server-side; calls Jupiter REST)
  refresh.ts              ← refreshSwap(prevConfig) → JupiterSwapPrepared (re-runs /quote + /swap)
  resolveAsset.ts         ← symbol → { mint, decimals, isNative } via curated + Jupiter token API
  addresses.ts            ← CURATED_MINTS table (CAIP-19 keyed) + JUPITER_TOKEN_LIST_URL
  types.ts                ← JupiterSwapConfig, JupiterSwapQuote, JupiterSwapPrepared, Call (= SvmTxCall)
  mcp/server.ts           ← createJupiterMcp(ctx) — tools: prepare_swap, refresh_swap
  widgets/
    SwapSummary.tsx       ← jupiter-swap-summary
    SwapExecute.tsx       ← jupiter-swap-execute (decode + sign + send)
    index.ts
  prepare.test.ts
  refresh.test.ts
  resolveAsset.test.ts
  intents.test.ts

apps/web/
  server/jupiterClients.ts   ← solanaRpcFor(caip2) factory using SOLANA_RPC_URL_SERVER
  widgetRegistry.ts          ← register jupiter-swap-summary, jupiter-swap-execute
  next.config.ts             ← add "@wishd/plugin-jupiter" to transpilePackages (per CLAUDE.md trap)
```

### Intent schema

```ts
export const jupiterIntents: IntentSchema[] = [{
  intent: "jupiter.swap",
  verb: "swap",
  description: "exchange one SPL token for another via Jupiter",
  fields: [
    { key: "amount",   type: "amount", required: true, default: "0.1" },
    { key: "assetIn",  type: "asset",  required: true, default: "SOL",  options: CURATED_SYMBOLS /* CAIP-19 ids */ },
    { key: "assetOut", type: "asset",  required: true, default: "USDC", options: CURATED_SYMBOLS },
    { key: "chain",    type: "chain",  required: true, default: SOLANA_MAINNET, options: [SOLANA_MAINNET] },
    { key: "slippage", type: "select", required: false, default: "0.5%", options: ["0.1%","0.5%","1%","auto"] },
  ],
  connectors: { assetIn: "", assetOut: "to", chain: "on", slippage: "with" },
  widget: "jupiter-swap-summary",
  slot: "flow",
}];
```

Both `jupiter.swap` and `uniswap.swap` claim the verb `swap` — disambiguation by `chain` field's CAIP-2 namespace (`eip155:*` → uniswap, `solana:*` → jupiter). The intent registry from PR1 already supports multi-claim; resolution logic in `prepareIntent.ts` picks by chain family. If chain is ambiguous on agent input, raise the disambiguation question (separate spec from PR1).

### `prepare()` shape

```ts
export type JupiterSwapConfig = {
  caip2: string;            // SOLANA_MAINNET
  swapper: string;          // base58 owner
  inputMint: string;        // base58
  outputMint: string;
  assetIn: string;          // symbol (display)
  assetOut: string;
  amountAtomic: string;     // u64 stringified
  slippageBps: number;      // 50, 100, etc.
  dynamicSlippage: boolean; // when "auto"
};

export type JupiterSwapQuote = {
  inAmount: string;         // u64
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: Array<{ swapInfo: { ammKey: string; label: string; inputMint: string; outputMint: string } }>;
  contextSlot: number;
  timeTaken: number;
};

// JupiterSwapPrepared = Prepared<JupiterSwapExtras> from PR1
export type JupiterSwapExtras = {
  config: JupiterSwapConfig;
  initialQuote: JupiterSwapQuote;
  initialQuoteAt: number;
  balance: string;          // human (decimals applied)
  insufficient: boolean;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];   // re-uses uniswap's KeeperOffer shape; identical UI semantics
};

export type JupiterSwapPrepared = Prepared<JupiterSwapExtras>;
// → { calls: [SvmTxCall]; staleAfter: number; ...JupiterSwapExtras }
// observations omitted — single-chain plugin, no Pattern X.
```

`prepare.ts`:
1. `validateSwapValues(values)` — reject same in/out, bad amount regex, unknown chain.
2. `resolveAsset(caip2, symbol)` for in & out → `{ mint, decimals, isNative }`. Curated lookup first, Jupiter token-list fallback (server LRU).
3. Compute `amountAtomic = parseUnits(amount, decimals).toString()`.
4. Parallel:
   - balance query: `rpc.getBalance(swapper)` for SOL, else `rpc.getTokenAccountBalance(ata)` (derive ATA via `@solana-program/token`).
   - quote: `GET https://lite-api.jup.ag/swap/v1/quote?inputMint=…&outputMint=…&amount=…&slippageBps=…[&dynamicSlippage=true]`.
5. Build swap: `POST https://lite-api.jup.ag/swap/v1/swap` with body `{ quoteResponse, userPublicKey, wrapAndUnwrapSol: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 5_000_000, priorityLevel: "high" } }, dynamicComputeUnitLimit: true }`. Response: `{ swapTransaction: <base64>, lastValidBlockHeight: <number> }`.
6. Compose `calls: [{ family: "svm", caip2, kind: "tx", base64: swapTransaction, lastValidBlockHeight: BigInt(lastValidBlockHeight), staleAfter: Date.now() + 25_000 }]` plus top-level `staleAfter: Date.now() + 25_000` (25 s — well under the ~60 s blockhash window). `BigInt()` normalization happens at the REST boundary per PR1's typing rule.

### Server clients

`apps/web/server/jupiterClients.ts` exports `solanaRpcFor(caip2)` returning a `@solana/client` `Rpc<SolanaRpcApi>`. Uses `process.env.SOLANA_RPC_URL_SERVER` for mainnet; throws on non-mainnet caip2 (D5). Mirrors `apps/web/server/uniswapClients.ts` shape so the MCP server is symmetric.

### MCP

```ts
// plugins/jupiter/mcp/server.ts
export function createJupiterMcp(ctx: PluginCtx /* family: "svm" */) {
  return createSdkMcpServer({
    name: "jupiter",
    version: "0.0.0",
    tools: [
      tool("prepare_swap", "Prepare a Jupiter swap. Returns JupiterSwapPrepared.",
        prepareInputSchema,
        async (args) => ({ content: [{ type: "text", text: JSON.stringify(await prepareSwap({ ... })) }] })),
    ],
  });
}
```

`prepare_swap` is the agent-facing entry point. **`refresh_swap` is NOT an MCP tool** — it's registered as a plugin-tool route via PR1's `registerPluginTool` helper:

```ts
// plugins/jupiter/index.ts
import { registerPluginTool } from "@wishd/plugin-sdk/routes";
import { refreshSwap } from "./refresh";
registerPluginTool("jupiter", "refresh_swap", refreshSwap);
```

Widgets call it via `callPluginTool("jupiter", "refresh_swap", { config, summaryId })`. Single Next route mount `/api/wish/[plugin]/[tool]` from PR1 dispatches. No agent round-trip, no per-plugin route copy-paste.

### Executor (client-side, in `SwapExecute.tsx`)

```ts
// blessed hook re-exports from PR1
import { useSolanaClient, useWalletConnection } from "@wishd/plugin-sdk/svm/react";
import { callPluginTool } from "@wishd/plugin-sdk/routes";
// kit signer abstraction — direct import from @solana/client (already a workspace dep).
// PR1 may later re-export this via @wishd/plugin-sdk/svm/react; until then, direct.
import { createWalletTransactionSigner } from "@solana/client";
import { getTransactionDecoder } from "@solana/transactions";

const { rpc } = useSolanaClient();
const { session } = useWalletConnection();
const call0 = prepared.calls[0] as SvmTxCall;

async function execute() {
  // 1. staleness check
  let call = call0;
  if (Date.now() > (prepared.staleAfter ?? 0)) {
    const refreshed = await callPluginTool<JupiterSwapPrepared>("jupiter", "refresh_swap", { config: prepared.config, summaryId });
    call = refreshed.calls[0] as SvmTxCall;
  }

  // 2. decode base64 → kit Transaction
  const bytes = Uint8Array.from(atob(call.base64), c => c.charCodeAt(0));
  const tx = getTransactionDecoder().decode(bytes);

  // 3. sign + send. Kit's signer wraps the wallet session and internally chooses
  //    between "partial" (sign locally, we send) and "send" (wallet signs+sends).
  const { signer } = createWalletTransactionSigner(session);
  const [signature] = await signer.signAndSendTransactions([tx]);

  // 4. confirm — poll signature status until lastValidBlockHeight passes or commitment="confirmed"
  await waitForConfirmation(rpc, signature, call.lastValidBlockHeight);
}
```

`waitForConfirmation` polls `rpc.getSignatureStatuses([sig]).send()` every 1 s; bails if `rpc.getBlockHeight().send()` exceeds `lastValidBlockHeight` (tx expired). Surfaces a typed error to `mapSwapExec` for the timeline UI.

The phase machine mirrors uniswap's `SwapExecute`:
`connect → ready → preflight (refresh if stale) → submitting → confirmed | error`.
No `switch-chain` phase (Solana has no chain switch — the connected wallet is implicitly mainnet; we surface an error if `session.chain !== SOLANA_MAINNET`).

### Widgets

- `jupiter-swap-summary` — show route (label list from `routePlan[].swapInfo.label`), `outAmount` (humanized), `priceImpactPct`, `slippageBps`, `liquidityNote`. CTA: "Execute" → swaps in `jupiter-swap-execute`.
- `jupiter-swap-execute` — the executor above + an `ExecuteTimeline` (re-uses `apps/web/components/primitives/ExecuteTimeline.tsx`) + on success a `SuccessCard` with `explorerTxUrl(SOLANA_MAINNET, sig)` from PR1's registry.

### Registration in apps/web

```ts
// apps/web/widgetRegistry.ts (additions)
import { JupiterSwapSummary, JupiterSwapExecute } from "@wishd/plugin-jupiter";
registry["jupiter-swap-summary"] = JupiterSwapSummary;
registry["jupiter-swap-execute"] = JupiterSwapExecute;

// apps/web/next.config.ts
transpilePackages: [..., "@wishd/plugin-jupiter"]   // CLAUDE.md trap (#1)
```

## Tests

Unit (vitest, in CI):
- `prepare.test.ts` — mocked `fetch` for `/quote` + `/swap`; mocked `Rpc<SolanaRpcApi>` for `getBalance` / `getTokenAccountBalance`. Asserts: emitted `SvmTxCall` shape, `staleAfter` set, slippage forwarding, `dynamicSlippage` toggle, insufficient balance flag, error path on Jupiter 400.
- `refresh.test.ts` — calling refresh with same config produces a new `staleAfter` and a new (possibly different) base64.
- `resolveAsset.test.ts` — curated hit, fallback hit (mocked Jupiter token API), miss raises typed error.
- `intents.test.ts` — `validateSwapValues` rejects same-in-out, bad amount, non-mainnet chain.
- Type-level: `expectTypeOf(prepared.call).toMatchTypeOf<SvmTxCall>()` — confirms PR1's discriminator narrows.

Integration: none in v1 (D8). README documents this and the rationale.

## Acceptance criteria

- `pnpm typecheck` clean across workspace including the new plugin package.
- `pnpm test` green; new plugin's unit tests cover `prepare`, `refresh`, `resolveAsset`, `intents`.
- Agent flow on local dev: typing "swap 0.1 SOL to USDC on Solana" produces a `jupiter-swap-summary` widget; clicking Execute opens `jupiter-swap-execute`, signs via Phantom (kit's `createWalletTransactionSigner` from `@solana/client`), submits, surfaces a Solscan link.
- Stale-blockhash path exercised: artificially set `staleAfter = Date.now() - 1000` in dev → execute calls `callPluginTool("jupiter", "refresh_swap", ...)` (which POSTs to the generic `/api/wish/jupiter/refresh_swap` route) and proceeds with the new tx.
- Manifest declares `chains: [SOLANA_MAINNET]` only; attempting to use the plugin from a devnet-connected wallet surfaces a clear "switch to Solana mainnet" error in the execute widget (no partial sign).
- `@wishd/plugin-jupiter` listed in `apps/web/next.config.ts` `transpilePackages` (CLAUDE.md recurring trap).
- No new top-level deps in workspace root; `@solana/client` and `@solana/react-hooks` already present in `apps/web`. Plugin package depends on `@solana/transactions` (already a transitive of `@solana/client`) — confirm at `pnpm install` time.

## Feedback to PR1 — RESOLVED

All 8 PR2 feedback items absorbed into PR1 spec on 2026-05-06 cross-review:
1. `/api/wish/[plugin]/[tool]` generic Next route + `callPluginTool()` / `registerPluginTool()` helpers — landed in PR1 §"Per-plugin Next route helper".
2. Client surface — `@wishd/plugin-sdk/svm/react` blessed hook re-exports + `@wishd/plugin-sdk/client/emit` bus — landed in PR1 §"Client surface".
3. `staleAfter: number` JSDoc'd as epoch ms — landed in PR1 type definitions.
4. `lastValidBlockHeight: bigint` strict; `BigInt()` normalization at REST boundary documented — landed in PR1 type JSDoc.
5. Disambiguation min-rule (chain-family) shipped in PR1 `prepareIntent.ts`, not deferred — landed in PR1 §"Disambiguation min-rule".
6. `@wishd/tokens.findByCaip19()` + canonical SOL = `slip44:501` — landed in PR1 §"Tokens API".
7. Explorer parameter named `sig` — landed in PR1 §"Explorer registry".
8. `mockSolanaRpc()` helper in `@wishd/plugin-sdk/svm/testing` — landed in PR1 §"Test scaffolding".

PR2 implementation depends on PR1 merging first.

---

Summary: this PR delivers the smallest credible Solana plugin that exercises every PR1 contract surface (CAIP-2 chains, `SvmTxCall`, `staleAfter`+`refresh`, priority fees, explorer registry, CAIP-19 assets) without taking on devnet aggregation, cross-chain, or shared-widget refactors. Mainnet-only, swap-only, unit-tests-only, REST-driven — a clean validation pass for PR1 and a foundation for PR3.

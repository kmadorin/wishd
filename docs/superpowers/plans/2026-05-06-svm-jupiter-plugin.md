# `@wishd/plugin-jupiter` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@wishd/plugin-jupiter` — the first Solana plugin on the chain-agnostic SDK — exposing a `jupiter.swap` intent that prepares a Jupiter REST `/quote` + `/swap` server-side, returns an `SvmTxCall`, and executes client-side via `useWalletAccountTransactionSendingSigner`.

**Architecture:** Mirror the `plugins/uniswap/` shape, but for Solana mainnet only. Server `prepare()` calls Jupiter v6 REST for quote + swap and emits a `Prepared<JupiterSwapExtras>` with a single `SvmTxCall { kind: "tx", base64, lastValidBlockHeight, staleAfter }`. Client widget decodes the base64 `VersionedTransaction`, signs via `@solana/react-hooks`, polls confirmation. Stale-blockhash refresh runs through the generic `/api/wish/[plugin]/[tool]` route from PR1.

**Tech Stack:** TypeScript, vitest, React 19, `@solana/client`, `@solana/react-hooks`, `@solana/transactions`, `@solana-program/token` (for ATA derivation), Jupiter REST `https://lite-api.jup.ag/swap/v1/{quote,swap}`, `@wishd/plugin-sdk` (PR1 surfaces).

**Spec:** `docs/superpowers/specs/2026-05-06-svm-jupiter-plugin-design.md`

**Depends on:** `docs/superpowers/plans/2026-05-06-svm-fork-a-sdk.md` (PR1) merged first. PR1 ships `Prepared<TExtras>`, `SvmTxCall`, `PluginCtx { family: "svm" }`, `SOLANA_MAINNET`, `humanizeChain`, `explorerTxUrl`, `findByCaip19`, `registerPluginTool`, `callPluginTool`, the generic `/api/wish/[plugin]/[tool]` route, blessed re-exports under `@wishd/plugin-sdk/svm/react`, the client emit bus under `@wishd/plugin-sdk/client/emit`, and `mockSolanaRpc()` under `@wishd/plugin-sdk/svm/testing`.

---

## File Structure

**New package** `plugins/jupiter/`:
- `package.json` — `@wishd/plugin-jupiter`, workspace pkg, mirrors uniswap's exports map.
- `tsconfig.json` — extends repo root, same shape as `plugins/uniswap/tsconfig.json`.
- `vitest.config.ts` — same shape as `plugins/uniswap/vitest.config.ts`.
- `index.ts` — `definePlugin({ manifest, mcp, widgets, intents })`; calls `registerPluginTool("jupiter", "refresh_swap", refreshSwap)` at module load.
- `manifest.ts` — `{ name: "jupiter", chains: [SOLANA_MAINNET], trust: "verified", provides: { intents: ["jupiter.swap"], widgets: [...], mcps: ["jupiter"] } }`.
- `addresses.ts` — `CURATED_MINTS` table keyed by symbol → `{ caip19, mint, decimals, isNative }`; `CURATED_SYMBOLS` (CAIP-19 list); `JUPITER_TOKEN_LIST_URL`.
- `resolveAsset.ts` — `resolveAsset(caip2, symbol)` → `{ mint, decimals, isNative }`. Curated → `findByCaip19` → Jupiter token API LRU fallback.
- `types.ts` — `JupiterSwapConfig`, `JupiterSwapQuote`, `JupiterSwapExtras`, `JupiterSwapPrepared = Prepared<JupiterSwapExtras>`, `Call = SvmTxCall`.
- `intents.ts` — `jupiterIntents: IntentSchema[]`; `validateSwapValues(values)`.
- `prepare.ts` — `prepareSwap(input)` server-side: validate → resolve → balance + `/quote` parallel → `/swap` → assemble `JupiterSwapPrepared`.
- `refresh.ts` — `refreshSwap({ config, summaryId })` re-runs `/quote` + `/swap`, returns fresh `JupiterSwapPrepared`.
- `mcp/server.ts` — `createJupiterMcp(ctx)` exposing `prepare_swap` only.
- `widgets/SwapSummary.tsx` — route + amounts + slippage + CTA.
- `widgets/SwapExecute.tsx` — decode/sign/send/confirm + stale-refresh via `callPluginTool`.
- `widgets/index.ts` — re-export `JupiterSwapSummary`, `JupiterSwapExecute`.
- `prepare.test.ts`, `refresh.test.ts`, `resolveAsset.test.ts`, `intents.test.ts`, `types.test-d.ts` (type-level).

**New apps/web file:**
- `apps/web/server/jupiterClients.ts` — `solanaRpcFor(caip2)` factory.

**Modified files:**
- `apps/web/widgetRegistry.ts` — register `jupiter-swap-summary`, `jupiter-swap-execute`.
- `apps/web/next.config.ts` — add `@wishd/plugin-jupiter` to `transpilePackages` (CLAUDE.md trap).
- `apps/web/package.json` — add `@wishd/plugin-jupiter: workspace:*` dependency.
- `apps/web/server/pluginLoader.ts` (or wherever uniswap is registered) — register jupiter plugin.
- `pnpm-workspace.yaml` — confirm `plugins/*` glob already covers it (no change expected; verify).

---

## Phase 1: Package scaffold

### Task 1: Create empty `@wishd/plugin-jupiter` package

**Files:**
- Create: `plugins/jupiter/package.json`
- Create: `plugins/jupiter/tsconfig.json`
- Create: `plugins/jupiter/vitest.config.ts`
- Create: `plugins/jupiter/index.ts` (stub)

- [ ] **Step 1: Verify workspace glob picks `plugins/jupiter`**

Run: `cat pnpm-workspace.yaml`. Expect `plugins/*` already in `packages:`. If not, add it; otherwise no edit.

- [ ] **Step 2: Copy uniswap package shape**

Mirror `plugins/uniswap/package.json` with these differences: `name = "@wishd/plugin-jupiter"`, drop `viem`/`wagmi` deps, add `@solana/client`, `@solana/react-hooks`, `@solana/transactions`, `@solana-program/token` (peer for ATA derivation). Keep `@wishd/plugin-sdk: workspace:*`, `@wishd/tokens: workspace:*`, `@modelcontextprotocol/sdk`, `react`, `zod`. Mirror the `exports` map: `.`, `./widgets`, `./mcp`, `./manifest`, `./prepare`, `./refresh`, `./addresses`, `./resolveAsset`, `./intents`, `./types`.

- [ ] **Step 3: Mirror tsconfig + vitest config**

Copy `plugins/uniswap/tsconfig.json` and `plugins/uniswap/vitest.config.ts` verbatim into `plugins/jupiter/`.

- [ ] **Step 4: Stub `index.ts`**

Single line: `export {};`. Keeps tsconfig happy until Phase 5.

- [ ] **Step 5: Install + typecheck**

Run: `pnpm install && pnpm --filter @wishd/plugin-jupiter typecheck`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/jupiter pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore(jupiter): scaffold @wishd/plugin-jupiter package"
```

### Task 2: Add to apps/web `transpilePackages` and `package.json`

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add dep**

Add `"@wishd/plugin-jupiter": "workspace:*"` to `apps/web/package.json` `dependencies`, alphabetical alongside other `@wishd/plugin-*` entries.

- [ ] **Step 2: Add to `transpilePackages`**

Edit `apps/web/next.config.ts` — append `"@wishd/plugin-jupiter"` to the existing `transpilePackages` array. This is the recurring trap in `CLAUDE.md` (#1) — failing this step → "No QueryClient set" wagmi/react-query split.

- [ ] **Step 3: Install + dev boot smoke**

```bash
pnpm install
pnpm --filter web dev
```

Visit http://localhost:3000. Expected: existing app renders, no console errors. Stop server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/next.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): wire @wishd/plugin-jupiter into transpilePackages"
```

---

## Phase 2: Core (addresses, resolveAsset, types, intents)

### Task 3: `addresses.ts` — curated mint table

**Files:**
- Create: `plugins/jupiter/addresses.ts`

- [ ] **Step 1: Write curated table**

Export `CURATED_MINTS: Record<string, { caip19: string; mint: string; decimals: number; isNative: boolean }>` for: `SOL` (native, mint = `So11111111111111111111111111111111111111112` for WSOL fallback, decimals 9, `caip19 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501"`, `isNative: true`), `USDC` (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 6), `USDT` (`Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, 6), `BONK` (`DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`, 5), `JUP` (`JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`, 6), `JTO` (`jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL`, 9), `mSOL` (`mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So`, 9), `jupSOL` (`jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v`, 9). For non-native CAIP-19 use `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:<mint>`.

Also export:
- `CURATED_SYMBOLS: string[]` — the keys of `CURATED_MINTS`, plus a parallel `CURATED_CAIP19: string[]` for use as the intent `asset` field's `options`.
- `JUPITER_TOKEN_LIST_URL = "https://tokens.jup.ag/tokens?tags=verified"`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-jupiter typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/jupiter/addresses.ts
git commit -m "feat(jupiter): curated mint table + Jupiter token list URL"
```

### Task 4: `types.ts` — config, quote, extras, prepared

**Files:**
- Create: `plugins/jupiter/types.ts`

- [ ] **Step 1: Write types**

Export:
- `JupiterSwapConfig = { caip2: string; swapper: string; inputMint: string; outputMint: string; assetIn: string; assetOut: string; amountAtomic: string; slippageBps: number; dynamicSlippage: boolean }`.
- `JupiterSwapQuote = { inAmount: string; outAmount: string; otherAmountThreshold: string; priceImpactPct: string; routePlan: Array<{ swapInfo: { ammKey: string; label: string; inputMint: string; outputMint: string } }>; contextSlot: number; timeTaken: number }`.
- `JupiterSwapExtras = { config: JupiterSwapConfig; initialQuote: JupiterSwapQuote; initialQuoteAt: number; balance: string; insufficient: boolean; liquidityNote?: string; keeperOffers: KeeperOffer[] }` — `KeeperOffer` imported from `@wishd/plugin-sdk` (re-uses uniswap's shape).
- `import type { Prepared, SvmTxCall } from "@wishd/plugin-sdk";`
- `JupiterSwapPrepared = Prepared<JupiterSwapExtras>`.
- `Call = SvmTxCall` (alias for clarity).

- [ ] **Step 2: Type-level test**

Create `plugins/jupiter/types.test-d.ts` using `expectTypeOf`:
- assert `JupiterSwapPrepared["calls"][number]` matches `SvmTxCall`.
- assert `JupiterSwapPrepared["config"]` is `JupiterSwapConfig`.
- assert `JupiterSwapPrepared["staleAfter"]` is `number | undefined`.

Run: `pnpm --filter @wishd/plugin-jupiter test -- types.test-d` — expect PASS (vitest's `expectTypeOf` runs at compile time).

- [ ] **Step 3: Commit**

```bash
git add plugins/jupiter/types.ts plugins/jupiter/types.test-d.ts
git commit -m "feat(jupiter): types — config, quote, extras, prepared"
```

### Task 5: `intents.ts` — schema + validator (TDD)

**Files:**
- Test: `plugins/jupiter/intents.test.ts`
- Create: `plugins/jupiter/intents.ts`

- [ ] **Step 1: Write the failing test**

Cases:
1. `validateSwapValues({ amount: "0.1", assetIn: "SOL", assetOut: "USDC", chain: SOLANA_MAINNET, slippage: "0.5%" })` → `{ ok: true }`.
2. Same `assetIn` / `assetOut` → `{ ok: false, error: /same input and output/i }`.
3. `amount = "abc"` → `{ ok: false, error: /amount/i }`.
4. `amount = "-1"` → `{ ok: false, error: /amount/i }`.
5. `chain = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"` (devnet) → `{ ok: false, error: /mainnet only/i }`.
6. `chain = "eip155:1"` → `{ ok: false, error: /chain/i }`.
7. `jupiterIntents` exported, length 1, has `intent === "jupiter.swap"`, `verb === "swap"`, `widget === "jupiter-swap-summary"`, `slot === "flow"`, fields include `amount`, `assetIn`, `assetOut`, `chain`, `slippage`. `chain.options` = `[SOLANA_MAINNET]`.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-jupiter test -- intents`. Expected: module-not-found.

- [ ] **Step 3: Implement**

Write `intents.ts`:
- Import `SOLANA_MAINNET` from `@wishd/plugin-sdk`, `CURATED_CAIP19` from `./addresses`.
- Export `jupiterIntents: IntentSchema[]` matching spec §"Intent schema" exactly.
- Export `validateSwapValues(values: Record<string, string>)` returning `{ ok: true } | { ok: false, error: string }` covering the rejection cases above. Allowed slippage values: `"0.1%", "0.5%", "1%", "auto"`.

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @wishd/plugin-jupiter test -- intents`. Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add plugins/jupiter/intents.ts plugins/jupiter/intents.test.ts
git commit -m "feat(jupiter): intent schema + validateSwapValues"
```

### Task 6: `resolveAsset.ts` (TDD with mocked fetch)

**Files:**
- Test: `plugins/jupiter/resolveAsset.test.ts`
- Create: `plugins/jupiter/resolveAsset.ts`

- [ ] **Step 1: Write the failing test**

Mock `fetch` (via `vi.stubGlobal`) and `@wishd/tokens` `findByCaip19`. Cases:
1. Curated hit: `resolveAsset(SOLANA_MAINNET, "USDC")` returns `{ mint: "EPjFW...", decimals: 6, isNative: false }`. `fetch` not called.
2. `findByCaip19` hit when symbol unknown to curated but known to tokens pkg — returns its mint/decimals.
3. Fallback hit: symbol absent everywhere; `fetch(JUPITER_TOKEN_LIST_URL)` returns `[{ symbol: "FOO", address: "FoO...", decimals: 4 }]` → returns `{ mint: "FoO...", decimals: 4, isNative: false }`.
4. LRU: second call for `"FOO"` does NOT call `fetch` again.
5. Miss: symbol nowhere → throws `Error` matching `/unknown asset/i`.
6. Native SOL bypass: `resolveAsset(SOLANA_MAINNET, "SOL")` returns `isNative: true`.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-jupiter test -- resolveAsset`. Expected: module-not-found.

- [ ] **Step 3: Implement**

Write `resolveAsset.ts`:
- Module-level `Map<string, { mint, decimals, isNative }>` keyed by `${caip2}:${symbol.toUpperCase()}` for the LRU.
- Lookup order: curated → `findByCaip19(<computed CAIP-19 from symbol via tokens pkg findBySymbol>)` → `fetch(JUPITER_TOKEN_LIST_URL)` cached at module scope (1 h TTL via timestamp) → throw.
- Always set the per-symbol cache entry on success.

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @wishd/plugin-jupiter test -- resolveAsset`. Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add plugins/jupiter/resolveAsset.ts plugins/jupiter/resolveAsset.test.ts
git commit -m "feat(jupiter): resolveAsset (curated + tokens pkg + Jupiter API LRU)"
```

---

## Phase 3: Server (jupiterClients, prepare, refresh, MCP)

### Task 7: `apps/web/server/jupiterClients.ts`

**Files:**
- Create: `apps/web/server/jupiterClients.ts`

- [ ] **Step 1: Implement**

Write `solanaRpcFor(caip2: string)`:
- Import `SOLANA_MAINNET, isSvmCaip2` from `@wishd/plugin-sdk`.
- Import `createSolanaRpc` from `@solana/client`.
- If `caip2 !== SOLANA_MAINNET` → throw `Error("jupiter is mainnet-only")`.
- Read `process.env.SOLANA_RPC_URL_SERVER`; default to `https://api.mainnet-beta.solana.com` (public; documented best-effort).
- Return `createSolanaRpc(url)`.

Also export a stable env doc comment listing `SOLANA_RPC_URL_SERVER`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/jupiterClients.ts
git commit -m "feat(web): add server-side solanaRpcFor factory for Jupiter"
```

### Task 8: `prepare.ts` (TDD with mocked fetch + mockSolanaRpc)

**Files:**
- Test: `plugins/jupiter/prepare.test.ts`
- Create: `plugins/jupiter/prepare.ts`

- [ ] **Step 1: Write the failing test**

Imports: `mockSolanaRpc` from `@wishd/plugin-sdk/svm/testing`, `SOLANA_MAINNET` from `@wishd/plugin-sdk`. Stub global `fetch`.

`PrepareInput = { values: Record<string,string>; swapper: string; rpc: ReturnType<typeof mockSolanaRpc>; }`. Cases:

1. **Happy path SOL→USDC**:
   - `rpc.getBalance.send` returns `{ value: 5_000_000_000n }` (5 SOL).
   - `fetch` first call (URL contains `/quote`) returns 200 JSON quote with `inAmount: "100000000"`, `outAmount: "9500000"`, `priceImpactPct: "0.1"`, `routePlan: [{ swapInfo: { label: "Whirlpool", ... } }]`, `contextSlot: 1, timeTaken: 0.05`.
   - `fetch` second call (URL contains `/swap`) returns `{ swapTransaction: "BASE64...", lastValidBlockHeight: 280000000 }`.
   - Assert returned `prepared`:
     - `prepared.calls.length === 1`.
     - `prepared.calls[0]` matches `{ family: "svm", caip2: SOLANA_MAINNET, kind: "tx", base64: "BASE64...", lastValidBlockHeight: 280000000n }`.
     - `prepared.staleAfter` is a number in `[Date.now()+24_500, Date.now()+25_500]`.
     - `prepared.config` round-trip preserved.
     - `prepared.initialQuote.outAmount === "9500000"`.
     - `prepared.balance === "5"`, `prepared.insufficient === false`.

2. **Insufficient balance**: balance = `1_000_000n` (0.001 SOL), amount = `"0.1"` → `prepared.insufficient === true`. Quote/swap still attempted (no early throw); spec keeps `insufficient` as a flag, not error.

3. **Slippage forwarding**: `slippage: "1%"` → `/quote` URL contains `slippageBps=100`; `dynamicSlippage` not present.

4. **Auto slippage**: `slippage: "auto"` → `/quote` URL contains `dynamicSlippage=true`.

5. **`/quote` 400**: throws `Error` matching `/jupiter quote/i`.

6. **`/swap` 400**: throws `Error` matching `/jupiter swap/i`.

7. **SPL→SPL balance path**: input `assetIn: "USDC"` → `rpc.getTokenAccountBalance.send` invoked with derived ATA (mock returns `{ value: { amount: "1000000000", decimals: 6 } }`); `prepared.balance === "1000"`.

8. **Priority fee body**: assert `/swap` POST body contains `prioritizationFeeLamports.priorityLevelWithMaxLamports.maxLamports === 5_000_000` and `priorityLevel === "high"`, and `wrapAndUnwrapSol === true`, and `dynamicComputeUnitLimit === true`.

9. **`SvmTxCall.lastValidBlockHeight` is bigint**: `typeof prepared.calls[0].lastValidBlockHeight === "bigint"` even though Jupiter returns a JSON number.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-jupiter test -- prepare`. Expected: module-not-found.

- [ ] **Step 3: Implement**

Write `prepare.ts`:
- Signature: `export async function prepareSwap(input: { values: Record<string,string>; swapper: string; rpc: SolanaRpc; }): Promise<JupiterSwapPrepared>`.
- Step 1: `validateSwapValues(values)` → throw on `ok: false`.
- Step 2: `resolveAsset(caip2, assetIn)` + `resolveAsset(caip2, assetOut)` parallel.
- Step 3: `amountAtomic = parseUnits(values.amount, decimalsIn)`. Implement `parseUnits` locally (no viem — use BigInt math + decimal regex).
- Step 4: `Promise.all([balance, quote])`:
  - Balance: native → `rpc.getBalance(swapper).send()` and humanize via `lamports / 10^9`. SPL → derive ATA via `@solana-program/token` `findAssociatedTokenPda({ owner, mint, tokenProgram })`, then `rpc.getTokenAccountBalance(ata).send()`. On `TokenAccountNotFound` → balance `"0"`.
  - Quote: `GET https://lite-api.jup.ag/swap/v1/quote?inputMint=…&outputMint=…&amount=…&slippageBps=…[&dynamicSlippage=true]`. Throw `Error("jupiter quote failed: <status>")` on non-200.
- Step 5: `POST https://lite-api.jup.ag/swap/v1/swap` body `{ quoteResponse, userPublicKey: swapper, wrapAndUnwrapSol: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 5_000_000, priorityLevel: "high" } }, dynamicComputeUnitLimit: true }`. Throw `Error("jupiter swap failed: <status>")` on non-200.
- Step 6: Assemble:
  ```
  calls: [{ family: "svm", caip2, kind: "tx", base64: swapTransaction, lastValidBlockHeight: BigInt(lastValidBlockHeight), staleAfter }]
  staleAfter: Date.now() + 25_000
  config, initialQuote, initialQuoteAt: Date.now(), balance, insufficient, keeperOffers: []
  ```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @wishd/plugin-jupiter test -- prepare`. Expected: 9 cases green.

- [ ] **Step 5: Commit**

```bash
git add plugins/jupiter/prepare.ts plugins/jupiter/prepare.test.ts
git commit -m "feat(jupiter): prepare — quote+swap+balance → SvmTxCall Prepared"
```

### Task 9: `refresh.ts` (TDD)

**Files:**
- Test: `plugins/jupiter/refresh.test.ts`
- Create: `plugins/jupiter/refresh.ts`

- [ ] **Step 1: Write the failing test**

Cases:
1. `refreshSwap({ config, summaryId, rpc })` re-runs quote+swap; returns `JupiterSwapPrepared` with a new `staleAfter > previous staleAfter` and a possibly new `base64`.
2. Refresh preserves config (round-trip equality).
3. Failure (`/swap` 400) bubbles up.

Use the same fetch + `mockSolanaRpc` setup as Task 8.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-jupiter test -- refresh`. Expected: module-not-found.

- [ ] **Step 3: Implement**

`refresh.ts` exports `refreshSwap({ config, summaryId, rpc }: { config: JupiterSwapConfig; summaryId: string; rpc: SolanaRpc }): Promise<JupiterSwapPrepared>`. Re-runs `/quote` + `/swap` against `config` (no asset re-resolution, no balance re-fetch — refresh is fast-path; balance from `prepare` is informational and not safety-critical at sign time). Returns new `Prepared` with same `config` shape.

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @wishd/plugin-jupiter test -- refresh`. Expected: 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add plugins/jupiter/refresh.ts plugins/jupiter/refresh.test.ts
git commit -m "feat(jupiter): refresh — re-quote + re-swap on stale blockhash"
```

### Task 10: MCP server with `prepare_swap`

**Files:**
- Create: `plugins/jupiter/mcp/server.ts`

- [ ] **Step 1: Implement**

Mirror `plugins/uniswap/mcp/server.ts` shape:
- `createJupiterMcp(ctx: PluginCtx)` — assert `ctx.family === "svm"`; use `ctx.rpc`.
- Build with `createSdkMcpServer({ name: "jupiter", version: "0.0.0", tools: [...] })`.
- Single tool `prepare_swap` with zod input schema: `{ values: { amount, assetIn, assetOut, chain, slippage }, swapper: string }`. Handler calls `prepareSwap({ values, swapper, rpc: ctx.rpc })` and returns `{ content: [{ type: "text", text: JSON.stringify(prepared) }] }`. JSON-stringify must `BigInt → string`-coerce (`prepared.calls[0].lastValidBlockHeight.toString()`).
- Do NOT register `refresh_swap` here — that's a plugin-tool route registration done in `index.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-jupiter typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/jupiter/mcp/server.ts
git commit -m "feat(jupiter): MCP server with prepare_swap tool"
```

### Task 11: `index.ts` — definePlugin + registerPluginTool

**Files:**
- Modify: `plugins/jupiter/index.ts`

- [ ] **Step 1: Replace stub**

```
import { definePlugin, registerPluginTool } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { jupiterIntents } from "./intents";
import { createJupiterMcp } from "./mcp/server";
import { JupiterSwapSummary, JupiterSwapExecute } from "./widgets";
import { refreshSwap } from "./refresh";
import { solanaRpcFor } from "../../apps/web/server/jupiterClients";   // see note

registerPluginTool("jupiter", "refresh_swap", async (body) => {
  const { config, summaryId } = body as { config: JupiterSwapConfig; summaryId: string };
  return refreshSwap({ config, summaryId, rpc: solanaRpcFor(config.caip2) });
});

export const jupiter = definePlugin({
  manifest,
  mcp(ctx) { return { server: createJupiterMcp(ctx) as any, serverName: "jupiter" }; },
  widgets: { "jupiter-swap-summary": JupiterSwapSummary, "jupiter-swap-execute": JupiterSwapExecute },
  intents: jupiterIntents,
});

export { JupiterSwapSummary, JupiterSwapExecute, manifest, jupiterIntents };
```

NOTE on the `solanaRpcFor` import path: importing from `apps/web/server/jupiterClients` from inside the plugin package crosses workspace boundaries. **Preferred**: pass the rpc factory in at registration time from the host app instead. Implement that as: have `apps/web/server/pluginLoader.ts` (or wherever uniswap registers) call `registerPluginTool("jupiter", "refresh_swap", buildRefreshHandler(solanaRpcFor))` after importing `buildRefreshHandler` from `@wishd/plugin-jupiter/refresh`. Then the plugin's `index.ts` does NOT call `registerPluginTool` itself — it exports `buildRefreshHandler`. Pick this approach. Update Task 11 step 1 accordingly: `index.ts` exports `buildRefreshHandler(rpcFor: (caip2: string) => SolanaRpc) = async (body) => refreshSwap({ ...body, rpc: rpcFor(body.config.caip2) })`. Host app does the wiring in Task 14.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-jupiter typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/jupiter/index.ts plugins/jupiter/refresh.ts
git commit -m "feat(jupiter): definePlugin entry + buildRefreshHandler factory"
```

---

## Phase 4: Client widgets

### Task 12: `widgets/SwapSummary.tsx`

**Files:**
- Create: `plugins/jupiter/widgets/SwapSummary.tsx`

- [ ] **Step 1: Implement**

Props: `{ id: string; prepared: JupiterSwapPrepared; }` (mirrors uniswap SwapSummary). Render:
- Header: `humanizeChain(SOLANA_MAINNET)` + assetIn/assetOut.
- Route line: `prepared.initialQuote.routePlan.map(r => r.swapInfo.label).join(" → ")`.
- Output amount: `formatUnits(BigInt(prepared.initialQuote.outAmount), decimalsOut)` (decimalsOut from `resolveAsset` cache; cheap fix: pass `decimalsOut` in `JupiterSwapExtras` — add field to `types.ts` and `prepare.ts` if not present). Update Task 4 + 8 accordingly: extend `JupiterSwapExtras` with `decimalsIn: number, decimalsOut: number`.
- Price impact + slippage display.
- `liquidityNote` if present.
- CTA button "Execute" → emits `{ type: "ui.render", widget: { id: ..., type: "jupiter-swap-execute", slot: "flow", props: { prepared } } }` via `useEmit()` from `@wishd/plugin-sdk/client/emit`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-jupiter typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/jupiter/widgets/SwapSummary.tsx plugins/jupiter/types.ts plugins/jupiter/prepare.ts
git commit -m "feat(jupiter): SwapSummary widget + decimals on extras"
```

### Task 13: `widgets/SwapExecute.tsx`

**Files:**
- Create: `plugins/jupiter/widgets/SwapExecute.tsx`
- Create: `plugins/jupiter/widgets/index.ts`

- [ ] **Step 1: Implement `SwapExecute.tsx`**

Imports through SDK blessed re-exports:
```
import { useSolanaClient, useWalletConnection, useWalletAccountTransactionSendingSigner } from "@wishd/plugin-sdk/svm/react";
import { callPluginTool } from "@wishd/plugin-sdk/routes";
import { explorerTxUrl } from "@wishd/plugin-sdk";
import { getTransactionDecoder } from "@solana/transactions";
import { useEmit } from "@wishd/plugin-sdk/client/emit";
```

Phase machine state: `"connect" | "ready" | "preflight" | "submitting" | "confirmed" | "error"`.

`execute()` flow:
1. Read `prepared.calls[0]` → narrow to `SvmTxCall` via `call.family === "svm" && call.kind === "tx"`. If not, set error state.
2. If `session.chain !== SOLANA_MAINNET` → set error state with text `"switch to Solana mainnet"`. Return.
3. If `Date.now() > (call.staleAfter ?? 0)` → set phase `"preflight"`; await `callPluginTool<JupiterSwapPrepared>("jupiter", "refresh_swap", { config: prepared.config, summaryId: id })`. Replace `call` with the refreshed first call.
4. Decode: `const bytes = Uint8Array.from(atob(call.base64), c => c.charCodeAt(0)); const tx = getTransactionDecoder().decode(bytes);`.
5. Sign + send: `const sendingSigner = useWalletAccountTransactionSendingSigner(session.account, call.caip2);` (hook called at top of component, not inside `execute`); `const [signature] = await sendingSigner.signAndSendTransactions([tx]);`.
6. Confirm via `waitForConfirmation(rpc, signature, call.lastValidBlockHeight)` — local helper polling `rpc.getSignatureStatuses([sig]).send()` every 1 s, bails when `rpc.getBlockHeight().send()` exceeds `lastValidBlockHeight` (throw `"transaction expired"`), success when `value[0]?.confirmationStatus === "confirmed"`.
7. On success → render `SuccessCard` with link `explorerTxUrl(SOLANA_MAINNET, signature)`. Phase `"confirmed"`.
8. On error → phase `"error"`, render error message + "retry" button that calls `execute()` again.

Re-use `apps/web/components/primitives/ExecuteTimeline.tsx` for phase visualisation (uniswap parity).

- [ ] **Step 2: Implement `widgets/index.ts`**

```
export { JupiterSwapSummary } from "./SwapSummary";
export { JupiterSwapExecute } from "./SwapExecute";
```

(Exported names — ensure components in step 1 use these `Jupiter*` exports.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wishd/plugin-jupiter typecheck`. Expected: PASS. If `getTransactionDecoder` not present in installed `@solana/transactions` major, run `node -e "console.log(Object.keys(require('@solana/transactions')))"` and adjust import to actual export name.

- [ ] **Step 4: Commit**

```bash
git add plugins/jupiter/widgets/SwapExecute.tsx plugins/jupiter/widgets/index.ts
git commit -m "feat(jupiter): SwapExecute widget (decode/sign/send/confirm)"
```

---

## Phase 5: Wire-in

### Task 14: Register in `apps/web`

**Files:**
- Modify: `apps/web/widgetRegistry.ts`
- Modify: `apps/web/server/pluginLoader.ts` (or equivalent registration point)
- Modify: `apps/web/server/intentRegistry.ts` (if intents are registered server-side)

- [ ] **Step 1: Widget registry**

Add to `apps/web/widgetRegistry.ts`:
```
import { JupiterSwapSummary, JupiterSwapExecute } from "@wishd/plugin-jupiter/widgets";
registry["jupiter-swap-summary"] = JupiterSwapSummary;
registry["jupiter-swap-execute"] = JupiterSwapExecute;
```

- [ ] **Step 2: Plugin loader**

In `apps/web/server/pluginLoader.ts`: import `jupiter` from `@wishd/plugin-jupiter`, append to the plugin list. Import `buildRefreshHandler` from `@wishd/plugin-jupiter` and `solanaRpcFor` from `@/server/jupiterClients`; call `registerPluginTool("jupiter", "refresh_swap", buildRefreshHandler(solanaRpcFor))` here (single source of truth — Task 11 NOTE).

If the plugin loader uses the SDK's `PluginCtx`, ensure for Solana family: when `jupiter` is loaded, build `ctx = { family: "svm", rpc: solanaRpcFor(SOLANA_MAINNET), emit, caip2: SOLANA_MAINNET }`.

- [ ] **Step 3: Intent registry**

If `apps/web/lib/intentRegistry.client.ts` or server analogue manually lists schemas, append `jupiterIntents`. (PR1's per-plugin `intents` field on `definePlugin` may already auto-register; verify by reading PR1 plan's intent registry task. If auto, no edit needed.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`. Expected: PASS.

- [ ] **Step 5: Build smoke**

Run: `pnpm --filter web build`. Expected: success, no SSR errors, no transpile errors. If a `getRandomValues` / `crypto` polyfill issue surfaces from `@solana/transactions`, follow the `transpilePackages` recipe (already done Task 2) and verify by reading the build error.

- [ ] **Step 6: Commit**

```bash
git add apps/web/widgetRegistry.ts apps/web/server/pluginLoader.ts apps/web/server/intentRegistry.ts
git commit -m "feat(web): register jupiter plugin (widgets, loader, refresh route)"
```

---

## Phase 6: Verification

### Task 15: Full workspace sweep

**Files:** none.

- [ ] **Step 1: Workspace typecheck**

Run: `pnpm typecheck`. Expected: clean.

- [ ] **Step 2: Workspace tests**

Run: `pnpm test`. Expected: all green, including new `prepare.test.ts`, `refresh.test.ts`, `resolveAsset.test.ts`, `intents.test.ts`, `types.test-d.ts`.

- [ ] **Step 3: Existing uniswap regression check**

Confirm `plugins/uniswap/*.test.ts` still pass. (No edits expected to uniswap; this is a sanity gate.)

### Task 16: Manual end-to-end demo

**Files:** none.

- [ ] **Step 1: Set env**

Set `SOLANA_RPC_URL_SERVER` to a Helius/QuickNode mainnet endpoint (free tiers fine). Confirm Phantom installed in browser, on Solana mainnet, with at least 0.05 SOL.

- [ ] **Step 2: Boot**

Run: `pnpm --filter web dev`.

- [ ] **Step 3: Connect Phantom**

Open http://localhost:3000, open wallet drawer, connect Phantom. Confirm Solana card visible (multi-wallet PR already shipped).

- [ ] **Step 4: Trigger intent**

Type into composer: `"swap 0.01 SOL to USDC on Solana"`. Expected: `jupiter-swap-summary` widget renders with route, output amount, slippage.

- [ ] **Step 5: Execute**

Click Execute → `jupiter-swap-execute` mounts. Phantom prompts for signature. Sign. Expected: phase transitions `ready → submitting → confirmed`. Solscan link appears, opens to a confirmed tx.

- [ ] **Step 6: Stale-blockhash refresh path**

In dev, temporarily edit `prepare.ts` to set `staleAfter: Date.now() - 1000` (always stale) OR use a debug query param wired to your dev page. Re-run intent. Expected: execute widget shows brief `"preflight"` phase, network tab shows `POST /api/wish/jupiter/refresh_swap`, then proceeds to sign with the refreshed tx. **Revert the dev edit before commit.**

- [ ] **Step 7: Mainnet-only error path**

Switch Phantom to Devnet (wallet UI). Trigger intent. Expected: execute widget surfaces `"switch to Solana mainnet"` error before any signature prompt.

- [ ] **Step 8: Production build**

Run: `pnpm --filter web build`. Expected: success.

---

## Dependencies on PR1

Plugin requires the following exports from `@wishd/plugin-sdk` shipped by PR1 (`docs/superpowers/plans/2026-05-06-svm-fork-a-sdk.md`):

- **Types**: `Prepared<TExtras>`, `Manifest` (with `chains: string[]` CAIP-2), `IntentSchema`, `IntentField` (with `chain`/`asset`/`amount`/`select` variants), `Call` union, `SvmTxCall`, `PluginCtx { family: "svm"; rpc; emit; caip2 }`, `KeeperOffer`, `ServerEvent`.
- **CAIP helpers**: `SOLANA_MAINNET`, `SOLANA_DEVNET`, `EIP155`, `isSvmCaip2`, `humanizeChain`, `parseCaip19`.
- **Explorer registry**: `explorerTxUrl(caip2, sig)`.
- **Routes**: `registerPluginTool`, `callPluginTool`, the mounted `/api/wish/[plugin]/[tool]` Next route.
- **Client surface**: `@wishd/plugin-sdk/svm/react` re-exports of `useSolanaClient`, `useWalletConnection`, `useWalletAccountTransactionSendingSigner`.
- **Emit bus**: `useEmit` from `@wishd/plugin-sdk/client/emit`.
- **Tokens**: `findByCaip19`, canonical native SOL CAIP-19 (`solana:5eykt4.../slip44:501`) from `@wishd/tokens`.
- **Test scaffolding**: `mockSolanaRpc()` from `@wishd/plugin-sdk/svm/testing`.
- **Intent registry behavior**: multi-claim `Map<verb, RegisteredIntent[]>` and chain-family disambiguation min-rule in `apps/web/lib/prepareIntent.ts` (so `jupiter.swap` and `uniswap.swap` can co-exist under verb `swap`).
- **Plugin definer**: `definePlugin({ manifest, mcp, widgets, intents })`.

If any of the above is missing or named differently when this plan is executed, stop and reconcile against PR1's plan rather than guessing — the spec's "Feedback to PR1 — RESOLVED" section locks each name.

---

## Verification checklist (maps to spec acceptance criteria)

- [ ] `pnpm typecheck` clean across workspace including `@wishd/plugin-jupiter` — Task 15 step 1.
- [ ] `pnpm test` green; new plugin's unit tests cover `prepare`, `refresh`, `resolveAsset`, `intents` — Tasks 5, 6, 8, 9, 15 step 2.
- [ ] Type-level test asserts `JupiterSwapPrepared["calls"][number]` matches `SvmTxCall` — Task 4 step 2.
- [ ] Agent flow demo: "swap 0.1 SOL to USDC on Solana" → `jupiter-swap-summary` → Execute → Phantom signs → Solscan link — Task 16 steps 4–5.
- [ ] Stale-blockhash path: `staleAfter < now` → executor calls `callPluginTool("jupiter", "refresh_swap", ...)` → POST `/api/wish/jupiter/refresh_swap` — Task 16 step 6.
- [ ] Manifest declares `chains: [SOLANA_MAINNET]` only — Task 1 + Task 8 case 2 indirect; explicit assertion in `intents.test.ts` case 5.
- [ ] Devnet wallet → execute widget surfaces "switch to Solana mainnet" before signing — Task 13 step 1 (phase machine guard) + Task 16 step 7.
- [ ] `@wishd/plugin-jupiter` listed in `apps/web/next.config.ts` `transpilePackages` — Task 2 step 2.
- [ ] No new top-level deps in workspace root; new deps live inside `plugins/jupiter/package.json` only — Task 1 step 2.
- [ ] Single `SvmTxCall` returned with `staleAfter`, `lastValidBlockHeight: bigint`, `caip2: SOLANA_MAINNET`, `kind: "tx"` — Task 8 cases 1, 9.
- [ ] Slippage: default `50` bps; `"auto"` → `dynamicSlippage: true` — Task 8 cases 3, 4.
- [ ] Priority fee: `priorityLevelWithMaxLamports.maxLamports = 5_000_000`, `priorityLevel = "high"`, `wrapAndUnwrapSol: true`, `dynamicComputeUnitLimit: true` — Task 8 case 8.
- [ ] MCP server name `jupiter` exposes only `prepare_swap`; `refresh_swap` registered via `registerPluginTool` — Tasks 10 + 14 step 2.
- [ ] No integration test suite (D8) — README in `plugins/jupiter/` to be updated noting this; not gating but documented in Task 1 if README created.

---

## Self-review notes

- **Spec coverage**: each numbered "must cover" item in the prompt maps to a phase task: (1) Tasks 1–13; (2) Task 5; (3) Task 8; (4) Task 9; (5) Task 3; (6) Task 6; (7) Tasks 10 + 11 + 14; (8) Tasks 12 + 13; (9) Task 7; (10) Tasks 2 + 14; (11) Tasks 5, 6, 8, 9, 4; (12) Task 16.
- **Type-name consistency**: `JupiterSwapConfig`, `JupiterSwapQuote`, `JupiterSwapExtras`, `JupiterSwapPrepared`, `SvmTxCall`, `JupiterSwapSummary`, `JupiterSwapExecute`, `prepareSwap`, `refreshSwap`, `buildRefreshHandler`, `solanaRpcFor`, `resolveAsset`, `validateSwapValues`, `jupiterIntents`, `CURATED_MINTS`, `CURATED_CAIP19`, `JUPITER_TOKEN_LIST_URL` — used identically across tasks.
- **Decimals plumbing**: Task 12 step 1 surfaced the need for `decimalsIn`/`decimalsOut` on `JupiterSwapExtras`; Tasks 4, 8, 12 updated together.
- **Refresh handler wiring**: NOTE in Task 11 resolved by Task 14 step 2 — host app builds the refresh handler via `buildRefreshHandler(solanaRpcFor)`, plugin doesn't import `apps/web/*`.
- **Mainnet-only guard**: enforced at three layers — manifest (`chains: [SOLANA_MAINNET]`), intent (`chain.options = [SOLANA_MAINNET]` + `validateSwapValues` rejection), executor (Task 13 step 1, phase 2 of `execute()`).

# `@wishd/plugin-lifi` — cross-chain bridge-swap (Pattern X) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@wishd/plugin-lifi` as the first cross-chain wishd plugin: a `lifi.bridge-swap` intent that uses Li.Fi REST `/quote` for routing, returns one user-signed source-chain `EvmCall` (optionally preceded by an approval `EvmCall`), and drives destination delivery off-chain via a `LifiStatusObservation` polled by an executor poller — all surviving page refresh through a zustand-persist store.

**Architecture:** Plugin package mirrors `plugins/uniswap/` and `plugins/jupiter/` (PR2). Server side: `prepare.ts` (validate → resolveAsset → Li.Fi `/quote` → allowance check → calls + observation), `refresh.ts` registered as plugin-tool, MCP server (`prepare_bridge_swap`, `get_bridge_status`), and `apps/web/server/lifiClients.ts` (per-chain viem `evmPublicClientFor` + `lifiFetch` w/ `LIFI_API_KEY`). Client side: 3 widgets (`BridgeSummary`, `BridgeExecute`, `BridgeProgress`) + zustand `bridgeProgressStore` keyed by source `txHash`. Observation runtime: `LifiStatusPoller` with exponential backoff (3s → 15s, 15-min timeout) emitting `ServerEvent`s via PR1's `useEmit()`.

**Tech Stack:** TypeScript, Next.js 15, React 19, viem, wagmi v2, `@solana/react-hooks`, zustand + persist, vitest, `@wishd/plugin-sdk` (PR1), `@wishd/plugin-jupiter` (PR2 token-list helper), Li.Fi REST API (`https://li.quest/v1`).

**Spec:** `docs/superpowers/specs/2026-05-06-lifi-cross-chain-plugin-design.md`

**Prereqs:** PR1 (`@wishd/plugin-sdk` SVM fork) merged. PR2 (`@wishd/plugin-jupiter`) merged. PR1 provides `Prepared<TExtras>`, `Observation` union (incl. `LifiStatusObservation`), `Placeholder`, `EvmCall`, `Manifest.primaryChainField`, `registerPluginTool` / `callPluginTool`, `useEmit`, `ServerEvent.recovery`. PR2 provides Jupiter plugin pattern + exported SVM verified-token-list fetcher.

---

## File Structure

**New package: `plugins/lifi/`**

- `plugins/lifi/package.json` — workspace package `@wishd/plugin-lifi`, exports mirror uniswap.
- `plugins/lifi/tsconfig.json` — extends repo base; same as uniswap.
- `plugins/lifi/vitest.config.ts` — same as uniswap.
- `plugins/lifi/index.ts` — `definePlugin({ manifest, mcp, widgets, intents })` + `registerPluginTool("lifi", "refresh_quote", refreshBridgeSwap)`.
- `plugins/lifi/manifest.ts` — `Manifest` with 5 EVM chains + Solana mainnet, `primaryChainField: "fromChain"`, `trust: "verified"`, `name: "lifi"`.
- `plugins/lifi/intents.ts` — `lifiIntents: IntentSchema[]` + `validateBridgeValues()`.
- `plugins/lifi/addresses.ts` — `CURATED_ASSETS` map (CAIP-19 keyed); `CURATED_SYMBOLS_EVM`, `CURATED_SYMBOLS_ALL`; `SOLANA_MAINNET` constant.
- `plugins/lifi/types.ts` — `LifiBridgeConfig`, `LifiQuoteEstimate`, `LifiBridgeExtras`, `LifiBridgePrepared`, `LifiBridgeStatus`, `LifiStatusResponse`.
- `plugins/lifi/resolveAsset.ts` — `resolveAsset(caip2, symbol): Promise<ResolvedAsset>` — curated → `@wishd/tokens` → Li.Fi `/tokens` (EVM) or Jupiter token-list (SVM).
- `plugins/lifi/prepare.ts` — `prepareBridgeSwap(input): Promise<LifiBridgePrepared>`.
- `plugins/lifi/refresh.ts` — `refreshBridgeSwap({ config }): Promise<LifiBridgePrepared>` (re-quote with cached config).
- `plugins/lifi/observe.ts` — `class LifiStatusPoller`, `fetchLifiStatus()` helper, terminal-state handling.
- `plugins/lifi/store/bridgeProgressStore.ts` — zustand persist store; `BridgeRecord`, `useBridgeProgressStore`.
- `plugins/lifi/mcp/server.ts` — `createLifiMcp(ctx)` exposing `prepare_bridge_swap` + `get_bridge_status`.
- `plugins/lifi/widgets/BridgeSummary.tsx` — `lifi-bridge-summary`.
- `plugins/lifi/widgets/BridgeExecute.tsx` — `lifi-bridge-execute` (multi-call signing).
- `plugins/lifi/widgets/BridgeProgress.tsx` — `lifi-bridge-progress` (rehydrate + poller).
- `plugins/lifi/widgets/index.ts` — barrel.
- `plugins/lifi/prepare.test.ts`, `observe.test.ts`, `resolveAsset.test.ts`, `intents.test.ts`, `bridgeProgressStore.test.ts`.

**Modified files (apps/web):**
- `apps/web/package.json` — add `@wishd/plugin-lifi: workspace:*`.
- `apps/web/next.config.ts` — add `@wishd/plugin-lifi` to `transpilePackages` (CLAUDE.md recurring trap).
- `apps/web/widgetRegistry.ts` — register the 3 lifi widgets.
- `apps/web/server/lifiClients.ts` — NEW: `evmPublicClientFor(caip2)`, `lifiFetch(path, init)`, `LIFI_API_KEY` env handling.
- `apps/web/.env.example` — document `LIFI_API_KEY`, `SOLANA_RPC_URL_SERVER`.
- `apps/web/server/lifiClients.test.ts` — NEW: client construction unit tests.

**Untouched (verify after each phase):** `apps/web/lib/wallets/useWishdAccounts.ts` (consumed read-only), `plugins/uniswap/`, `plugins/jupiter/`, `plugins/compound-v3/`, `apps/web/components/primitives/ExecuteTimeline.tsx` (re-used by `BridgeProgress`).

---

# Phase 1 — Package scaffold

## Task 1: Create `plugins/lifi` package shell

**Files:**
- Create: `plugins/lifi/package.json`
- Create: `plugins/lifi/tsconfig.json`
- Create: `plugins/lifi/vitest.config.ts`
- Create: `plugins/lifi/index.ts` (placeholder)
- Modify: `pnpm-workspace.yaml` (only if `plugins/*` glob doesn't already include lifi — it almost certainly does; verify).

- [ ] **Step 1: Verify workspace glob covers `plugins/lifi`**

Run: `grep -n "plugins" /Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/pnpm-workspace.yaml`
Expected: a line like `- "plugins/*"`. If absent, add `- "plugins/*"`.

- [ ] **Step 2: Write `plugins/lifi/package.json`**

```json
{
  "name": "@wishd/plugin-lifi",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": "./index.ts",
    "./widgets": "./widgets/index.ts",
    "./mcp": "./mcp/server.ts",
    "./manifest": "./manifest.ts",
    "./prepare": "./prepare.ts",
    "./refresh": "./refresh.ts",
    "./observe": "./observe.ts",
    "./addresses": "./addresses.ts",
    "./resolveAsset": "./resolveAsset.ts",
    "./intents": "./intents.ts",
    "./types": "./types.ts",
    "./store": "./store/bridgeProgressStore.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@wishd/plugin-sdk": "workspace:*",
    "@wishd/plugin-jupiter": "workspace:*",
    "@wishd/tokens": "workspace:*",
    "react": "^19.0.0",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0",
    "zod": "^4.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `plugins/lifi/tsconfig.json`**

Copy `plugins/uniswap/tsconfig.json` exactly.

- [ ] **Step 4: Write `plugins/lifi/vitest.config.ts`**

Copy `plugins/uniswap/vitest.config.ts` exactly.

- [ ] **Step 5: Write placeholder `plugins/lifi/index.ts`**

```ts
export {};
```

- [ ] **Step 6: Install + verify workspace recognition**

Run: `pnpm install`
Expected: `@wishd/plugin-lifi` resolves; no errors.

- [ ] **Step 7: Commit**

```bash
git add plugins/lifi/package.json plugins/lifi/tsconfig.json plugins/lifi/vitest.config.ts plugins/lifi/index.ts pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore(lifi): scaffold @wishd/plugin-lifi package"
```

---

# Phase 2 — Core types, addresses, intents, asset resolution

## Task 2: `types.ts`

**Files:** Create `plugins/lifi/types.ts`.

- [ ] **Step 1: Write the types file**

Define exactly (consume PR1 types from `@wishd/plugin-sdk`): `LifiBridgeStatus = "PENDING" | "DONE" | "FAILED" | "INVALID" | "TIMEOUT"`; `LifiBridgeConfig` (fromCaip2, toCaip2, fromAddress, toAddress, assetInCaip19, assetOutCaip19, amountAtomic, slippage); `LifiQuoteEstimate` (fromAmount, toAmount, toAmountMin, approvalAddress, feeCosts[], gasCosts[], executionDuration, steps[]); `LifiBridgeExtras` (config, quote, quoteAt, insufficient, balance, routeNote?, totalFeeUSD, totalGasUSD, estimatedDurationSec); `LifiBridgePrepared = Prepared<LifiBridgeExtras>` from `@wishd/plugin-sdk`; `LifiStatusResponse` (status, substatus?, sending?, receiving?, bridgeExplorerLink?). Re-export `LifiStatusObservation`, `Placeholder`, `EvmCall` from `@wishd/plugin-sdk` for convenience.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-lifi typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/lifi/types.ts
git commit -m "feat(lifi): add type definitions for bridge config, quote, prepared, status"
```

---

## Task 3: `addresses.ts` — curated CAIP-19 catalog

**Files:** Create `plugins/lifi/addresses.ts`.

- [ ] **Step 1: Write the file**

Export:
- `SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` (per spec D4 + PR1 lock-in).
- `EVM_CHAINS` array of CAIP-2: `["eip155:1","eip155:8453","eip155:42161","eip155:10","eip155:137"]`.
- `ALL_CHAINS = [...EVM_CHAINS, SOLANA_MAINNET]`.
- `NATIVE_EVM_MARKER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"`.
- `WSOL_MINT = "So11111111111111111111111111111111111111112"`.
- `CURATED_ASSETS: Record<string /* caip19 */, { caip2: string; symbol: string; address: string; decimals: number; isNative: boolean }>` with entries for: ETH on each EVM chain, USDC on each EVM chain, USDT on Ethereum/Polygon/Arbitrum, MATIC on Polygon, SOL on Solana mainnet (slip44:501), USDC on Solana, JitoSOL.
- `CURATED_SYMBOLS_EVM = ["ETH","USDC","USDT","MATIC"]`.
- `CURATED_SYMBOLS_ALL = ["ETH","USDC","USDT","MATIC","SOL","JitoSOL"]`.
- Helper `caip19For(caip2: string, symbol: string): string | undefined` — looks up curated entry by `(caip2, uppercased symbol)`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-lifi typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/lifi/addresses.ts
git commit -m "feat(lifi): add curated CAIP-19 catalog covering EVM + Solana mainnet"
```

---

## Task 4: `intents.ts` — schema + `validateBridgeValues` (TDD)

**Files:**
- Test: `plugins/lifi/intents.test.ts`
- Create: `plugins/lifi/intents.ts`

- [ ] **Step 1: Write the failing test**

Cases for `validateBridgeValues(values)`:
1. valid EVM→SVM (Ethereum USDC → Solana SOL) → returns `{ ok: true }`.
2. valid EVM→EVM (Ethereum USDC → Base USDC) → `{ ok: true }`.
3. SVM source rejected: `fromChain = SOLANA_MAINNET` → `{ ok: false, reason: /source chain must be EVM/i }`.
4. Identical asset in/out on same chain → `{ ok: false, reason: /same asset on same chain/i }`.
5. amount = "0" → `{ ok: false, reason: /amount/i }`.
6. amount = "abc" (NaN) → `{ ok: false, reason: /amount/i }`.
7. negative amount "-1" → `{ ok: false, reason: /amount/i }`.

Also verify `lifiIntents[0]` shape: `intent: "lifi.bridge-swap"`, `verb: "bridge"`, `widget: "lifi-bridge-summary"`, `slot: "flow"`, `fields` length 6, default `assetIn: "USDC"`, default `fromChain: "eip155:1"`, default `assetOut: "SOL"`, default `toChain: SOLANA_MAINNET`, default `slippage: "0.5%"`.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- intents`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`intents.ts`:
- `lifiIntents: IntentSchema[]` exactly per spec §"Intent schema" (verb `"bridge"`, 6 fields, connectors object, widget `"lifi-bridge-summary"`, slot `"flow"`).
- `validateBridgeValues(values: { amount: string; assetIn: string; fromChain: string; assetOut: string; toChain: string }): { ok: true } | { ok: false; reason: string }`.
  - Rejects when `fromChain` starts with `solana:`.
  - Rejects when `fromChain === toChain && assetIn === assetOut`.
  - Rejects when `Number(values.amount)` is NaN, ≤ 0, or `values.amount` is empty.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- intents`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/intents.ts plugins/lifi/intents.test.ts
git commit -m "feat(lifi): add bridge intent schema + validateBridgeValues"
```

---

## Task 5: `resolveAsset.ts` — cross-family resolver (TDD)

**Files:**
- Test: `plugins/lifi/resolveAsset.test.ts`
- Create: `plugins/lifi/resolveAsset.ts`

- [ ] **Step 1: Write the failing test**

Mock: `global.fetch` for both `https://li.quest/v1/tokens` and the SVM Jupiter token list. Mock import of `@wishd/plugin-jupiter/server` exporting `fetchJupiterVerifiedTokens`. Mock `@wishd/tokens` `findByCaip19`.

Cases:
1. Curated EVM hit: `resolveAsset("eip155:1", "USDC")` → returns USDC mainnet entry (decimals 6, address 0xA0b8…); does NOT hit network.
2. Curated SVM hit: `resolveAsset(SOLANA_MAINNET, "SOL")` → native SOL (decimals 9, isNative true); no network.
3. EVM unknown falls back to Li.Fi tokens API: `resolveAsset("eip155:8453", "BRETT")` → mocked Li.Fi `/tokens?chains=8453` returns token; resolver returns CAIP-19, decimals.
4. SVM unknown falls back to Jupiter helper: `resolveAsset(SOLANA_MAINNET, "JUP")` → mocked `fetchJupiterVerifiedTokens` returns JUP; resolver returns CAIP-19, decimals.
5. Total miss: `resolveAsset("eip155:1", "ZZZNOTEXIST")` → throws `Error` whose message contains `"unknown asset"` and the symbol.
6. EVM native marker: `resolveAsset("eip155:1", "ETH")` → returns `{ address: NATIVE_EVM_MARKER, isNative: true, decimals: 18, caip19: "eip155:1/slip44:60" }`.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- resolveAsset`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`resolveAsset.ts` exports `ResolvedAsset` type and `resolveAsset(caip2, symbol)`:
- 1st: `caip19For(caip2, symbol.toUpperCase())` from `addresses.ts` — return curated.
- 2nd: `findByCaip19` lookup against `@wishd/tokens` (best-effort if export exists).
- 3rd: family branch:
  - EVM: GET `https://li.quest/v1/tokens?chains=<numericChainId>` (parsed from caip2), case-insensitive symbol match → CAIP-19 + decimals + address.
  - SVM: `fetchJupiterVerifiedTokens()` from `@wishd/plugin-jupiter/server`, case-insensitive symbol match → CAIP-19 + decimals + address.
- 4th: throw `new Error(\`unknown asset \${symbol} on \${caip2}\`)`.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- resolveAsset`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/resolveAsset.ts plugins/lifi/resolveAsset.test.ts
git commit -m "feat(lifi): add cross-family asset resolver (curated → tokens → Li.Fi/Jupiter)"
```

---

## Task 6: `manifest.ts`

**Files:** Create `plugins/lifi/manifest.ts`.

- [ ] **Step 1: Write the manifest**

Per spec §"Manifest":
```ts
import type { Manifest } from "@wishd/plugin-sdk";
import { ALL_CHAINS } from "./addresses";

export const lifiManifest: Manifest = {
  name: "lifi",
  version: "0.0.0",
  chains: ALL_CHAINS,
  trust: "verified",
  primaryChainField: "fromChain",
  provides: {
    intents: ["lifi.bridge-swap"],
    widgets: ["lifi-bridge-summary", "lifi-bridge-execute", "lifi-bridge-progress"],
    mcps: ["lifi"],
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-lifi typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/lifi/manifest.ts
git commit -m "feat(lifi): add manifest with 5 EVM chains + Solana mainnet, primaryChainField=fromChain"
```

---

# Phase 3 — Server: clients, prepare, refresh, MCP

## Task 7: `apps/web/server/lifiClients.ts` — viem + Li.Fi fetch (TDD)

**Files:**
- Test: `apps/web/server/lifiClients.test.ts`
- Create: `apps/web/server/lifiClients.ts`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Write the failing test**

Cases:
1. `evmPublicClientFor("eip155:1")` returns a viem `PublicClient` whose `chain.id === 1`.
2. `evmPublicClientFor("eip155:8453")` → chain.id 8453.
3. `evmPublicClientFor("eip155:9999")` → throws `Error /unsupported chain/i`.
4. `evmPublicClientFor("solana:...")` → throws `Error /not an EVM/i`.
5. `lifiFetch("/quote", { search: { fromChain: 1 } })` constructs URL `https://li.quest/v1/quote?fromChain=1`, sends `x-lifi-api-key` header iff `process.env.LIFI_API_KEY` is set, returns parsed JSON. Mock global `fetch`.
6. `lifiFetch` with non-2xx response throws an `Error` containing the response status code and body text.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter web test -- lifiClients`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

- `evmPublicClientFor(caip2: string)`: parse `eip155:<id>`, look up viem chain in static map (`mainnet`, `base`, `arbitrum`, `optimism`, `polygon`), return `createPublicClient({ chain, transport: http(rpcUrlFor(chainId)) })`. `rpcUrlFor` reads `process.env.<CHAIN>_RPC_URL` then falls back to viem default.
- `lifiFetch(path, { search?, init? })`: builds `https://li.quest/v1${path}`, appends URLSearchParams from `search`, attaches `x-lifi-api-key` header when env set, returns `await res.json()`; throws on `!res.ok` with `\`Li.Fi \${res.status}: \${text}\``.

- [ ] **Step 4: Update `.env.example`**

Append:
```
# Li.Fi REST (optional but recommended for higher rate limits)
LIFI_API_KEY=

# Server-side Solana RPC for plugin observation reads
SOLANA_RPC_URL_SERVER=

# Optional per-chain EVM RPC overrides
ETHEREUM_RPC_URL=
BASE_RPC_URL=
ARBITRUM_RPC_URL=
OPTIMISM_RPC_URL=
POLYGON_RPC_URL=
```

- [ ] **Step 5: Run test, verify PASS**

Run: `pnpm --filter web test -- lifiClients`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/server/lifiClients.ts apps/web/server/lifiClients.test.ts apps/web/.env.example
git commit -m "feat(web): add lifiClients with evmPublicClientFor + lifiFetch"
```

---

## Task 8: `prepare.ts` — orchestrate validate → resolve → quote → calls → observation (TDD)

**Files:**
- Test: `plugins/lifi/prepare.test.ts`
- Create: `plugins/lifi/prepare.ts`

- [ ] **Step 1: Write the failing test**

Mock `lifiFetch` and `evmPublicClientFor` (re-export through a thin module-local indirection so the plugin doesn't import `apps/web` directly — see Step 3). Mock `resolveAsset`.

Cases:
1. **No approval needed (native source)**: input ETH on Ethereum → SOL on Solana, $10 notional. Mocked `/quote` returns `transactionRequest` and `estimate.approvalAddress: null`. Asserts: `prepared.calls.length === 1`, `calls[0].family === "evm"`, `calls[0].caip2 === "eip155:1"`, `calls[0].to === tx.to`, `calls[0].value === BigInt(tx.value)`. `prepared.observations.length === 1`. `observations[0].family === "lifi-status"`. `observations[0].query.txHash` is a `Placeholder` `{ from:"callResult", index: 0, field:"hash" }`. `prepared.staleAfter` is ~ now+25s. `prepared.quote.toAmountMin` matches mock.
2. **Approval needed (ERC-20 source, allowance insufficient)**: input USDC on Ethereum → SOL on Solana. Mocked `/quote.estimate.approvalAddress = "0xDIAMOND"`. Mocked `evmPublicClientFor` returns a `readContract` that returns `0n` for `allowance`. Asserts: `calls.length === 2`. `calls[0]` is approval (`to === USDC_ADDR`, encoded `approve(0xDIAMOND, MAX_UINT256)`). `calls[1]` is bridge tx. `observations[0].query.txHash.index === 1`.
3. **Approval pre-existing (allowance ≥ amount)**: same setup as case 2 but `allowance = MAX_UINT256`. Asserts: `calls.length === 1` (approval skipped). `observations[0].query.txHash.index === 0`.
4. **SVM source rejected**: input from `solana:...` → throws via `validateBridgeValues`. (Verify it surfaces the validation error.)
5. **Slippage forwarding**: input slippage `"1%"` → mocked `lifiFetch` called with `slippage=0.01`.
6. **Stale headroom**: `prepared.staleAfter - prepared.quoteAt === 25_000`.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- prepare`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`prepare.ts`:
- Imports: `validateBridgeValues` (intents), `resolveAsset`, `parseUnits` from viem, `encodeFunctionData` for ERC-20 `approve`, `MaxUint256` constant, types from `./types`, `Placeholder` from `@wishd/plugin-sdk`.
- Imports server clients via thin local re-export (`./_serverClients.ts`) that re-exports `lifiFetch` + `evmPublicClientFor` from `apps/web/server/lifiClients` — keeps tests mockable AND avoids circular workspace deps. NOTE: alternative is to inject clients via a `deps` parameter; we choose injection for testability — `prepareBridgeSwap(input, deps?)` with `deps = { lifiFetch, evmPublicClientFor }` defaulted to the real impls in a small accompanying `./_serverClients.ts` shim that the apps/web side wires.
- Function `prepareBridgeSwap(input, deps = defaultDeps): Promise<LifiBridgePrepared>` does:
  1. `validateBridgeValues({ amount, assetIn, fromChain, assetOut, toChain })` → throw `Error(reason)` if not ok.
  2. `assetInRes = await resolveAsset(fromChain, assetIn)`; `assetOutRes = await resolveAsset(toChain, assetOut)`.
  3. `amountAtomic = parseUnits(amount, assetInRes.decimals).toString()`.
  4. `slippageNum = parseSlippage(slippage)` (`"0.5%" → 0.005`).
  5. `quoteJson = await deps.lifiFetch("/quote", { search: { fromChain, toChain, fromToken, toToken, fromAddress, toAddress, fromAmount: amountAtomic, slippage: slippageNum, integrator: "wishd" } })`.
  6. Build `bridgeCall: EvmCall` from `quoteJson.transactionRequest`.
  7. If `quoteJson.estimate.approvalAddress` AND not `assetInRes.isNative`:
     - `pc = deps.evmPublicClientFor(fromChain)`.
     - `allowance = await pc.readContract({ address: assetInRes.address, abi: erc20Abi, functionName: "allowance", args: [fromAddress, approvalAddress] })`.
     - If `allowance < BigInt(amountAtomic)` → prepend approval `EvmCall` with `data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [approvalAddress, MaxUint256] })`.
  8. `bridgeCallIndex = calls.length - 1`.
  9. Build `observation: LifiStatusObservation` (`endpoint: "https://li.quest/v1/status"`, `query: { txHash: { from:"callResult", index: bridgeCallIndex, field:"hash" }, fromChain, toChain }`, `successWhen: { path: "status", equals: "DONE" }`, `failureWhen: { path: "status", equalsAny: ["FAILED","INVALID"] }`, `pollMs: { initial: 3000, factor: 1.5, maxBackoff: 15000 }`, `timeoutMs: 15*60*1000`, `display: { title: "Bridging", fromLabel, toLabel }`).
  10. `quoteAt = Date.now()`. `staleAfter = quoteAt + 25_000`.
  11. Compute `LifiBridgeExtras` (totalFeeUSD, totalGasUSD, estimatedDurationSec, routeNote from `steps.map(s => s.toolDetails.name).join(" → ")`, balance via best-effort or echoed input).
  12. Return `{ calls, observations: [observation], staleAfter, ...extras }`.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- prepare`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/prepare.ts plugins/lifi/prepare.test.ts plugins/lifi/_serverClients.ts
git commit -m "feat(lifi): add prepareBridgeSwap (validate → resolve → quote → calls → observation)"
```

---

## Task 9: `refresh.ts` + plugin-tool registration

**Files:**
- Create: `plugins/lifi/refresh.ts`
- Test: extend `plugins/lifi/prepare.test.ts` with refresh case (or new `refresh.test.ts`).

- [ ] **Step 1: Write a small test (`refresh.test.ts`)**

Case: given a previously-prepared `LifiBridgeConfig`, calling `refreshBridgeSwap({ config })` re-invokes `lifiFetch("/quote", ...)` with the same params and returns a fresh `Prepared` whose `quoteAt > old.quoteAt` and `staleAfter` is reset.

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- refresh`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `refresh.ts`**

`refreshBridgeSwap({ config }: { config: LifiBridgeConfig }): Promise<LifiBridgePrepared>` — re-runs the same quote + allowance + observation logic from `prepare.ts` but skips `resolveAsset` and `validateBridgeValues` (config already validated). Factor shared logic into an internal `quoteAndBuild(config, deps)` helper called by both `prepareBridgeSwap` and `refreshBridgeSwap` (DRY).

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- refresh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/refresh.ts plugins/lifi/refresh.test.ts plugins/lifi/prepare.ts
git commit -m "feat(lifi): add refreshBridgeSwap sharing quoteAndBuild with prepare"
```

---

## Task 10: MCP server (`prepare_bridge_swap`, `get_bridge_status`)

**Files:**
- Create: `plugins/lifi/mcp/server.ts`
- Test: `plugins/lifi/mcp/server.test.ts`

- [ ] **Step 1: Write the failing test**

Cases:
1. `createLifiMcp(ctx)` returns an MCP server with two registered tools whose names are exactly `prepare_bridge_swap` and `get_bridge_status`.
2. Calling `prepare_bridge_swap` handler with a valid input object returns `content[0].type === "text"` whose JSON-parsed body matches the shape `{ calls, observations, staleAfter, quote, ... }` (fixture-driven; reuse mocks from prepare.test).
3. Calling `get_bridge_status` handler with `{ txHash, fromChain, toChain }` proxies to `lifiFetch("/status", { search: { txHash, fromChain, toChain } })` and returns its JSON. Mock `lifiFetch` to return `{ status: "PENDING", substatus: "WAIT_DESTINATION" }`.

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- mcp/server`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Mirror `plugins/uniswap/mcp/server.ts` structure. Use `createSdkMcpServer` + `tool` from `@anthropic-ai/claude-agent-sdk`. Define zod schemas:
- `prepareInputSchema = z.object({ amount: z.string(), assetIn: z.string(), fromChain: z.string(), assetOut: z.string(), toChain: z.string(), slippage: z.string().optional(), fromAddress: z.string(), toAddress: z.string() })`.
- `statusInputSchema = z.object({ txHash: z.string(), fromChain: z.union([z.string(), z.number()]), toChain: z.union([z.string(), z.number()]) })`.
- `fetchLifiStatus(args)` lives in `observe.ts` (Task 11) — for now stub via local helper that calls `lifiFetch("/status", { search: args })`. Refactor to import from `observe.ts` after Task 11.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- mcp/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/mcp/server.ts plugins/lifi/mcp/server.test.ts
git commit -m "feat(lifi): add MCP server with prepare_bridge_swap + get_bridge_status"
```

---

# Phase 4 — Observation engine + persistence

## Task 11: `observe.ts` — `LifiStatusPoller` + `fetchLifiStatus` (TDD with fake timers)

**Files:**
- Test: `plugins/lifi/observe.test.ts`
- Create: `plugins/lifi/observe.ts`

- [ ] **Step 1: Write the failing test**

Use vitest `vi.useFakeTimers()`. Mock `lifiFetch` such that successive calls return a configurable sequence.

Cases:
1. **PENDING → PENDING → DONE**: poller emits 2 `notification` events (each with `type: "notification"`, `level: "info"`, `widgetUpdate` containing `phase:"pending"`, `elapsedMs`), then 1 terminal `result` event with `ok: true`, `summary` containing the receive amount, and `artifacts` containing both source and destination tx entries (`{ kind: "tx", caip2, hash }`). Store record `lastStatus` ends at `"DONE"`. After terminal, poller does NOT emit further events even when `vi.advanceTimersByTime` is called.
2. **PENDING → FAILED**: terminal `result.ok === false`, `summary` contains "Bridge failed", `recovery` is `{ kind:"link", url: \`https://li.quest/recovery/<srcTxHash>\`, label: "Recover with Li.Fi" }`. Store `lastStatus === "FAILED"`.
3. **PENDING → INVALID**: terminal `ok:false`, message references "could not locate the source tx".
4. **All PENDING past 15-min timeout**: terminal `ok:false`, `summary` contains "still pending after 15 minutes", `recovery.url === \`https://li.quest/tx/<srcTxHash>\``. Store `lastStatus === "TIMEOUT"`. Verify by `vi.advanceTimersByTime(15*60*1000 + 1000)`.
5. **Backoff cadence**: starting from initial 3000ms, factor 1.5, cap 15000ms — assert call timestamps match sequence `[3000, 4500, 6750, 10125, 15000, 15000, ...]` within ±50ms. Use `vi.getMockedSystemTime()` between advance calls.
6. **Abort**: call `controller.abort()` after first poll → no further `lifiFetch` calls; no terminal event emitted; store record retained at `lastStatus: "PENDING"`.
7. **Network error retry**: mock `lifiFetch` to throw on first call, then return `DONE` on second — poller swallows error, applies backoff, then completes with success.

Also test `fetchLifiStatus({ txHash, fromChain, toChain })` directly — it forwards to `lifiFetch("/status", { search: ... })`.

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- observe`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`observe.ts`:
- `const DEFAULTS = { initial: 3_000, factor: 1.5, maxBackoff: 15_000, timeoutMs: 15 * 60 * 1000 }`.
- `fetchLifiStatus({ txHash, fromChain, toChain })` → `lifiFetch("/status", { search: { txHash, fromChain, toChain } })`.
- `class LifiStatusPoller`:
  - Constructor `(obs: LifiStatusObservation, store: BridgeProgressStoreApi, emit: Emit)`.
  - Method `start(id: string, srcTxHash: string): AbortController` returns controller; schedules tick loop with `setTimeout`.
  - On each tick: check `Date.now() > timeoutAt` → call `terminal(id, "TIMEOUT")`. Otherwise call `fetchLifiStatus`; on error → backoff retry. On `status: "DONE"` → emit `result.ok=true` with both tx artifacts (extract destination hash from `receiving.txHash`); store `patch({ lastStatus:"DONE", destTxHash, toAmountActual })`. On `"FAILED"` / `"INVALID"` → terminal with recovery link. On `"PENDING"` (or other) → emit `notification`, store `patch({ lastStatus:"PENDING" })`, schedule next tick with `delay = min(delay * factor, maxBackoff)`.
  - Method `terminal(id, status, raw?)` emits the result event and calls `store.patch` with terminal state. After terminal, sets internal `done = true` so further timers are ignored.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- observe`
Expected: PASS.

- [ ] **Step 5: Wire `fetchLifiStatus` into MCP**

Edit `plugins/lifi/mcp/server.ts` to import `fetchLifiStatus` from `./observe.ts` (replacing the stub from Task 10). Re-run MCP test: `pnpm --filter @wishd/plugin-lifi test -- mcp/server` — expected PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/lifi/observe.ts plugins/lifi/observe.test.ts plugins/lifi/mcp/server.ts
git commit -m "feat(lifi): add LifiStatusPoller with backoff, abort, terminal states + recovery"
```

---

## Task 12: `store/bridgeProgressStore.ts` — zustand persist (TDD)

**Files:**
- Test: `plugins/lifi/bridgeProgressStore.test.ts`
- Create: `plugins/lifi/store/bridgeProgressStore.ts`

- [ ] **Step 1: Write the failing test**

Mock `localStorage` (vitest's jsdom env supplies it). Cases:
1. `useBridgeProgressStore.getState().records` initially `{}`.
2. `upsert({ id: "0xabc", config, observation, startedAt: 1000, lastStatus: "PENDING" })` adds the record.
3. `patch("0xabc", { lastStatus: "DONE", destTxHash: "abcd...", toAmountActual: "9.9" })` updates only the patched fields, preserves others.
4. After `upsert + patch`, calling `localStorage.getItem("wishd:lifi:bridges")` returns a JSON blob whose `state.records["0xabc"].lastStatus === "DONE"`.
5. **Rehydration**: pre-seed `localStorage` with a serialized v1 blob, fresh-mount the store (re-import via `vi.resetModules()`), assert `records["0xabc"]` exists and matches.
6. `patch` for an unknown id is a no-op (no record created).

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- bridgeProgressStore`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LifiBridgeConfig, LifiStatusObservation, LifiBridgeStatus } from "../types";

export type BridgeRecord = {
  id: string;
  config: LifiBridgeConfig;
  observation: LifiStatusObservation;
  startedAt: number;
  lastStatus: LifiBridgeStatus;
  destTxHash?: string;
  toAmountActual?: string;
  lastError?: string;
};

type State = {
  records: Record<string, BridgeRecord>;
  upsert: (r: BridgeRecord) => void;
  patch: (id: string, p: Partial<BridgeRecord>) => void;
};

export const useBridgeProgressStore = create<State>()(
  persist(
    (set) => ({
      records: {},
      upsert: (r) => set((s) => ({ records: { ...s.records, [r.id]: r } })),
      patch: (id, p) => set((s) =>
        s.records[id] ? { records: { ...s.records, [id]: { ...s.records[id], ...p } } } : s
      ),
    }),
    { name: "wishd:lifi:bridges", version: 1 }
  )
);

export type BridgeProgressStoreApi = {
  upsert: (r: BridgeRecord) => void;
  patch: (id: string, p: Partial<BridgeRecord>) => void;
};
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- bridgeProgressStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/store/bridgeProgressStore.ts plugins/lifi/bridgeProgressStore.test.ts
git commit -m "feat(lifi): add bridgeProgressStore with zustand persist (rehydrates on mount)"
```

---

# Phase 5 — Client widgets

## Task 13: `BridgeSummary` widget (pre-confirm)

**Files:**
- Create: `plugins/lifi/widgets/BridgeSummary.tsx`
- Test: `plugins/lifi/widgets/BridgeSummary.test.tsx`

- [ ] **Step 1: Write failing test**

Render with a `prepared: LifiBridgePrepared` fixture. Assert:
- Route note appears (e.g., text containing "Across" or steps tool names).
- Receive (min) line shows humanized `toAmountMin`.
- Bridge fees line shows `$<totalFeeUSD>`.
- Gas line shows `$<totalGasUSD>`.
- ETA line shows minutes-rounded duration.
- Slippage select reflects current value.
- "Execute" CTA is rendered as a button; clicking it invokes the `onExecute` prop.
- Stale gate: when `Date.now() > prepared.staleAfter`, the Execute button is disabled and "Refresh quote" button appears; clicking it calls `onRefresh`.
- High-impact gate: when `quote.priceImpactPct > 5`, an "I understand" toggle appears and Execute is disabled until toggled.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- BridgeSummary`
Expected: FAIL.

- [ ] **Step 3: Write `BridgeSummary.tsx`**

Pure presentational component reading from `props.prepared`. Uses `apps/web/components/primitives/` styling tokens (text-ink, bg-bg-2, border-rule). No hooks against wagmi/Solana directly — caller injects address state and execute handler.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- BridgeSummary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/widgets/BridgeSummary.tsx plugins/lifi/widgets/BridgeSummary.test.tsx
git commit -m "feat(lifi): add BridgeSummary widget with route, fees, ETA, stale gate"
```

---

## Task 14: `BridgeExecute` widget (multi-call signing)

**Files:**
- Create: `plugins/lifi/widgets/BridgeExecute.tsx`
- Test: `plugins/lifi/widgets/BridgeExecute.test.tsx`

The widget owns a phase machine: `idle → switch-chain (if needed) → preflight (refresh if stale) → approve (if calls.length===2) → submitting → submitted → progress`. On submitted, it `useBridgeProgressStore().upsert()` a `BridgeRecord` keyed by source `txHash` and renders `<BridgeProgress id={txHash} />`.

- [ ] **Step 1: Write the failing test**

Mock `wagmi` (`useAccount`, `useWriteContract`, `useSendTransaction`, `useChainId`, `useSwitchChain`), `useWishdAccounts`, and `callPluginTool`.

Cases:
1. Wrong source chain connected → "Switch network" button visible; click → calls `switchChain({ chainId: 1 })` for an Ethereum prepared; after switch, "Approve" or "Sign bridge" appears.
2. Single-call (no approval): renders one "Sign & bridge" button; click → `sendTransaction` called with `to/data/value` from `prepared.calls[0]`. On hash, `upsert` writes a record with `lastStatus: "PENDING"`, then `BridgeProgress` rendered.
3. Two-call (approval + bridge): renders an "Approve <symbol>" button first; on approval tx receipt, automatically progresses to bridge sign.
4. Stale at click time → calls `callPluginTool("lifi", "refresh_quote", { config })` and re-renders summary; user must re-confirm.
5. Submission rejection / revert → error message rendered; no record persisted.

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- BridgeExecute`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`BridgeExecute.tsx`:
- Accepts props `{ prepared: LifiBridgePrepared }`.
- Uses local `useState<Phase>` machine.
- On final hash, builds `BridgeRecord` and writes via `useBridgeProgressStore.getState().upsert(...)`. Substitutes the `Placeholder` in `observation.query.txHash` with the actual hash.
- Then conditionally renders `<BridgeProgress id={txHash} />`.

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- BridgeExecute`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/widgets/BridgeExecute.tsx plugins/lifi/widgets/BridgeExecute.test.tsx
git commit -m "feat(lifi): add BridgeExecute widget (switch-chain → approve → bridge → progress)"
```

---

## Task 15: `BridgeProgress` widget (rehydrate + poller)

**Files:**
- Create: `plugins/lifi/widgets/BridgeProgress.tsx`
- Test: `plugins/lifi/widgets/BridgeProgress.test.tsx`

- [ ] **Step 1: Write the failing test**

Mock `LifiStatusPoller`, `useEmit`, and seed `useBridgeProgressStore` with a record.

Cases:
1. **On mount with PENDING record** → constructs poller, calls `start(id, srcTxHash)`. Renders `ExecuteTimeline` with steps `Source signed → Source confirmed → Bridge processing → Destination delivered` (4 steps; first 2 marked done, third active).
2. **On unmount** → calls `controller.abort()` returned by `start()`.
3. **Already DONE record (rehydrate after success)** → does NOT start poller; renders source + destination explorer links via `explorerTxUrl(caip2, sig)` from `@wishd/plugin-sdk` (PR1).
4. **FAILED record** → renders recovery link `https://li.quest/recovery/<srcTxHash>` and an error message.
5. **TIMEOUT record** → renders "still pending — view on Li.Fi" link; provides "Resume polling" button that re-instantiates the poller.
6. **Missing record (id not in store)** → renders fallback "No bridge in progress" empty state.

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @wishd/plugin-lifi test -- BridgeProgress`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`BridgeProgress.tsx`:
- Accepts `{ id: string }` prop (source txHash).
- `record = useBridgeProgressStore((s) => s.records[id])`.
- `useEffect` mounts a poller iff `record?.lastStatus === "PENDING"`; cleanup aborts.
- Renders `ExecuteTimeline` from `apps/web/components/primitives/ExecuteTimeline`.
- Terminal states render explorer links via `explorerTxUrl`.

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @wishd/plugin-lifi test -- BridgeProgress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/lifi/widgets/BridgeProgress.tsx plugins/lifi/widgets/BridgeProgress.test.tsx
git commit -m "feat(lifi): add BridgeProgress widget with rehydration + poller mount"
```

---

## Task 16: Widgets barrel + plugin entry

**Files:**
- Create: `plugins/lifi/widgets/index.ts`
- Modify: `plugins/lifi/index.ts`

- [ ] **Step 1: Write `widgets/index.ts`**

```ts
export { BridgeSummary } from "./BridgeSummary";
export { BridgeExecute } from "./BridgeExecute";
export { BridgeProgress } from "./BridgeProgress";
```

- [ ] **Step 2: Replace `plugins/lifi/index.ts`**

```ts
import { definePlugin } from "@wishd/plugin-sdk";
import { registerPluginTool } from "@wishd/plugin-sdk/routes";
import { lifiManifest } from "./manifest";
import { lifiIntents } from "./intents";
import { createLifiMcp } from "./mcp/server";
import * as widgets from "./widgets";
import { refreshBridgeSwap } from "./refresh";

registerPluginTool("lifi", "refresh_quote", refreshBridgeSwap);

export default definePlugin({
  manifest: lifiManifest,
  intents: lifiIntents,
  mcp: createLifiMcp,
  widgets,
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wishd/plugin-lifi typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/lifi/widgets/index.ts plugins/lifi/index.ts
git commit -m "feat(lifi): wire definePlugin entry + registerPluginTool('refresh_quote')"
```

---

# Phase 6 — Wire-in to apps/web

## Task 17: Register widgets in `widgetRegistry.ts`

**Files:**
- Modify: `apps/web/widgetRegistry.ts`
- Modify: `apps/web/package.json` (add dep)
- Modify: `apps/web/next.config.ts` (transpilePackages)

- [ ] **Step 1: Add dep**

In `apps/web/package.json` `dependencies`, add `"@wishd/plugin-lifi": "workspace:*"` (alphabetical placement next to other `@wishd/plugin-*`).

- [ ] **Step 2: Add to `transpilePackages`**

Edit `apps/web/next.config.ts`. Append `"@wishd/plugin-lifi"` to the existing `transpilePackages` array. (CLAUDE.md recurring trap — must do this or wagmi/react-query will split.)

- [ ] **Step 3: Register widgets**

Edit `apps/web/widgetRegistry.ts`. Add imports from `@wishd/plugin-lifi/widgets` and register `lifi-bridge-summary`, `lifi-bridge-execute`, `lifi-bridge-progress` mapping to the imported components — follow the exact pattern used by uniswap (`swap-summary`, `swap-execute`).

- [ ] **Step 4: Install + typecheck + dev boot**

```bash
pnpm install
pnpm --filter web typecheck
pnpm --filter web dev
```

Expected: clean install, typecheck green. Dev boots; opening http://localhost:3000 has no "No QueryClient set" error in console. Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/widgetRegistry.ts apps/web/package.json apps/web/next.config.ts pnpm-lock.yaml
git commit -m "chore(web): register lifi widgets + add to transpilePackages"
```

---

## Task 18: Mount MCP server in agent runtime

**Files:**
- Modify: `apps/web/server/pluginLoader.ts` (mount point — same file PR2 used to register Jupiter).

- [ ] **Step 1: Locate the MCP composition site**

Run: `grep -rn "createUniswapMcp\|createJupiterMcp" apps/web/server/`
Expected: matches in `apps/web/server/pluginLoader.ts`.

- [ ] **Step 2: Register `createLifiMcp(ctx)` next to its siblings**

Add the import and append the server to whatever array/object the composer uses. Match conventions exactly.

- [ ] **Step 3: Boot dev + verify MCP discovery**

```bash
pnpm --filter web dev
```

Hit the agent endpoint that lists MCP tools (or use the dev console) and verify `lifi.prepare_bridge_swap` and `lifi.get_bridge_status` appear. Stop server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/<composer>.ts
git commit -m "feat(web): mount lifi MCP server in agent runtime"
```

---

# Phase 7 — Verification + acceptance

## Task 19: Full workspace green run

- [ ] **Step 1: Workspace typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Workspace tests**

Run: `pnpm test`
Expected: PASS across all packages including `@wishd/plugin-lifi`.

- [ ] **Step 3: Production build**

Run: `pnpm --filter web build`
Expected: build success; no "No QueryClient set" warnings; no SSR Solana errors.

- [ ] **Step 4: Commit any incidental fixes**

If steps 1–3 surfaced fixes (e.g., import paths, type narrowing), commit them with focused messages.

---

## Task 20: Acceptance — manual demo + edge paths

**Files:** none (manual smoke).

- [ ] **Step 1: Demo happy path**

Boot dev. Connect Porto on Ethereum mainnet (or Sepolia if mainnet keys absent — note in PR description) AND Phantom on Solana mainnet. In the wish composer, type: **"swap 10 USDC on Ethereum to SOL on Solana via Li.Fi"**. Expected: agent emits a `lifi-bridge-summary` widget with route, fees, ETA. Click Execute → if USDC allowance insufficient, Approve appears first; sign approval. Then sign bridge tx. Widget transitions to `lifi-bridge-progress` showing timeline. Wait for `DONE` → success result event renders both source + destination explorer links.

- [ ] **Step 2: Refresh-mid-poll persistence**

Mid-poll (status PENDING, before terminal), do a hard reload (Cmd+Shift+R). Re-open the wish thread. Expected: `BridgeProgress` rehydrates from localStorage and resumes polling. Cadence resumes near where it left off.

- [ ] **Step 3: Failure path (mocked)**

In dev, temporarily wire `fetchLifiStatus` to return `{ status: "FAILED", substatus: "BRIDGE_REVERTED" }` for any txHash (toggle via `?lifi_force_status=FAILED` query param OR a dev-only env flag — implementer's call which mechanism). Repeat the demo. Expected: terminal `result.ok=false` with recovery link rendered (`https://li.quest/recovery/<srcTxHash>`). Remove the dev override before committing.

- [ ] **Step 4: EVM-EVM smoke**

Repeat with USDC on Base → USDC on Arbitrum, $0.50 notional. Expected: same flow; `BridgeProgress` reaches `DONE`.

- [ ] **Step 5: Confirm `transpilePackages` and console hygiene**

DevTools console must be clean of "No QueryClient set" or SSR hydration errors throughout the demo.

- [ ] **Step 6: README**

Add a brief `plugins/lifi/README.md` documenting: package purpose, env vars (`LIFI_API_KEY`, `SOLANA_RPC_URL_SERVER`, per-chain RPC overrides), unit-test-only stance (no integration tests, per spec D6), demo steps from this task. Commit.

```bash
git add plugins/lifi/README.md
git commit -m "docs(lifi): add README covering env, demo, test stance"
```

---

## Dependencies on PR1 + PR2

**Consumed from PR1 (`@wishd/plugin-sdk`)**:
- Types: `Manifest`, `IntentSchema`, `IntentField`, `EvmCall`, `Prepared<TExtras>`, `Observation` union, `LifiStatusObservation`, `Placeholder`, `PluginCtx`, `TrustTier`, `ServerEvent` (incl. `recovery: { kind, url, label }`).
- Helpers: `definePlugin`, `registerPluginTool` (server), `callPluginTool` (client), `useEmit` (client emit bus), `explorerTxUrl(caip2, sig)`, `findByCaip19` from `@wishd/tokens`, `parseSlippage` (or local helper if not exported).
- Constants/conventions: `Manifest.primaryChainField` semantics, executor placeholder substitution rule, `/api/wish/[plugin]/[tool]` generic route.

**Consumed from PR2 (`@wishd/plugin-jupiter`)**:
- `fetchJupiterVerifiedTokens()` (or equivalently named exported helper) from `@wishd/plugin-jupiter/server` — used by `resolveAsset.ts` for SVM unknowns.
- Plugin file-layout pattern (mirrored 1:1 in `plugins/lifi/`).
- Disambiguation min-rule (PR1 §"Disambiguation min-rule" landed via PR2 cross-review) — relevant only if a future `lifi.swap` joins the `swap` cohort; PR3 ships only `lifi.bridge-swap` with `verb: "bridge"` so does not collide.

If PR2 has not exported the Jupiter token-list helper publicly, PR3 implements a small local fetcher in `resolveAsset.ts` (per spec §"Asset resolution across families"). Do not block PR3 on PR2 export changes.

---

## Verification checklist (mapping to spec acceptance criteria)

- [ ] `pnpm typecheck` clean across workspace including `@wishd/plugin-lifi` → Task 19 step 1.
- [ ] `pnpm test` green; unit tests cover `prepare`, `observe`, `resolveAsset`, `intents`, `bridgeProgressStore`, `mcp/server`, `refresh`, plus widget tests → Tasks 4, 5, 8, 9, 10, 11, 12, 13, 14, 15 + Task 19 step 2.
- [ ] Type assertions: `prepared.calls[0]` is `EvmCall`, `prepared.observations[0]` is `LifiStatusObservation` → Task 8 (typecheck within prepare.test).
- [ ] Demo flow USDC@Ethereum → SOL@Solana produces summary → execute → progress → DONE → Task 20 step 1.
- [ ] Mid-poll refresh-tab persistence → Task 20 step 2 (covered by store test Task 12 case 5 + widget test Task 15 case 1).
- [ ] FAILED path emits `result.ok=false` with `recovery` link → Task 11 case 2 + Task 20 step 3.
- [ ] TIMEOUT path emits `result.ok=false` with Li.Fi tx link, store entry retained → Task 11 case 4 + Task 15 case 5.
- [ ] EVM-EVM works end-to-end → Task 20 step 4.
- [ ] `@wishd/plugin-lifi` listed in `apps/web/next.config.ts` `transpilePackages` → Task 17 step 2.
- [ ] No new top-level deps (viem/wagmi/zustand already present) → verified by `pnpm install` output in Task 1 step 6 + Task 17 step 4.
- [ ] No "No QueryClient set" regression → Task 17 step 4 + Task 20 step 5.
- [ ] MCP tools `lifi.prepare_bridge_swap` + `lifi.get_bridge_status` discoverable by the agent → Task 18 step 3.
- [ ] `refresh_quote` is a plugin-tool (NOT MCP), reachable via `callPluginTool("lifi","refresh_quote", ...)` → Task 9 + Task 16.
- [ ] Approval handling: 1-call (native or sufficient allowance) vs 2-call (insufficient allowance) → Task 8 cases 1, 2, 3.
- [ ] Manifest `primaryChainField: "fromChain"`, `trust: "verified"`, chains = 5 EVM + Solana mainnet → Task 6.
- [ ] SVM source rejected by validation → Task 4 case 3.
- [ ] Backoff cadence `[3000, 4500, 6750, 10125, 15000, 15000, ...]` and 15-min timeout → Task 11 cases 4, 5.
- [ ] README documents unit-only test stance → Task 20 step 6.

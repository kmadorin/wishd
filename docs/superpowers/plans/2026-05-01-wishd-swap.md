# wishd Uniswap Swap Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single `plugins/uniswap` plugin that swaps tokens end-to-end on Trading-API-supported chains (Mainnet, Base, Arbitrum, Optimism, Polygon, Unichain) and on Sepolia via a direct Uniswap V3 fallback, with composer schema, prepare orchestration, MCP tool, two widgets (`SwapSummary`, `SwapExecute`), and stub keeper offers.

**Architecture:** One plugin, two strategies selected by `chainId` at prepare time (`tradingApi.ts` for prod chains, `directV3.ts` for Sepolia / any chain with hardcoded V3 deployment). Widgets are oblivious to strategy — they consume a unified `SwapPrepared`/`SwapQuote`/`SwapConfig` contract. Live freshness via TanStack Query inside the widget; server-only API key in route handlers under `apps/web/app/api/uniswap/*`. Execution uses Porto's `useSendCalls` for atomic approve+swap batching.

**Tech Stack:** TypeScript strict, Next.js 15 route handlers, viem v2 (`publicClient.simulateContract`, `parseUnits`, `formatUnits`, `encodeFunctionData`), wagmi v2, `@tanstack/react-query` (already mounted in `apps/web/app/providers.tsx`), Vitest, MSW-style fetch mocks for Trading API tests.

**TDD pragmatics:** Pure modules (`tradingApi.ts` over mocked `fetch`, `directV3.ts` over a mocked viem client, `prepare.ts` strategy dispatch, validation helpers, multi-chain `amount.ts`/`tokens.ts`, intent schema rejection of `assetIn === assetOut`) get Vitest. The Next.js route handlers, widgets, and the on-chain leg are exercised by the manual e2e protocol in Task 14 against Base + Sepolia.

**Hard rules (from `swap-integration` skill):** chainIds in Trading API bodies are strings (`"1"`, `"8453"`); ETH uses placeholder `0x0000000000000000000000000000000000000000`; `routingPreference: "CLASSIC"`, `protocols: ["V2","V3","V4"]`, `deadline: now + 300`; all input strings validated against `/^[a-zA-Z0-9._:/?&=,-]+$/` and addresses against `/^0x[a-fA-F0-9]{40}$/`; spread quote into `/swap` body with `permitData` and `permitTransaction` stripped unconditionally (no Permit2 in v0); response validation rejects empty `data`, missing `to`, non-hex calldata; `fetchWithRetry` does exponential backoff with jitter on 429/5xx (cap 10s, total 12s) and immediate fail on other 4xx; never log the API key.

**Dependencies:** Tasks 11 and 12 are blocked-by the parity-plan tasks that ship `StepCard`, `WidgetCard`, `AICheckPanel`, `ExecuteTimeline`, `SuccessCard`, `ActionPill`, `SentenceBox`. This plan consumes those primitives by import; it does not redefine them.

---

## Phase 1 — Foundation: multi-chain token registry

### Task 1: Multi-chain `TOKENS` registry + `amount.ts` overload

**Files:**
- Modify: `apps/web/lib/tokens.ts`
- Modify: `apps/web/lib/amount.ts`
- Test: `apps/web/lib/tokens.test.ts` (new)
- Test: `apps/web/lib/amount.test.ts` (extend)

Compound currently imports nothing from `tokens.ts`; the registry only holds Sepolia USDC. Reshape it to `Record<number, Record<string, TokenInfo>>` with entries for chainIds `1, 8453, 42161, 10, 137, 130, 11155111`. Compound migrates onto the registry in this same task (Sepolia USDC entry simply becomes `TOKENS[11155111].USDC`).

- [ ] **Step 1: Write the failing test for `tokens.ts`**

```ts
// apps/web/lib/tokens.test.ts
import { describe, it, expect } from "vitest";
import { TOKENS, getToken, isNative } from "./tokens";

describe("multi-chain TOKENS registry", () => {
  it("exposes ETH on each Trading API chain", () => {
    for (const cid of [1, 8453, 42161, 10, 130]) {
      expect(TOKENS[cid].ETH.decimals).toBe(18);
      expect(TOKENS[cid].ETH.isNative).toBe(true);
    }
  });
  it("polygon native is MATIC, weth is wrapped", () => {
    expect(TOKENS[137].MATIC.isNative).toBe(true);
    expect(TOKENS[137].WETH.isNative).toBeFalsy();
  });
  it("getToken throws on unknown (chain, symbol)", () => {
    expect(() => getToken(11155111, "WBTC")).toThrow(/unsupported/i);
  });
  it("isNative true only for native entries", () => {
    expect(isNative(1, "ETH")).toBe(true);
    expect(isNative(1, "USDC")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run lib/tokens.test.ts`
Expected: FAIL — `TOKENS[1]` undefined / `getToken` does not throw / `isNative` not exported.

- [ ] **Step 3: Implement multi-chain `tokens.ts`**

```ts
// apps/web/lib/tokens.ts
import type { Hex } from "viem";

export type TokenInfo = {
  address: Hex;
  symbol: string;
  decimals: number;
  iconClass: string;
  isNative?: boolean;
};

const ETH_PLACEHOLDER = "0x0000000000000000000000000000000000000000" as Hex;

export const TOKENS: Record<number, Record<string, TokenInfo>> = {
  1: {
    ETH:  { address: ETH_PLACEHOLDER, symbol: "ETH",  decimals: 18, iconClass: "asset-dot eth",  isNative: true },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6,  iconClass: "asset-dot usdc" },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6,  iconClass: "asset-dot usdt" },
    DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI",  decimals: 18, iconClass: "asset-dot dai"  },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8,  iconClass: "asset-dot wbtc" },
  },
  8453: {
    ETH:  { address: ETH_PLACEHOLDER, symbol: "ETH",  decimals: 18, iconClass: "asset-dot eth",  isNative: true },
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6,  iconClass: "asset-dot usdc" },
    USDT: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", symbol: "USDT", decimals: 6,  iconClass: "asset-dot usdt" },
    DAI:  { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI",  decimals: 18, iconClass: "asset-dot dai"  },
    WBTC: { address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", symbol: "WBTC", decimals: 8,  iconClass: "asset-dot wbtc" },
  },
  42161: {
    ETH:  { address: ETH_PLACEHOLDER, symbol: "ETH",  decimals: 18, iconClass: "asset-dot eth",  isNative: true },
    USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6,  iconClass: "asset-dot usdc" },
    USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6,  iconClass: "asset-dot usdt" },
    DAI:  { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", symbol: "DAI",  decimals: 18, iconClass: "asset-dot dai"  },
    WBTC: { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", symbol: "WBTC", decimals: 8,  iconClass: "asset-dot wbtc" },
  },
  10: {
    ETH:  { address: ETH_PLACEHOLDER, symbol: "ETH",  decimals: 18, iconClass: "asset-dot eth",  isNative: true },
    USDC: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", decimals: 6,  iconClass: "asset-dot usdc" },
    USDT: { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", symbol: "USDT", decimals: 6,  iconClass: "asset-dot usdt" },
    DAI:  { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", symbol: "DAI",  decimals: 18, iconClass: "asset-dot dai"  },
    WBTC: { address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", symbol: "WBTC", decimals: 8,  iconClass: "asset-dot wbtc" },
  },
  137: {
    MATIC: { address: ETH_PLACEHOLDER, symbol: "MATIC", decimals: 18, iconClass: "asset-dot matic", isNative: true },
    WETH:  { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH", decimals: 18, iconClass: "asset-dot eth"  },
    USDC:  { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", decimals: 6,  iconClass: "asset-dot usdc" },
    USDT:  { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", decimals: 6,  iconClass: "asset-dot usdt" },
    DAI:   { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", symbol: "DAI",  decimals: 18, iconClass: "asset-dot dai"  },
    WBTC:  { address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", symbol: "WBTC", decimals: 8,  iconClass: "asset-dot wbtc" },
  },
  130: {
    ETH:  { address: ETH_PLACEHOLDER, symbol: "ETH",  decimals: 18, iconClass: "asset-dot eth",  isNative: true },
    USDC: { address: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", symbol: "USDC", decimals: 6,  iconClass: "asset-dot usdc" },
  },
  11155111: {
    ETH:  { address: ETH_PLACEHOLDER, symbol: "ETH",  decimals: 18, iconClass: "asset-dot eth",  isNative: true },
    USDC: { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", symbol: "USDC", decimals: 6,  iconClass: "asset-dot usdc" },
  },
};

export function getToken(chainId: number, symbol: string): TokenInfo {
  const t = TOKENS[chainId]?.[symbol];
  if (!t) throw new Error(`unsupported (chain, symbol): ${chainId} / ${symbol}`);
  return t;
}

export function isNative(chainId: number, symbol: string): boolean {
  return Boolean(TOKENS[chainId]?.[symbol]?.isNative);
}
```

- [ ] **Step 4: Extend `amount.ts` with the (symbol, chainId) overload**

```ts
// apps/web/lib/amount.ts
import { parseUnits, formatUnits } from "viem";
import { getToken } from "./tokens";

export const toWei = (h: string, t: { decimals: number }) => parseUnits(h, t.decimals);
export const fromWei = (w: bigint, t: { decimals: number }) => formatUnits(w, t.decimals);

export const toWeiFor = (h: string, symbol: string, chainId: number) =>
  parseUnits(h, getToken(chainId, symbol).decimals);
export const fromWeiFor = (w: bigint, symbol: string, chainId: number) =>
  formatUnits(w, getToken(chainId, symbol).decimals);
```

- [ ] **Step 5: Extend `amount.test.ts`**

```ts
import { toWeiFor, fromWeiFor } from "./amount";
it("toWeiFor / fromWeiFor go through the registry", () => {
  expect(toWeiFor("1", "USDC", 1)).toBe(1_000_000n);
  expect(toWeiFor("1", "ETH",  1)).toBe(1_000_000_000_000_000_000n);
  expect(fromWeiFor(1_000_000n, "USDC", 8453)).toBe("1");
});
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm --filter web vitest run lib/tokens.test.ts lib/amount.test.ts`
Expected: PASS.

- [ ] **Step 7: Confirm Compound still passes**

Compound's `prepare.ts` hardcodes `USDC_DECIMALS = 6` and uses `COMPOUND_ADDRESSES`, not `tokens.ts`, so this refactor is additive. Run: `pnpm --filter compound-v3 vitest run`. Expected: existing suite green.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/tokens.ts apps/web/lib/amount.ts apps/web/lib/tokens.test.ts apps/web/lib/amount.test.ts
git commit -m "feat(tokens): multi-chain registry + amount overloads"
```

---

## Phase 2 — Plugin scaffold

### Task 2: `plugins/uniswap` package skeleton + manifest + addresses + ABIs

**Files:**
- Create: `plugins/uniswap/package.json`
- Create: `plugins/uniswap/tsconfig.json`
- Create: `plugins/uniswap/vitest.config.ts`
- Create: `plugins/uniswap/manifest.ts`
- Create: `plugins/uniswap/addresses.ts`
- Create: `plugins/uniswap/abis/erc20.ts`
- Create: `plugins/uniswap/abis/quoterV2.ts`
- Create: `plugins/uniswap/abis/swapRouter02.ts`
- Test: `plugins/uniswap/addresses.test.ts`

- [ ] **Step 1: Failing test for addresses sanity**

```ts
// plugins/uniswap/addresses.test.ts
import { describe, it, expect } from "vitest";
import { TRADING_API_CHAINS, DIRECT_V3_CHAINS, UNIVERSAL_ROUTER } from "./addresses";

describe("uniswap addresses", () => {
  it("Trading API chains include the manifest set", () => {
    for (const cid of [1, 8453, 42161, 10, 137, 130]) expect(TRADING_API_CHAINS.has(cid)).toBe(true);
  });
  it("Sepolia is direct-V3, not Trading API", () => {
    expect(TRADING_API_CHAINS.has(11155111)).toBe(false);
    expect(DIRECT_V3_CHAINS[11155111]).toBeDefined();
  });
  it("UniversalRouter populated for every TradingAPI chain", () => {
    for (const cid of TRADING_API_CHAINS) expect(UNIVERSAL_ROUTER[cid]).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
  it("DIRECT_V3_CHAINS[sepolia] has quoter, swapRouter02, weth", () => {
    const c = DIRECT_V3_CHAINS[11155111]!;
    expect(c.quoterV2).toMatch(/^0x/);
    expect(c.swapRouter02).toMatch(/^0x/);
    expect(c.weth).toMatch(/^0x/);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @wishd/uniswap vitest run`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "@wishd/uniswap",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./intents": "./intents.ts",
    "./manifest": "./manifest.ts",
    "./prepare": "./prepare.ts",
    "./addresses": "./addresses.ts",
    "./tokens": "./tokens.ts",
    "./mcp/server": "./mcp/server.ts",
    "./widgets": "./widgets/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "*",
    "@modelcontextprotocol/sdk": "*",
    "@wishd/plugin-sdk": "workspace:*",
    "viem": "*",
    "zod": "*"
  },
  "devDependencies": {
    "vitest": "*",
    "typescript": "*"
  },
  "peerDependencies": { "react": "^19.0.0" }
}
```

- [ ] **Step 4: Write `tsconfig.json` + `vitest.config.ts`** (mirror `plugins/compound-v3/tsconfig.json`, `vitest.config.ts` exactly).

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["**/*.test.ts"] } });
```

- [ ] **Step 5: Write `manifest.ts`**

```ts
import type { Manifest } from "@wishd/plugin-sdk";
export const manifest: Manifest = {
  name: "uniswap",
  version: "0.0.0",
  chains: [1, 8453, 42161, 10, 137, 130, 11155111],
  trust: "verified",
  provides: { intents: ["swap", "trade", "exchange"], widgets: ["swap-summary", "swap-execute"], mcps: ["uniswap"] },
};
```

- [ ] **Step 6: Write `addresses.ts`**

```ts
import type { Hex } from "viem";

export const TRADING_API_CHAINS: ReadonlySet<number> = new Set([1, 8453, 42161, 10, 137, 130]);

export const UNIVERSAL_ROUTER: Record<number, Hex> = {
  1:     "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
  8453:  "0x6fF5693b99212Da76ad316178A184AB56D299b43",
  42161: "0xA51afAFe0263b40EdaEf0Df8781eA9aa03E381a3",
  10:    "0x851116D9223fabED8E56C0E6b8Ad0c31d98B3507",
  137:   "0x1095692A6237d83C6a72F3F5eFEdb9A670C49223",
  130:   "0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3",
};

export const DIRECT_V3_CHAINS: Record<number, {
  quoterV2: Hex;
  swapRouter02: Hex;
  universalRouter?: Hex;
  weth: Hex;
}> = {
  11155111: {
    quoterV2:     "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    weth:         "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  },
};
```

- [ ] **Step 7: Write the three ABI files** (minimal fragments only — `erc20.ts` exports `erc20Abi` with `allowance, balanceOf, approve, decimals`; `quoterV2.ts` exports `quoterV2Abi` with `quoteExactInputSingle((tuple))`; `swapRouter02.ts` exports `swapRouter02Abi` with `exactInputSingle(tuple)`, `multicall(bytes[])`, `unwrapWETH9(uint256,address)`, `refundETH()`). Pull canonical signatures from the on-chain contracts; do not invent fields.

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @wishd/uniswap vitest run`
Expected: PASS.

- [ ] **Step 9: Wire into pnpm workspace**

The root `pnpm-workspace.yaml` already globs `plugins/*`. Run `pnpm install` from repo root — confirm `@wishd/uniswap` resolves.

- [ ] **Step 10: Commit**

```bash
git add plugins/uniswap pnpm-lock.yaml
git commit -m "feat(uniswap): plugin scaffold + addresses + abis"
```

---

### Task 3: Shared swap types + per-chain `tokens.ts` re-export

**Files:**
- Create: `plugins/uniswap/types.ts`
- Create: `plugins/uniswap/tokens.ts`
- Create: `plugins/uniswap/intents.ts`
- Test: `plugins/uniswap/intents.test.ts`

- [ ] **Step 1: Failing test — schema rejects `assetIn === assetOut` and unknown chain**

```ts
// plugins/uniswap/intents.test.ts
import { describe, it, expect } from "vitest";
import { uniswapIntents, validateSwapValues } from "./intents";

describe("uniswapIntents", () => {
  it("exposes uniswap.swap with assetIn/assetOut/amount/chain", () => {
    const s = uniswapIntents[0];
    expect(s.intent).toBe("uniswap.swap");
    const keys = s.fields.map((f) => f.key).sort();
    expect(keys).toEqual(["amount", "assetIn", "assetOut", "chain"].sort());
  });

  it("rejects assetIn === assetOut", () => {
    expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "ETH", chain: "ethereum" }))
      .toThrow(/different assets/i);
  });

  it("rejects unknown chain", () => {
    expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "USDC", chain: "moonbeam" }))
      .toThrow(/unsupported chain/i);
  });

  it("accepts a valid combo", () => {
    expect(() => validateSwapValues({ amount: "0.1", assetIn: "ETH", assetOut: "USDC", chain: "base" }))
      .not.toThrow();
  });
});
```

- [ ] **Step 2: Write `types.ts`**

```ts
import type { Hex } from "viem";

export type SwapConfig = {
  chainId: number;
  swapper: Hex;
  tokenIn: Hex;        // 0x000…000 for native
  tokenOut: Hex;
  assetIn: string;
  assetOut: string;
  amountIn: string;    // decimal
  slippageBps: number;
  strategyTag: "trading-api" | "direct-v3";
};

export type Call = { to: Hex; data: Hex; value: Hex };

export type SwapQuote = {
  amountIn: string;
  amountOut: string;
  amountOutMin: string;
  rate: string;
  route: string;
  gasFeeUSD?: string;
  networkFee?: string;
  priceImpactBps?: number;
  expiresAt: number;
  raw: unknown;
};

export type KeeperOffer = { title: string; desc: string; featured?: boolean };

export type SwapPrepared = {
  config: SwapConfig;
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  approvalCall: Call | null;
  balance: string;
  insufficient: boolean;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];
};

export class SwapError extends Error {
  constructor(public code: "no_route" | "unsupported_routing" | "insufficient_balance" | "validation" | "upstream", message: string) {
    super(`[${code}] ${message}`);
  }
}
```

- [ ] **Step 3: Write `tokens.ts`** (re-export `apps/web/lib/tokens.ts` so the plugin doesn't import across app boundary).

```ts
// plugins/uniswap/tokens.ts
export { TOKENS, getToken, isNative } from "../../apps/web/lib/tokens";
export type { TokenInfo } from "../../apps/web/lib/tokens";
```

(If lint disallows `..` imports, copy the registry shape into the plugin and have `apps/web` re-export from the plugin instead — pick whichever direction the existing Compound plugin uses; mirror it.)

- [ ] **Step 4: Write `intents.ts`**

```ts
import type { IntentSchema } from "@wishd/plugin-sdk";

export const SUPPORTED_ASSETS = ["ETH", "USDC", "USDT", "DAI", "WBTC"] as const;
export const SUPPORTED_CHAINS = ["ethereum","base","arbitrum","optimism","polygon","unichain","ethereum-sepolia"] as const;

export const CHAIN_ID_BY_SLUG: Record<string, number> = {
  "ethereum": 1, "base": 8453, "arbitrum": 42161, "optimism": 10,
  "polygon": 137, "unichain": 130, "ethereum-sepolia": 11155111,
};

export const uniswapIntents: IntentSchema[] = [{
  intent: "uniswap.swap",
  verb: "swap",
  description: "exchange one token for another",
  fields: [
    { key: "amount",   type: "amount", required: true, default: "0.1" },
    { key: "assetIn",  type: "asset",  required: true, default: "ETH",  options: [...SUPPORTED_ASSETS] },
    { key: "assetOut", type: "asset",  required: true, default: "USDC", options: [...SUPPORTED_ASSETS] },
    { key: "chain",    type: "chain",  required: true, default: "ethereum-sepolia", options: [...SUPPORTED_CHAINS] },
  ],
  widget: "swap-summary",
  slot: "flow",
}];

export function validateSwapValues(v: { amount: string; assetIn: string; assetOut: string; chain: string }): void {
  if (!CHAIN_ID_BY_SLUG[v.chain]) throw new Error(`unsupported chain: ${v.chain}`);
  if (v.assetIn === v.assetOut) throw new Error("pick two different assets");
  if (!(SUPPORTED_ASSETS as readonly string[]).includes(v.assetIn))  throw new Error(`unsupported assetIn: ${v.assetIn}`);
  if (!(SUPPORTED_ASSETS as readonly string[]).includes(v.assetOut)) throw new Error(`unsupported assetOut: ${v.assetOut}`);
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(v.amount)) throw new Error(`invalid amount: ${v.amount}`);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @wishd/uniswap vitest run intents.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/uniswap/types.ts plugins/uniswap/tokens.ts plugins/uniswap/intents.ts plugins/uniswap/intents.test.ts
git commit -m "feat(uniswap): shared swap types + intent schema with validation"
```

---

## Phase 3 — Trading API strategy

### Task 4: `strategies/tradingApi.ts` — quote/check_approval/swap with retries + skill rules

**Files:**
- Create: `plugins/uniswap/strategies/tradingApi.ts`
- Create: `plugins/uniswap/strategies/fetchWithRetry.ts`
- Create: `plugins/uniswap/strategies/validateCall.ts`
- Test: `plugins/uniswap/strategies/tradingApi.test.ts`
- Test: `plugins/uniswap/strategies/fetchWithRetry.test.ts`

This module must enforce every rule from the swap-integration skill: chainIds as strings, ETH placeholder, `routingPreference: "CLASSIC"`, `protocols: ["V2","V3","V4"]`, `deadline: now+300`, `permitData`/`permitTransaction` stripped from `/swap` body, response calldata validated (non-empty hex, valid `to`/`from`), retries on 429/5xx with exponential backoff + jitter (cap 10s, total budget 12s).

- [ ] **Step 1: Failing tests**

```ts
// fetchWithRetry.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchWithRetry } from "./fetchWithRetry";

describe("fetchWithRetry", () => {
  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const r = await fetchWithRetry("https://x", { method: "POST" }, { maxRetries: 3, baseDelayMs: 1, capDelayMs: 5, totalBudgetMs: 1000, fetchImpl: fetchMock as any });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("4xx other than 429 fails immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("bad", { status: 400 }));
    await expect(fetchWithRetry("https://x", {}, { maxRetries: 5, baseDelayMs: 1, fetchImpl: fetchMock as any }))
      .rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries on persistent 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("x", { status: 503 }));
    await expect(fetchWithRetry("https://x", {}, { maxRetries: 2, baseDelayMs: 1, fetchImpl: fetchMock as any })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
```

```ts
// tradingApi.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradingApiStrategy } from "./tradingApi";

const APPROVE_RES = { approval: { to: "0xUSDC", data: "0x095ea7b3", value: "0x0" }, gasFee: "0.01" };
const QUOTE_RES = {
  routing: "CLASSIC",
  quote: { input: { amount: "100000000", token: "0xUSDC" }, output: { amount: "33000000000000000", token: "0x0000000000000000000000000000000000000000" }, gasFeeUSD: "0.42", priceImpact: 0.01, deadline: 9999999999 },
  permitData: { domain: {}, types: {}, values: {} },
};
const SWAP_RES = { swap: { to: "0xUR", data: "0xdeadbeef", value: "0x0", from: "0xSwapper" } };

describe("tradingApiStrategy", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-05-01T00:00:00Z")));

  it("/check_approval — sends chainId as string, returns null when API returns null approval", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ approval: null }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const out = await s.checkApproval({ chainId: 8453, walletAddress: "0xA".padEnd(42,"0") as any, token: "0xUSDC" as any, amountWei: "1" });
    expect(out.approvalCall).toBeNull();
    const sentBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(sentBody.chainId).toBe("8453");
  });

  it("/quote — pins CLASSIC + V2/V3/V4 + deadline now+300 + chainIds as strings", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(QUOTE_RES), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await s.quote({ chainId: 8453, swapper: "0xSwapper" as any, tokenIn: "0xUSDC" as any, tokenOut: "0x0000000000000000000000000000000000000000" as any, amountIn: "1", slippageBps: 50, assetIn: "USDC", assetOut: "ETH", strategyTag: "trading-api" });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.routingPreference).toBe("CLASSIC");
    expect(body.protocols).toEqual(["V2","V3","V4"]);
    expect(body.tokenInChainId).toBe("8453");
    expect(body.tokenOutChainId).toBe("8453");
    expect(body.deadline).toBe(Math.floor(Date.now()/1000) + 300);
    expect(body.slippageTolerance).toBeCloseTo(0.5);
  });

  it("/quote — rejects non-CLASSIC routing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ routing: "DUTCH_V2" }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await expect(s.quote({ chainId: 1, swapper: "0xSwapper" as any, tokenIn: "0xA" as any, tokenOut: "0xB" as any, amountIn: "1", slippageBps: 50, assetIn: "A", assetOut: "B", strategyTag: "trading-api" })).rejects.toThrow(/unsupported_routing/);
  });

  it("/swap — strips permitData and permitTransaction unconditionally", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(SWAP_RES), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const quote = { amountIn: "1", amountOut: "1", amountOutMin: "1", rate: "", route: "", expiresAt: Date.now()+30000,
      raw: { ...QUOTE_RES, permitData: {x:1}, permitTransaction: {y:2} } };
    await s.swap({ config: { chainId: 1, swapper: "0xSwapper" as any, tokenIn: "0xA" as any, tokenOut: "0xB" as any, amountIn: "1", slippageBps: 50, assetIn: "A", assetOut: "B", strategyTag: "trading-api" }, quote: quote as any });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.permitData).toBeUndefined();
    expect(body.permitTransaction).toBeUndefined();
  });

  it("/swap — rejects empty data hex", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ swap: { to: "0xUR", data: "0x", value: "0x0" } }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await expect(s.swap({ config: {} as any, quote: { raw: {} } as any })).rejects.toThrow(/calldata/i);
  });
});
```

- [ ] **Step 3: Run — verify fail.**

Run: `pnpm --filter @wishd/uniswap vitest run strategies`
Expected: FAIL (modules missing).

- [ ] **Step 4: Implement `fetchWithRetry.ts`**

```ts
export type RetryOpts = {
  maxRetries?: number;
  baseDelayMs?: number;
  capDelayMs?: number;
  totalBudgetMs?: number;
  fetchImpl?: typeof fetch;
};

export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOpts = {}): Promise<Response> {
  const { maxRetries = 5, baseDelayMs = 250, capDelayMs = 10_000, totalBudgetMs = 12_000, fetchImpl = fetch } = opts;
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    const res = await fetchImpl(url, init);
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`http ${res.status}: ${await safeText(res)}`);
    }
    if (attempt >= maxRetries || Date.now() - start > totalBudgetMs) {
      throw new Error(`http ${res.status} after ${attempt} retries: ${await safeText(res)}`);
    }
    const exp = Math.min(capDelayMs, baseDelayMs * 2 ** attempt);
    const jitter = Math.floor(Math.random() * exp * 0.25);
    await new Promise((r) => setTimeout(r, exp + jitter));
    attempt += 1;
  }
}

async function safeText(r: Response): Promise<string> { try { return (await r.text()).slice(0, 200); } catch { return ""; } }
```

- [ ] **Step 5: Implement `validateCall.ts`**

```ts
import type { Hex } from "viem";
import type { Call } from "../types";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const HEX  = /^0x[a-fA-F0-9]+$/;

export function validateCall(c: Partial<Call> | undefined, label: string): asserts c is Call {
  if (!c) throw new Error(`${label}: missing`);
  if (!c.to || !ADDR.test(c.to)) throw new Error(`${label}: bad to`);
  if (!c.data || !HEX.test(c.data) || c.data === "0x") throw new Error(`${label}: empty calldata`);
  if (typeof c.value !== "string" || !HEX.test(c.value)) throw new Error(`${label}: bad value`);
}

export function ensureHexValue(v: unknown): Hex {
  if (typeof v === "string" && HEX.test(v)) return v as Hex;
  if (typeof v === "string" && /^[0-9]+$/.test(v)) {
    const h = BigInt(v).toString(16);
    return `0x${h}` as Hex;
  }
  throw new Error("invalid value");
}
```

- [ ] **Step 6: Implement `tradingApi.ts`**

```ts
import type { Hex } from "viem";
import type { SwapConfig, SwapQuote, Call } from "../types";
import { SwapError } from "../types";
import { fetchWithRetry, type RetryOpts } from "./fetchWithRetry";
import { validateCall, ensureHexValue } from "./validateCall";

const BASE = "https://trade-api.gateway.uniswap.org/v1";
const ETH = "0x0000000000000000000000000000000000000000";

export type TradingApiOpts = { apiKey: string; fetchImpl?: typeof fetch; retry?: RetryOpts };

export function tradingApiStrategy(opts: TradingApiOpts) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    "x-universal-router-version": "2.0",
  };
  const post = (path: string, body: unknown) =>
    fetchWithRetry(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) }, { ...opts.retry, fetchImpl: opts.fetchImpl });

  async function checkApproval(input: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }): Promise<{ approvalCall: Call | null }> {
    if (input.token.toLowerCase() === ETH) return { approvalCall: null };
    const r = await post("/check_approval", {
      walletAddress: input.walletAddress,
      token: input.token,
      amount: input.amountWei,
      chainId: String(input.chainId),
    });
    const j = await r.json() as { approval: { to: Hex; data: Hex; value?: Hex } | null };
    if (!j.approval) return { approvalCall: null };
    const call: Call = { to: j.approval.to, data: j.approval.data, value: ensureHexValue(j.approval.value ?? "0x0") };
    validateCall(call, "approvalCall");
    return { approvalCall: call };
  }

  async function quote(cfg: SwapConfig): Promise<SwapQuote> {
    const r = await post("/quote", {
      swapper: cfg.swapper,
      tokenIn:  cfg.tokenIn,
      tokenOut: cfg.tokenOut,
      tokenInChainId:  String(cfg.chainId),
      tokenOutChainId: String(cfg.chainId),
      amount: cfg.amountIn,                        // already in wei — caller converts via amount.ts
      type: "EXACT_INPUT",
      slippageTolerance: cfg.slippageBps / 100,
      routingPreference: "CLASSIC",
      protocols: ["V2", "V3", "V4"],
      deadline: Math.floor(Date.now() / 1000) + 300,
    });
    const j = await r.json() as any;
    if (j.routing !== "CLASSIC" && j.routing !== "WRAP" && j.routing !== "UNWRAP") {
      throw new SwapError("unsupported_routing", j.routing ?? "missing");
    }
    return {
      amountIn:     j.quote?.input?.amount ?? cfg.amountIn,
      amountOut:    j.quote?.output?.amount ?? "0",
      amountOutMin: j.quote?.minOutput?.amount ?? j.quote?.output?.amount ?? "0",
      rate:         j.quote?.rate ?? "",
      route:        j.quote?.routeString ?? "Uniswap (Trading API)",
      gasFeeUSD:    j.quote?.gasFeeUSD,
      networkFee:   j.quote?.gasFeeUSD,
      priceImpactBps: typeof j.quote?.priceImpact === "number" ? Math.round(j.quote.priceImpact * 100) : undefined,
      expiresAt:    (j.quote?.deadline ?? (Math.floor(Date.now()/1000) + 30)) * 1000,
      raw: j,
    };
  }

  async function swap(input: { config: SwapConfig; quote: SwapQuote }): Promise<{ swapCall: Call; approvalStillRequired: boolean }> {
    const { permitData: _pd, permitTransaction: _pt, ...cleanQuote } = (input.quote.raw as Record<string, unknown>) ?? {};
    const r = await post("/swap", cleanQuote);
    const j = await r.json() as { swap: { to: Hex; data: Hex; value?: Hex; from?: Hex } };
    const call: Call = { to: j.swap.to, data: j.swap.data, value: ensureHexValue(j.swap.value ?? "0x0") };
    validateCall(call, "swapCall");
    const approvalCheck = await checkApproval({
      chainId: input.config.chainId,
      walletAddress: input.config.swapper,
      token: input.config.tokenIn,
      amountWei: input.quote.amountIn,
    });
    return { swapCall: call, approvalStillRequired: approvalCheck.approvalCall !== null };
  }

  return { checkApproval, quote, swap };
}
```

- [ ] **Step 7: Tests pass.** Run: `pnpm --filter @wishd/uniswap vitest run strategies`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add plugins/uniswap/strategies
git commit -m "feat(uniswap): trading API strategy with skill-enforced rules"
```

---

## Phase 4 — Direct V3 strategy

### Task 5: `strategies/directV3.ts` — fee-tier scan, multicall calldata

**Files:**
- Create: `plugins/uniswap/strategies/directV3.ts`
- Test: `plugins/uniswap/strategies/directV3.test.ts`

Direct V3 covers Sepolia plus any future chain populated in `DIRECT_V3_CHAINS`. ETH is wrapped to WETH for the quoter; ETH-in is delivered via `swapRouter02` `multicall([exactInputSingle, refundETH])` with `value = amountIn`; ETH-out is `multicall([exactInputSingle{recipient=ADDRESS_THIS=2}, unwrapWETH9(amountOutMin, swapper)])`. Approval (ERC-20 → router) is read separately and emitted as a `Call`.

- [ ] **Step 1: Failing tests with mocked viem client**

```ts
import { describe, it, expect, vi } from "vitest";
import { directV3Strategy } from "./directV3";

const sepolia = 11155111;
const SWAPPER = "0x000000000000000000000000000000000000bEEF" as const;

function mockClient({ outs, allowance }: { outs: Record<number, bigint>; allowance: bigint }) {
  const sim = vi.fn().mockImplementation((args: any) => {
    const fee = args.args[0].fee;
    const out = outs[fee];
    if (out === undefined) throw new Error("revert: no pool");
    return Promise.resolve({ result: [out, 0n, 0, 100_000n] });
  });
  const read = vi.fn().mockImplementation((args: any) => {
    if (args.functionName === "allowance") return Promise.resolve(allowance);
    if (args.functionName === "balanceOf") return Promise.resolve(10n ** 20n);
    throw new Error("unexpected read");
  });
  return { simulateContract: sim, readContract: read, getBalance: vi.fn().mockResolvedValue(5n * 10n ** 18n) } as any;
}

describe("directV3Strategy", () => {
  it("picks best fee tier across 500/3000/10000", async () => {
    const client = mockClient({ outs: { 500: 100n, 3000: 200n, 10000: 50n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    const q = await s.quote({ chainId: sepolia, swapper: SWAPPER, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as any, amountIn: "0.001", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" });
    expect(q.route).toContain("0.30%");
    expect(BigInt((q.raw as any).amountOutMin)).toBe(200n * 9950n / 10000n);
  });

  it("throws no_route when all fee tiers revert", async () => {
    const client = mockClient({ outs: {}, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    await expect(s.quote({ chainId: sepolia, swapper: SWAPPER, tokenIn: "0xA" as any, tokenOut: "0xB" as any, amountIn: "1", slippageBps: 50, assetIn: "A", assetOut: "B", strategyTag: "direct-v3" })).rejects.toThrow(/no_route/);
  });

  it("checkApproval — null for ETH-in, allowance read for ERC20", async () => {
    const client = mockClient({ outs: { 3000: 1n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    expect(await s.checkApproval({ chainId: sepolia, walletAddress: SWAPPER, token: "0x0000000000000000000000000000000000000000" as any, amountWei: "1" })).toEqual({ approvalCall: null });
    const r = await s.checkApproval({ chainId: sepolia, walletAddress: SWAPPER, token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as any, amountWei: "10000000" });
    expect(r.approvalCall).not.toBeNull();
    expect(r.approvalCall!.data.startsWith("0x095ea7b3")).toBe(true);
  });

  it("swap — ETH-in returns multicall with non-zero value", async () => {
    const client = mockClient({ outs: { 3000: 200n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    const cfg = { chainId: sepolia, swapper: SWAPPER, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as any, amountIn: "0.001", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" as const };
    const q = await s.quote(cfg);
    const out = await s.swap({ config: cfg, quote: q });
    expect(BigInt(out.swapCall.value)).toBeGreaterThan(0n);
    expect(out.swapCall.data.startsWith("0xac9650d8")).toBe(true); // multicall(bytes[]) selector
  });
});
```

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement `directV3.ts`**

```ts
import { encodeFunctionData, parseUnits, formatUnits, maxUint256, type Hex, type PublicClient } from "viem";
import { DIRECT_V3_CHAINS } from "../addresses";
import { quoterV2Abi } from "../abis/quoterV2";
import { swapRouter02Abi } from "../abis/swapRouter02";
import { erc20Abi } from "../abis/erc20";
import { getToken, isNative } from "../tokens";
import type { Call, SwapConfig, SwapQuote } from "../types";
import { SwapError } from "../types";

const ETH = "0x0000000000000000000000000000000000000000" as Hex;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Hex; // SwapRouter02 sentinel for "this contract"
const FEES = [500, 3000, 10_000] as const;

export function directV3Strategy(opts: { publicClient: Pick<PublicClient, "simulateContract" | "readContract" | "getBalance"> }) {
  const pc = opts.publicClient;

  function chain(chainId: number) {
    const c = DIRECT_V3_CHAINS[chainId];
    if (!c) throw new SwapError("validation", `direct-v3 not configured for chain ${chainId}`);
    return c;
  }

  function wrapNative(addr: Hex, chainId: number): Hex {
    return addr.toLowerCase() === ETH ? chain(chainId).weth : addr;
  }

  async function quote(cfg: SwapConfig): Promise<SwapQuote> {
    const c = chain(cfg.chainId);
    const tIn  = wrapNative(cfg.tokenIn,  cfg.chainId);
    const tOut = wrapNative(cfg.tokenOut, cfg.chainId);
    const decIn  = getToken(cfg.chainId, cfg.assetIn).decimals;
    const decOut = getToken(cfg.chainId, cfg.assetOut).decimals;
    const amountInWei = parseUnits(cfg.amountIn, decIn);

    const settled = await Promise.allSettled(FEES.map((fee) => pc.simulateContract({
      address: c.quoterV2, abi: quoterV2Abi, functionName: "quoteExactInputSingle",
      args: [{ tokenIn: tIn, tokenOut: tOut, fee, amountIn: amountInWei, sqrtPriceLimitX96: 0n }],
    })));

    let best: { fee: number; out: bigint } | null = null;
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        const out = (r.value.result as readonly [bigint, bigint, number, bigint])[0];
        if (!best || out > best.out) best = { fee: FEES[i]!, out };
      }
    });
    if (!best) throw new SwapError("no_route", `no V3 pool for ${cfg.assetIn}/${cfg.assetOut} on chain ${cfg.chainId}`);

    const amountOutMin = (best.out * BigInt(10_000 - cfg.slippageBps)) / 10_000n;
    return {
      amountIn:     cfg.amountIn,
      amountOut:    formatUnits(best.out, decOut),
      amountOutMin: formatUnits(amountOutMin, decOut),
      rate:         `1 ${cfg.assetIn} = ${formatUnits(best.out * 10n ** BigInt(decIn) / amountInWei, decOut)} ${cfg.assetOut}`,
      route:        `Uniswap v3 · ${(best.fee / 10_000).toFixed(2)}%`,
      expiresAt:    Date.now() + 30_000,
      raw:          { fee: best.fee, amountInWei: amountInWei.toString(), amountOutMin: amountOutMin.toString(), wrapEthIn: cfg.tokenIn.toLowerCase() === ETH, unwrapWethOut: cfg.tokenOut.toLowerCase() === ETH },
    };
  }

  async function checkApproval(input: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }): Promise<{ approvalCall: Call | null }> {
    if (input.token.toLowerCase() === ETH) return { approvalCall: null };
    const c = chain(input.chainId);
    const allowance = await pc.readContract({ address: input.token, abi: erc20Abi, functionName: "allowance", args: [input.walletAddress, c.swapRouter02] }) as bigint;
    if (allowance >= BigInt(input.amountWei)) return { approvalCall: null };
    return { approvalCall: { to: input.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [c.swapRouter02, maxUint256] }), value: "0x0" as Hex } };
  }

  async function swap(input: { config: SwapConfig; quote: SwapQuote }): Promise<{ swapCall: Call; approvalStillRequired: boolean }> {
    const cfg = input.config;
    const raw = input.quote.raw as { fee: number; amountInWei: string; amountOutMin: string; wrapEthIn: boolean; unwrapWethOut: boolean };
    const c = chain(cfg.chainId);

    const recipient = raw.unwrapWethOut ? ADDRESS_THIS : cfg.swapper;
    const exactInputSingle = encodeFunctionData({
      abi: swapRouter02Abi, functionName: "exactInputSingle",
      args: [{ tokenIn: wrapNative(cfg.tokenIn, cfg.chainId), tokenOut: wrapNative(cfg.tokenOut, cfg.chainId), fee: raw.fee, recipient, amountIn: BigInt(raw.amountInWei), amountOutMinimum: BigInt(raw.amountOutMin), sqrtPriceLimitX96: 0n }],
    });

    const inner: Hex[] = [exactInputSingle];
    if (raw.unwrapWethOut) inner.push(encodeFunctionData({ abi: swapRouter02Abi, functionName: "unwrapWETH9", args: [BigInt(raw.amountOutMin), cfg.swapper] }));
    if (raw.wrapEthIn)     inner.push(encodeFunctionData({ abi: swapRouter02Abi, functionName: "refundETH", args: [] }));

    const data = encodeFunctionData({ abi: swapRouter02Abi, functionName: "multicall", args: [inner] });
    const value = (raw.wrapEthIn ? `0x${BigInt(raw.amountInWei).toString(16)}` : "0x0") as Hex;

    const swapCall: Call = { to: c.swapRouter02, data, value };
    const ap = await checkApproval({ chainId: cfg.chainId, walletAddress: cfg.swapper, token: cfg.tokenIn, amountWei: raw.amountInWei });
    return { swapCall, approvalStillRequired: ap.approvalCall !== null };
  }

  return { quote, checkApproval, swap };
}
```

- [ ] **Step 4: Tests pass.** Run: `pnpm --filter @wishd/uniswap vitest run strategies/directV3`.

- [ ] **Step 5: Commit**

```bash
git add plugins/uniswap/strategies/directV3.ts plugins/uniswap/strategies/directV3.test.ts
git commit -m "feat(uniswap): direct V3 strategy with multicall ETH wrap/unwrap"
```

---

## Phase 5 — Prepare orchestrator

### Task 6: `prepare.ts` — strategy dispatch + balance + parallel quote/approval

**Files:**
- Create: `plugins/uniswap/prepare.ts`
- Test: `plugins/uniswap/prepare.test.ts`

`prepareSwap` is the single entry point. Pure aside from clients passed in. Returns the full `SwapPrepared` shape.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { prepareSwap } from "./prepare";

const SWAPPER = "0x000000000000000000000000000000000000bEEF" as const;

const fakeQuote = (over = {}) => ({ amountIn: "0.1", amountOut: "300", amountOutMin: "298.5", rate: "1 ETH = 3000 USDC", route: "Uniswap v3", expiresAt: Date.now() + 30_000, raw: {}, ...over });

function tradingApiStub(out: any) {
  return { quote: vi.fn().mockResolvedValue(out.quote), checkApproval: vi.fn().mockResolvedValue({ approvalCall: out.approvalCall }), swap: vi.fn() };
}
function directV3Stub(out: any) { return tradingApiStub(out); }

describe("prepareSwap", () => {
  it("dispatches to tradingApi for chain 8453", async () => {
    const ta = tradingApiStub({ quote: fakeQuote(), approvalCall: null });
    const dv = directV3Stub({ quote: fakeQuote(), approvalCall: null });
    const out = await prepareSwap({
      values: { amount: "0.1", assetIn: "ETH", assetOut: "USDC", chain: "base" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn().mockResolvedValue(10n ** 18n), readContract: vi.fn() } as any,
    });
    expect(ta.quote).toHaveBeenCalled();
    expect(dv.quote).not.toHaveBeenCalled();
    expect(out.config.chainId).toBe(8453);
    expect(out.config.strategyTag).toBe("trading-api");
    expect(out.insufficient).toBe(false);
  });

  it("dispatches to directV3 for sepolia + sets liquidityNote", async () => {
    const ta = tradingApiStub({ quote: fakeQuote(), approvalCall: null });
    const dv = directV3Stub({ quote: fakeQuote(), approvalCall: null });
    const out = await prepareSwap({
      values: { amount: "0.001", assetIn: "ETH", assetOut: "USDC", chain: "ethereum-sepolia" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn().mockResolvedValue(10n ** 18n), readContract: vi.fn() } as any,
    });
    expect(dv.quote).toHaveBeenCalled();
    expect(out.config.strategyTag).toBe("direct-v3");
    expect(out.liquidityNote).toMatch(/sepolia/i);
  });

  it("rejects assetIn === assetOut", async () => {
    const ta = tradingApiStub({}); const dv = directV3Stub({});
    await expect(prepareSwap({ values: { amount: "1", assetIn: "USDC", assetOut: "USDC", chain: "base" }, address: SWAPPER, slippageBps: 50, strategies: { tradingApi: ta as any, directV3: dv as any }, publicClient: {} as any })).rejects.toThrow(/different assets/);
  });

  it("flags insufficient when balance < amountIn", async () => {
    const ta = tradingApiStub({ quote: fakeQuote({ amountIn: "10" }), approvalCall: null });
    const dv = directV3Stub({});
    const out = await prepareSwap({
      values: { amount: "10", assetIn: "ETH", assetOut: "USDC", chain: "base" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn().mockResolvedValue(10n ** 17n), readContract: vi.fn() } as any,
    });
    expect(out.insufficient).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fail. Step 3: Implement `prepare.ts`**

```ts
import type { Hex, PublicClient } from "viem";
import { parseUnits, formatUnits } from "viem";
import { TRADING_API_CHAINS } from "./addresses";
import { CHAIN_ID_BY_SLUG, validateSwapValues } from "./intents";
import { getToken, isNative } from "./tokens";
import { erc20Abi } from "./abis/erc20";
import type { SwapConfig, SwapPrepared, KeeperOffer } from "./types";

const STATIC_KEEPER_OFFERS: KeeperOffer[] = [
  { title: "Earn on idle tokens",     desc: "Auto-deposit received tokens into best APY protocol.", featured: true },
  { title: "Range alert",             desc: "Notify if price moves ±15% — chance to swap back at better rate." },
  { title: "DCA back",                desc: "Drip tokens back at intervals until target allocation reached." },
  { title: "Liquidation protection",  desc: "Auto-repay borrow if health factor drops below 1.3." },
];

export type Strategies = {
  tradingApi: { quote: (cfg: SwapConfig) => Promise<any>; checkApproval: (i: any) => Promise<any>; swap: (i: any) => Promise<any> };
  directV3:   { quote: (cfg: SwapConfig) => Promise<any>; checkApproval: (i: any) => Promise<any>; swap: (i: any) => Promise<any> };
};

export type PrepareInput = {
  values: { amount: string; assetIn: string; assetOut: string; chain: string };
  address: Hex;
  slippageBps: number;
  strategies: Strategies;
  publicClient: Pick<PublicClient, "getBalance" | "readContract">;
};

export async function prepareSwap(input: PrepareInput): Promise<SwapPrepared> {
  validateSwapValues(input.values);
  const chainId = CHAIN_ID_BY_SLUG[input.values.chain]!;
  const tokenInInfo  = getToken(chainId, input.values.assetIn);
  const tokenOutInfo = getToken(chainId, input.values.assetOut);

  const strategyTag: SwapConfig["strategyTag"] = TRADING_API_CHAINS.has(chainId) ? "trading-api" : "direct-v3";
  const strategy = strategyTag === "trading-api" ? input.strategies.tradingApi : input.strategies.directV3;

  const amountInWei = parseUnits(input.values.amount, tokenInInfo.decimals);

  const config: SwapConfig = {
    chainId, swapper: input.address,
    tokenIn:  tokenInInfo.address,
    tokenOut: tokenOutInfo.address,
    assetIn:  input.values.assetIn,
    assetOut: input.values.assetOut,
    amountIn: input.values.amount,
    slippageBps: input.slippageBps,
    strategyTag,
  };

  const balanceP = isNative(chainId, input.values.assetIn)
    ? input.publicClient.getBalance({ address: input.address })
    : input.publicClient.readContract({ address: tokenInInfo.address, abi: erc20Abi, functionName: "balanceOf", args: [input.address] }) as Promise<bigint>;

  const [balanceWei, quote, approval] = await Promise.all([
    balanceP,
    strategy.quote(config),
    strategy.checkApproval({ chainId, walletAddress: input.address, token: tokenInInfo.address, amountWei: amountInWei.toString() }),
  ]);

  const balance = formatUnits(balanceWei as bigint, tokenInInfo.decimals);
  const insufficient = (balanceWei as bigint) < amountInWei;

  return {
    config,
    initialQuote: quote,
    initialQuoteAt: Date.now(),
    approvalCall: approval.approvalCall,
    balance,
    insufficient,
    liquidityNote: chainId === 11155111 ? "Sepolia liquidity is sparse — preview only, this may revert on execute." : undefined,
    keeperOffers: STATIC_KEEPER_OFFERS,
  };
}
```

- [ ] **Step 4: Tests pass. Step 5: Commit.**

```bash
git add plugins/uniswap/prepare.ts plugins/uniswap/prepare.test.ts
git commit -m "feat(uniswap): prepare orchestrator dispatching strategy by chainId"
```

---

## Phase 6 — Server endpoints

### Task 7: `/api/prepare/uniswap.swap` route + `intentDispatch.ts` extension

**Files:**
- Create: `apps/web/server/uniswapClients.ts` (factory: builds wagmi-equivalent `publicClient` per chainId, returns strategy bundle)
- Modify: `apps/web/server/intentDispatch.ts`
- Test: `apps/web/server/intentDispatch.test.ts` (extend)
- Modify: existing `apps/web/app/api/prepare/[intent]/route.ts` to forward to dispatch — already does so, but currently hardcodes a Sepolia `publicClient`. Refactor to per-intent: for `uniswap.swap`, build the right RPC clients server-side.

- [ ] **Step 1: Write `uniswapClients.ts`**

```ts
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, sepolia } from "viem/chains";
import { tradingApiStrategy } from "@plugins/uniswap/strategies/tradingApi";
import { directV3Strategy }   from "@plugins/uniswap/strategies/directV3";

const CHAIN_BY_ID: Record<number, any> = {
  1: mainnet, 8453: base, 42161: arbitrum, 10: optimism, 137: polygon, 11155111: sepolia,
  130: { id: 130, name: "Unichain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://mainnet.unichain.org"] } } },
};

export function publicClientFor(chainId: number): PublicClient {
  const c = CHAIN_BY_ID[chainId];
  if (!c) throw new Error(`no rpc configured for chain ${chainId}`);
  const rpcUrl = process.env[`RPC_URL_${chainId}`] ?? c.rpcUrls?.default?.http?.[0];
  return createPublicClient({ chain: c, transport: http(rpcUrl) });
}

export function uniswapStrategies(chainId: number) {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) throw new Error("UNISWAP_API_KEY missing");
  return {
    tradingApi: tradingApiStrategy({ apiKey }),
    directV3:   directV3Strategy({ publicClient: publicClientFor(chainId) }),
  };
}
```

- [ ] **Step 2: Extend `intentDispatch.ts`** — add a branch:

```ts
if (intent === "uniswap.swap") {
  const chainSlug = String(input.body.chain ?? "");
  const chainId = CHAIN_ID_BY_SLUG[chainSlug];
  if (!chainId) throw new Error(`unsupported chain: ${chainSlug}`);
  const prepared = await prepareSwap({
    values: { amount: requireAmount(input.body), assetIn: String(input.body.assetIn), assetOut: String(input.body.assetOut), chain: chainSlug },
    address: requireAddress(input.body),
    slippageBps: typeof input.body.slippageBps === "number" ? input.body.slippageBps : 50,
    strategies: uniswapStrategies(chainId),
    publicClient: publicClientFor(chainId),
  });
  return {
    prepared,
    widget: { id: newWidgetId(), type: "swap-summary", slot: "flow", props: prepared as unknown as Record<string, unknown> },
  };
}
```

(Update the existing route handler to choose `publicClientFor(chainId)` from the body for swap intents — or keep the route generic and let dispatch build clients itself; pick the second to keep route a thin adapter.)

- [ ] **Step 3: Add a dispatch test** that passes a stub `publicClient` and asserts a swap intent returns a `swap-summary` widget. Reuse the existing `intentDispatch.test.ts` patterns; inject strategies via a test seam if needed (export `dispatchIntentInner` that takes pre-built strategies, or use module-level mocks via `vi.mock`).

- [ ] **Step 4: Run all dispatch tests.** Expected: PASS, including existing Compound cases.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/uniswapClients.ts apps/web/server/intentDispatch.ts apps/web/server/intentDispatch.test.ts
git commit -m "feat(server): dispatch uniswap.swap through strategy bundle"
```

### Task 8: `/api/uniswap/quote` route

**Files:**
- Create: `apps/web/app/api/uniswap/quote/route.ts`

```ts
import { NextResponse } from "next/server";
import { uniswapStrategies, publicClientFor } from "@/server/uniswapClients";
import { getToken } from "@/lib/tokens";
import { parseUnits } from "viem";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { chainId: number; tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: string; swapper: `0x${string}`; slippageBps: number; assetIn: string; assetOut: string };
    const strat = uniswapStrategies(body.chainId);
    const tag = (body.chainId === 11155111 ? "direct-v3" : "trading-api") as const;
    const decIn = getToken(body.chainId, body.assetIn).decimals;
    const cfg = { ...body, amountIn: tag === "trading-api" ? parseUnits(body.amountIn, decIn).toString() : body.amountIn, strategyTag: tag };
    const quote = await (tag === "trading-api" ? strat.tradingApi.quote(cfg as any) : strat.directV3.quote(cfg as any));
    return NextResponse.json(quote);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: /no_route|insufficient/.test(msg) ? 422 : /unsupported|invalid|required/.test(msg) ? 400 : 502 });
  }
}
```

- [ ] **Step 1:** Manually exercise with `curl -X POST localhost:3000/api/uniswap/quote -d '{...}'` — see Task 14. No unit test on the route handler itself; the strategies are unit-tested.

- [ ] **Step 2: Commit** with `git add … && git commit -m "feat(api): /api/uniswap/quote"`.

### Task 9: `/api/uniswap/swap` route

**Files:**
- Create: `apps/web/app/api/uniswap/swap/route.ts`

```ts
import { NextResponse } from "next/server";
import { uniswapStrategies } from "@/server/uniswapClients";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { config, quote } = await req.json();
    const strat = uniswapStrategies(config.chainId);
    const out = await (config.strategyTag === "trading-api" ? strat.tradingApi.swap({ config, quote }) : strat.directV3.swap({ config, quote }));
    return NextResponse.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: /calldata|invalid|unsupported_routing/.test(msg) ? 422 : 502 });
  }
}
```

- [ ] **Commit** as `"feat(api): /api/uniswap/swap with fresh-approval check"`.

### Task 10: `/api/uniswap/balance` route

**Files:**
- Create: `apps/web/app/api/uniswap/balance/route.ts`

```ts
import { NextResponse } from "next/server";
import { publicClientFor } from "@/server/uniswapClients";
import { erc20Abi } from "@plugins/uniswap/abis/erc20";
import { formatUnits } from "viem";
import { getToken } from "@/lib/tokens";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { chainId, token, address, symbol } = await req.json();
    const pc = publicClientFor(chainId);
    const dec = getToken(chainId, symbol).decimals;
    const wei = token.toLowerCase() === "0x0000000000000000000000000000000000000000"
      ? await pc.getBalance({ address })
      : await pc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }) as bigint;
    return NextResponse.json({ balance: formatUnits(wei, dec) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
```

- [ ] **Commit** `"feat(api): /api/uniswap/balance"`.

---

## Phase 7 — MCP tool + composer wiring

### Task 11: MCP `prepare_swap` tool

**Files:**
- Create: `plugins/uniswap/mcp/server.ts`
- Create: `plugins/uniswap/index.ts`

Mirror Compound's MCP exactly — `createSdkMcpServer` with one tool. Validate inputs with Zod regex per skill.

```ts
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { PluginCtx } from "@wishd/plugin-sdk";
import { prepareSwap } from "../prepare";
import { uniswapStrategies, publicClientFor } from "../../../apps/web/server/uniswapClients"; // or expose via ctx
import { CHAIN_ID_BY_SLUG } from "../intents";

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const inputSchema = {
  amount:     z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/),
  assetIn:    z.enum(["ETH","USDC","USDT","DAI","WBTC","MATIC","WETH"]),
  assetOut:   z.enum(["ETH","USDC","USDT","DAI","WBTC","MATIC","WETH"]),
  chain:      z.string(),
  user:       z.string().regex(ADDR),
  chainId:    z.coerce.number().int(),
  slippageBps: z.number().optional().default(50),
};

export function createUniswapMcp(_ctx: PluginCtx) {
  return createSdkMcpServer({
    name: "uniswap",
    version: "0.0.0",
    tools: [
      tool("prepare_swap", "Prepare a Uniswap swap. Returns SwapPrepared (config, initialQuote, approvalCall, balance, insufficient, keeperOffers).",
        inputSchema,
        async (args) => {
          const chainId = args.chainId ?? CHAIN_ID_BY_SLUG[args.chain]!;
          const prepared = await prepareSwap({
            values: { amount: args.amount, assetIn: args.assetIn, assetOut: args.assetOut, chain: args.chain },
            address: args.user as `0x${string}`,
            slippageBps: args.slippageBps,
            strategies: uniswapStrategies(chainId),
            publicClient: publicClientFor(chainId),
          });
          return { content: [{ type: "text", text: JSON.stringify(prepared) }] };
        },
      ),
    ],
  });
}
```

`index.ts`:

```ts
import { definePlugin } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { createUniswapMcp } from "./mcp/server";
import { uniswapIntents } from "./intents";
import { SwapSummary, SwapExecute } from "./widgets";

export const uniswap = definePlugin({
  manifest,
  mcp: (ctx) => ({ server: createUniswapMcp(ctx) as any, serverName: "uniswap" }),
  widgets: { "swap-summary": SwapSummary, "swap-execute": SwapExecute },
  intents: uniswapIntents,
});
export { manifest, uniswapIntents };
```

- [ ] **Step 1:** Add the plugin to `apps/web/server/pluginLoader.ts` so its MCP gets mounted; mirror how Compound is registered.
- [ ] **Step 2:** Add `apps/web/lib/intentRegistry.client.ts` import:

```ts
import { uniswapIntents } from "@plugins/uniswap/intents";
export const CLIENT_INTENT_SCHEMAS: IntentSchema[] = [...compoundIntents, ...uniswapIntents];
```

- [ ] **Step 3:** Extend `apps/web/server/intentRegistry.ts` similarly (server-side aggregation).
- [ ] **Step 4: Run `intentRegistry.test.ts`** — extend to assert `uniswap.swap` is registered.
- [ ] **Step 5: Commit** `"feat(uniswap): MCP tool + plugin index, register in loader & client/server intent registries"`.

---

## Phase 8 — Free-text composer + system prompt

### Task 12: `guessFromText` swap regex + system prompt swap branch

**Files:**
- Modify: `apps/web/components/wish/WishComposer.tsx` (`guessFromText` at L242)
- Modify: `apps/web/server/systemPrompt.ts`
- Test: `apps/web/server/systemPrompt.test.ts` (extend)

- [ ] **Step 1:** Update `guessFromText`:

```ts
function guessFromText(t: string): { widgetType: string; amount?: string; asset?: string } {
  const lower = t.toLowerCase();
  if (/swap|trade|exchange/.test(lower)) {
    const m = lower.match(/(\d+(?:\.\d+)?)\s*(eth|usdc|usdt|dai|wbtc|matic|weth)?/);
    return { widgetType: "swap-summary", amount: m?.[1], asset: m?.[2]?.toUpperCase() };
  }
  const widgetType = /withdraw|redeem/.test(lower) ? "compound-withdraw-summary" : "compound-summary";
  const m = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|usd|eth)?/);
  return { widgetType, amount: m?.[1], asset: m?.[2]?.toUpperCase() };
}
```

Also extend the structured composer's `phrase()` helper with a swap branch so submitting via the structured form generates a swap-shaped wish.

- [ ] **Step 2:** Append a swap branch to `CANONICAL_FLOWS` in `systemPrompt.ts`:

```
E. Swap intent — wishes like "swap N <assetIn> for <assetOut> on <chain>":
  1. Call mcp__uniswap__prepare_swap({ amount, assetIn, assetOut, chain, user, chainId, slippageBps }).
  2. Call mcp__widget__render({ type: "swap-summary", props: <prepared> }).
  3. Reply with one short narration line.

F. Follow-up "execute swap <summaryId>" — context.prepared present:
  1. Call mcp__widget__render({ type: "swap-execute", props: { ...context.prepared } }).
  2. Reply with one short narration line.
```

Add a `Tools available:` row for `mcp__uniswap__prepare_swap`.

- [ ] **Step 3:** Update `systemPrompt.test.ts` to assert the swap branch text is present when `uniswap.swap` is in `intents`.

- [ ] **Step 4: Commit** `"feat(composer): swap regex + system-prompt swap canonical flow"`.

---

## Phase 9 — Widgets

> **Both widget tasks are blocked-by the parity plan's primitive tasks**: `StepCard`, `WidgetCard`, `AICheckPanel`, `ExecuteTimeline`, `SuccessCard`, `ActionPill`, `SentenceBox`. Do not start these until those primitives are exported from `apps/web/components/primitives/`.

### Task 13: `SwapSummary.tsx` — TanStack Query refresh + AICheckPanel + flip

**Files:**
- Create: `plugins/uniswap/widgets/SwapSummary.tsx`
- Create: `plugins/uniswap/widgets/index.ts`
- Modify: `apps/web/widgetRegistry.ts` (mount `swap-summary`, `swap-execute`)

- [ ] **Step 1:** Confirm `QueryClientProvider` is mounted in `apps/web/app/providers.tsx`. (Already verified — wagmi v2 mounts one alongside `WagmiProvider`. No extra work.)

- [ ] **Step 2:** Implement `SwapSummary` per the spec's widget-contract block (lines 451–494). Key behaviors:

  - Local state for editable `amountIn`, `assetIn`, `assetOut`, `slippageBps`, debounced 300ms.
  - `useQuery({ queryKey: ["uniswap.quote", chainId, tokenIn, tokenOut, debouncedAmount, swapper], ... })` with `initialData: props.initialQuote`, `initialDataUpdatedAt: props.initialQuoteAt`, `refetchInterval: 15_000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`, `staleTime: 10_000`, `placeholderData: keepPreviousData`, `retry: (n, err) => n < 2 && !is4xx(err)`, `signal` forwarded into `fetch`.
  - Render `<StepCard step="STEP 02" …>` containing `<WidgetCard>` with pay/receive boxes, `<SwapDir>` flip, `<Stats>`, and a CTA.
  - Adjacent `<AICheckPanel>` driven by `quoteQuery.isFetching` ("live" pulse) and the spec's safety/balance-change rows.
  - Yellow Sepolia banner whenever `config.chainId === 11155111`.
  - Disabled execute when `insufficient || !quoteQuery.data || quoteQuery.error`.
  - On execute click: dispatch a `wishd:wish` custom event with `wish: "execute swap <summaryId>"` and `context: { prepared: { ...config, ...quoteQuery.data, approvalCall: props.approvalCall, balance: props.balance, keeperOffers: props.keeperOffers }, summaryId }`. Mirror `CompoundSummary`'s emission pattern.

- [ ] **Step 3:** Register the widget. In `apps/web/widgetRegistry.ts` add the two entries from `@plugins/uniswap/widgets`.

- [ ] **Step 4: Manual smoke (after parity primitives land)** — run `pnpm --filter web dev`, submit `swap 0.001 ETH for USDC on Base`, confirm the card paints with the seeded quote, the live pulse ticks every 15s, and editing the amount triggers a refetch within ~1s.

- [ ] **Step 5: Commit** `"feat(uniswap): SwapSummary widget with TanStack Query polling"`.

### Task 14: `SwapExecute.tsx` — ExecuteTimeline + sendCalls + SuccessCard

**Files:**
- Create: `plugins/uniswap/widgets/SwapExecute.tsx`

- [ ] **Step 1:** Implement the `Phase` state machine (`connect | switch-chain | ready | preflight | submitting | confirmed | error`), driven by `useAccount`, `useSwitchChain`, `useSendCalls`, `useCallsStatus`. Mirror `plugins/compound-v3/widgets/CompoundExecute.tsx` for the wagmi/Porto plumbing.

- [ ] **Step 2:** On click "Approve & Swap":
  1. Set phase to `preflight`. Call `queryClient.fetchQuery` with the same `queryKey`/`queryFn` as Summary (cancel-bypass).
  2. POST `/api/uniswap/swap` with `{ config, quote: fresh }`. Receive `{ swapCall, approvalStillRequired }`.
  3. Validate `swapCall` via the same `validateCall` helper (import from plugin).
  4. Build `calls = approvalStillRequired ? [props.approvalCall, swapCall] : [swapCall]`. Throw if `approvalStillRequired && !props.approvalCall` (server's fresh check disagrees with prepare — surface error, retry).
  5. Set phase to `submitting`, call `sendCalls({ calls })`.

- [ ] **Step 3:** Drive `ExecuteTimeline` items by phase. On `confirmed` (callsStatus.data.status === "success"), render `<SuccessCard>` with the spec's exact `keeperOffers` array. Keeper-offer "deploy ✦/customize" buttons render disabled with a tooltip.

- [ ] **Step 4: Manual e2e** per Task 15 below.

- [ ] **Step 5: Commit** `"feat(uniswap): SwapExecute widget — timeline + sendCalls + SuccessCard"`.

---

## Phase 10 — Env, sanity, full e2e

### Task 15: `.env.local.example` + provider sanity + manual end-to-end

**Files:**
- Modify: `.env.local.example`
- Modify (verify only): `apps/web/app/providers.tsx`

- [ ] **Step 1:** Append to `.env.local.example`:

```
UNISWAP_API_KEY=
RPC_URL_1=
RPC_URL_8453=
RPC_URL_42161=
RPC_URL_10=
RPC_URL_137=
RPC_URL_130=
RPC_URL_11155111=
```

- [ ] **Step 2:** Re-verify `apps/web/app/providers.tsx` mounts `<QueryClientProvider>` around the children. Already true (lines 23–28). No change.

- [ ] **Step 3: Base e2e (Trading API path)** — execute the spec's section "Verification → Base" (lines 590–598) verbatim. Capture: first-paint latency, refetch cadence in DevTools network, sign+broadcast tx hash, BaseScan link.

- [ ] **Step 4: Sepolia e2e (Direct V3 path)** — execute spec's section "Verification → Sepolia" (lines 600–606). Confirm yellow liquidity banner, ETH-in approval skipped, multicall calldata in wallet, Sepolia Etherscan tx.

- [ ] **Step 5: Cross-flow checks** — run spec's "Cross-flow" tests (lines 608–612): Compound deposit on Sepolia immediately after Base swap, mid-flow disconnect/reconnect, missing API key surfaces a clean 5xx.

- [ ] **Step 6: Plugin-shape sanity** — confirm Compound still works unchanged after token-registry refactor; confirm a manifest filter that excludes `uniswap` removes swap intents from the composer.

- [ ] **Step 7: Commit** `"chore(uniswap): env example + e2e checklist captured"`.

---

## Risks & open questions

1. **Trading API key provisioning.** Hackathon-time access requires registering at the Uniswap Developer Portal. Without `UNISWAP_API_KEY`, every Trading-API-chain swap returns 5xx. Sepolia direct-V3 still works as a partial demo — document this in the README before the demo.
2. **Sepolia liquidity volatility.** WETH/USDC 0.3% pool depth fluctuates; pre-demo, run `curl /api/uniswap/quote -d '{...sepolia 0.001 eth → usdc...}'` and confirm a real `amountOut`. Banner is informational; tx may still revert.
3. **L2 WETH-vs-ETH delivery on Trading API.** Trading API may already include unwrap calldata for ETH-out on Base/Arbitrum/Optimism. v0 unconditionally appends an `unwrapWETH9` call — accept the small redundant gas cost; revisit when we have measurements.
4. **Quote/swap contract mismatch.** Constants `routingPreference` and `protocols` live only in `tradingApi.ts` — single source of truth.
5. **Schema asset union.** Composer offers all five symbols on every chain; per-chain validation in `prepareSwap` rejects unknown `(symbol, chainId)`. Acceptable; error must read clearly.
6. **TanStack Query provider.** Confirmed mounted in `apps/web/app/providers.tsx`; no new provider plumbing needed.
7. **Free-text path latency.** First paint takes ~600ms (Trading API `/check_approval` + `/quote` parallel). Skeleton timeout is 5s — comfortable headroom.
8. **Direct V3 fee-tier scan.** Three parallel `simulateContract` calls per quote on Sepolia public RPC; rps cap may bite under demo load. Fallback: cache slot0 reads keyed on `(chainId, tokenIn, tokenOut, blockNumber)` if it becomes a problem.
9. **Permit2 absence.** Users with prior Permit2 approval on the Universal Router still see an extra `approve` tx because v0 uses legacy approval. Documented in widget allowance line; v0.1 work.
10. **Cross-package import direction.** `plugins/uniswap` re-exports from `apps/web/lib/tokens.ts`. If lint forbids this direction, invert: move the registry into `packages/wishd-tokens` and have both `apps/web` and the plugin import from there. Decide before Task 1.

---

### Critical Files for Implementation

- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/plugins/uniswap/prepare.ts`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/plugins/uniswap/strategies/tradingApi.ts`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/plugins/uniswap/strategies/directV3.ts`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/apps/web/server/intentDispatch.ts`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/apps/web/lib/tokens.ts`

---

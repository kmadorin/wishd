# wishd Uniswap Swap Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-01-wishd-swap-design.md` (revised after `@wishd/tokens` landed).

**Goal:** Ship `plugins/uniswap` end-to-end — composer schema, prepare orchestration, MCP tool, two widgets (`SwapSummary`, `SwapExecute`), Trading API + Direct V3 strategies, four route handlers, system-prompt branch, registry-driven asset picker. Demoable on Base (Trading API) and Sepolia (Direct V3).

**Architecture:** One plugin, two strategies selected by `chainId` at prepare time (`tradingApi.ts` for prod chains, `directV3.ts` for Sepolia / any chain populated in `DIRECT_V3_CHAINS`). Widgets are oblivious to strategy — they consume a unified `SwapPrepared`/`SwapQuote`/`SwapConfig` contract. Live freshness via TanStack Query inside the widget; server-only API key in route handlers under `apps/web/app/api/uniswap/*`. Execution uses Porto's `useSendCalls` for atomic approve+swap batching. Token metadata via `@wishd/tokens` through a small `resolveAsset` helper.

**Tech Stack:** TypeScript strict, Next.js 15 route handlers, viem v2 (`publicClient.simulateContract`, `parseUnits`, `formatUnits`, `encodeFunctionData`), wagmi v2, `@tanstack/react-query` (already mounted in `apps/web/app/providers.tsx`), Vitest, fetch mocks for Trading API tests.

**TDD pragmatics:** Pure modules (`tradingApi.ts` over mocked `fetch`, `directV3.ts` over a mocked viem client, `prepare.ts` strategy dispatch, validation helpers, `resolveAsset`, intent schema rejection of `assetIn === assetOut`) get Vitest. Next.js route handlers, widgets, and the on-chain leg are exercised by the manual e2e protocol in Task 14 against Base + Sepolia.

**Hard rules (from `swap-integration` skill):** chainIds in Trading API bodies are strings (`"1"`, `"8453"`); ETH uses placeholder `0x0000000000000000000000000000000000000000` (already exported as `NATIVE_PLACEHOLDER` from `@wishd/tokens`); `routingPreference: "CLASSIC"`, `protocols: ["V2","V3","V4"]`, `deadline: now + 300`; addresses validated against `/^0x[a-fA-F0-9]{40}$/`, calldata against `/^0x[a-fA-F0-9]+$/` (non-empty); spread quote into `/swap` body with `permitData` and `permitTransaction` stripped unconditionally (no Permit2 in v0); response validation rejects empty `data`, missing `to`, non-hex calldata; `fetchWithRetry` does exponential backoff with jitter on 429/5xx (cap 10s, total 12s) and immediate fail on other 4xx; never log the API key.

**Dependencies:** `@wishd/tokens` (already shipped; provides `getToken`, `getTokens`, `getNative`, `NATIVE_PLACEHOLDER`). UI parity primitives — `StepCard`, `WidgetCard`, `AICheckPanel`, `ExecuteTimeline`, `SuccessCard`, `ActionPill`, `SentenceBox` — already exported from `apps/web/components/primitives/`.

---

## Phase 0 — Cleanup

### Task 1: Drop legacy single-chain `apps/web/lib/tokens.ts`

The legacy file holds a single Sepolia-USDC entry and is consumed by no one (verified by grep). Replaced wholesale by `@wishd/tokens`. An untracked `apps/web/lib/tokens.test.ts` from a prior aborted session is also deleted.

**Files:**
- Delete: `apps/web/lib/tokens.ts`
- Delete: `apps/web/lib/tokens.test.ts` (untracked; may not exist on a fresh worktree — skip silently if absent)

- [ ] **Step 1: Verify no consumers**

```bash
grep -rn "from.*lib/tokens\b\|@/lib/tokens\b" apps/ plugins/ packages/ 2>/dev/null | grep -v node_modules | grep -v "tokenIcons"
```
Expected: no matches outside `apps/web/lib/tokens.ts` itself.

- [ ] **Step 2: Delete files**

```bash
rm -f apps/web/lib/tokens.ts apps/web/lib/tokens.test.ts
```

- [ ] **Step 3: Run web suite + compound suite**

```bash
pnpm --filter web exec vitest run
pnpm -r --filter ./plugins/compound-v3 exec vitest run
```
Expected: both green (no regressions).

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/lib/
git commit -m "chore(web): remove legacy single-chain tokens.ts (superseded by @wishd/tokens)"
```

---

## Phase 1 — Plugin scaffold

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

- [ ] **Step 1: Failing test for `addresses.ts`**

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
  it("DIRECT_V3_CHAINS[sepolia] has quoterV2 + swapRouter02", () => {
    const c = DIRECT_V3_CHAINS[11155111]!;
    expect(c.quoterV2).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(c.swapRouter02).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run
```
Expected: FAIL (module not found).

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "@wishd/plugin-uniswap",
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
    "./addresses": "./addresses.ts",
    "./resolveAsset": "./resolveAsset.ts",
    "./intents": "./intents.ts",
    "./types": "./types.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@wishd/plugin-sdk": "workspace:*",
    "@wishd/tokens": "workspace:*",
    "react": "^19.0.0",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json` + `vitest.config.ts`** (mirror `plugins/compound-v3`)

```json
// plugins/uniswap/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "noEmit": true,
    "jsx": "preserve"
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

```ts
// plugins/uniswap/vitest.config.ts
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
  provides: {
    intents: ["uniswap.swap"],
    widgets: ["swap-summary", "swap-execute"],
    mcps: ["uniswap"],
  },
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
}> = {
  11155111: {
    quoterV2:     "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  },
};
```

- [ ] **Step 7: Write three ABI files**

`plugins/uniswap/abis/erc20.ts` — exports `erc20Abi` with `allowance(address,address)`, `balanceOf(address)`, `approve(address,uint256)`, `decimals()`. Pull canonical signatures.

`plugins/uniswap/abis/quoterV2.ts` — exports `quoterV2Abi` with `quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)`.

`plugins/uniswap/abis/swapRouter02.ts` — exports `swapRouter02Abi` with `exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96))`, `multicall(bytes[])`, `unwrapWETH9(uint256,address)`, `refundETH()`.

Use viem's narrow `as const` ABI fragments. Reference Uniswap V3 official deployments — do not invent fields.

- [ ] **Step 8: Run tests + typecheck**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run
pnpm -r --filter ./plugins/uniswap exec tsc --noEmit
```
Expected: tests PASS, typecheck PASS.

- [ ] **Step 9: Wire into pnpm workspace**

```bash
pnpm install
```
Confirm `@wishd/plugin-uniswap` resolves (`pnpm-lock.yaml` updates).

- [ ] **Step 10: Commit**

```bash
git add plugins/uniswap pnpm-lock.yaml
git commit -m "feat(uniswap): plugin scaffold + addresses + ABIs"
```

---

## Phase 2 — Foundation: types, resolveAsset, intent schema

### Task 3: Shared swap types + `resolveAsset.ts` + `intents.ts`

**Files:**
- Create: `plugins/uniswap/types.ts`
- Create: `plugins/uniswap/resolveAsset.ts`
- Create: `plugins/uniswap/intents.ts`
- Test: `plugins/uniswap/resolveAsset.test.ts`
- Test: `plugins/uniswap/intents.test.ts`

- [ ] **Step 1: Failing test for `resolveAsset`**

```ts
// plugins/uniswap/resolveAsset.test.ts
import { describe, it, expect } from "vitest";
import { resolveAsset } from "./resolveAsset";

describe("resolveAsset", () => {
  it("ETH on mainnet → native placeholder, 18 decimals", () => {
    const r = resolveAsset(1, "ETH");
    expect(r.address).toBe("0x0000000000000000000000000000000000000000");
    expect(r.decimals).toBe(18);
    expect(r.isNative).toBe(true);
    expect(r.symbol).toBe("ETH");
  });
  it("USDC on Sepolia → override address, 6 decimals, not native", () => {
    const r = resolveAsset(11155111, "USDC");
    expect(r.address.toLowerCase()).toBe("0x1c7d4b196cb0c7b01d743fbc6116a902379c7238");
    expect(r.decimals).toBe(6);
    expect(r.isNative).toBe(false);
  });
  it("MATIC on Polygon → native (chain native is MATIC, not ETH)", () => {
    const r = resolveAsset(137, "MATIC");
    expect(r.isNative).toBe(true);
    expect(r.decimals).toBe(18);
  });
  it("WETH on Sepolia → ERC-20 (override)", () => {
    const r = resolveAsset(11155111, "WETH");
    expect(r.isNative).toBe(false);
    expect(r.decimals).toBe(18);
  });
  it("throws on unknown (chain, symbol)", () => {
    expect(() => resolveAsset(11155111, "WBTC")).toThrow(/unsupported asset/i);
    expect(() => resolveAsset(999, "ETH")).toThrow(/unsupported asset/i);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run resolveAsset.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write `types.ts`**

```ts
// plugins/uniswap/types.ts
import type { Hex } from "viem";

export type SwapConfig = {
  chainId: number;
  swapper: Hex;
  tokenIn: Hex;          // 0x000…000 for native
  tokenOut: Hex;
  assetIn: string;
  assetOut: string;
  amountIn: string;      // decimal user-facing amount
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
  expiresAt: number;     // epoch ms
  raw: unknown;
};

export type KeeperOffer = { title: string; desc: string; featured?: boolean };

export type SwapPrepared = {
  config: SwapConfig;
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  approvalCall: Call | null;
  balance: string;       // decimal
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

- [ ] **Step 4: Write `resolveAsset.ts`**

```ts
// plugins/uniswap/resolveAsset.ts
import type { Hex } from "viem";
import { getToken, getNative, NATIVE_PLACEHOLDER } from "@wishd/tokens";

export type ResolvedAsset = {
  address: Hex;
  decimals: number;
  isNative: boolean;
  symbol: string;
};

export function resolveAsset(chainId: number, symbol: string): ResolvedAsset {
  const native = getNative(chainId);
  if (native?.symbol === symbol) {
    return { address: NATIVE_PLACEHOLDER as Hex, decimals: native.decimals, isNative: true, symbol };
  }
  const t = getToken(chainId, symbol);
  if (!t) throw new Error(`unsupported asset on chain ${chainId}: ${symbol}`);
  return { address: t.address as Hex, decimals: t.decimals, isNative: false, symbol };
}
```

- [ ] **Step 5: Failing test for `intents.ts`**

```ts
// plugins/uniswap/intents.test.ts
import { describe, it, expect } from "vitest";
import { uniswapIntents, validateSwapValues, CHAIN_ID_BY_SLUG, SUPPORTED_CHAIN_SLUGS } from "./intents";

describe("uniswapIntents", () => {
  it("exposes uniswap.swap with assetIn/assetOut/amount/chain", () => {
    const s = uniswapIntents[0]!;
    expect(s.intent).toBe("uniswap.swap");
    const keys = s.fields.map((f) => f.key).sort();
    expect(keys).toEqual(["amount", "assetIn", "assetOut", "chain"].sort());
  });

  it("widget is swap-summary", () => {
    expect(uniswapIntents[0]!.widget).toBe("swap-summary");
  });

  it("rejects assetIn === assetOut", () => {
    expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "ETH", chain: "ethereum" }))
      .toThrow(/different assets/i);
  });

  it("rejects unknown chain slug", () => {
    expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "USDC", chain: "moonbeam" }))
      .toThrow(/unsupported chain/i);
  });

  it("rejects malformed amount", () => {
    expect(() => validateSwapValues({ amount: "abc", assetIn: "ETH", assetOut: "USDC", chain: "base" }))
      .toThrow(/invalid amount/i);
    expect(() => validateSwapValues({ amount: "", assetIn: "ETH", assetOut: "USDC", chain: "base" }))
      .toThrow(/invalid amount/i);
  });

  it("accepts a valid combo", () => {
    expect(() => validateSwapValues({ amount: "0.1", assetIn: "ETH", assetOut: "USDC", chain: "base" }))
      .not.toThrow();
  });

  it("CHAIN_ID_BY_SLUG covers all supported chains", () => {
    for (const slug of SUPPORTED_CHAIN_SLUGS) expect(CHAIN_ID_BY_SLUG[slug]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Write `intents.ts`**

```ts
// plugins/uniswap/intents.ts
import type { IntentSchema } from "@wishd/plugin-sdk";

export const SUPPORTED_CHAIN_SLUGS = [
  "ethereum", "base", "arbitrum", "optimism", "polygon", "unichain", "ethereum-sepolia",
] as const;

export const CHAIN_ID_BY_SLUG: Record<string, number> = {
  "ethereum":          1,
  "base":              8453,
  "arbitrum":          42161,
  "optimism":          10,
  "polygon":           137,
  "unichain":          130,
  "ethereum-sepolia":  11155111,
};

export const uniswapIntents: IntentSchema[] = [{
  intent: "uniswap.swap",
  verb: "swap",
  description: "exchange one token for another",
  fields: [
    { key: "amount",   type: "amount", required: true, default: "0.1" },
    { key: "assetIn",  type: "asset",  required: true, default: "ETH"  },
    { key: "assetOut", type: "asset",  required: true, default: "USDC" },
    { key: "chain",    type: "chain",  required: true, default: "ethereum-sepolia", options: [...SUPPORTED_CHAIN_SLUGS] },
  ],
  connectors: { assetIn: "", assetOut: "to", chain: "on" },
  widget: "swap-summary",
  slot: "flow",
}];

export function validateSwapValues(v: { amount: string; assetIn: string; assetOut: string; chain: string }): void {
  if (!CHAIN_ID_BY_SLUG[v.chain]) throw new Error(`unsupported chain: ${v.chain}`);
  if (v.assetIn === v.assetOut) throw new Error("pick two different assets");
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(v.amount)) throw new Error(`invalid amount: ${v.amount}`);
  // Asset existence on chain validated downstream by resolveAsset (registry-driven).
}
```

- [ ] **Step 7: Run tests**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run
```
Expected: all PASS (resolveAsset, intents, addresses).

- [ ] **Step 8: Commit**

```bash
git add plugins/uniswap/types.ts plugins/uniswap/resolveAsset.ts plugins/uniswap/resolveAsset.test.ts plugins/uniswap/intents.ts plugins/uniswap/intents.test.ts
git commit -m "feat(uniswap): types + resolveAsset (via @wishd/tokens) + intent schema"
```

---

## Phase 3 — Trading API strategy

### Task 4: `strategies/tradingApi.ts` + `fetchWithRetry.ts` + `validateCall.ts`

**Files:**
- Create: `plugins/uniswap/strategies/fetchWithRetry.ts`
- Create: `plugins/uniswap/strategies/validateCall.ts`
- Create: `plugins/uniswap/strategies/tradingApi.ts`
- Test: `plugins/uniswap/strategies/fetchWithRetry.test.ts`
- Test: `plugins/uniswap/strategies/tradingApi.test.ts`

Enforces every rule from the swap-integration skill: chainIds as strings, ETH placeholder, `routingPreference: "CLASSIC"`, `protocols: ["V2","V3","V4"]`, `deadline: now+300`, `permitData`/`permitTransaction` stripped from `/swap` body, response calldata validated, retries on 429/5xx with exponential backoff + jitter (cap 10s, total budget 12s).

- [ ] **Step 1: Failing test for `fetchWithRetry`**

```ts
// plugins/uniswap/strategies/fetchWithRetry.test.ts
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

- [ ] **Step 2: Failing test for `tradingApi.ts`**

```ts
// plugins/uniswap/strategies/tradingApi.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradingApiStrategy } from "./tradingApi";

const QUOTE_RES = {
  routing: "CLASSIC",
  quote: { input: { amount: "100000000", token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" }, output: { amount: "33000000000000000", token: "0x0000000000000000000000000000000000000000" }, gasFeeUSD: "0.42", priceImpact: 0.01, deadline: 9999999999 },
  permitData: { domain: {}, types: {}, values: {} },
};
const SWAP_RES = { swap: { to: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af", data: "0xdeadbeef", value: "0x0", from: "0x000000000000000000000000000000000000bEEF" } };

describe("tradingApiStrategy", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-05-01T00:00:00Z")));

  it("/check_approval — sends chainId as string, returns null when API returns null approval", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ approval: null }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const out = await s.checkApproval({ chainId: 8453, walletAddress: "0x000000000000000000000000000000000000bEEF" as any, token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as any, amountWei: "1" });
    expect(out.approvalCall).toBeNull();
    const sentBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(sentBody.chainId).toBe("8453");
  });

  it("/check_approval — short-circuits null for native (0x000…)", async () => {
    const fetchMock = vi.fn();
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const out = await s.checkApproval({ chainId: 1, walletAddress: "0x000000000000000000000000000000000000bEEF" as any, token: "0x0000000000000000000000000000000000000000" as any, amountWei: "1" });
    expect(out.approvalCall).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("/quote — pins CLASSIC + V2/V3/V4 + deadline now+300 + chainIds as strings", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(QUOTE_RES), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await s.quote({ chainId: 8453, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as any, tokenOut: "0x0000000000000000000000000000000000000000" as any, amountIn: "1000000", slippageBps: 50, assetIn: "USDC", assetOut: "ETH", strategyTag: "trading-api" });
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
    await expect(s.quote({ chainId: 1, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as any, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "trading-api" })).rejects.toThrow(/unsupported_routing/);
  });

  it("/swap — strips permitData and permitTransaction unconditionally", async () => {
    const swapMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(SWAP_RES), { status: 200 }));
    const checkMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ approval: null }), { status: 200 }));
    const fetchMock = vi.fn()
      .mockImplementationOnce(swapMock)
      .mockImplementationOnce(checkMock);
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    const quote = { amountIn: "1", amountOut: "1", amountOutMin: "1", rate: "", route: "", expiresAt: Date.now()+30000,
      raw: { ...QUOTE_RES, permitData: { x: 1 }, permitTransaction: { y: 2 } } };
    await s.swap({ config: { chainId: 1, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as any, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "trading-api" }, quote: quote as any });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.permitData).toBeUndefined();
    expect(body.permitTransaction).toBeUndefined();
  });

  it("/swap — rejects empty data hex", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ swap: { to: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af", data: "0x", value: "0x0" } }), { status: 200 }));
    const s = tradingApiStrategy({ apiKey: "k", fetchImpl: fetchMock as any });
    await expect(s.swap({ config: { chainId: 1, swapper: "0x000000000000000000000000000000000000bEEF" as any, tokenIn: "0x0000000000000000000000000000000000000000" as any, tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as any, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "trading-api" } as any, quote: { raw: {}, amountIn: "1" } as any })).rejects.toThrow(/calldata|empty/i);
  });
});
```

- [ ] **Step 3: Run — verify FAIL**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run strategies
```
Expected: FAIL (modules missing).

- [ ] **Step 4: Implement `fetchWithRetry.ts`**

```ts
// plugins/uniswap/strategies/fetchWithRetry.ts
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

async function safeText(r: Response): Promise<string> {
  try { return (await r.text()).slice(0, 200); } catch { return ""; }
}
```

- [ ] **Step 5: Implement `validateCall.ts`**

```ts
// plugins/uniswap/strategies/validateCall.ts
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
// plugins/uniswap/strategies/tradingApi.ts
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
      amount: cfg.amountIn,                            // caller passes wei string
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
      raw:          j,
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

- [ ] **Step 7: Run tests — verify PASS**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run strategies
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add plugins/uniswap/strategies
git commit -m "feat(uniswap): trading API strategy with skill-enforced rules"
```

---

## Phase 4 — Direct V3 strategy

### Task 5: `strategies/directV3.ts`

**Files:**
- Create: `plugins/uniswap/strategies/directV3.ts`
- Test: `plugins/uniswap/strategies/directV3.test.ts`

Direct V3 covers Sepolia plus any future chain populated in `DIRECT_V3_CHAINS`. Native (ETH/MATIC) is wrapped to its `wrappedSymbol` (WETH/WMATIC) for the quoter; native-in is delivered via `swapRouter02` `multicall([exactInputSingle, refundETH])` with `value = amountIn`; native-out is `multicall([exactInputSingle{recipient=ADDRESS_THIS=2}, unwrapWETH9(amountOutMin, swapper)])`. Approval (ERC-20 → router) is read separately and emitted as a `Call`.

WETH (or chain-specific wrapped-native) address resolved via `resolveAsset(chainId, getNative(chainId)!.wrappedSymbol)`. No hardcoding.

- [ ] **Step 1: Failing tests**

```ts
// plugins/uniswap/strategies/directV3.test.ts
import { describe, it, expect, vi } from "vitest";
import { directV3Strategy } from "./directV3";

const sepolia = 11155111;
const SWAPPER = "0x000000000000000000000000000000000000bEEF" as const;
const ETH = "0x0000000000000000000000000000000000000000" as const;
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

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
    const q = await s.quote({ chainId: sepolia, swapper: SWAPPER, tokenIn: ETH, tokenOut: SEPOLIA_USDC, amountIn: "0.001", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" });
    expect(q.route).toContain("0.30%");
    expect(BigInt((q.raw as any).amountOutMin)).toBe(200n * 9950n / 10000n);
  });

  it("throws no_route when all fee tiers revert", async () => {
    const client = mockClient({ outs: {}, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    await expect(s.quote({ chainId: sepolia, swapper: SWAPPER, tokenIn: ETH, tokenOut: SEPOLIA_USDC, amountIn: "1", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" })).rejects.toThrow(/no_route/);
  });

  it("checkApproval — null for ETH-in, allowance read for ERC20", async () => {
    const client = mockClient({ outs: { 3000: 1n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    expect(await s.checkApproval({ chainId: sepolia, walletAddress: SWAPPER, token: ETH, amountWei: "1" })).toEqual({ approvalCall: null });
    const r = await s.checkApproval({ chainId: sepolia, walletAddress: SWAPPER, token: SEPOLIA_USDC, amountWei: "10000000" });
    expect(r.approvalCall).not.toBeNull();
    expect(r.approvalCall!.data.startsWith("0x095ea7b3")).toBe(true);
  });

  it("swap — ETH-in returns multicall with non-zero value", async () => {
    const client = mockClient({ outs: { 3000: 200n }, allowance: 0n });
    const s = directV3Strategy({ publicClient: client });
    const cfg = { chainId: sepolia, swapper: SWAPPER, tokenIn: ETH, tokenOut: SEPOLIA_USDC, amountIn: "0.001", slippageBps: 50, assetIn: "ETH", assetOut: "USDC", strategyTag: "direct-v3" as const };
    const q = await s.quote(cfg);
    const out = await s.swap({ config: cfg, quote: q });
    expect(BigInt(out.swapCall.value)).toBeGreaterThan(0n);
    expect(out.swapCall.data.startsWith("0xac9650d8")).toBe(true); // multicall(bytes[]) selector
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run strategies/directV3
```

- [ ] **Step 3: Implement `directV3.ts`**

```ts
// plugins/uniswap/strategies/directV3.ts
import { encodeFunctionData, parseUnits, formatUnits, maxUint256, type Hex, type PublicClient } from "viem";
import { getNative } from "@wishd/tokens";
import { DIRECT_V3_CHAINS } from "../addresses";
import { quoterV2Abi } from "../abis/quoterV2";
import { swapRouter02Abi } from "../abis/swapRouter02";
import { erc20Abi } from "../abis/erc20";
import { resolveAsset } from "../resolveAsset";
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
    if (addr.toLowerCase() !== ETH) return addr;
    const n = getNative(chainId);
    if (!n) throw new SwapError("validation", `no native for chain ${chainId}`);
    return resolveAsset(chainId, n.wrappedSymbol).address;
  }

  async function quote(cfg: SwapConfig): Promise<SwapQuote> {
    const c = chain(cfg.chainId);
    const tIn  = wrapNative(cfg.tokenIn,  cfg.chainId);
    const tOut = wrapNative(cfg.tokenOut, cfg.chainId);
    const decIn  = resolveAsset(cfg.chainId, cfg.assetIn).decimals;
    const decOut = resolveAsset(cfg.chainId, cfg.assetOut).decimals;
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

- [ ] **Step 4: Run tests — verify PASS**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run strategies/directV3
```

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
// plugins/uniswap/prepare.test.ts
import { describe, it, expect, vi } from "vitest";
import { prepareSwap } from "./prepare";

const SWAPPER = "0x000000000000000000000000000000000000bEEF" as const;

const fakeQuote = (over = {}) => ({ amountIn: "0.1", amountOut: "300", amountOutMin: "298.5", rate: "1 ETH = 3000 USDC", route: "Uniswap v3", expiresAt: Date.now() + 30_000, raw: {}, ...over });

function strategyStub(out: any) {
  return { quote: vi.fn().mockResolvedValue(out.quote), checkApproval: vi.fn().mockResolvedValue({ approvalCall: out.approvalCall }), swap: vi.fn() };
}

describe("prepareSwap", () => {
  it("dispatches to tradingApi for chain 8453", async () => {
    const ta = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const dv = strategyStub({ quote: fakeQuote(), approvalCall: null });
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
    expect(out.keeperOffers.length).toBeGreaterThan(0);
  });

  it("dispatches to directV3 for sepolia + sets liquidityNote", async () => {
    const ta = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const dv = strategyStub({ quote: fakeQuote(), approvalCall: null });
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
    const ta = strategyStub({}); const dv = strategyStub({});
    await expect(prepareSwap({ values: { amount: "1", assetIn: "USDC", assetOut: "USDC", chain: "base" }, address: SWAPPER, slippageBps: 50, strategies: { tradingApi: ta as any, directV3: dv as any }, publicClient: {} as any })).rejects.toThrow(/different assets/);
  });

  it("flags insufficient when balance < amountIn", async () => {
    const ta = strategyStub({ quote: fakeQuote({ amountIn: "10" }), approvalCall: null });
    const dv = strategyStub({});
    const out = await prepareSwap({
      values: { amount: "10", assetIn: "ETH", assetOut: "USDC", chain: "base" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn().mockResolvedValue(10n ** 17n), readContract: vi.fn() } as any,
    });
    expect(out.insufficient).toBe(true);
  });

  it("uses readContract.balanceOf for ERC-20 assetIn", async () => {
    const ta = strategyStub({ quote: fakeQuote(), approvalCall: null });
    const dv = strategyStub({});
    const readContract = vi.fn().mockResolvedValue(50_000_000n); // 50 USDC
    await prepareSwap({
      values: { amount: "10", assetIn: "USDC", assetOut: "ETH", chain: "base" },
      address: SWAPPER, slippageBps: 50,
      strategies: { tradingApi: ta as any, directV3: dv as any },
      publicClient: { getBalance: vi.fn(), readContract } as any,
    });
    expect(readContract).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

- [ ] **Step 3: Implement `prepare.ts`**

```ts
// plugins/uniswap/prepare.ts
import type { Hex, PublicClient } from "viem";
import { parseUnits, formatUnits } from "viem";
import { TRADING_API_CHAINS } from "./addresses";
import { CHAIN_ID_BY_SLUG, validateSwapValues } from "./intents";
import { resolveAsset } from "./resolveAsset";
import { erc20Abi } from "./abis/erc20";
import type { SwapConfig, SwapPrepared, KeeperOffer, SwapQuote, Call } from "./types";

const STATIC_KEEPER_OFFERS: KeeperOffer[] = [
  { title: "Earn on idle tokens",     desc: "Auto-deposit received tokens into best APY protocol.", featured: true },
  { title: "Range alert",             desc: "Notify if price moves ±15% — chance to swap back at better rate." },
  { title: "DCA back",                desc: "Drip tokens back at intervals until target allocation reached." },
  { title: "Liquidation protection",  desc: "Auto-repay borrow if health factor drops below 1.3." },
];

export type StrategyApi = {
  quote: (cfg: SwapConfig) => Promise<SwapQuote>;
  checkApproval: (i: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }) => Promise<{ approvalCall: Call | null }>;
  swap: (i: { config: SwapConfig; quote: SwapQuote }) => Promise<{ swapCall: Call; approvalStillRequired: boolean }>;
};

export type Strategies = { tradingApi: StrategyApi; directV3: StrategyApi };

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
  const aIn  = resolveAsset(chainId, input.values.assetIn);
  const aOut = resolveAsset(chainId, input.values.assetOut);

  const strategyTag: SwapConfig["strategyTag"] = TRADING_API_CHAINS.has(chainId) ? "trading-api" : "direct-v3";
  const strategy = strategyTag === "trading-api" ? input.strategies.tradingApi : input.strategies.directV3;

  const amountInWei = parseUnits(input.values.amount, aIn.decimals);

  const config: SwapConfig = {
    chainId, swapper: input.address,
    tokenIn:  aIn.address,
    tokenOut: aOut.address,
    assetIn:  input.values.assetIn,
    assetOut: input.values.assetOut,
    amountIn: strategyTag === "trading-api" ? amountInWei.toString() : input.values.amount,
    slippageBps: input.slippageBps,
    strategyTag,
  };

  const balanceP = aIn.isNative
    ? input.publicClient.getBalance({ address: input.address })
    : input.publicClient.readContract({ address: aIn.address, abi: erc20Abi, functionName: "balanceOf", args: [input.address] }) as Promise<bigint>;

  const [balanceWei, quote, approval] = await Promise.all([
    balanceP,
    strategy.quote(config),
    strategy.checkApproval({ chainId, walletAddress: input.address, token: aIn.address, amountWei: amountInWei.toString() }),
  ]);

  const balance = formatUnits(balanceWei as bigint, aIn.decimals);
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

- [ ] **Step 4: Run tests — verify PASS**

```bash
pnpm -r --filter ./plugins/uniswap exec vitest run prepare
```

- [ ] **Step 5: Commit**

```bash
git add plugins/uniswap/prepare.ts plugins/uniswap/prepare.test.ts
git commit -m "feat(uniswap): prepare orchestrator dispatching strategy by chainId"
```

---

## Phase 6 — Server endpoints

### Task 7: `uniswapClients.ts` factory + `intentDispatch.ts` extension

**Files:**
- Create: `apps/web/server/uniswapClients.ts`
- Modify: `apps/web/server/intentDispatch.ts`
- Test: extend `apps/web/server/intentDispatch.test.ts`

- [ ] **Step 1: Write `uniswapClients.ts`**

```ts
// apps/web/server/uniswapClients.ts
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, sepolia } from "viem/chains";
import { tradingApiStrategy } from "@plugins/uniswap/strategies/tradingApi";
import { directV3Strategy }   from "@plugins/uniswap/strategies/directV3";

const UNICHAIN = {
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.unichain.org"] } },
} as const;

const CHAIN_BY_ID: Record<number, any> = {
  1: mainnet, 8453: base, 42161: arbitrum, 10: optimism, 137: polygon, 11155111: sepolia, 130: UNICHAIN,
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

- [ ] **Step 2: Extend `intentDispatch.ts`**

Modify the existing dispatcher (`apps/web/server/intentDispatch.ts`) to handle `uniswap.swap`. Add at the top of the existing dispatcher branches:

```ts
// imports
import { prepareSwap } from "@plugins/uniswap/prepare";
import { CHAIN_ID_BY_SLUG } from "@plugins/uniswap/intents";
import { uniswapStrategies, publicClientFor } from "./uniswapClients";

// inside dispatchIntent, BEFORE the existing compound branches:
if (intent === "uniswap.swap") {
  const chainSlug = String(input.body.chain ?? "");
  const chainId = CHAIN_ID_BY_SLUG[chainSlug];
  if (!chainId) throw new Error(`unsupported chain: ${chainSlug}`);
  const slippageBps = typeof input.body.slippageBps === "number" ? input.body.slippageBps : 50;
  const prepared = await prepareSwap({
    values: {
      amount:   requireAmount(input.body),
      assetIn:  String(input.body.assetIn),
      assetOut: String(input.body.assetOut),
      chain:    chainSlug,
    },
    address:  requireAddress(input.body),
    slippageBps,
    strategies:   uniswapStrategies(chainId),
    publicClient: publicClientFor(chainId),
  });
  return {
    prepared: prepared as any,
    widget: {
      id: newWidgetId(),
      type: schema.widget,
      slot: "flow",
      props: {
        config: prepared.config,
        initialQuote: prepared.initialQuote,
        initialQuoteAt: prepared.initialQuoteAt,
        approvalCall: prepared.approvalCall,
        balance: prepared.balance,
        insufficient: prepared.insufficient,
        liquidityNote: prepared.liquidityNote,
        keeperOffers: prepared.keeperOffers,
        summaryId: newWidgetId(),
      },
    },
  };
}
```

The existing dispatcher signature accepts a generic `publicClient` — for the swap branch we ignore the passed-in `publicClient` and build one per-chain via `publicClientFor`. (Alternatively, refactor the dispatcher to receive `chainId` and build the client itself; do whichever requires the smallest diff.)

- [ ] **Step 3: Add a dispatch test**

Extend `apps/web/server/intentDispatch.test.ts` with a swap case using `vi.mock("@plugins/uniswap/prepare", ...)` and `vi.mock("./uniswapClients", ...)` to inject a stub `prepareSwap` that returns a fixed `SwapPrepared`. Assert the dispatcher returns a widget with `type: "swap-summary"` and props mirror the stub.

```ts
import { vi } from "vitest";
vi.mock("./uniswapClients", () => ({
  uniswapStrategies: () => ({ tradingApi: {}, directV3: {} }),
  publicClientFor: () => ({} as any),
}));
vi.mock("@plugins/uniswap/prepare", () => ({
  prepareSwap: vi.fn().mockResolvedValue({
    config: { chainId: 8453, swapper: "0x000000000000000000000000000000000000bEEF", tokenIn: "0x0000000000000000000000000000000000000000", tokenOut: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", assetIn: "ETH", assetOut: "USDC", amountIn: "100000000000000", slippageBps: 50, strategyTag: "trading-api" },
    initialQuote: { amountIn: "100000000000000", amountOut: "0", amountOutMin: "0", rate: "", route: "", expiresAt: Date.now()+30000, raw: {} },
    initialQuoteAt: Date.now(),
    approvalCall: null,
    balance: "1.0",
    insufficient: false,
    keeperOffers: [],
  }),
}));

it("dispatches uniswap.swap → swap-summary widget", async () => {
  const out = await dispatchIntent("uniswap.swap", {
    body: { amount: "0.0001", assetIn: "ETH", assetOut: "USDC", chain: "base", address: "0x000000000000000000000000000000000000bEEF" },
    publicClient: {} as any,
  });
  expect(out.widget.type).toBe("swap-summary");
});
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
pnpm --filter web exec vitest run server/intentDispatch.test.ts
```

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
import { uniswapStrategies } from "@/server/uniswapClients";
import { resolveAsset } from "@plugins/uniswap/resolveAsset";
import { parseUnits } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      chainId: number;
      tokenIn: `0x${string}`;
      tokenOut: `0x${string}`;
      amountIn: string;
      swapper: `0x${string}`;
      slippageBps: number;
      assetIn: string;
      assetOut: string;
    };
    const tag = (body.chainId === 11155111 ? "direct-v3" : "trading-api") as const;
    const strat = uniswapStrategies(body.chainId);
    const decIn = resolveAsset(body.chainId, body.assetIn).decimals;
    const cfg = {
      ...body,
      amountIn: tag === "trading-api" ? parseUnits(body.amountIn, decIn).toString() : body.amountIn,
      strategyTag: tag,
    };
    const quote = await (tag === "trading-api" ? strat.tradingApi.quote(cfg as any) : strat.directV3.quote(cfg as any));
    return NextResponse.json(quote);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /no_route|insufficient/.test(msg) ? 422
                : /unsupported|invalid|required/.test(msg) ? 400
                : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

- [ ] **Step 1: No unit test** — strategies are unit-tested. Manual exercise via Task 14 e2e.
- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/uniswap/quote
git commit -m "feat(api): /api/uniswap/quote"
```

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
    const status = /calldata|invalid|unsupported_routing/.test(msg) ? 422 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

- [ ] **Commit**

```bash
git add apps/web/app/api/uniswap/swap
git commit -m "feat(api): /api/uniswap/swap with fresh-approval check"
```

### Task 10: `/api/uniswap/balance` route

**Files:**
- Create: `apps/web/app/api/uniswap/balance/route.ts`

```ts
import { NextResponse } from "next/server";
import { publicClientFor } from "@/server/uniswapClients";
import { resolveAsset } from "@plugins/uniswap/resolveAsset";
import { erc20Abi } from "@plugins/uniswap/abis/erc20";
import { formatUnits } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { chainId, token, address, symbol } = await req.json() as { chainId: number; token: `0x${string}`; address: `0x${string}`; symbol: string };
    const pc = publicClientFor(chainId);
    const a = resolveAsset(chainId, symbol);
    const wei = a.isNative
      ? await pc.getBalance({ address })
      : await pc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }) as bigint;
    return NextResponse.json({ balance: formatUnits(wei, a.decimals) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
```

- [ ] **Commit**

```bash
git add apps/web/app/api/uniswap/balance
git commit -m "feat(api): /api/uniswap/balance"
```

---

## Phase 7 — MCP tool + plugin index + registry wiring

### Task 11: MCP `prepare_swap` + plugin `index.ts` + register in pluginLoader & intentRegistry

**Files:**
- Create: `plugins/uniswap/mcp/server.ts`
- Create: `plugins/uniswap/index.ts`
- Modify: `apps/web/server/pluginLoader.ts`
- Modify: `apps/web/lib/intentRegistry.client.ts`
- Modify: `apps/web/server/intentRegistry.ts` (verify auto-includes via pluginLoader; usually no change)
- Test: extend `apps/web/server/intentRegistry.test.ts`

- [ ] **Step 1: Write `plugins/uniswap/mcp/server.ts`**

```ts
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { PluginCtx } from "@wishd/plugin-sdk";
import { prepareSwap } from "../prepare";
import { uniswapStrategies, publicClientFor } from "../../../apps/web/server/uniswapClients";
import { CHAIN_ID_BY_SLUG } from "../intents";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

const inputSchema = {
  amount:      z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/).describe("Decimal amount, e.g. '0.1'"),
  assetIn:     z.string().describe("Source token symbol (e.g. ETH, USDC)"),
  assetOut:    z.string().describe("Destination token symbol"),
  chain:       z.string().describe("Chain slug (ethereum-sepolia, base, ...)"),
  user:        z.string().regex(ADDR).describe("Swapper EOA / smart-account address"),
  chainId:     z.coerce.number().int().describe("Chain id (e.g. 8453 for Base)"),
  slippageBps: z.number().optional().default(50),
};

export function createUniswapMcp(_ctx: PluginCtx) {
  return createSdkMcpServer({
    name: "uniswap",
    version: "0.0.0",
    tools: [
      tool(
        "prepare_swap",
        "Prepare a Uniswap swap. Returns SwapPrepared (config, initialQuote, approvalCall, balance, insufficient, keeperOffers).",
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

- [ ] **Step 2: Write `plugins/uniswap/index.ts`**

```ts
import { definePlugin } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { createUniswapMcp } from "./mcp/server";
import { uniswapIntents } from "./intents";
import { SwapSummary, SwapExecute } from "./widgets";

export const uniswap = definePlugin({
  manifest,
  mcp(ctx) { return { server: createUniswapMcp(ctx) as any, serverName: "uniswap" }; },
  widgets: { "swap-summary": SwapSummary, "swap-execute": SwapExecute },
  intents: uniswapIntents,
});

export { SwapSummary, SwapExecute, manifest, uniswapIntents };
```

(`./widgets` won't exist yet — that's fine, the import will fail until Task 12/13. Order: skip the widget imports for now and add them when widgets land. Alternative: ship a stub `widgets/index.ts` exporting `null as unknown as React.FC<any>` placeholders; replace in Task 12.)

To keep this task green now, ship a stub `plugins/uniswap/widgets/index.ts`:

```ts
// plugins/uniswap/widgets/index.ts (stub — replaced in Task 12)
import type { ComponentType } from "react";
export const SwapSummary: ComponentType<any> = () => null;
export const SwapExecute: ComponentType<any> = () => null;
```

- [ ] **Step 3: Register in `apps/web/server/pluginLoader.ts`**

```ts
import { compoundV3 } from "@wishd/plugin-compound-v3";
import { uniswap }    from "@wishd/plugin-uniswap";
// ...
const plugins: Plugin[] = [compoundV3, uniswap];
```

- [ ] **Step 4: Register in `apps/web/lib/intentRegistry.client.ts`**

```ts
import type { IntentSchema } from "@wishd/plugin-sdk";
import { compoundIntents }  from "@plugins/compound-v3/intents";
import { uniswapIntents }   from "@plugins/uniswap/intents";

export const CLIENT_INTENT_SCHEMAS: IntentSchema[] = [...compoundIntents, ...uniswapIntents];
```

- [ ] **Step 5: Extend `apps/web/server/intentRegistry.test.ts`**

Add an assertion that `await getIntentSchema("uniswap.swap")` returns a schema with `widget: "swap-summary"`.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter web exec vitest run
pnpm -r --filter ./plugins/uniswap exec vitest run
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/uniswap/mcp plugins/uniswap/index.ts plugins/uniswap/widgets/index.ts apps/web/server/pluginLoader.ts apps/web/lib/intentRegistry.client.ts apps/web/server/intentRegistry.test.ts
git commit -m "feat(uniswap): MCP tool + plugin index + register in loader/registries"
```

---

## Phase 8 — Composer integration

### Task 12: `AssetPicker` + `guessFromText` swap branch + system prompt

**Files:**
- Create: `apps/web/components/wish/AssetPicker.tsx`
- Modify: `apps/web/components/wish/WishComposer.tsx` (`guessFromText` near L242, plus structured composer asset fields render `AssetPicker`)
- Modify: `apps/web/server/systemPrompt.ts`
- Test: extend `apps/web/server/systemPrompt.test.ts`

- [ ] **Step 1: Implement `AssetPicker.tsx`**

Searchable token picker. Receives `chainId`, `value`, `onChange`. Options derived from registry:

```tsx
"use client";
import { useMemo, useState } from "react";
import { getNative, getTokens } from "@wishd/tokens";
import { tokenIconClass, tokenSymbol } from "@/lib/tokenIcons";

type Option = { symbol: string; name: string };

function options(chainId: number): Option[] {
  const out: Option[] = [];
  const n = getNative(chainId);
  if (n) out.push({ symbol: n.symbol, name: `${n.symbol} (native)` });
  for (const t of getTokens(chainId)) out.push({ symbol: t.symbol, name: t.name });
  return out;
}

export function AssetPicker({ chainId, value, onChange, ariaLabel }: {
  chainId: number; value: string; onChange: (next: string) => void; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = useMemo(() => options(chainId), [chainId]);
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return all;
    return all.filter((o) => o.symbol.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle));
  }, [all, q]);

  return (
    <div className="asset-picker">
      <button type="button" aria-label={ariaLabel ?? "pick token"} onClick={() => setOpen((v) => !v)}>
        <span className={tokenIconClass(value)}>{tokenSymbol(value)}</span>
        <span>{value || "select token"}</span>
      </button>
      {open && (
        <div className="asset-picker-pop" role="listbox">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" />
          <ul>
            {filtered.map((o) => (
              <li key={o.symbol}>
                <button type="button" onClick={() => { onChange(o.symbol); setOpen(false); setQ(""); }}>
                  <span className={tokenIconClass(o.symbol)}>{tokenSymbol(o.symbol)}</span>
                  <span>{o.symbol}</span>
                  <span className="muted">{o.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="muted">no tokens match — pick a different chain or add an override to <code>@wishd/tokens</code></li>}
          </ul>
        </div>
      )}
    </div>
  );
}
```

(Style classes are placeholders — match the existing wish composer's CSS; minimum viable styling is acceptable for v0.)

- [ ] **Step 2: Update `guessFromText` in `WishComposer.tsx`**

Open `apps/web/components/wish/WishComposer.tsx`, find `guessFromText` (~L242), replace with:

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

In the structured composer's render path, where intent fields of `type: "asset"` are rendered, swap the existing dropdown for `<AssetPicker chainId={chainIdFromCurrentChainSlug} value={fields.asset} onChange={...} />`. Keep the existing fallback for intents whose schemas declare hardcoded `options` (Compound's USDC-only) so non-swap intents still use the native dropdown.

- [ ] **Step 3: Append swap branches to `systemPrompt.ts` `CANONICAL_FLOWS`**

Open `apps/web/server/systemPrompt.ts`, append to the `CANONICAL_FLOWS` block:

```
E. Swap intent — wishes like "swap N <assetIn> for <assetOut> on <chain>":
  1. Call mcp__uniswap__prepare_swap({ amount, assetIn, assetOut, chain, user, chainId, slippageBps }).
  2. Call mcp__widget__render({ type: "swap-summary", props: <prepared> }).
  3. Reply with one short narration line.

F. Follow-up "execute swap <summaryId>" — context.prepared present:
  1. Call mcp__widget__render({ type: "swap-execute", props: { ...context.prepared } }).
  2. Reply with one short narration line.
```

Add `mcp__uniswap__prepare_swap` to the `Tools available:` list.

- [ ] **Step 4: Update `systemPrompt.test.ts`**

Extend with an assertion that the prompt text includes `"E. Swap intent"` when `uniswap.swap` is in the registered intents, AND includes `"mcp__uniswap__prepare_swap"` in the tools row.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter web exec vitest run
```
Expected: PASS (existing 29 + new swap assertions).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/wish/AssetPicker.tsx apps/web/components/wish/WishComposer.tsx apps/web/server/systemPrompt.ts apps/web/server/systemPrompt.test.ts
git commit -m "feat(composer): registry-driven AssetPicker + swap regex + system-prompt swap flow"
```

---

## Phase 9 — Widgets

### Task 13: `SwapSummary.tsx` — TanStack Query refresh + AICheckPanel + flip

**Files:**
- Create: `plugins/uniswap/widgets/SwapSummary.tsx`
- Replace: `plugins/uniswap/widgets/index.ts` (drop the stub)
- Modify: `apps/web/widgetRegistry.ts` (mount `swap-summary`)

- [ ] **Step 1: Confirm `QueryClientProvider`**

Read `apps/web/app/providers.tsx`. Confirm wagmi v2 mounts a `QueryClientProvider` around children. (Already verified during plan authoring; no change.)

- [ ] **Step 2: Implement `SwapSummary.tsx`**

Drives:
- Local state for editable `amountIn`, `assetIn`, `assetOut`, `slippageBps`. `useDebounce(amountIn, 300)`.
- `useQuery({ queryKey: ["uniswap.quote", chainId, tokenIn, tokenOut, debouncedAmount, swapper], queryFn: ({signal}) => fetch("/api/uniswap/quote", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({...}), signal }).then(r => { if (!r.ok) throw new Error(...); return r.json(); }), initialData: props.initialQuote, initialDataUpdatedAt: props.initialQuoteAt, refetchInterval: 15_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, staleTime: 10_000, placeholderData: keepPreviousData, retry: (n, err) => n < 2 && !is4xx(err) })`.
- Render `<StepCard step="STEP 02" title="your swap, materialized" sub="tweak amounts here. AI re-checks live.">` containing `<WidgetCard>`:
  - `<PaySection>` with editable amount input, `<AssetPicker chainId={config.chainId} value={assetIn} onChange={...}/>`, balance line.
  - `<SwapDir>` flip — swaps assetIn/assetOut in local state (changes queryKey → fresh quote).
  - `<ReceiveSection>` with `quote.amountOut`, `<AssetPicker .../>`.
  - `<Stats>` row: rate, min received, route, network fee.
  - CTA button "execute →" — disabled when `insufficient || !quoteQuery.data || quoteQuery.error`.
- Adjacent `<AICheckPanel status={quoteQuery.isFetching ? "live" : "stale"} balanceChanges={[...]} safety={[...]}/>`.
- Yellow Sepolia banner when `config.chainId === 11155111` (use `liquidityNote` prop).
- On execute click: emit `wishd:wish` custom event with `wish: "execute swap <summaryId>"` and `context: { prepared: { ...config, ...quoteQuery.data, approvalCall: props.approvalCall, balance: props.balance, keeperOffers: props.keeperOffers }, summaryId }`. Mirror `CompoundSummary`'s emission pattern.

The full component is ~250 lines of straightforward React. Reference `plugins/compound-v3/widgets/CompoundSummary.tsx` for event-emission idioms; the parity primitives are imported from `@/components/primitives/...`.

- [ ] **Step 3: Replace `plugins/uniswap/widgets/index.ts`**

```ts
export { SwapSummary } from "./SwapSummary";
export { SwapExecute } from "./SwapExecute"; // shipped in Task 13's follow-up
```

(For this task, `SwapExecute` is still the stub from Task 11 — keep both exports stable.)

- [ ] **Step 4: Register widget in `apps/web/widgetRegistry.ts`**

Mirror Compound's pattern: import `SwapSummary` and `SwapExecute` from `@plugins/uniswap/widgets`, add entries `"swap-summary": SwapSummary` and `"swap-execute": SwapExecute`.

- [ ] **Step 5: Manual smoke**

```bash
pnpm --filter web dev
```
Submit wish "swap 0.001 ETH for USDC on Base" via composer. Verify the card paints with the seeded quote, the live pulse ticks every 15s, and editing the amount triggers a refetch within ~1s.

(If `UNISWAP_API_KEY` not yet set, expect 500 — that's Task 14's territory.)

- [ ] **Step 6: Commit**

```bash
git add plugins/uniswap/widgets/SwapSummary.tsx plugins/uniswap/widgets/index.ts apps/web/widgetRegistry.ts
git commit -m "feat(uniswap): SwapSummary widget with TanStack Query polling"
```

### Task 14: `SwapExecute.tsx` — ExecuteTimeline + sendCalls + SuccessCard

**Files:**
- Create: `plugins/uniswap/widgets/SwapExecute.tsx`

- [ ] **Step 1: Implement `Phase` state machine**

States: `connect | switch-chain | ready | preflight | submitting | confirmed | error`. Driven by `useAccount`, `useSwitchChain`, `useSendCalls`, `useCallsStatus`. Mirror `plugins/compound-v3/widgets/CompoundExecute.tsx` for wagmi/Porto plumbing.

- [ ] **Step 2: On click "Approve & Swap"**

```
1. Set phase = "preflight". Call queryClient.fetchQuery with the same queryKey/queryFn as Summary (cancel-bypass).
2. POST /api/uniswap/swap with { config, quote: fresh }. Receive { swapCall, approvalStillRequired }.
3. validateCall(swapCall, "swapCall") — same helper as the strategies.
4. Build calls = approvalStillRequired ? [props.approvalCall, swapCall] : [swapCall].
   Throw if approvalStillRequired && !props.approvalCall.
5. Set phase = "submitting", call sendCalls({ calls }).
```

- [ ] **Step 3: Drive `ExecuteTimeline` items by phase**

Items:
1. Pre-flight quote (active during preflight)
2. Approve <assetIn> (skipped when no approval needed)
3. Sign swap (active during submitting once sendCalls posts)
4. Broadcasting (active while callsStatus.isLoading)
5. Confirmed (done when callsStatus.data.status === "success")

On `confirmed`, render `<SuccessCard title="swap complete ✦" sub={...} summary={[...]} keeperOffers={props.keeperOffers} primaryAction={{ label: "make another wish", onClick: onWishReset }} secondaryAction={{ label: "view portfolio", onClick: onPortfolioToast }} />`. Keeper-offer "deploy ✦/customize" buttons disabled with tooltip.

- [ ] **Step 4: Manual e2e**

Deferred to Task 15.

- [ ] **Step 5: Commit**

```bash
git add plugins/uniswap/widgets/SwapExecute.tsx
git commit -m "feat(uniswap): SwapExecute widget — timeline + sendCalls + SuccessCard"
```

---

## Phase 10 — Env, manual e2e

### Task 15: `.env.local.example` + manual e2e + provider sanity

**Files:**
- Modify: `.env.local.example`
- Verify only: `apps/web/app/providers.tsx`

- [ ] **Step 1: Append to `.env.local.example`**

```
# Uniswap Trading API key (required for Mainnet/Base/Arb/Op/Polygon/Unichain swaps)
UNISWAP_API_KEY=

# Optional per-chain RPC overrides (defaults to viem chain.rpcUrls.default)
RPC_URL_1=
RPC_URL_8453=
RPC_URL_42161=
RPC_URL_10=
RPC_URL_137=
RPC_URL_130=
RPC_URL_11155111=
```

- [ ] **Step 2: Verify `providers.tsx`**

Read `apps/web/app/providers.tsx`; confirm `<QueryClientProvider client={queryClient}>` wraps `<WagmiProvider>` children. No edit if already correct.

- [ ] **Step 3: Base e2e (Trading API path)**

```
1. Set UNISWAP_API_KEY in .env.local.
2. pnpm --filter web dev.
3. Connect wallet on Base, fund with ~0.001 ETH and a few USDC.
4. Compose: "swap 0.001 ETH for USDC on Base". Submit.
5. Observe Step 02 painted within ~1s with quote.amountOut, AICheckPanel "live" pulse.
6. Edit amount to 0.002 → refetch within ~1s, no skeleton flash.
7. Click execute → wallet pops with calldata. Sign.
8. Timeline progresses → SuccessCard with BaseScan tx link.
```

Capture: first-paint latency, refetch cadence in DevTools network, tx hash.

- [ ] **Step 4: Sepolia e2e (Direct V3 path)**

```
1. Switch wallet to Sepolia, fund with ~0.001 ETH.
2. Compose: "swap 0.001 ETH for USDC on Ethereum Sepolia". Submit.
3. Yellow liquidity banner visible. Quote shows likely high price impact.
4. Click execute → ETH-in approval skipped, multicall calldata in wallet. Sign.
5. SuccessCard with Sepolia Etherscan link (or error timeline if pool drained between quote/broadcast — retry).
```

- [ ] **Step 5: Cross-flow checks**

```
- After Base swap, run a Compound deposit on Sepolia immediately. Confirm no state leaks.
- Disconnect mid-swap → execute timeline shows phase=connect, button label flips. Reconnect → resumes.
- Remove UNISWAP_API_KEY temporarily → /api/prepare/uniswap.swap returns 500 with clean error in skeleton.
```

- [ ] **Step 6: Plugin-shape sanity**

```
- Compound plugin still works unchanged after token-registry changes (already verified post-Task 1).
- Manifest filter excluding uniswap removes swap intents from composer (confirm via existing filter mechanism).
```

- [ ] **Step 7: Commit**

```bash
git add .env.local.example
git commit -m "chore(uniswap): env example + e2e checklist captured"
```

---

## Risks & open questions

1. **Trading API key provisioning.** Without `UNISWAP_API_KEY`, every Trading-API-chain swap returns 5xx. Sepolia direct-V3 still works as a partial demo — document in README before demo.
2. **Sepolia liquidity volatility.** WETH/USDC 0.3% pool depth fluctuates. Pre-demo, run `curl /api/uniswap/quote -d '...sepolia 0.001 eth → usdc...'` and confirm a real `amountOut`. Banner is informational; tx may still revert.
3. **L2 WETH-vs-ETH delivery on Trading API.** Trading API may already include unwrap calldata for ETH-out on Base/Arb/OP. v0 does not append a redundant unwrap (Trading API path returns its own calldata as-is). Revisit if measurements show issues.
4. **Quote/swap contract mismatch.** Constants `routingPreference` and `protocols` live only in `tradingApi.ts` — single source of truth.
5. **Per-chain asset coverage gaps.** `@wishd/tokens` upstream is sparse on Base (no USDT/WBTC) and native-only on Unichain. Picker reflects reality. Add overrides if a demo demands.
6. **TanStack Query provider.** Confirmed mounted in `apps/web/app/providers.tsx`; no new provider plumbing needed.
7. **Free-text path latency.** First paint takes ~600ms (Trading API `/check_approval` + `/quote` parallel). Skeleton timeout is 5s — comfortable headroom.
8. **Direct V3 fee-tier scan.** Three parallel `simulateContract` calls per quote on Sepolia public RPC; rps cap may bite under demo load. Fallback: cache slot0 reads keyed on `(chainId, tokenIn, tokenOut, blockNumber)` if it becomes a problem.
9. **Permit2 absence.** Users with prior Permit2 approval on the Universal Router still see an extra `approve` tx because v0 uses legacy approval. Documented in widget allowance line; v0.1 work.
10. **Stub widget dependency.** `plugins/uniswap/index.ts` imports widgets before they exist. Task 11 ships stubs; Tasks 13–14 replace them. Don't ship `index.ts` referencing missing files.

---

### Critical Files for Implementation

- `plugins/uniswap/resolveAsset.ts`
- `plugins/uniswap/prepare.ts`
- `plugins/uniswap/strategies/tradingApi.ts`
- `plugins/uniswap/strategies/directV3.ts`
- `apps/web/server/intentDispatch.ts`
- `apps/web/server/uniswapClients.ts`
- `apps/web/components/wish/AssetPicker.tsx`
- `apps/web/server/systemPrompt.ts`

---

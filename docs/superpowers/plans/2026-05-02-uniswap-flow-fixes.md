# Uniswap flow fixes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land 11 P0 swap-flow bug fixes in a single PR: step header dedup, AssetPicker portal popover with balances + kb nav, step01 flip button, same-token auto-flip, widget flip polish, quote decimals fix.

**Architecture:** Approach A from spec — targeted patches in place. New `applyAssetChange` helper in `plugins/uniswap/intents.ts`, new `/api/wallet/balances` endpoint, new `useBalances` SWR hook, rewritten `AssetPicker` component, `tradingApi` decimals fix, plus surgical edits to `StepStack`, `WishComposer`, `SwapSummary`, `WidgetCard`.

**Tech Stack:** Next.js 15 (App Router), React 19, wagmi/viem, SWR, vitest + @testing-library/react, Tailwind. Single-app monorepo with `apps/web`, `plugins/uniswap`, `packages/wishd-tokens`.

**Spec:** `docs/superpowers/specs/2026-05-02-uniswap-flow-fixes-design.md`

**Branch / worktree:** run from `main` (already on it) or create a worktree `uniswap-flow-fixes`.

---

## Conventions for this plan

- Run tests with `pnpm -w test` for the whole monorepo, or `pnpm --filter <pkg> test` for a single package. App tests live under `apps/web/test/` and plugin tests live next to source as `*.test.ts`.
- The Next.js dev server runs on `https://localhost:3000/` with self-signed certs — do not start it from the agent; user keeps it running.
- Commit after every task with `git add <files> && git commit -m "<msg>"`. Never `--no-verify`. Hooks must pass.
- Caveman mode is for chat only; code/commits/spec/plan are written normally.

---

## Section A — Step header dedup (bug #1)

### Task 1: Add swap entries to STEP_LABELS and drop wrappers

**Files:**
- Modify: `apps/web/components/workspace/StepStack.tsx`
- Modify: `plugins/uniswap/widgets/SwapSummary.tsx`
- Modify: `plugins/uniswap/widgets/SwapExecute.tsx`

- [ ] **Step 1: Inspect SwapExecute to see if it wraps in StepCard**

Run: `grep -n "StepCard" plugins/uniswap/widgets/SwapExecute.tsx`

If matches found, this task removes its wrapper too. If no matches, only edit `SwapSummary.tsx` and `StepStack.tsx`.

- [ ] **Step 2: Edit `apps/web/components/workspace/StepStack.tsx`**

Replace the `STEP_LABELS` const (currently lines 8–16) with:

```ts
const STEP_LABELS: Record<string, { step: string; title: string; sub?: string }> = {
  "compound-summary": { step: "STEP 02", title: "your supply, materialized", sub: "review and execute" },
  "compound-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" },
  "compound-withdraw-summary": {
    step: "STEP 02",
    title: "your withdraw, materialized",
    sub: "review and execute",
  },
  "swap-summary": {
    step: "STEP 02",
    title: "your swap, materialized",
    sub: "tweak amounts here. AI re-checks live.",
  },
  "swap-execute": {
    step: "STEP 03",
    title: "execute",
    sub: "native · don't close the tab",
  },
};
```

- [ ] **Step 3: Edit `plugins/uniswap/widgets/SwapSummary.tsx` — drop outer `StepCard`**

Locate the outer `<StepCard …>` opened around line 146 and the matching `</StepCard>` around line 331.

Replace:

```tsx
return (
  <StepCard
    step="STEP 02"
    title="your swap, materialized"
    sub="tweak amounts here. AI re-checks live."
  >
    <div className="flex flex-col gap-3">
      ...body...
    </div>
  </StepCard>
);
```

With:

```tsx
return (
  <div className="flex flex-col gap-3">
    ...body...
  </div>
);
```

Then delete the now-unused `import { StepCard } from "../../../apps/web/components/primitives/StepCard";` line at the top.

- [ ] **Step 4: If SwapExecute wraps in StepCard, drop that wrapper too**

Apply the same transformation as Step 3 to `plugins/uniswap/widgets/SwapExecute.tsx`. Skip if Step 1 found no matches.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @wishd/plugin-uniswap typecheck` (or `pnpm -w typecheck` if no per-pkg script).
Expected: PASS, no errors.

- [ ] **Step 6: Manual smoke**

User confirms in browser:
1. Pick swap intent → submit → step02 shows ONE header reading `STEP 02 · your swap, materialized`. No `STEP / swap-summary` row above.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/workspace/StepStack.tsx plugins/uniswap/widgets/SwapSummary.tsx plugins/uniswap/widgets/SwapExecute.tsx
git commit -m "fix(uniswap-widgets): drop inner StepCard, register swap-* in STEP_LABELS

Outer StepStack already wraps every widget in a StepCard; SwapSummary/Execute
double-wrapped, producing a stray 'STEP swap-summary' header above the real
'STEP 02' header. Mirrors the compound-v3 widget pattern."
```

---

## Section B — Same-token auto-flip helper (bug #5)

### Task 2: Export `applyAssetChange` from `plugins/uniswap/intents.ts` (TDD)

**Files:**
- Modify: `plugins/uniswap/intents.ts`
- Modify: `plugins/uniswap/intents.test.ts`

- [ ] **Step 1: Write failing tests in `plugins/uniswap/intents.test.ts`**

Append to the file:

```ts
import { applyAssetChange } from "./intents";

describe("applyAssetChange", () => {
  it("sets in side normally when no collision", () => {
    expect(applyAssetChange("in", "WETH", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "WETH", assetOut: "USDC" });
  });

  it("sets out side normally when no collision", () => {
    expect(applyAssetChange("out", "DAI", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "ETH", assetOut: "DAI" });
  });

  it("auto-flips when in == prev.out", () => {
    expect(applyAssetChange("in", "USDC", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "USDC", assetOut: "ETH" });
  });

  it("auto-flips when out == prev.in", () => {
    expect(applyAssetChange("out", "ETH", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "USDC", assetOut: "ETH" });
  });

  it("no-op when picking the same value already on that side", () => {
    expect(applyAssetChange("in", "ETH", { assetIn: "ETH", assetOut: "USDC" }))
      .toEqual({ assetIn: "ETH", assetOut: "USDC" });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `pnpm --filter @wishd/plugin-uniswap test -- intents.test`
Expected: FAIL — `applyAssetChange is not a function`.

- [ ] **Step 3: Implement `applyAssetChange` in `plugins/uniswap/intents.ts`**

Append to the file (after `validateSwapValues`):

```ts
export type AssetSide = "in" | "out";
export type AssetPair = { assetIn: string; assetOut: string };

export function applyAssetChange(
  side: AssetSide,
  next: string,
  prev: AssetPair,
): AssetPair {
  if (side === "in") {
    if (next === prev.assetOut) return { assetIn: next, assetOut: prev.assetIn };
    return { assetIn: next, assetOut: prev.assetOut };
  }
  if (next === prev.assetIn) return { assetIn: prev.assetOut, assetOut: next };
  return { assetIn: prev.assetIn, assetOut: next };
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm --filter @wishd/plugin-uniswap test -- intents.test`
Expected: PASS, 5 new cases.

- [ ] **Step 5: Commit**

```bash
git add plugins/uniswap/intents.ts plugins/uniswap/intents.test.ts
git commit -m "feat(uniswap): applyAssetChange helper — auto-flip on same-token pick

When the user picks the same token already shown on the opposite side,
swap sides instead of accepting an invalid USDC->USDC state."
```

---

## Section C — Trading-API quote decimals fix (bug #6)

### Task 3: Apply `formatUnits` to trading-api `amountOut`/`amountOutMin` (TDD)

**Files:**
- Modify: `plugins/uniswap/strategies/tradingApi.ts`
- Modify: `plugins/uniswap/strategies/tradingApi.test.ts`

**Diagnosis (read-only first):**
- Trading-API returns `j.quote.output.amount` and `j.quote.minOutput.amount` in token's smallest units (raw, like wei). `directV3.ts` already uses `formatUnits(rawOut, decOut)`. `tradingApi.ts` returns raw strings as-is, so `SwapSummary` displays them un-scaled (`1842888296660176.700365` USDC for 0.1 ETH).
- The fix: scale by `assetOut.decimals` using `resolveAsset(chainId, assetOut)`, mirroring `directV3`.

- [ ] **Step 1: Write failing test in `plugins/uniswap/strategies/tradingApi.test.ts`**

Append a new `describe` block:

```ts
import { tradingApiStrategy } from "./tradingApi";
import type { SwapConfig } from "../types";

describe("tradingApi quote decimals", () => {
  function fakeFetch(response: unknown): typeof fetch {
    return (async () => new Response(JSON.stringify(response), { status: 200 })) as typeof fetch;
  }

  const ethToUsdcCfg: SwapConfig = {
    chainId: 1,
    swapper: "0x0000000000000000000000000000000000000001",
    tokenIn:  "0x0000000000000000000000000000000000000000", // ETH
    tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC mainnet
    assetIn: "ETH", assetOut: "USDC",
    amountIn: "100000000000000000", // 0.1 ETH in wei
    slippageBps: 50,
    strategyTag: "trading-api",
  };

  it("formats amountOut using assetOut decimals (USDC = 6)", async () => {
    // Trading-API returns raw smallest-unit amounts.
    // 300 USDC = 300_000_000 (6 decimals).
    const apiResponse = {
      routing: "CLASSIC",
      quote: {
        input:  { amount: "100000000000000000" },
        output: { amount: "300000000" },
        minOutput: { amount: "298500000" },
        rate: "1 ETH = 3000 USDC",
        routeString: "ETH > USDC",
      },
    };
    const strat = tradingApiStrategy({ apiKey: "k", fetchImpl: fakeFetch(apiResponse) });
    const q = await strat.quote(ethToUsdcCfg);
    expect(q.amountOut).toBe("300");
    expect(q.amountOutMin).toBe("298.5");
  });

  it("formats amountOut using assetOut decimals (ETH = 18)", async () => {
    const usdcToEthCfg: SwapConfig = {
      ...ethToUsdcCfg,
      tokenIn:  ethToUsdcCfg.tokenOut,
      tokenOut: ethToUsdcCfg.tokenIn,
      assetIn: "USDC", assetOut: "ETH",
      amountIn: "100000000", // 100 USDC raw
    };
    // 0.0333 ETH out = 33300000000000000 wei.
    const apiResponse = {
      routing: "CLASSIC",
      quote: {
        input:  { amount: "100000000" },
        output: { amount: "33300000000000000" },
        minOutput: { amount: "33133500000000000" },
      },
    };
    const strat = tradingApiStrategy({ apiKey: "k", fetchImpl: fakeFetch(apiResponse) });
    const q = await strat.quote(usdcToEthCfg);
    expect(q.amountOut).toBe("0.0333");
    expect(q.amountOutMin).toBe("0.0331335");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @wishd/plugin-uniswap test -- tradingApi.test`
Expected: FAIL — `expected "300000000" to be "300"`.

- [ ] **Step 3: Patch `plugins/uniswap/strategies/tradingApi.ts`**

At the top, alongside other imports:

```ts
import { formatUnits } from "viem";
import { resolveAsset } from "../resolveAsset";
```

Replace the `quote` function's return block (currently lines 55–66) with:

```ts
    const decOut = resolveAsset(cfg.chainId, cfg.assetOut).decimals;
    const rawOut    = j.quote?.output?.amount ?? "0";
    const rawOutMin = j.quote?.minOutput?.amount ?? rawOut;
    return {
      amountIn:     j.quote?.input?.amount ?? cfg.amountIn,
      amountOut:    formatUnits(BigInt(rawOut), decOut),
      amountOutMin: formatUnits(BigInt(rawOutMin), decOut),
      rate:         j.quote?.rate ?? "",
      route:        j.quote?.routeString ?? "Uniswap (Trading API)",
      gasFeeUSD:    j.quote?.gasFeeUSD,
      networkFee:   j.quote?.gasFeeUSD,
      priceImpactBps: typeof j.quote?.priceImpact === "number" ? Math.round(j.quote.priceImpact * 100) : undefined,
      expiresAt:    (j.quote?.deadline ?? (Math.floor(Date.now()/1000) + 30)) * 1000,
      raw:          j,
    };
```

- [ ] **Step 4: Run test to confirm pass**

Run: `pnpm --filter @wishd/plugin-uniswap test -- tradingApi.test`
Expected: PASS — both new cases.

- [ ] **Step 5: Run the full plugin test suite to catch regressions**

Run: `pnpm --filter @wishd/plugin-uniswap test`
Expected: PASS overall (existing tradingApi tests use placeholder amounts; verify they still pass — if any test asserted the un-scaled raw value, update it to the scaled value).

- [ ] **Step 6: Commit**

```bash
git add plugins/uniswap/strategies/tradingApi.ts plugins/uniswap/strategies/tradingApi.test.ts
git commit -m "fix(uniswap-tradingApi): scale amountOut by assetOut decimals

Trading-API returns smallest-unit amounts; we were returning them raw,
so SwapSummary displayed e.g. 1.84e+15 USDC for 0.1 ETH. directV3 already
formats correctly. Mirror that with formatUnits(BigInt(raw), decOut)."
```

---

## Section D — Wallet balances endpoint + hook

### Task 4: `GET /api/wallet/balances` route handler (TDD)

**Files:**
- Create: `apps/web/app/api/wallet/balances/route.ts`
- Create: `apps/web/test/api/wallet/balances.test.ts`

**Contract:**
- Query: `?address=0x..&chainId=11155111&tokens=ETH,USDC,WETH,UNI`.
- Response 200: `{ balances: { ETH: "0.842", USDC: "1248.55", WETH: "—", UNI: "0" }, missing: [] }`.
  - Decimal strings, already scaled by token decimals via `formatUnits`.
  - `"—"` placeholder if a token symbol is unknown for this chain.
  - `"0"` for known tokens with zero balance.
- Response 400 if `address` missing or `chainId` invalid: `{ error: "..." }`.

- [ ] **Step 1: Write failing test in `apps/web/test/api/wallet/balances.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/uniswapClients", () => ({
  publicClient: vi.fn(),
}));

import { publicClient } from "@/server/uniswapClients";
import { GET } from "@/app/api/wallet/balances/route";

describe("GET /api/wallet/balances", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400s when address is missing", async () => {
    const req = new Request("http://x/api/wallet/balances?chainId=1&tokens=ETH");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns native + erc20 balances scaled by decimals", async () => {
    const fake = {
      getBalance: vi.fn().mockResolvedValue(842_000_000_000_000_000n), // 0.842 ETH
      multicall: vi.fn().mockResolvedValue([
        { status: "success", result: 1_248_550_000n }, // USDC = 1248.55
      ]),
    };
    (publicClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fake);

    const req = new Request(
      "http://x/api/wallet/balances?address=0x0000000000000000000000000000000000000001&chainId=1&tokens=ETH,USDC",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.balances.ETH).toBe("0.842");
    expect(j.balances.USDC).toBe("1248.55");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @wishd/web test -- balances.test`
Expected: FAIL — module `@/app/api/wallet/balances/route` not found.

- [ ] **Step 3: Implement `apps/web/app/api/wallet/balances/route.ts`**

```ts
import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { erc20Abi } from "@plugins/uniswap/abis/erc20";
import { resolveAsset } from "@plugins/uniswap/resolveAsset";
import { publicClient } from "@/server/uniswapClients";

export const dynamic = "force-dynamic";

function formatBalance(value: bigint, decimals: number): string {
  if (value === 0n) return "0";
  const raw = formatUnits(value, decimals);
  // Trim trailing zeros after the decimal point but keep at least 2 sig figs.
  return raw.replace(/(\.[0-9]*?)0+$/, "$1").replace(/\.$/, "");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address");
  const chainIdRaw = url.searchParams.get("chainId");
  const tokensRaw = url.searchParams.get("tokens") ?? "";

  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "chainId required" }, { status: 400 });
  }
  const tokens = tokensRaw.split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return NextResponse.json({ balances: {}, missing: [] });

  const client = publicClient(chainId);

  // Resolve assets; collect unknowns for "missing" + "—" placeholders.
  const resolved: Array<{ symbol: string; decimals: number; isNative: boolean; address: `0x${string}` }> = [];
  const missing: string[] = [];
  for (const sym of tokens) {
    try {
      const a = resolveAsset(chainId, sym);
      resolved.push({ symbol: sym, decimals: a.decimals, isNative: a.isNative, address: a.address });
    } catch {
      missing.push(sym);
    }
  }

  // Native balance (only one expected per request, take first native entry).
  const nativeIdx = resolved.findIndex((r) => r.isNative);
  const nativeP = nativeIdx >= 0
    ? client.getBalance({ address: address as `0x${string}` })
    : Promise.resolve(0n);

  const erc20s = resolved.filter((r) => !r.isNative);
  const mcP = erc20s.length > 0
    ? client.multicall({
        contracts: erc20s.map((r) => ({
          address: r.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        })),
        allowFailure: true,
      })
    : Promise.resolve([]);

  const [nativeBal, erc20Results] = await Promise.all([nativeP, mcP]);

  const balances: Record<string, string> = {};
  for (const sym of missing) balances[sym] = "—";
  if (nativeIdx >= 0) {
    balances[resolved[nativeIdx]!.symbol] = formatBalance(nativeBal as bigint, resolved[nativeIdx]!.decimals);
  }
  erc20s.forEach((r, i) => {
    const row = (erc20Results as Array<{ status: "success" | "failure"; result?: bigint }>)[i];
    if (!row || row.status !== "success" || row.result === undefined) {
      balances[r.symbol] = "—";
      return;
    }
    balances[r.symbol] = formatBalance(row.result, r.decimals);
  });

  return NextResponse.json({ balances, missing });
}
```

> Note: `publicClient(chainId)` already exists in `apps/web/server/uniswapClients.ts`. Verify the export shape before running tests; if it returns the client directly (function call) the test mock matches; if it's a `getPublicClient()` style export, adjust both the route and test imports.

- [ ] **Step 4: Run test to confirm pass**

Run: `pnpm --filter @wishd/web test -- balances.test`
Expected: PASS — both cases.

- [ ] **Step 5: Manual smoke (curl)**

User runs in another terminal:

```bash
curl -k 'https://localhost:3000/api/wallet/balances?address=0x9dd0...D5F3&chainId=11155111&tokens=ETH,USDC,WETH,UNI' | jq .
```

Expected: `{ "balances": { "ETH": "...", "USDC": "30", ... }, "missing": [] }`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/wallet/balances/route.ts apps/web/test/api/wallet/balances.test.ts
git commit -m "feat(api/wallet): GET /api/wallet/balances — multi-token native + erc20 lookup

Returns formatted balance strings keyed by symbol. Used by AssetPicker
to show per-token wallet balances next to each option."
```

---

### Task 5: `useBalances` SWR hook

**Files:**
- Create: `apps/web/lib/useBalances.ts`
- Create: `apps/web/test/useBalances.test.tsx`

- [ ] **Step 1: Confirm SWR is already in `apps/web` dependencies**

Run: `grep -n '"swr"' apps/web/package.json`

If present, proceed. If absent, add it:

```bash
pnpm --filter @wishd/web add swr
```

Commit a separate `chore: add swr dependency` if needed before continuing.

- [ ] **Step 2: Write failing test in `apps/web/test/useBalances.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { useBalances } from "@/lib/useBalances";

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

describe("useBalances", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ balances: { ETH: "0.842", USDC: "30" }, missing: [] }), { status: 200 }),
    );
  });

  it("returns balances map after fetch", async () => {
    const { result } = renderHook(
      () => useBalances({ chainId: 1, address: "0x0000000000000000000000000000000000000001", tokens: ["ETH", "USDC"] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.balances).toEqual({ ETH: "0.842", USDC: "30" }));
  });

  it("returns empty map when address is undefined (no fetch)", async () => {
    const { result } = renderHook(
      () => useBalances({ chainId: 1, address: undefined, tokens: ["ETH"] }),
      { wrapper },
    );
    expect(result.current.balances).toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to confirm failure**

Run: `pnpm --filter @wishd/web test -- useBalances.test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `apps/web/lib/useBalances.ts`**

```ts
"use client";
import useSWR from "swr";

export type BalancesMap = Record<string, string>;

export type UseBalancesArgs = {
  chainId: number;
  address: `0x${string}` | string | undefined;
  tokens: string[];
};

const fetcher = async (url: string): Promise<{ balances: BalancesMap }> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`balances fetch failed: ${r.status}`);
  return r.json();
};

export function useBalances({ chainId, address, tokens }: UseBalancesArgs): {
  balances: BalancesMap;
  isLoading: boolean;
  error: Error | undefined;
} {
  const sortedTokens = [...tokens].sort().join(",");
  const key = address && tokens.length > 0
    ? `/api/wallet/balances?address=${address}&chainId=${chainId}&tokens=${sortedTokens}`
    : null;
  const { data, error, isLoading } = useSWR(key, fetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
  });
  return {
    balances: data?.balances ?? {},
    isLoading,
    error: error as Error | undefined,
  };
}
```

- [ ] **Step 5: Run test to confirm pass**

Run: `pnpm --filter @wishd/web test -- useBalances.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/useBalances.ts apps/web/test/useBalances.test.tsx
git commit -m "feat(web/lib): useBalances — SWR-backed multi-token balance hook

30s dedupe, gracefully no-ops without an address. Cache key includes
sorted token list + chainId so wallet/chain switches refresh."
```

---

## Section E — AssetPicker rewrite

### Task 6: Rewrite `AssetPicker` — portal popover, balances, kb nav, mutex

**Files:**
- Rewrite: `apps/web/components/wish/AssetPicker.tsx`
- Create: `apps/web/test/AssetPicker.test.tsx`

**Behavior contract:**
- Anchor: full pill matching ActionPill style (icon, ticker, chevron). `aria-label = value ? \`Selected ${value}\` : "Select asset"`.
- Controlled or uncontrolled `open`: if `open` + `onOpenChange` props provided, parent owns state (mutex); else internal state.
- Popover: portaled to `document.body`, absolute-positioned below anchor (or above on overflow), 320px wide.
- Header: `{N} matches · ↑↓ ↵`.
- Search input autoFocus on open.
- Each row: icon + symbol + name + balance (right). Balance comes from `balances[symbol]`. Unknown → `—`. Loading → `…`.
- Keyboard: ↓/↑ moves cursor (highlighted row), ↵ commits, Esc closes.
- Click outside (anywhere not inside popover or anchor) closes.

- [ ] **Step 1: Write failing tests in `apps/web/test/AssetPicker.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetPicker } from "@/components/wish/AssetPicker";

vi.mock("@/lib/useBalances", () => ({
  useBalances: () => ({ balances: { ETH: "0.842", USDC: "30" }, isLoading: false, error: undefined }),
}));

describe("AssetPicker", () => {
  it("opens on click, lists tokens with balances, commits on click", async () => {
    const onChange = vi.fn();
    render(<AssetPicker chainId={11155111} value="ETH" onChange={onChange} address="0x0000000000000000000000000000000000000001" />);
    fireEvent.click(screen.getByRole("button", { name: /selected ETH/i }));
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
    expect(screen.getByText("0.842")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /usdc/i }));
    expect(onChange).toHaveBeenCalledWith("USDC");
  });

  it("filters by search query", async () => {
    render(<AssetPicker chainId={11155111} value="ETH" onChange={vi.fn()} address="0x0000000000000000000000000000000000000001" />);
    fireEvent.click(screen.getByRole("button", { name: /selected ETH/i }));
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "usdc" } });
    expect(screen.queryByRole("option", { name: /^ETH/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /usdc/i })).toBeInTheDocument();
  });

  it("commits highlighted row on Enter", async () => {
    const onChange = vi.fn();
    render(<AssetPicker chainId={11155111} value="ETH" onChange={onChange} address="0x0000000000000000000000000000000000000001" />);
    const anchor = screen.getByRole("button", { name: /selected ETH/i });
    fireEvent.click(anchor);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.keyDown(search, { key: "ArrowDown" }); // move from ETH (default) to next row
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalled();
  });

  it("closes when controlled open flips to false", () => {
    const { rerender } = render(
      <AssetPicker chainId={11155111} value="ETH" onChange={vi.fn()} address="0x0..1" open onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
    rerender(
      <AssetPicker chainId={11155111} value="ETH" onChange={vi.fn()} address="0x0..1" open={false} onOpenChange={() => {}} />,
    );
    expect(screen.queryByText(/matches/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `pnpm --filter @wishd/web test -- AssetPicker.test`
Expected: FAIL — current AssetPicker has no `address` prop, no `open`/`onOpenChange`, no balances, no `option` roles, no portal.

- [ ] **Step 3: Implement the rewritten `apps/web/components/wish/AssetPicker.tsx`**

```tsx
"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getNative, getTokens } from "@wishd/tokens";
import { tokenIconClass, tokenSymbol } from "@/lib/tokenIcons";
import { useBalances } from "@/lib/useBalances";

type Option = { symbol: string; name: string };

function options(chainId: number): Option[] {
  const out: Option[] = [];
  const n = getNative(chainId);
  if (n) out.push({ symbol: n.symbol, name: `${n.symbol} (native)` });
  for (const t of getTokens(chainId)) out.push({ symbol: t.symbol, name: t.name });
  return out;
}

export type AssetPickerProps = {
  chainId: number;
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  address?: `0x${string}` | string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: "from" | "to";
};

export function AssetPicker(props: AssetPickerProps) {
  const { chainId, value, onChange, address, variant = "from" } = props;
  const all = useMemo(() => options(chainId), [chainId]);
  const tokenSymbols = useMemo(() => all.map((o) => o.symbol), [all]);
  const { balances } = useBalances({ chainId, address, tokens: tokenSymbols });

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const open = isControlled ? !!props.open : internalOpen;
  const setOpen = (o: boolean) => (isControlled ? props.onOpenChange!(o) : setInternalOpen(o));

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return all;
    return all.filter((o) => o.symbol.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle));
  }, [all, q]);

  const [cursor, setCursor] = useState(0);
  useEffect(() => setCursor(0), [q, open]);

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });
  const popoverId = useId();

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const width = 320;
    const above = window.innerHeight - r.bottom < 360;
    setPos({
      top: above ? r.top + window.scrollY - 8 - 320 : r.bottom + window.scrollY + 8,
      left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left + window.scrollX)),
      width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function commit(symbol: string) {
    onChange(symbol);
    setOpen(false);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[cursor];
      if (o) commit(o.symbol);
    } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  const anchorAria = props.ariaLabel ?? (value ? `Selected ${value}` : "Select asset");
  const variantClass = variant === "from"
    ? "bg-accent border-ink"
    : "bg-mint border-ink";

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={anchorAria}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 ${variantClass} border-[1.5px] rounded-pill px-2.5 py-1 font-bold text-sm`}
      >
        <span className={tokenIconClass(value)}>{tokenSymbol(value)}</span>
        <span>{value || "select token"}</span>
        <span className="text-xs ml-0.5">⌄</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          id={popoverId}
          role="listbox"
          aria-label="token list"
          style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 50 }}
          className="bg-surface border-2 border-ink rounded-xl shadow-cardSm p-2"
        >
          <div className="flex items-center justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
            <span>{filtered.length} matches</span>
            <span>↑↓ ↵</span>
          </div>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search…"
            className="w-full bg-transparent outline-none border border-rule rounded px-2 py-1.5 mb-2 text-sm"
          />
          <ul className="max-h-72 overflow-y-auto">
            {filtered.map((o, i) => (
              <li key={o.symbol}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(o.symbol)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${i === cursor ? "bg-accent-2" : ""}`}
                >
                  <span className={tokenIconClass(o.symbol)}>{tokenSymbol(o.symbol)}</span>
                  <span className="font-bold">{o.symbol}</span>
                  <span className="text-ink-3 truncate">{o.name}</span>
                  <span className="ml-auto font-mono text-xs text-ink-2">{balances[o.symbol] ?? "—"}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-ink-3 text-sm">no tokens match</li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm --filter @wishd/web test -- AssetPicker.test`
Expected: PASS — all four cases.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/AssetPicker.tsx apps/web/test/AssetPicker.test.tsx
git commit -m "feat(wish/AssetPicker): portal popover, balances, kb nav, controlled open

- Anchor styled as full pill (matches ActionPill) with chevron + dynamic aria-label.
- Popover renders into document.body (absolute, viewport-aware), so it never
  shifts the surrounding sentence.
- Per-token wallet balance fetched via useBalances; '—' for unknown, '0' for empty.
- Header shows '{N} matches · ↑↓ ↵'.
- Keyboard: ↑/↓ moves cursor, ↵ commits, Esc closes.
- Optional controlled open/onOpenChange enables single-open mutex from parent."
```

---

## Section F — WishComposer integration (bugs #2, #5, #8b)

### Task 7: Wire AssetPicker mutex + add step01 flip button + same-token guard

**Files:**
- Create: `apps/web/components/primitives/FlipButton.tsx`
- Modify: `apps/web/components/wish/WishComposer.tsx`

- [ ] **Step 1: Create `apps/web/components/primitives/FlipButton.tsx`**

```tsx
"use client";

export function FlipButton({ onClick, ariaLabel = "swap direction" }: {
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title="swap direction"
      className="inline-flex items-center justify-center w-7 h-7 rounded-full border-[1.5px] border-ink bg-surface-2 text-base hover:bg-accent-2 hover:rotate-180 transition-transform mx-1"
    >↕</button>
  );
}
```

- [ ] **Step 2: Edit `apps/web/components/wish/WishComposer.tsx` — wire mutex, flip, same-token guard**

Add imports near the top:

```ts
import { FlipButton } from "@/components/primitives/FlipButton";
import { applyAssetChange } from "@plugins/uniswap/intents";
```

In the component body (before `setField`), add:

```ts
function setAssetField(side: "in" | "out", next: string) {
  setValues((s) => {
    const prev = { assetIn: s.assetIn ?? "", assetOut: s.assetOut ?? "" };
    const updated = applyAssetChange(side, next, prev);
    return { ...s, assetIn: updated.assetIn, assetOut: updated.assetOut };
  });
}

function flipAssets() {
  setValues((s) => ({ ...s, assetIn: s.assetOut ?? "", assetOut: s.assetIn ?? "" }));
}
```

Replace the existing `<FieldPill>` rendering inside `renderSentenceParts(schema).map(...)`:

```tsx
{schema?.fields.length ? (
  renderSentenceParts(schema).map((part, i) => {
    if (part.kind === "connector") {
      // For swap intent, between assetIn and assetOut, also render flip button.
      const showFlip =
        schema.intent === "uniswap.swap" &&
        i > 0 &&
        // connector immediately precedes assetOut
        renderSentenceParts(schema)[i + 1]?.kind === "field" &&
        (renderSentenceParts(schema)[i + 1] as { kind: "field"; key: string }).key === "assetOut";
      return (
        <SentenceConnector key={`connector-${i}`}>
          {part.text}
          {showFlip && <FlipButton onClick={flipAssets} />}
        </SentenceConnector>
      );
    }

    const field = schema.fields.find((f) => f.key === part.key);
    if (!field) return null;
    const isAssetField = field.type === "asset" && (field.key === "assetIn" || field.key === "assetOut");
    return (
      <FieldPill
        key={field.key}
        field={field}
        value={values[field.key] ?? ""}
        open={openPillKey === field.key}
        onOpenChange={(o) => setOpenPillKey(o ? field.key : null)}
        onChange={(v) => {
          if (isAssetField) {
            setAssetField(field.key === "assetIn" ? "in" : "out", v);
          } else {
            setField(field.key, v);
          }
        }}
        disabled={busy}
        chainId={CHAIN_ID_BY_SLUG[values.chain ?? ""] ?? CHAIN_ID_BY_SLUG["ethereum-sepolia"]}
        address={address}
      />
    );
  })
) : (
  <SentenceConnector>pick an action</SentenceConnector>
)}
```

Then update the `FieldPill` definition (around line 363) to forward `open`, `onOpenChange`, and `address` to `AssetPicker`:

```tsx
function FieldPill({
  field, value, open, onOpenChange, onChange, disabled, chainId, address,
}: {
  field: IntentField;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (v: string) => void;
  disabled?: boolean;
  chainId?: number;
  address?: `0x${string}` | string;
}) {
  if (field.type === "amount") { /* unchanged */ }

  if (field.type === "asset" && field.options.length !== 1) {
    return (
      <AssetPicker
        chainId={chainId ?? 11155111}
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabelForField(field)}
        address={address}
        open={open}
        onOpenChange={onOpenChange}
        variant={field.key === "assetOut" ? "to" : "from"}
      />
    );
  }
  // ... rest unchanged
}
```

- [ ] **Step 3: Type-check + run app tests**

Run: `pnpm --filter @wishd/web test`
Expected: PASS. (No new direct test for the integration; existing tests around composer still green.)

- [ ] **Step 4: Manual smoke**

User confirms in browser:
1. Pick swap intent. Two asset pills + chain pill + amount + flip button between asset pills.
2. Click `assetIn` pill (USDC), pick `USDC` again → no change (no-op).
3. With assetIn=ETH, assetOut=USDC, click `assetIn`, pick USDC → assetIn=USDC, assetOut=ETH (auto-flip).
4. Open `assetIn` picker, then click `assetOut` pill → first popover closes, second opens (mutex).
5. Click flip button → ETH ↔ USDC swap.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/primitives/FlipButton.tsx apps/web/components/wish/WishComposer.tsx
git commit -m "feat(wish/composer): step01 flip button + AssetPicker mutex + same-token guard

- New FlipButton primitive used between assetIn and assetOut for swap intent.
- AssetPicker now opt-in controlled via openPillKey, mutex enforced.
- assetIn/assetOut updates routed through applyAssetChange to auto-swap
  sides instead of allowing USDC->USDC."
```

---

## Section G — SwapSummary integration (bugs #3, #4, #5 widget side, #11)

### Task 8: SwapSummary uses useBalances + applyAssetChange + clean rate + stale-edit hide

**Files:**
- Modify: `plugins/uniswap/widgets/SwapSummary.tsx`

- [ ] **Step 1: Read the current SwapSummary state-management section**

Run: `sed -n '1,140p' plugins/uniswap/widgets/SwapSummary.tsx`

Confirm the `useState` lines for `amountIn`, `assetIn`, `assetOut`, `slippageBps`, the `handleFlip` function, and the `quote` derivation. We'll modify these.

- [ ] **Step 2: Add imports + replace state/derivations**

Add to imports:

```ts
import { applyAssetChange } from "../intents";
import { useBalances } from "../../../apps/web/lib/useBalances";
```

Replace `handleFlip` (line ~114):

```ts
function handleFlip() {
  setAssetIn((prev) => {
    const nextOut = prev;
    setAssetOut(nextOut);
    return assetOut;
  });
}
```

with the cleaner pair-swap that also resets the local edit indicator (we'll add `editPending` state):

```ts
const [editPending, setEditPending] = useState(false);

function setAssetInGuarded(next: string) {
  setEditPending(true);
  const updated = applyAssetChange("in", next, { assetIn, assetOut });
  setAssetIn(updated.assetIn);
  setAssetOut(updated.assetOut);
}
function setAssetOutGuarded(next: string) {
  setEditPending(true);
  const updated = applyAssetChange("out", next, { assetIn, assetOut });
  setAssetIn(updated.assetIn);
  setAssetOut(updated.assetOut);
}
function handleFlip() {
  setEditPending(true);
  setAssetIn(assetOut);
  setAssetOut(assetIn);
}
```

Update the two `<AssetPicker>` callsites (~line 178 + ~line 205):

```tsx
<AssetPicker
  chainId={chainId}
  value={assetIn}
  onChange={setAssetInGuarded}
  ariaLabel="select token in"
  address={swapper}
  variant="from"
/>
...
<AssetPicker
  chainId={chainId}
  value={assetOut}
  onChange={setAssetOutGuarded}
  ariaLabel="select token out"
  address={swapper}
  variant="to"
/>
```

(Add a local mutex if both pickers must not open at once — the `useState<"in" | "out" | null>(null)` and pass `open={mutex === "in"}` / `onOpenChange={(o) => setMutex(o ? "in" : null)}`. Same for out side.)

- [ ] **Step 3: Replace `balance` source**

Add hook call near top of the body:

```ts
const liveBalances = useBalances({ chainId, address: swapper, tokens: [assetIn, assetOut] });
const balance = liveBalances.balances[assetIn] ?? props.balance;
```

(`props.balance` stays as initial fallback when SWR is still warming up.)

- [ ] **Step 4: Drop stale rate suffix in stats row**

Replace the rate stat (around line 223):

```ts
{ k: "rate", v: quote.rate || "—" },
```

(remove the ` ${assetOut}/${assetIn}` template that produces `USDC/USDC` after a same-token glitch and `ETH/USDC USDC/ETH`-type duplicates.)

- [ ] **Step 5: Hide stale NL summary on local edits**

Find the `<StaticText>"Swapping ..."` line at the end of the body — it's part of the agent narration, surfaced via the `summaryId` patch. Replace with a conditional:

```tsx
{editPending && (
  <div className="font-mono text-[11px] text-ink-3 px-2">edit pending — re-running checks…</div>
)}
```

…and gate the existing summary line on `!editPending`. The `editPending` flag clears when a fresh quote arrives (add an effect):

```ts
useEffect(() => {
  if (quoteQuery.data && !quoteQuery.isFetching) setEditPending(false);
}, [quoteQuery.data, quoteQuery.isFetching]);
```

- [ ] **Step 6: Type-check + run plugin tests**

Run: `pnpm --filter @wishd/plugin-uniswap test`
Expected: PASS.

- [ ] **Step 7: Manual smoke**

User confirms in browser:
1. Submit swap. Step02 shows USDC→ETH.
2. Click flip ↕. Both AssetPicker pills swap. Balance row now shows `30 USDC` for new from-token (or live SWR balance).
3. Pick the same token on token-out as token-in is currently → auto-flip occurs (no USDC→USDC state).
4. Rate stat shows the server-formatted string only (e.g. `"1 USDC = 0.000122 ETH"`), no `USDC/USDC` suffix.
5. While quote is refetching after a flip, NL summary is replaced by `edit pending — re-running checks…`.

- [ ] **Step 8: Commit**

```bash
git add plugins/uniswap/widgets/SwapSummary.tsx
git commit -m "fix(uniswap/SwapSummary): live balance, applyAssetChange, clean rate, stale-edit hide

- Read balance from useBalances, keyed by current assetIn — no longer stuck
  on initial prepare-time prop after a flip.
- Token-in/out changes route through applyAssetChange → auto-swap on collision.
- Drop the appended ' \${assetOut}/\${assetIn}' from the rate stat — the
  server-formatted rate string already contains both tokens.
- Local edits set editPending; while pending, replace stale NL summary."
```

---

## Section H — Widget flip button polish (bug #3)

### Task 9: Beef up `WidgetCard.SwapDir`

**Files:**
- Modify: `apps/web/components/primitives/WidgetCard.tsx`

- [ ] **Step 1: Replace `WidgetCard.SwapDir`**

Replace the existing definition (lines ~33–42) with:

```tsx
WidgetCard.SwapDir = function SwapDir({ onFlip }: { onFlip?: () => void }) {
  return (
    <div className="flex justify-center items-center p-2 bg-surface-2 border-y border-rule">
      <button
        type="button"
        onClick={onFlip}
        aria-label="reverse swap direction"
        title="swap direction"
        className="w-10 h-10 rounded-full border-[1.5px] border-ink bg-surface-2 flex items-center justify-center cursor-pointer text-lg hover:bg-accent hover:text-ink hover:rotate-180 transition-transform shadow-cardSm"
      >↕</button>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @wishd/web typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

User confirms: button in step02 widget is visibly larger, has `aria-label="reverse swap direction"`, hover shows accent bg + 180° rotation.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/primitives/WidgetCard.tsx
git commit -m "polish(WidgetCard/SwapDir): bigger circle, aria-label, accent hover

40px target instead of 32, accent bg on hover, screen-reader label
'reverse swap direction'."
```

---

## Section I — Final QA pass

### Task 10: Run full test suite + manual demo flow

- [ ] **Step 1: Run the full monorepo test suite**

Run: `pnpm -w test`
Expected: PASS across `@wishd/plugin-uniswap`, `@wishd/web`, `@wishd/plugin-sdk`, etc. No new failures.

- [ ] **Step 2: Type-check**

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm -w lint`
Expected: PASS (or no NEW warnings vs main).

- [ ] **Step 4: Manual demo flow (user-driven, in chrome-devtools or browser)**

Walk through these in order on `https://localhost:3000/`:
1. Pick `swap` intent. Sentence shows: `I want to [swap] [0.1] [ETH] [↕] to [USDC] on [ethereum-sepolia]`. Flip button between asset pills.
2. Click `assetIn` pill → portal popover opens BELOW the pill (not inline). Header `4 matches · ↑↓ ↵`. Each row shows token + balance. ETH row shows real wallet balance.
3. Type `usdc` in search → only USDC row remains. ↑/↓/↵ commit USDC.
4. With assetIn=USDC, click `assetOut` pill, pick USDC → assetOut becomes ETH (auto-flip).
5. Click step01 flip button → ETH ↔ USDC swap.
6. Click `looks good →`. Step02 appears with ONE STEP 02 header (no `STEP / swap-summary`).
7. Inside widget: `you pay` shows `0.1 USDC` with realistic balance (e.g. 30). `you receive` shows scaled USDC→ETH amount with sane decimals (~3e-5, not 1e16).
8. Click widget flip ↕. Now ETH→USDC. Balance shows ETH balance. Rate stat shows server-formatted text only. Decimals on `you receive` realistic.
9. Pick same token on both sides via widget pickers → auto-flip kicks in.

- [ ] **Step 5: If all passes, optionally open PR**

```bash
git push -u origin HEAD
gh pr create --title "fix(uniswap-flow): 11 P0 swap UX/quote bugs" --body "$(cat <<'EOF'
## Summary
- Step header dedup: outer StepStack provides chrome, widgets keep body.
- AssetPicker overhaul: portal popover, per-token balances, kb nav, single-open mutex.
- Step01 flip button + same-token auto-flip guard (shared helper).
- SwapSummary uses live useBalances, drops stale rate suffix, hides stale NL on local edits.
- Trading-API quote scaled by assetOut decimals (was returning raw smallest-units).
- WidgetCard.SwapDir: bigger, labeled, accent hover.

Spec: docs/superpowers/specs/2026-05-02-uniswap-flow-fixes-design.md
Plan: docs/superpowers/plans/2026-05-02-uniswap-flow-fixes.md

## Test plan
- [ ] pnpm -w test passes
- [ ] pnpm -w typecheck passes
- [ ] Manual demo flow (steps 1–9 in plan Task 10 Step 4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Skip if user prefers to merge locally.)

---

## Self-review notes (post-write)

- **Spec coverage:** Each numbered bug 1–11 maps to a task: #1 → Task 1; #2, #5, #8b → Task 7; #3 → Task 9; #4 → Task 8; #5 also → Task 2; #6 → Task 3; #7, #8a, #8c, #8d, #9, #10, #11 → Tasks 4, 5, 6.
- **Placeholders:** None ("TBD"/"add appropriate"/"similar to").
- **Type consistency:** `applyAssetChange(side: "in" | "out", next: string, prev: { assetIn, assetOut })` used identically in Tasks 2, 7, 8. `useBalances({ chainId, address, tokens })` consistent across Tasks 5, 6, 8. `AssetPicker` props (`address`, `open`, `onOpenChange`, `variant`) consistent across Tasks 6, 7, 8.
- **Risks called out in spec are mitigated in plan:** decimals fix has both-direction tests (Task 3 Step 1); SWR cache key includes `address` + `chainId` + sorted tokens (Task 5 Step 4); portal click-outside covered by smoke (Task 6 Step 1 case 4 implicitly via controlled-open close test).

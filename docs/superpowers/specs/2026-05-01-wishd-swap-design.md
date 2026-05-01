# wishd — Uniswap Swap Plugin Design

**Date:** 2026-05-01
**Status:** Draft (pending user review)
**Scope:** Add a single `plugins/uniswap` plugin that supports token swaps end-to-end across all chains in the manifest, using the Uniswap Trading API where available and a direct on-chain Uniswap V3 fallback elsewhere (Sepolia, plus any chain Uniswap deploys but the Trading API doesn't gateway). The plugin is end-to-end: composer intent, prepare, MCP tool, summary widget with live quote refresh, execute widget with state-machine + timeline, and success card with stub keeper offers. Builds on the UI primitives shipped in the parallel UI parity spec.

## Goal

Today wishd ships one plugin (`compound-v3`, lend-only). The prototype demonstrates a swap flow as the headline action — pay/receive boxes, live AI-check, multi-chain. We ship that flow as a real, working plugin that:

1. Returns real on-chain quotes within ~1s of composer submit.
2. Stays fresh while the user reviews — no frozen quotes.
3. Always re-quotes immediately before broadcasting, regardless of how stale the cache is.
4. Works on Trading-API-supported production chains (Mainnet, Base, Arbitrum, Optimism, Polygon, Unichain) **and** on Sepolia via a direct Uniswap V3 path. The same direct path generalises to any chain where Uniswap V3 is deployed but the Trading API doesn't gateway.
5. Keeps the API key server-side, never browser-exposed.
6. Uses Porto's `useSendCalls` for execution (atomic batched approval+swap when supported, otherwise sequential).

## Non-goals (v0)

- No Permit2 — v0 uses legacy direct-to-Universal-Router approval (1 approve tx + 1 swap tx). Permit2's gasless-approve UX is v0.1.
- No UniswapX (DUTCH_V2/V3, PRIORITY) — pin `routingPreference: "CLASSIC"` and `protocols: ["V2","V3","V4"]` to avoid the dual-shape complexity of Dutch-order signing. v0.1 work.
- No multi-hop on the direct V3 fallback — single-pool exact-input only (sufficient for WETH⇄USDC on Sepolia). Trading API path handles multi-hop on prod chains automatically.
- No limit orders, no DCA, no range-based swaps. The Step 04 success card surfaces these as keeper-offer stubs ("DCA back", "Range alert", "Earn on idle tokens") but no real keeper deploys.
- No mobile-specific UX work beyond the parallel UI parity spec.

## Architecture overview

One plugin, two strategies inside it. Plugin-level interface stays uniform; strategy is selected by `chainId` at prepare time. Widgets never see the strategy.

```
plugins/uniswap/
├── package.json
├── manifest.ts            # name:"uniswap", chains:[1,8453,42161,10,137,130,11155111], trust:"verified"
├── index.ts               # definePlugin(...) wiring strategies + widgets + intents
├── addresses.ts           # WETH/USDC/USDT/DAI/WBTC + UniversalRouter + (Sepolia) QuoterV2/SwapRouter02
├── tokens.ts              # per-chain token registry (address, symbol, decimals, iconClass)
├── intents.ts             # uniswap.swap intent schema
├── abis/
│   ├── erc20.ts
│   ├── quoterV2.ts        # only used by directV3 strategy
│   └── swapRouter02.ts    # only used by directV3 strategy
├── strategies/
│   ├── tradingApi.ts      # POST /check_approval + /quote + /swap
│   └── directV3.ts        # quoter.quoteExactInputSingle + build SwapRouter02 calldata via viem
├── prepare.ts             # entry point — picks strategy by chainId, returns unified SwapPrepared
├── mcp/
│   └── server.ts          # MCP tool: prepare_swap (free-text path)
└── widgets/
    ├── SwapSummary.tsx    # WidgetCard preview + AICheckPanel + TanStack Query refresh
    └── SwapExecute.tsx    # ExecuteTimeline + state machine + SuccessCard

apps/web/app/api/uniswap/
├── quote/route.ts         # POST — body: SwapConfig + amountIn → SwapQuote
├── swap/route.ts          # POST — body: SwapConfig + SwapQuote → SwapCalldata
└── balance/route.ts       # POST — body: {chainId, token, address} → string (decimal)

apps/web/app/api/prepare/uniswap.swap/route.ts
                           # composer first-paint: validate → balance → approval + first quote (parallel)
                           # returns initial widget props with seeded quote — no /swap call here
```

## Data flow

### First paint (composer submit)

```
WishComposer.submitComposer({intent:"uniswap.swap", values})
  └─> prepareIntent("uniswap.swap", values)
        └─> POST /api/prepare/uniswap.swap
              ├─ validate(values, account)              # skill input rules (regex, no shell metas)
              ├─ resolve(tokenIn, tokenOut, chainId)    # tokens.ts lookup → addresses + decimals
              ├─ Promise.all([
              │     readBalance(tokenIn, swapper),       # publicClient.readContract or getBalance
              │     prepare.quote({chainId, ...}),       # strategy-dispatched
              │     prepare.checkApproval(...),          # tradingApi: POST /check_approval
              │                                          # directV3: read ERC20.allowance(swapper, router)
              │   ])
              └─ return {
                   widget: {
                     id, type:"swap-summary", slot:"flow",
                     props: {
                       config: { chainId, swapper, tokenIn, tokenOut, amountIn, slippageBps, strategyTag },
                       initialQuote: SwapQuote,            # seeds TanStack Query
                       initialQuoteAt: number,             # epoch ms for initialDataUpdatedAt
                       approvalCall?: { to, data, value },
                       balance: string,                    # decimal
                       insufficient: boolean,
                       suggestions: { keeperOffers: KeeperOffer[] },
                     }
                   }
                 }
```

The route does **not** call `/swap`. Calldata generation is deferred to the execute click because Trading API quotes expire in ~30s.

### Live refresh inside the widget

`SwapSummary` mounts with `props.initialQuote` seeded into TanStack Query cache. From there, the widget owns freshness:

```tsx
const debouncedAmount = useDebounce(amountIn, 300);

const quoteQuery = useQuery({
  queryKey: ["uniswap.quote", chainId, tokenIn, tokenOut, debouncedAmount, swapper],
  queryFn: ({ signal }) =>
    fetch("/api/uniswap/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId, tokenIn, tokenOut, amountIn: debouncedAmount, swapper, slippageBps }),
      signal,
    }).then((r) => { if (!r.ok) throw new HttpError(r); return r.json() as Promise<SwapQuote>; }),
  initialData: props.initialQuote,
  initialDataUpdatedAt: props.initialQuoteAt,
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  staleTime: 10_000,
  placeholderData: keepPreviousData,        // no flash on amount change / refetch
  retry: (n, err) => n < 2 && !is4xx(err),
});
```

Why this works:

- `refetchInterval: 15s` < 30s API expiry → cache never goes stale on its own.
- `staleTime: 10s` + `placeholderData: keepPreviousData` → typing fast doesn't spam the API; stale data shown during refetch, no skeleton flash.
- `signal` passed to `fetch` → in-flight requests cancelled when amount changes or component unmounts.
- `refetchOnWindowFocus` → user tabs back from wallet, instant fresh quote.
- `initialData` + `initialDataUpdatedAt` → first paint shows server-provided quote with no client roundtrip; refetch timer measures from initial timestamp.

The widget renders `quoteQuery.data` everywhere a price/route/min-out appears. The `isFetching` state drives a small "live" pulse dot in the AICheckPanel. If a 4xx error sticks (no route, insufficient liquidity), the panel surfaces the human-readable reason and the execute button disables.

### Execute click

```tsx
async function execute() {
  // 1. Force a fresh quote, bypassing the polling cache
  const fresh = await queryClient.fetchQuery({ queryKey, queryFn, retry: 1 });

  // 2. Get fresh swap calldata
  const swapRes = await fetch("/api/uniswap/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config, quote: fresh }),
  });
  if (!swapRes.ok) throw new Error((await swapRes.json()).error);
  const { swapCall } = (await swapRes.json()) as { swapCall: Call };

  // 3. Validate per skill (non-empty hex, valid addresses, value present)
  validateSwapBeforeBroadcast(swapCall);

  // 4. Build calls array. Approval already known from prepare; if it has since become unnecessary
  //    (user pre-approved separately), the server's /api/uniswap/swap response will include
  //    `approvalStillRequired: boolean` from a fresh /check_approval — only include when true.
  const calls = approvalStillRequired ? [props.approvalCall!, swapCall] : [swapCall];

  sendCalls({ calls });
}
```

Approval is fetched again (fresh `/check_approval`) only inside `/api/uniswap/swap` to avoid double round-trips: the server returns both `swapCall` and a boolean `approvalStillRequired`, freshly computed at call time. Cheap (one read) and avoids the bug class where the cached approval call from prepare time becomes outdated.

## Strategy: Trading API (prod chains)

**Supported chains (subset of manifest):** 1 (Ethereum), 8453 (Base), 42161 (Arbitrum), 10 (Optimism), 137 (Polygon), 130 (Unichain). Authoritative list in `strategies/tradingApi.ts` as `TRADING_API_CHAINS: ReadonlySet<number>`.

### Endpoints

Server-side only. Base URL: `https://trade-api.gateway.uniswap.org/v1`. Required headers per skill:

```
Content-Type: application/json
x-api-key: <env UNISWAP_API_KEY>
x-universal-router-version: 2.0
```

### `/check_approval` wrapper

```ts
async function checkApproval(input: { chainId: number; walletAddress: Hex; token: Hex; amountWei: string }):
  Promise<{ approvalCall: Call | null }>
```

Returns `{ approvalCall: null }` when the API responds with `approval: null`. Maps the `approval: { to, data, value }` shape into our `Call` type. ETH placeholder address (`0x0000000000000000000000000000000000000000`) skips the call entirely and returns `null`.

### `/quote` wrapper

```ts
async function quote(input: SwapConfig & { amountIn: string }): Promise<SwapQuote>
```

Request body:
```jsonc
{
  "swapper": "0x…",
  "tokenIn":  "0x…",     // 0x000…000 for ETH
  "tokenOut": "0x…",
  "tokenInChainId":  "1", // STRINGS — skill warns numbers fail
  "tokenOutChainId": "1",
  "amount": "1000000000000000000",
  "type": "EXACT_INPUT",
  "slippageTolerance": 0.5,                            // percent
  "routingPreference": "CLASSIC",                      // pin — no UniswapX
  "protocols": ["V2", "V3", "V4"],
  "deadline": <epoch + 300s>                            // 5 min headroom
}
```

Response is narrowed via discriminated union on `routing`. We hard-reject non-CLASSIC routings:

```ts
if (response.routing !== "CLASSIC" && response.routing !== "WRAP" && response.routing !== "UNWRAP") {
  throw new SwapError("unsupported_routing", response.routing);
}
```

Mapped into our internal `SwapQuote` shape (chain-agnostic):

```ts
type SwapQuote = {
  amountIn: string;          // decimal
  amountOut: string;         // decimal — best-case
  amountOutMin: string;      // decimal — slippage-adjusted
  rate: string;              // "1 ETH = 3,120 USDC"
  route: string;             // human label, e.g. "Uniswap v3 · 0.30%"
  gasFeeUSD?: string;        // skill warns: use API string, never compute manually
  networkFee?: string;       // duplicate of gasFeeUSD for prototype's "NETWORK FEE" cell
  priceImpactBps?: number;
  expiresAt: number;         // epoch ms — derived from deadline
  raw: unknown;              // full Trading API quote response — opaque pass-through to /swap
};
```

`raw` is a pass-through bag that the widget POSTs back to `/api/uniswap/swap` so the server doesn't need to re-quote. The widget never inspects `raw`.

### `/swap` wrapper

```ts
async function swap(input: { config: SwapConfig; quote: SwapQuote }):
  Promise<{ swapCall: Call; approvalStillRequired: boolean }>
```

Spread the `raw` quote into the `/swap` body, **stripping `permitData` and `permitTransaction`** unconditionally per skill:

```ts
const { permitData, permitTransaction, ...cleanQuote } = quote.raw as Record<string, unknown>;
const body = { ...cleanQuote };           // CLASSIC + legacy approval → no signature/permitData
```

Validate response (non-empty `data`, valid `to`/`from`, hex). Return:
```ts
{ swapCall: { to, data, value }, approvalStillRequired: <fresh /check_approval result> }
```

### Rate limiting + retries

Server-side `fetchWithRetry(url, init, maxRetries = 5)` per skill: exponential backoff with jitter on 429/5xx, immediate fail to client on 4xx. Cap delay 10s; abort total budget 12s.

## Strategy: Direct V3 (Sepolia + any chain Trading API doesn't support)

Trigger: `chainId` not in `TRADING_API_CHAINS` **and** present in `DIRECT_V3_CHAINS` (chains where we hardcode QuoterV2 + SwapRouter02 + UniversalRouter addresses + at least one well-known pool). Initial set: Sepolia (11155111). Generalises to any chain where we can populate `addresses.ts`.

The plugin contract is identical — same `SwapPrepared`, `SwapQuote`, `Call` shapes — so widgets are oblivious.

### Quote

```ts
async function quote(input: SwapConfig & { amountIn: string }): Promise<SwapQuote> {
  const tokenInAddr  = wrapNativeIfNeeded(input.tokenIn,  input.chainId);   // ETH → WETH for the quoter
  const tokenOutAddr = wrapNativeIfNeeded(input.tokenOut, input.chainId);
  const fees = [500, 3000, 10000];                                           // pool fee tiers we'll try
  const quotes = await Promise.allSettled(fees.map(fee =>
    publicClient.simulateContract({
      address: QUOTER_V2[input.chainId],
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [{
        tokenIn: tokenInAddr,
        tokenOut: tokenOutAddr,
        fee,
        amountIn: parseUnits(input.amountIn, decimals(tokenIn, chainId)),
        sqrtPriceLimitX96: 0n,
      }],
    })
  ));
  const best = pickBestSettled(quotes);
  if (!best) throw new SwapError("no_route", "no V3 pool found for pair");
  // best.result = [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
  const amountOutWei = best.result[0];
  const minOutWei    = (amountOutWei * BigInt(10000 - input.slippageBps)) / 10000n;
  return {
    amountIn:     input.amountIn,
    amountOut:    formatUnits(amountOutWei, decimals(tokenOut, chainId)),
    amountOutMin: formatUnits(minOutWei,    decimals(tokenOut, chainId)),
    rate:         humanRate(input.amountIn, amountOutWei, …),
    route:        `Uniswap v3 · ${(best.fee / 10000).toFixed(2)}%`,
    gasFeeUSD:    undefined,                       // we don't price gas without an oracle
    networkFee:   undefined,
    priceImpactBps: undefined,
    expiresAt:    Date.now() + 30_000,             // self-imposed; Sepolia quotes don't actually expire
    raw:          { fee: best.fee, amountOutMin: minOutWei.toString(), wrapEth: input.tokenIn === ETH },
  };
}
```

### Calldata

`SwapRouter02.exactInputSingle` for ERC-20 → ERC-20 / ERC-20 → ETH / ETH → ERC-20. For ETH-in: pass `value: amountIn` and use the router's payable path (router wraps internally via `WETH9.deposit{value:msg.value}` followed by `exactInputSingle`). For ETH-out: call `exactInputSingle` with `recipient: ADDRESS_THIS` plus a follow-up `unwrapWETH9` via `multicall(...)` (router's helper). Both encoded as `multicall(bytes[])` so it's a single `Call`.

### Approval

`erc20.allowance(swapper, swapRouter02[chainId])` — if less than `amountIn`, push approval call (max-uint approve to router). Legacy direct approval, no Permit2 on this path.

### Liquidity reality on Sepolia

Sepolia V3 pools are sparse. Realistic outcomes for the demo:

- WETH/USDC 0.3% pool: present, depth typically a few thousand USDC. Quotes for ≤0.05 ETH plausible; larger sizes show severe price impact or the quoter reverts.
- USDT/DAI/WBTC: usually no pool. Quoter reverts → strategy returns `SwapError("no_route", …)` → widget shows "no route on Sepolia for this pair".

The `SwapSummary` widget renders a yellow "Sepolia liquidity is sparse — preview only, this may revert on execute" banner whenever `chainId === 11155111`. Banner is informational; execute is still allowed (user can choose to retry on Base for production-quality demo).

### Generalisation hook

`addresses.ts` exports `DIRECT_V3_CHAINS: Record<number, { quoter, swapRouter02, weth, knownPools? }>`. Adding a new chain to the direct path is a one-file edit; no widget or strategy change required.

## Token registry

Replace the current single-chain `apps/web/lib/tokens.ts` with a multi-chain shape:

```ts
export type TokenInfo = {
  address: Hex;
  symbol: string;
  decimals: number;
  iconClass: string;            // "asset-dot eth" | "asset-dot usdc" | …
  isNative?: boolean;           // ETH on chain 1, MATIC on 137, etc.
};

export const TOKENS: Record<number, Record<string, TokenInfo>> = {
  1:        { ETH:{...}, USDC:{...}, USDT:{...}, DAI:{...}, WBTC:{...} },
  8453:     { ETH:{...}, USDC:{...}, USDT:{...}, DAI:{...}, WBTC:{...} },
  42161:    { ETH:{...}, USDC:{...}, USDT:{...}, DAI:{...}, WBTC:{...} },
  10:       { ETH:{...}, USDC:{...}, USDT:{...}, DAI:{...}, WBTC:{...} },
  137:      { MATIC:{...}, USDC:{...}, USDT:{...}, DAI:{...}, WETH:{...}, WBTC:{...} },
  130:      { ETH:{...}, USDC:{...} },
  11155111: { ETH:{...}, USDC:{...} },                     // limited
};
```

`amount.ts` gains a `(symbol, chainId)` overload reading from this registry. The Compound plugin migrates to the same registry — no functional change, just sourcing.

For the composer's asset pickers: the `intents.ts` schema lists the **union** of supported symbols per `assetIn`/`assetOut` field; per-chain validation happens server-side in `prepareSwap` (reject if `(symbol, chainId)` not in registry → 400 with explicit error).

## Composer schema

```ts
// plugins/uniswap/intents.ts
import type { IntentSchema } from "@wishd/plugin-sdk";

const SUPPORTED_ASSETS = ["ETH","USDC","USDT","DAI","WBTC"];
const SUPPORTED_CHAINS = ["ethereum","base","arbitrum","optimism","polygon","unichain","ethereum-sepolia"];

export const uniswapIntents: IntentSchema[] = [{
  intent: "uniswap.swap",
  verb: "swap",
  description: "exchange one token for another",
  fields: [
    { key: "amount",   type: "amount", required: true,  default: "0.1" },
    { key: "assetIn",  type: "asset",  required: true,  default: "ETH",  options: SUPPORTED_ASSETS },
    { key: "assetOut", type: "asset",  required: true,  default: "USDC", options: SUPPORTED_ASSETS },
    { key: "chain",    type: "chain",  required: true,  default: "ethereum-sepolia", options: SUPPORTED_CHAINS },
  ],
  widget: "swap-summary",
  slot: "flow",
  connectors: { assetIn: "", assetOut: "to", chain: "on" },
  balanceFor: "assetIn",
}];
```

`assetIn === assetOut` is rejected at the prepare layer with a clear "pick two different assets" error.

## Insufficient balance + WETH unwrap

### Insufficient balance pre-flight

`/api/prepare/uniswap.swap` reads balance:
- ETH-in (`tokenIn === 0x000…`): `publicClient.getBalance(swapper)`.
- ERC-20 in: `erc20.balanceOf(swapper)`.

Renders `insufficient: true` when `balance < amountIn`. Widget displays a banner mirroring the Compound widget's existing pattern, and disables execute. Execute click also re-checks (race with user funding mid-flow).

### WETH unwrap on L2

When `tokenOut === ETH` and `chainId in {8453, 42161, 10}`, the swap may deliver WETH instead of native ETH (skill section "WETH Handling on L2s"). Two paths:

- **Trading API path:** request body adds `recipient` of WETH9 router-internal then we follow with an `unwrapWETH9(amountOutMin, recipient: swapper)` call appended to the calls array. Trading API's own returned calldata may already unwrap — if so, our appended unwrap is a no-op against zero balance. Empirically determined; for v0 we always append the unwrap, accepting a minor gas cost on mismatch.
- **Direct V3 path:** the multicall-based exactInputSingle + unwrapWETH9 sequence handles this in-router; no extra call needed.

Logic lives in `strategies/*/buildCalls.ts`.

## MCP tool (free-text path)

```ts
// plugins/uniswap/mcp/server.ts
tool(
  "prepare_swap",
  "Prepare a Uniswap swap. Call before rendering swap-summary.",
  {
    amount:    z.string(),
    assetIn:   z.string(),
    assetOut:  z.string(),
    chain:     z.string(),                             // "ethereum-sepolia" etc.
    user:      z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    chainId:   z.number(),
    slippageBps: z.number().optional().default(50),
  },
  async (args, ctx) => {
    const prepared = await prepareSwap({ ...args, slippageBps: args.slippageBps ?? 50, ctx });
    return { content: [{ type: "text", text: JSON.stringify(prepared) }] };
  },
);
```

System prompt (`apps/web/server/systemPrompt.ts`) gains a swap branch:

> For "swap/trade/exchange A for B on <chain>" intents:
> 1. Call `prepare_swap({amount, assetIn, assetOut, chain, user, chainId, slippageBps})`.
> 2. Call `widget.render({type:"swap-summary", props: <prepared>})`.
> 3. One short narration line. Stop.

`WishComposer.guessFromText` (`apps/web/components/wish/WishComposer.tsx:242`) gains a swap regex (`/swap|trade|exchange/`) so the freetext skeleton hydrates with the swap-summary skeleton type.

## Widget contract

### `SwapSummary` props

```ts
type SwapSummaryProps = {
  config: SwapConfig;            // canonical inputs — used as queryKey + execute body
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  approvalCall: Call | null;     // from prepare — re-validated at execute
  balance: string;               // decimal
  insufficient: boolean;
  liquidityNote?: string;        // Sepolia banner text, undefined elsewhere
  keeperOffers?: KeeperOffer[];  // surfaced after success — passed through to SwapExecute
};
```

Renders inside the parity-spec primitives:

```
<StepCard step="STEP 02" title="your swap, materialized" sub="tweak amounts here. AI re-checks live.">
  <div class="step2-layout">
    <WidgetCard>
      <Head name="swap" badge={…strategy badge: "NATIVE · 1 TX" | "ERC-20 · 1–2 TX"} />
      <PaySection>
        <BoxLabel>YOU PAY <max>max · {balance}</max></BoxLabel>
        <Input value={amountIn} onChange={…debounced} />
        <UsdEstimate>{quote.amountIn × ratePay}</UsdEstimate>
        <BoxAsset>{config.assetIn}</BoxAsset>
      </PaySection>
      <SwapDir onFlip={…}/>
      <ReceiveSection>
        <BoxLabel>YOU RECEIVE <route>~ best route</route></BoxLabel>
        <BoxAmount>{quote.amountOut}</BoxAmount>
        <UsdEstimate>{usd} · impact {priceImpactBps}bps</UsdEstimate>
        <BoxAsset>{config.assetOut}</BoxAsset>
      </ReceiveSection>
      <Stats items={[
        { k: "RATE",         v: quote.rate },
        { k: "MIN RECEIVED", v: quote.amountOutMin },
        { k: "ROUTE",        v: quote.route },
        { k: "NETWORK FEE",  v: quote.gasFeeUSD ?? "—" },
      ]}/>
      <Cta onClick={onExecute} disabled={insufficient || hasError}>execute →</Cta>
    </WidgetCard>
    <AICheckPanel
      status={isFetching ? "live" : "stale"}
      balanceChanges={[
        { sign: "-", token: assetIn, amount: `-${quote.amountIn}` },
        { sign: "-", token: "gas",   amount: `~${quote.gasFeeUSD ?? "—"}` },
        { sign: "+", token: assetOut, amount: `+${quote.amountOut}` },
      ]}
      safety={[
        { ok: !needsApproval, text: needsApproval ? `${assetIn} allowance required for ${spender}` : "native token — no allowance required" },
        { ok: true, text: `contract verified · ${spender}` },
        { ok: true, text: `simulates cleanly · output ≈ ${quote.amountOut} ${assetOut}` },
      ]}
    />
  </div>
</StepCard>
```

The `<SwapDir>` flip swaps `assetIn`/`assetOut` in the widget's internal state, which changes the queryKey, which triggers a fresh quote.

Click "execute →" emits a `wishd:wish` custom event with `wish: "execute swap <summaryId>"` and `context: {prepared, summaryId}` — same plumbing as `CompoundSummary`. The agent's swap branch then calls `widget.render({type:"swap-execute", props:{...prepared}})`.

### `SwapExecute` props + state machine

```ts
type SwapExecuteProps = SwapPrepared & { keeperOffers?: KeeperOffer[] };

type Phase =
  | "connect"          // wallet disconnected
  | "switch-chain"     // wallet on wrong chain
  | "ready"            // can broadcast
  | "preflight"        // fetching fresh quote+swap
  | "submitting"       // sendCalls pending or callsStatus loading
  | "confirmed"
  | "error";
```

Phases drive an `ExecuteTimeline` (UI parity spec primitive):

```
queued → active → done flow:
  1. Pre-flight quote (active during "preflight")
  2. Approve <assetIn>  (skipped when no approval needed)
  3. Sign swap          (active during "submitting" once sendCalls posts)
  4. Broadcasting       (active while callsStatus.isLoading)
  5. Confirmed          (done when callsStatus.data.status === "success")
```

The CTA button label is `Connect Wallet | Switch Network | Approve & Swap | Swapping… | Confirmed | Retry`. `useSendCalls`-driven, mirroring `CompoundExecute.tsx`. On `confirmed`, replace the timeline+CTA with `<SuccessCard>`:

```tsx
<SuccessCard
  title="swap complete ✦"
  sub={`received ${amountOut} ${assetOut} · want to put it to work?`}
  summary={[
    { k: "paid",     v: `${amountIn} ${assetIn}` },
    { k: "received", v: `${amountOut} ${assetOut}` },
    { k: "rate",     v: rate },
    { k: "tx",       v: <a href={`${explorerUrl}/tx/${txHash}`}>{shortHash}</a> },
  ]}
  keeperOffers={[
    { title: "Earn on idle tokens",     desc: "Auto-deposit received tokens into best APY protocol.", featured: true },
    { title: "Range alert",             desc: "Notify if price moves ±15% — chance to swap back at better rate." },
    { title: "DCA back",                desc: "Drip tokens back at intervals until target allocation reached." },
    { title: "Liquidation protection",  desc: "Auto-repay borrow if health factor drops below 1.3." },
  ]}
  primaryAction={{ label: "make another wish", onClick: onWishReset }}
  secondaryAction={{ label: "view portfolio", onClick: onPortfolioToast }}
/>
```

Keeper-offer cards' "deploy ✦ / customize" buttons render as disabled "coming soon" tooltips in v0.

## Endpoint contracts

```ts
// /api/prepare/uniswap.swap   POST
type Req = {
  amount: string;
  assetIn: string;
  assetOut: string;
  chain: string;            // human ID; resolved → chainId server-side
  address: Hex;
  slippageBps?: number;
};
type Res =
  | { widget: { id: string; type: "swap-summary"; slot: "flow"; props: SwapSummaryProps } }
  | { error: string };

// /api/uniswap/quote   POST
type Req = { chainId: number; tokenIn: Hex; tokenOut: Hex; amountIn: string; swapper: Hex; slippageBps: number };
type Res = SwapQuote | { error: string };

// /api/uniswap/swap   POST
type Req = { config: SwapConfig; quote: SwapQuote };
type Res = { swapCall: Call; approvalStillRequired: boolean } | { error: string };

// /api/uniswap/balance   POST   (optional, used by widget for manual refresh)
type Req = { chainId: number; token: Hex; address: Hex };
type Res = { balance: string };
```

All routes return `application/json`. 4xx for validation/no-route/insufficient-liquidity. 5xx for upstream Trading API failures (after backoff exhausted).

## Decimal handling

All amount math goes through `lib/amount.ts` / token registry. No bare `1e18`, no hardcoded `6`. The Trading API expects integer wei strings; we convert at the boundary via `parseUnits(amount, TOKENS[chainId][symbol].decimals)`. Display always uses `formatUnits` — never raw bigint.

## Verification

End-to-end manual on Base (Trading API path) and Sepolia (direct V3 path):

### Base (Trading API)

1. Switch wallet to Base. Fund with a small ETH balance + some USDC.
2. Compose: "swap 0.001 ETH → USDC on Base". Submit.
3. Step 02 card paints within ~1s with `quote.amountOut` populated. AICheckPanel shows balance changes, "native token — no allowance required", "simulates cleanly". "Live" dot pulses every ~15s.
4. Edit amount to 0.002. Quote refetches within 300ms (debounce) + ~600ms API. Output amount updates without full skeleton flash.
5. Wait 30s without doing anything. Log shows `refetchInterval` firing twice; values may shift slightly with market.
6. Click execute. Pre-flight step turns active, then sign step. Wallet pops with EIP-1559 calldata. Sign.
7. Timeline progresses through broadcasting → confirmed. SuccessCard renders with tx hash linking to BaseScan.

### Sepolia (direct V3)

1. Switch wallet to Sepolia. Fund with Sepolia ETH + some Sepolia USDC.
2. Compose: "swap 0.001 ETH → USDC on Ethereum Sepolia". Submit.
3. Step 02 card shows quote (likely high price impact). Yellow "Sepolia liquidity is sparse — preview only" banner visible.
4. Click execute. Approval skipped (ETH-in). Wallet pops with multicall calldata. Sign.
5. Confirmed → SuccessCard with Sepolia Etherscan link. (Tx may revert if liquidity moved between quote and broadcast — error timeline phase + retry.)

### Cross-flow

- Run Compound deposit on Sepolia immediately after a successful swap on Base. No state leaks — workspace resets between wishes.
- Disconnect mid-swap → execute timeline shows phase=connect, button label flips. Reconnect → resumes.
- API key removed from env → server emits 500 on `/api/prepare/uniswap.swap`; widget fails the skeleton with the upstream error message visible.

### Plugin-shape sanity

- Compound plugin keeps working unchanged.
- A null `plugins/null-protocol/` (per skeleton spec) still loads.
- Manifest gating: when the system prompt loader excludes `uniswap`, swap intents are filtered from the composer (already covered by per-plugin manifest filtering — confirm).

## Open risks

1. **Trading API key.** Hackathon-time access requires registering at the Uniswap Developer Portal. Need to provision and document `UNISWAP_API_KEY` in `.env.local.example`. Without a key, swap on prod chains is blocked entirely; Sepolia direct-V3 path remains usable as a partial demo.
2. **Sepolia liquidity volatility.** Pools can drain mid-demo. Mitigation: pre-demo, run a quote against the target pair to confirm depth; show explicit liquidity-note banner so failure is expected, not surprising.
3. **L2 WETH-vs-ETH delivery.** Appending an unwrap call always (even when redundant) may hit a tiny gas cost overhead on mainnet/L2 depending on whether Trading API already includes one. Acceptable v0; revisit when we instrument actual gas usage.
4. **Quote → swap call contract mismatch.** If we change `routingPreference`/`protocols` between the two endpoints, the API may reject. Single source of truth for these constants in `strategies/tradingApi.ts`.
5. **Schema asset union.** Listing all five assets even on chains where some don't exist (e.g. Unichain has limited coverage) means the composer offers invalid pairs that fail at prepare. Acceptable trade-off (versus dynamic per-chain options); error message must be clear.
6. **TanStack Query setup.** wagmi v2 already mounts a QueryClientProvider. Confirm the provider wraps app/page; otherwise `useQuery` calls in the swap widget will error on mount.
7. **Free-text path narration ordering.** Existing freetext flow renders skeleton, then waits for `ui.render` from agent. With Trading API in the loop, first-paint latency is ~600ms (`/check_approval` + `/quote` parallel). Skeleton timeout is 5s — comfortable headroom.
8. **Direct V3 fee-tier scan cost.** Three `simulateContract` calls in parallel hit the public RPC. Cache miss on first call; subsequent same-pair-same-block share the slot0 read. For Sepolia we use whatever public RPC is configured for the wagmi chain — assume capped to a few rps.
9. **Permit2 absence on legacy approve.** A user who has previously approved Permit2 (via another app) but not the Universal Router directly will be prompted for an approve tx unnecessarily. Acceptable v0; documented in the widget's allowance line.

## Appendix — file change map

```
NEW   plugins/uniswap/                                              # full new plugin (above)
EDIT  apps/web/lib/tokens.ts                                        # multi-chain registry
EDIT  apps/web/lib/amount.ts                                        # (symbol, chainId) overload
EDIT  apps/web/lib/intentRegistry.client.ts                         # include uniswapIntents
EDIT  apps/web/server/systemPrompt.ts                               # swap branch
EDIT  apps/web/components/wish/WishComposer.tsx                     # guessFromText swap regex; intent dispatch
NEW   apps/web/app/api/prepare/uniswap.swap/route.ts
NEW   apps/web/app/api/uniswap/quote/route.ts
NEW   apps/web/app/api/uniswap/swap/route.ts
NEW   apps/web/app/api/uniswap/balance/route.ts
EDIT  apps/web/server/intentDispatch.ts                             # (if dispatch table is centralised)
EDIT  .env.local.example                                            # UNISWAP_API_KEY=
EDIT  apps/web/app/providers.tsx                                    # confirm QueryClientProvider mounted
```

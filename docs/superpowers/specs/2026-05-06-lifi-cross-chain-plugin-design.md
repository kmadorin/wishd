# PR3: `@wishd/plugin-lifi` — cross-chain bridge-swap via Pattern X

**Status:** brainstormed, pending review → implementation plan
**Scope:** First cross-chain plugin built on the SDK from `2026-05-06-svm-fork-a-sdk-design.md` (PR1) and learning from the SVM plugin pattern in `2026-05-06-svm-jupiter-plugin-design.md` (PR2). Bridge-swap intents that move value between chain families via Li.Fi REST + a Li.Fi-relayed destination delivery (Pattern X: one user-signed source-chain tx, off-chain observation of destination delivery).
**Demo case:** "swap 10 USDC on Ethereum to SOL on Solana via Li.Fi".
**Out of scope:** multi-leg user-signed bridges (Pattern Y), Solana-as-source bridging (relies on `SvmCall` + Li.Fi solana relayer maturity — defer until PR2 stabilizes), in-flight cancel/refund flows beyond Li.Fi's own status-driven UX, keepers, multi-chain destination splitting, intent disambiguation across `swap` claimants (handled by the rule PR2 added to `prepareIntent.ts`).
**Prereq:** PR1 merged, PR2 merged. All `EvmCall` / `SvmCall` / `PluginCtx` / CAIP / explorer / asset types referenced below are defined in PR1 and exercised in PR2 — not redefined here.

## Goal

Ship `@wishd/plugin-lifi` as the first cross-chain plugin. Surface a `lifi.bridge-swap` intent with TWO chain fields (`fromChain`, `toChain`) plus `amountIn`, `assetIn` (CAIP-19), `assetOut` (CAIP-19). Server `prepare()` calls Li.Fi `/quote` and returns a single `EvmCall` (the source-chain transaction) plus an `observations[]` array describing how to drive destination-side completion off-chain via Li.Fi `/status`. The user signs once on the source chain; the executor watches `/status` until `DONE` (success), `FAILED` (terminal error), or timeout, emitting `ServerEvent`s that drive a polling progress widget. The plugin owns its own `lifi-bridge-progress` widget; persistence (zustand + localStorage) makes the polling phase resume across page refreshes.

The plugin is also the conformance test for PR1's deferred `ObservationSpec` shape (PR1 §`prepare()` output explicitly defers it here).

## Non-goals

- Solana-as-source. Demo path is EVM source → SVM destination only. EVM↔EVM also works for free (same code path, observation polls Li.Fi status equally). SVM source bridging requires a proven Solana-side `SvmCall` story for Li.Fi which PR2 does not yet exercise — defer.
- Multi-step user-signed flows (e.g. approve + swap + bridge with three signatures). v1 leans on Li.Fi's all-in-one tx (Li.Fi-built calldata that approves and bridges in one tx via their diamond contract on the source chain).
- Custom bridge selection UI. Li.Fi `/quote` returns the route it picks; we surface the route + fees, but don't expose a per-bridge picker. Power-user feature; defer.
- Refund/recover UX beyond linking to Li.Fi's own recovery page when status returns `FAILED`. Li.Fi handles refund mechanics; we surface, don't reimplement.
- Bridge-only (no swap) variant. Encoded as `assetIn === assetOut` semantically; same intent.
- Devnet/testnet. Li.Fi has limited testnet coverage for Solana destinations — too flaky for demo. Mainnet only. Integration tests deferred (§D6).

## Decisions locked

| # | Q | Answer |
|---|---|---|
| D1 | Pattern | **Pattern X**, locked from PR1. One user-signed source-chain tx; destination delivery is observation-only via Li.Fi `/status`. No second user signature on the destination chain. |
| D2 | `PluginCtx.family` | `"evm"`. The user-signed call is EVM. Destination is observation-only — the plugin reads destination state (if at all) via its own RPC, NOT through ctx. This avoids needing a `MultiCtx` variant in PR1. PR1's existing `EvmCtx` is sufficient. |
| D3 | Source chains | `eip155:1` (Ethereum), `eip155:8453` (Base), `eip155:42161` (Arbitrum), `eip155:10` (Optimism), `eip155:137` (Polygon). Small set; covers demo + obvious extensions. Manifest also declares `solana:5eykt4...` so the chain field's `options` includes Solana — but only as a destination. Source-side validation in `validateBridgeValues` rejects SVM caip2 in `fromChain` for v1. |
| D4 | Destination chains | Same set as D3 plus Solana mainnet. Demo target = Solana mainnet. |
| D5 | Quote source | Li.Fi REST `/quote` (single endpoint that returns `transactionRequest` + route metadata). No `/routes` shopping in v1. |
| D6 | Tests | **Unit tests only** in v1. Mocked Li.Fi REST (`/quote`, `/status`) + mocked source RPC. Integration deferred — Li.Fi testnet → Solana devnet path is unreliable in CI per recent attempts on similar repos, and mainnet integration is cost-prohibitive. README documents the gap. |
| D7 | Polling cadence | Start at 3 s, exponential backoff factor 1.5 capped at 15 s. Total timeout 15 min. Abort on user navigation away from the progress widget. Concrete sequence in §Polling. |
| D8 | Persistence | zustand store `bridgeProgressStore` with `persist` middleware (localStorage key `wishd:lifi:bridges`). Keys by source `txHash`. Survives full reload — `lifi-bridge-progress` widget rehydrates on mount and resumes polling if status not terminal. |
| D9 | MCP server name & widgets | Server name: `lifi`. Widgets: `lifi-bridge-summary`, `lifi-bridge-execute`, `lifi-bridge-progress`. Per-plugin namespacing per the rule established in PR2 (D10). Manifest `provides.mcps: ["lifi"]`. |
| D10 | Slippage | Default `slippage: 0.005` (0.5%, Li.Fi's `/quote` `slippage` is a fraction not bps — we normalize at the boundary). User-tunable `["0.1%", "0.5%", "1%"]`. No `auto` (Li.Fi has no equivalent toggle). |
| D11 | Approval handling | Li.Fi's returned `transactionRequest` for ERC-20 sources includes the approval inside the route via their diamond contract OR returns a separate approval `Call` if `approvalAddress != tx.to`. v1: surface the prepared single `Call`. If Li.Fi indicates a separate approval is required (`/quote.estimate.approvalAddress` set + allowance insufficient), we prepend an approval `EvmCall` to the `calls[]` array. The executor signs them sequentially. Detail in §`prepare()`. |
| D12 | Result lifecycle | `ServerEvent` emission contract documented in §Result lifecycle. `notification` events during polling, `result` event terminal. Plugin emits via `ctx.emit` from PluginCtx — same channel the agent already consumes. |

## Architecture

### File-level layout

```
plugins/lifi/
  index.ts                ← definePlugin({ manifest, mcp, widgets, intents })
  manifest.ts             ← { chains: [eip155:1, ...:8453, ...:42161, ...:10, ...:137, SOLANA_MAINNET], provides: { intents: ["lifi.bridge-swap"], widgets: [...], mcps: ["lifi"] } }
  intents.ts              ← lifiIntents: IntentSchema[]; validateBridgeValues
  prepare.ts              ← prepareBridgeSwap(input) → LifiBridgePrepared
  resolveAsset.ts         ← (caip2, symbol) → { caip19, address, decimals, isNative } — handles both EVM and SVM caip2
  addresses.ts            ← CURATED_ASSETS: per-chain CAIP-19 entries for USDC/USDT/ETH/SOL/MATIC/etc.
  observe.ts              ← LifiStatusPoller: poll loop, backoff, abort, ServerEvent emission
  types.ts                ← LifiBridgeConfig, LifiQuote, LifiStatusObservation, LifiBridgePrepared, LifiBridgeStatus
  mcp/server.ts           ← createLifiMcp(ctx) — tools: prepare_bridge_swap, get_bridge_status (read-only proxy to /status)
  store/
    bridgeProgressStore.ts  ← zustand persist; keyed by source txHash
  widgets/
    BridgeSummary.tsx     ← lifi-bridge-summary
    BridgeExecute.tsx     ← lifi-bridge-execute (sign + submit source tx)
    BridgeProgress.tsx    ← lifi-bridge-progress (polling phase, rehydrates)
    index.ts
  prepare.test.ts
  observe.test.ts
  resolveAsset.test.ts
  intents.test.ts

apps/web/
  server/lifiClients.ts   ← evmPublicClientFor(caip2), lifiFetch(path, init) (auth header if LIFI_API_KEY)
  widgetRegistry.ts       ← register lifi-bridge-summary/execute/progress
  next.config.ts          ← add "@wishd/plugin-lifi" to transpilePackages (CLAUDE.md recurring trap)
```

### Manifest

```ts
export const lifiManifest: Manifest = {
  name: "lifi",                           // slug, NOT pkg name (PR1 convention)
  version: "0.0.0",
  chains: [
    "eip155:1", "eip155:8453", "eip155:42161", "eip155:10", "eip155:137",
    SOLANA_MAINNET,
  ],
  trust: "verified",                      // PR1 TrustTier — first-party reviewed
  primaryChainField: "fromChain",         // PR1: drives ctx selection + disambiguation
  provides: {
    intents: ["lifi.bridge-swap"],
    widgets: ["lifi-bridge-summary", "lifi-bridge-execute", "lifi-bridge-progress"],
    mcps: ["lifi"],
  },
};
```

`chains` lists the union of source + destination CAIP-2s. `validateBridgeValues` enforces v1 rule: `fromChain` must be EVM (no SVM source).

### Intent schema

```ts
export const lifiIntents: IntentSchema[] = [{
  intent: "lifi.bridge-swap",
  verb: "bridge",                    // distinct from `swap` to dodge uniswap/jupiter disambiguation
  description: "bridge and optionally swap an asset across chains via Li.Fi",
  fields: [
    { key: "amount",    type: "amount", required: true, default: "10" },
    { key: "assetIn",   type: "asset",  required: true, default: "USDC", options: CURATED_SYMBOLS_EVM },
    { key: "fromChain", type: "chain",  required: true, default: "eip155:1", options: ["eip155:1","eip155:8453","eip155:42161","eip155:10","eip155:137"] },
    { key: "assetOut",  type: "asset",  required: true, default: "SOL",  options: CURATED_SYMBOLS_ALL },
    { key: "toChain",   type: "chain",  required: true, default: SOLANA_MAINNET, options: ["eip155:1","eip155:8453","eip155:42161","eip155:10","eip155:137", SOLANA_MAINNET] },
    { key: "slippage",  type: "select", required: false, default: "0.5%", options: ["0.1%","0.5%","1%"] },
  ],
  connectors: { assetIn: "", fromChain: "on", assetOut: "to", toChain: "on", slippage: "with" },
  widget: "lifi-bridge-summary",
  slot: "flow",
}];
```

**Two `chain` fields under different keys** — resolved in PR1: `Manifest.primaryChainField` names which chain field drives ctx + disambiguation. Li.Fi sets `primaryChainField: "fromChain"` since the user-signed Call is on the source chain.

`verb: "bridge"` keeps `lifi.bridge-swap` out of the `swap` disambiguation cohort. If `lifi.swap` (single-chain Li.Fi-routed swap) lands later, it joins `swap` and PR1's chain-family disambiguator resolves correctly.

### `prepare()` shape

```ts
export type LifiBridgeConfig = {
  fromCaip2: string;          // eip155:*
  toCaip2: string;            // eip155:* | solana:*
  fromAddress: string;        // signer
  toAddress: string;          // recipient (defaults = wishd's known SVM acct from useWishdAccounts when toCaip2 is solana, or fromAddress for EVM-EVM)
  assetInCaip19: string;
  assetOutCaip19: string;
  amountAtomic: string;       // u64/u256 stringified
  slippage: number;           // 0.005 etc.
};

export type LifiQuoteEstimate = {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress: string | null;
  feeCosts: Array<{ name: string; description: string; amountUSD: string; included: boolean }>;
  gasCosts: Array<{ type: string; amountUSD: string; estimate: string }>;
  executionDuration: number;  // seconds
  steps: Array<{ tool: string; toolDetails: { name: string; logoURI: string }; type: string }>;
};

// LifiStatusObservation type lives in PR1 SDK (@wishd/plugin-sdk observation.ts).
// Reproduced here for reference only:
//   type LifiStatusObservation = {
//     family: "lifi-status";
//     endpoint: string;
//     query: { txHash: string | Placeholder; fromChain: string | number; toChain: string | number; bridge?: string };
//     successWhen: { path: string; equals: string };
//     failureWhen: { path: string; equalsAny: string[] };
//     pollMs?: { initial: number; maxBackoff: number; factor: number };
//     timeoutMs?: number;
//     display: { title: string; fromLabel: string; toLabel: string };
//   };
// Placeholder type also from PR1: { from: "callResult"; index: number; field: "hash" | "signature" }

// LifiBridgePrepared = Prepared<LifiBridgeExtras> from PR1
export type LifiBridgeExtras = {
  config: LifiBridgeConfig;
  quote: LifiQuoteEstimate;
  quoteAt: number;
  insufficient: boolean;
  balance: string;                // human (decimals applied)
  routeNote?: string;             // e.g. "Routed via Across + Wormhole (2 hops)"
  totalFeeUSD: string;            // sum of feeCosts where included=true
  totalGasUSD: string;
  estimatedDurationSec: number;
};

export type LifiBridgePrepared = Prepared<LifiBridgeExtras>;
// → { calls: EvmCall[]; observations: [LifiStatusObservation]; staleAfter: number; ...LifiBridgeExtras }
// `calls` length 1 (single tx) or 2 (approval + bridge); never empty.
// `observations` always length 1 in v1.
```

`LifiStatusObservation` lives in PR1's `Observation` union; PR3 contributes its definition + executor poller wiring. Future observation variants (`EvmEventLogObservation`, `SvmAccountWatchObservation`, etc.) extend the same union without further SDK churn.

`prepare.ts`:
1. `validateBridgeValues(values)` — reject SVM `fromChain`, identical CAIP-19 in/out on same chain, bad amount.
2. `resolveAsset(fromCaip2, assetIn)` and `resolveAsset(toCaip2, assetOut)` → CAIP-19 + decimals + on-chain address (or `0xeeee...EEeE` native marker for ETH-likes / `So11111111111111111111111111111111111111112` for SOL).
3. Compute `amountAtomic = parseUnits(amount, decimals).toString()`.
4. `fromAddress` from `useWishdAccounts().evm[fromCaip2]`, `toAddress` from `useWishdAccounts().svm[toCaip2]` if SVM destination, else `fromAddress`. PR2 already established `useWishdAccounts` exposes both families.
5. `GET https://li.quest/v1/quote?fromChain=…&toChain=…&fromToken=…&toToken=…&fromAddress=…&toAddress=…&fromAmount=…&slippage=…&integrator=wishd`.
6. Build `calls`:
   - If `quote.estimate.approvalAddress` set AND `assetIn` is ERC-20 AND on-chain `allowance(fromAddress, approvalAddress) < amountAtomic` (server reads via `evmPublicClientFor(fromCaip2)`), prepend an approval `EvmCall { family:"evm", caip2:fromCaip2, to:tokenAddr, data:encodeApprove(approvalAddress, MAX_UINT256), value:0n }`.
   - Always append the Li.Fi `transactionRequest`-derived `EvmCall { family:"evm", caip2:fromCaip2, to:tx.to, data:tx.data, value:BigInt(tx.value ?? 0) }`.
7. Build the single `LifiStatusObservation` with `query.txHash: { from: "callResult", index: <bridgeCallIndex>, field: "hash" }` per PR1's `Placeholder` type. `bridgeCallIndex` is `0` (no approval) or `1` (with approval). Executor substitutes after the bridge Call submits.
8. `staleAfter = Date.now() + 25_000` (Li.Fi quotes expire ~30 s; same headroom rule as PR2's Jupiter staleAfter).

### Result lifecycle (ServerEvent emission contract)

Once the user signs + submits the source tx in `lifi-bridge-execute`, control hands to `lifi-bridge-progress`, which mounts the `LifiStatusPoller` from `observe.ts`. Poller emits via `useEmit()` from `@wishd/plugin-sdk/client/emit` (PR1's client emit bus — zustand-backed; agent UI shell subscribes alongside the server-side ServerEvent stream).

Concrete events (mirrors the `ServerEvent` types already used by uniswap's keeper-watch flow):

| Trigger | ServerEvent | Notes |
|---|---|---|
| Each poll where `status === "PENDING"` | `{ type: "notification", level: "info", title: "Bridging…", message: "Waiting on destination delivery (elapsed Xm Ys)", widgetUpdate: { id: progressId, props: { phase: "pending", elapsedMs, lastChecked, substatus } } }` | At most one notification per cadence tick. |
| `status === "DONE"` | `{ type: "result", ok: true, summary: "Received <toAmount> on <toChainLabel>", artifacts: [{ kind:"tx", caip2: fromCaip2, hash: srcTxHash }, { kind:"tx", caip2: toCaip2, hash: destTxHash }] }` | Terminal. Stops polling, marks store entry `done`. |
| `status === "FAILED"` or `"INVALID"` | `{ type: "result", ok: false, summary: "Bridge failed: <substatus>", recovery: { kind:"link", url: `https://li.quest/recovery/${srcTxHash}`, label:"Recover with Li.Fi" } }` | Terminal. Marks store entry `failed`. |
| Timeout (15 min) | `{ type: "result", ok: false, summary: "Bridge still pending after 15 minutes — check Li.Fi for progress", recovery: { kind:"link", url: `https://li.quest/tx/${srcTxHash}`, label:"View on Li.Fi" } }` | Terminal from the agent's perspective; the store entry stays `pending` so the user can re-open the widget and resume polling later. Document this asymmetry in BridgeProgress UX. |
| User navigates away | Poller `abort()`. No event emitted. Store entry retains last known state. | Mounting the widget again resumes polling. |

### PluginCtx — why `family: "evm"` is enough

`prepare()` runs server-side with `family: "evm"` ctx (its `publicClient` is for `fromCaip2`). For destination reads — strictly only required if we wanted to *verify* delivery on-chain ourselves rather than trust Li.Fi `/status` — the plugin instantiates its own SVM RPC inside `prepare.ts` / `observe.ts` using `process.env.SOLANA_RPC_URL_SERVER` (PR1 standardized this env). For v1 we don't do on-chain destination reads; `/status` is the source of truth.

This means PR1 does not need a `MultiCtx` variant. The cross-chain plugin spans families via:
- the `Manifest.chains` union (advertise),
- two `chain`-typed `IntentField`s (collect),
- per-RPC instantiation inside the plugin server module (use).

PR1's `PluginCtx` union stays `{ family: "evm" } | { family: "svm" }` — no third variant.

### Asset resolution across families

```ts
// resolveAsset.ts
export type ResolvedAsset = {
  caip19: string;                         // e.g. "eip155:1/erc20:0xA0b8..."  or  "solana:.../slip44:501"
  address: string;                        // EVM: 0x... | SVM: base58 | native marker
  decimals: number;
  isNative: boolean;
};

export function resolveAsset(caip2: string, symbol: string): Promise<ResolvedAsset>;
```

`resolveAsset` consults `CURATED_ASSETS` (CAIP-19 keyed map in `addresses.ts`) first. For EVM unknowns it falls back to `https://li.quest/v1/tokens?chains=<chainId>` (server LRU, 1 h). For SVM unknowns it consults `https://tokens.jup.ag/tokens?tags=verified` (already cached by PR2's Jupiter plugin — PR3 imports the helper from `@wishd/plugin-jupiter/server` if exported, else duplicates the small fetcher).

Returned CAIP-19 ids are passed through to Li.Fi's `fromToken` / `toToken` parameters as on-chain addresses (Li.Fi uses chain-id + on-chain address, not CAIP-19, so we strip the address out of the CAIP-19 at the REST boundary).

### Persistence (resume-after-refresh)

```ts
// store/bridgeProgressStore.ts
type BridgeRecord = {
  id: string;                 // source txHash
  config: LifiBridgeConfig;
  observation: LifiStatusObservation;   // with txHash already substituted
  startedAt: number;
  lastStatus: LifiBridgeStatus;         // "PENDING" | "DONE" | "FAILED" | "INVALID" | "TIMEOUT"
  destTxHash?: string;
  toAmountActual?: string;
  lastError?: string;
};

export const useBridgeProgressStore = create<{
  records: Record<string, BridgeRecord>;
  upsert(r: BridgeRecord): void;
  patch(id: string, p: Partial<BridgeRecord>): void;
}>()(persist(/* ... */, { name: "wishd:lifi:bridges", version: 1 }));
```

`BridgeProgress.tsx` on mount looks up its record by `id` (passed via widget props from execute step) and starts a poller if `lastStatus === "PENDING"`. If the user closes the tab during polling and reopens 5 min later, the widget rehydrates and resumes — picking up backoff cadence from where the elapsed-time math says it should be.

### Polling

```ts
// observe.ts
const DEFAULTS = { initial: 3_000, factor: 1.5, maxBackoff: 15_000, timeoutMs: 15 * 60 * 1000 };

class LifiStatusPoller {
  constructor(private obs: LifiStatusObservation, private store: BridgeProgressStoreApi, private emit: Emit) {}
  start(id: string, srcTxHash: string): AbortController {
    const ctl = new AbortController();
    let delay = this.obs.pollMs?.initial ?? DEFAULTS.initial;
    const factor = this.obs.pollMs?.factor ?? DEFAULTS.factor;
    const maxDelay = this.obs.pollMs?.maxBackoff ?? DEFAULTS.maxBackoff;
    const timeoutAt = Date.now() + (this.obs.timeoutMs ?? DEFAULTS.timeoutMs);

    const tick = async () => {
      if (ctl.signal.aborted) return;
      if (Date.now() > timeoutAt) return this.terminal(id, "TIMEOUT");

      const url = `${this.obs.endpoint}?` + new URLSearchParams({ ...this.obs.query, txHash: srcTxHash } as any);
      const res = await fetch(url, { signal: ctl.signal }).then(r => r.json()).catch(() => null);
      if (!res) {
        delay = Math.min(delay * factor, maxDelay);
        setTimeout(tick, delay);
        return;
      }
      if (res.status === "DONE")    return this.terminal(id, "DONE", res);
      if (res.status === "FAILED")  return this.terminal(id, "FAILED", res);
      if (res.status === "INVALID") return this.terminal(id, "INVALID", res);

      this.emit({ type: "notification", level: "info", title: "Bridging…", message: `Waiting on destination (status: ${res.substatus ?? "PENDING"})` });
      this.store.patch(id, { lastStatus: "PENDING" });
      delay = Math.min(delay * factor, maxDelay);
      setTimeout(tick, delay);
    };
    tick();
    return ctl;
  }
  // terminal(): emits result event + stores final state
}
```

Cadence sequence: 3s, 4.5s, 6.75s, 10.1s, 15s, 15s, 15s… (capped). Total wall-clock to hit the 15-min cap ≈ 60+ polls — acceptable client-side cost; Li.Fi `/status` is cheap and unauthenticated.

`AbortController` returned to the widget; widget's effect cleanup calls `ctl.abort()` on unmount.

### Failure modes

| Mode | Detection | UX |
|---|---|---|
| Source quote stale | `Date.now() > prepared.staleAfter` before signing | `BridgeExecute` calls `callPluginTool("lifi", "refresh_quote", { config })` (PR1 generic route helper) and re-renders summary. |
| Source tx fails to land | Wallet rejects, or tx reverts | Standard `EvmCall` execution error; no observation started; nothing persisted. |
| Source mined, bridge starts, then **bridge fails** (`status: FAILED`) | Poller terminal | Result event `ok: false`; recovery link to `https://li.quest/recovery/<srcTxHash>`. Source funds may be locked in bridge contract; Li.Fi handles refund — we link, don't drive. |
| Source mined, status `INVALID` (Li.Fi can't find tx — wrong chain id, etc.) | Poller terminal | Same as FAILED but message points to "Li.Fi could not locate the source tx; double-check the chain selection". |
| Timeout (15 min, still PENDING) | Poller terminal | Result event `ok: false`, but store entry retained `PENDING` — user can re-open widget to resume polling. Different from FAILED (recoverable client-side just by waiting). |
| User navigates / closes tab | Abort | Store retains `PENDING`; rehydrate-on-mount resumes. |

### Slippage / fee surfacing

`BridgeSummary` shows:
- **Route**: tool labels from `quote.steps` (e.g. "Across → Wormhole → Jupiter"), with logos.
- **Receive (min)**: `toAmountMin` humanized.
- **Bridge fees**: sum of `feeCosts.where(included=true).amountUSD`, with a tooltip listing each.
- **Gas**: `totalGasUSD` (source-chain submit gas estimate).
- **ETA**: `executionDuration` in human terms ("~3 min").
- **Slippage**: configured value, editable via select field.

If `priceImpactPct > 1%` (Li.Fi exposes this on swap legs), show an amber warning. If `> 5%`, require explicit "I understand" toggle before Execute is enabled. (Mirrors uniswap's high-impact gate.)

### Widgets

- `lifi-bridge-summary` (pre-confirm) — route + fees + ETA + slippage. CTA: Execute → swaps in `lifi-bridge-execute`.
- `lifi-bridge-execute` (signing) — phase machine: `connect → switch-chain (if wrong source chain connected) → preflight (refresh quote if stale) → approve (if calls.length===2) → submitting → submitted → progress`. On submission success, persists `BridgeRecord`, then renders `lifi-bridge-progress` inline.
- `lifi-bridge-progress` (polling) — rehydrates from store on mount; renders an `ExecuteTimeline` (re-uses `apps/web/components/primitives/ExecuteTimeline.tsx`) with steps `Source signed → Source confirmed → Bridge processing → Destination delivered`. On terminal success, shows source + destination tx links via `explorerTxUrl(caip2, hash)` (PR1 registry). On terminal failure, recovery link.

Per-plugin widgets (not shared with uniswap or jupiter). Visual coherence comes from `components/primitives/` + Tailwind tokens, same as PR2.

### MCP

```ts
// plugins/lifi/mcp/server.ts
export function createLifiMcp(ctx: PluginCtx /* family: "evm" */) {
  return createSdkMcpServer({
    name: "lifi",
    version: "0.0.0",
    tools: [
      tool("prepare_bridge_swap", "Prepare a Li.Fi bridge-swap. Returns LifiBridgePrepared.",
        prepareInputSchema,
        async (args) => ({ content: [{ type: "text", text: JSON.stringify(await prepareBridgeSwap({ ... })) }] })),
      tool("get_bridge_status", "Read-only proxy to Li.Fi /status by source txHash. Used for ad-hoc agent inspection.",
        statusInputSchema,
        async ({ txHash, fromChain, toChain }) => ({ content: [{ type: "text", text: JSON.stringify(await fetchLifiStatus({ txHash, fromChain, toChain })) }] })),
    ],
  });
}

// plugins/lifi/index.ts — refresh_quote registered as plugin-tool, not MCP tool
import { registerPluginTool } from "@wishd/plugin-sdk/routes";
import { refreshBridgeSwap } from "./refresh";
registerPluginTool("lifi", "refresh_quote", refreshBridgeSwap);
```

`refresh_quote` is **NOT** an MCP tool — it's a plugin-tool registered via PR1's `registerPluginTool("lifi", "refresh_quote", refreshBridgeSwap)` and called from widgets via `callPluginTool("lifi", "refresh_quote", ...)`. Same pattern as PR2's Jupiter `refresh_swap`. `get_bridge_status` IS an MCP tool — exposed to the agent so it can answer "is my bridge done?" conversationally.

## Tests

Unit (vitest, in CI):
- `prepare.test.ts` — mocked `fetch` for `/quote`; mocked `evmPublicClientFor` for allowance reads. Asserts: emitted `EvmCall[]` count (1 vs 2 with approval), `LifiStatusObservation` shape with placeholder substitution rule, `staleAfter` set, slippage forwarding.
- `observe.test.ts` — mocked `/status` returning sequence `[PENDING, PENDING, DONE]` → poller emits 2 notifications then terminal `result.ok=true`. Sequence `[PENDING, FAILED]` → `result.ok=false` with recovery link. Sequence of all `PENDING` past timeout → `TIMEOUT` terminal. Backoff cadence asserted via fake timers.
- `resolveAsset.test.ts` — curated EVM hit, curated SVM hit, EVM fallback (mocked Li.Fi tokens), SVM fallback (mocked Jupiter tokens), miss raises typed error.
- `intents.test.ts` — `validateBridgeValues` rejects SVM `fromChain`, identical in/out on same chain, bad amount.
- Type-level: `expectTypeOf(prepared.calls[0]).toMatchTypeOf<EvmCall>()`, `expectTypeOf(prepared.observations[0]).toMatchTypeOf<LifiStatusObservation>()`.

Integration: none in v1 (D6). README documents this and the rationale.

## Acceptance criteria

- `pnpm typecheck` clean across workspace including the new plugin.
- `pnpm test` green; new plugin's unit tests cover `prepare`, `observe`, `resolveAsset`, `intents`.
- Agent flow on local dev: typing "swap 10 USDC on Ethereum to SOL on Solana via Li.Fi" produces a `lifi-bridge-summary` widget; clicking Execute opens `lifi-bridge-execute`, signs via the connected EVM wallet, persists a `BridgeRecord`, transitions to `lifi-bridge-progress`, and polls until `DONE`.
- Refresh-mid-poll: closing the tab during PENDING and reopening rehydrates the widget and resumes polling.
- Failure path simulated by Li.Fi mock returning `FAILED`: `result.ok=false` event with recovery link rendered.
- `@wishd/plugin-lifi` listed in `apps/web/next.config.ts` `transpilePackages` (CLAUDE.md recurring trap).
- No new top-level deps. `viem` already in workspace; `zustand` already a dep of `apps/web` (used elsewhere).

## Demo scope

Single happy-path demo: USDC@Ethereum → SOL@Solana mainnet, $10 notional. EVM-EVM works for free (e.g. USDC@Base → USDC@Arbitrum) and is exercised in unit tests but not the live demo.

---

## Feedback to PR1 — RESOLVED

All 6 PR3 feedback items absorbed into PR1 spec on 2026-05-06 cross-review:
1. `Observation` discriminated union hosted in PR1 with `LifiStatusObservation` variant — landed in PR1 type definitions.
2. `Prepared<TExtras>` return shape `{ calls, observations?, staleAfter? }` formalized — landed in PR1 §`prepare()` output.
3. Multi-chain-field convention via `Manifest.primaryChainField` — landed in PR1 Manifest type.
4. `Placeholder` typed substitution `{ from: "callResult", index, field }` + executor contract — landed in PR1 §"Observation placeholder substitution".
5. `ServerEvent.result.recovery: { kind, url, label }` — landed in PR1 ServerEvent additions.
6. Client-side `useEmit()` from `@wishd/plugin-sdk/client/emit` — landed in PR1 §"Client surface".

## Feedback to PR2 — RESOLVED

All 5 PR3 → PR2 cross-review items resolved:
1. Jupiter token-list fetcher export — folded into shared PR1 token API (`@wishd/tokens.findByCaip19` + plugin-side fetchers as needed); PR2 exports its server-side cache helper but PR3 first checks `@wishd/tokens` before falling back.
2. SOL CAIP-19 canonical = `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` — locked in PR1 §"Tokens API". PR2 + PR3 both consume this exact form.
3. `/api/wish/[plugin]/[tool]` generic helper landed in PR1; PR2 + PR3 both consumers, no copy-paste.
4. `useWishdAccounts` exposes both families unchanged; PR2 reads only `evm` for swapper, PR3 reads both. No conflict.
5. Disambiguation min-rule keys on chain field's CAIP-2 family (per `Manifest.primaryChainField`), not field key name — landed in PR1 §"Disambiguation min-rule". Future `lifi.swap` joins `swap` cohort cleanly.

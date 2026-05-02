# Uniswap flow fixes — design

Date: 2026-05-02
Scope: P0 hackathon-demo blockers in the swap intent path (step 01 wish form + step 02 SwapSummary widget).
Approach: targeted patches (Approach A). No primitive refactor. Future cleanup deferred.

## Problem

Live audit of `https://localhost:3000/` swap flow surfaced 11 distinct bugs spanning step 01 (`WishComposer`) and step 02 (`SwapSummary` widget). The original prototype at `prototype/wishd-intent.html` is the visual / UX reference: the current `AssetPicker` diverges from it materially (no balances, broken popover positioning, multi-open). On top of UX issues, the quote pipeline corrupts decimals after a flip and the step02 frame double-renders the STEP header.

## Bug inventory

| # | Where | Bug |
|---|-------|-----|
| 1 | step02 frame | Double STEP header — outer `StepStack.STEP_LABELS` lacks swap entries (fallback `STEP / swap-summary`), AND `SwapSummary` itself renders an inner `StepCard` |
| 2 | step01 form | No flip button between `assetIn` ↔ `assetOut` |
| 3 | step02 widget | Flip `↕` button tiny, unlabeled, easy to miss |
| 4 | step02 widget | Post-flip stale state: balance prop, rate suffix, NL summary text |
| 5 | step02 widget + step01 | Token picker accepts same token both sides → broken self-swap |
| 6 | step02 widget | Post-flip ETH→USDC quote `amountOut` decimals corrupted (~10^16 too large) |
| 7 | step01 cosmetic | `AssetPicker` button `aria-label` stays `"Select asset"` after pick |
| 8 | step01 form | `AssetPicker` popover renders inline (not absolute / portal) → pushes sentence layout, multiple open at once |
| 9 | AssetPicker | No per-token balances (prototype shows them) |
| 10 | AssetPicker | No `{N} matches · ↑↓ ↵` hint, no keyboard navigation |
| 11 | AssetPicker | Anchor style mismatch: small icon-only chip vs full `ActionPill` look |

## Out of scope

- Sepolia pool liquidity / price impact realism (banner already warns).
- Multi-chain balance fanout beyond Sepolia + Ethereum mainnet.
- Refactoring `ActionPill` + `AssetPicker` into a shared `Pill`/`Popover` primitive (Approach B). Tracked as follow-up.

## Architecture

Five sections, each independently shippable but landed in a single PR.

### Section 1 — Step header dedup (#1)

`apps/web/components/workspace/StepStack.tsx`
- Add to `STEP_LABELS`:
  - `"swap-summary": { step: "STEP 02", title: "your swap, materialized", sub: "tweak amounts here. AI re-checks live." }`
  - `"swap-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" }`

`plugins/uniswap/widgets/SwapSummary.tsx`
- Drop the outer `<StepCard step="STEP 02" title="your swap, materialized" …>` wrapper. Return the inner `<div className="flex flex-col gap-3">…</div>` directly. The Sepolia banner stays as the first child.

`plugins/uniswap/widgets/SwapExecute.tsx`
- Verify whether it currently wraps in `StepCard`; if so, drop the wrapper to match.

Result: outer `StepCard` from `StepStack` provides chrome; widgets provide body. Same pattern as `CompoundSummary` / `CompoundExecute`.

### Section 2 — AssetPicker overhaul (#7, #8, #9, #10, #11)

**Anchor (pill) — #7, #11.**
- Render as a full pill matching `ActionPill` look (chevron, icon, ticker, hover border, `from`/`to` variants).
- `aria-label = value ? \`Selected ${value}\` : "Select asset"`.
- Reused unchanged in step01 (via `WishComposer.FieldPill`) and in step02 widget pay/receive sections.

**Popover — #8, #10.**
- Mounted via React portal to `document.body`. Position: absolute, computed from anchor `getBoundingClientRect()` (below; flip above on viewport overflow). Width 320px. z-index above sentence stack.
- Header row: `{N} MATCHES · ↑↓ ↵` (mono, ink-3, small).
- Search input (`type="text"`, autoFocus on open).
- Keyboard: ↑/↓ moves selection cursor, ↵ commits, Esc closes, click outside closes (existing `closeOnOutsideMouseDown` listener extended to recognise portal).
- Rows: `[icon] [TICKER] [name muted] · · · [balance mono]`. Loading → `…`. Zero → `0`. Errored or no address → `—`.

**Single-open mutex — #8b.**
- `AssetPicker` accepts `open: boolean` + `onOpenChange(o: boolean)` props (same shape as `ActionPill`).
- `WishComposer` passes `open={openPillKey === field.key}` / `onOpenChange={(o) => setOpenPillKey(o ? field.key : null)}` for asset fields.
- `SwapSummary` keeps a local mutex `useState<"in" | "out" | null>` for its two pickers.

**Balances — #9.**
- New endpoint `GET /api/wallet/balances?address=0x..&chainId=11155111&tokens=ETH,USDC,WETH,UNI` → `{ ETH: "0.842", USDC: "1248.55", … }` (already-formatted decimal strings).
- Server uses `apps/web/server/uniswapClients.ts` `publicClient(chainId)`. Native: `getBalance`. ERC20: `multicall(balanceOf)` over registered token addresses. Decimals + addresses pulled from `ASSET_OPTIONS` in `plugins/uniswap/intents.ts` (or its address registry).
- Client hook `apps/web/lib/useBalances.ts`: SWR-backed, 30s dedupe. Cache key = `address + chainId + sorted(tokens).join(',')`.
- `AssetPicker` calls `useBalances(chainId, address, tokens)`; passes `balanceByToken` map to rows.
- Token list source: registry in `plugins/uniswap/intents.ts` (`ASSET_OPTIONS`). Always show all tokens; do not filter by non-zero balance.
- Balance precision: `formatBalance(value, decimals)` → 4 sig figs for `value > 1`, 6 for `value < 1`. Examples: `1,248.55`, `0.842`, `0.000122`.

### Section 3 — Step01 flip + same-token guard (#2, #5)

**Step01 flip button (#2).**
- New primitive `apps/web/components/primitives/FlipButton.tsx`: small circular button (~28px), `↕` icon, `aria-label="swap direction"`, native `title` tooltip.
- In `WishComposer`'s `renderSentenceParts` loop: when `schema.intent === "uniswap.swap"` and the part is the connector between `assetIn` and `assetOut`, render `<FlipButton onClick={flipAssets} />` immediately after the connector text (still inside `<SentenceConnector>` slot).
- `flipAssets`: `setValues((s) => ({ ...s, assetIn: s.assetOut, assetOut: s.assetIn }))`. No quote in step01, so no further state.

**Same-token guard (#5) — applies to BOTH step01 and widget.**
- Helper exported from `plugins/uniswap/intents.ts`:
  ```ts
  export function applyAssetChange(
    side: "in" | "out",
    next: string,
    prev: { assetIn: string; assetOut: string },
  ): { assetIn: string; assetOut: string };
  ```
  - If `side === "in"` and `next === prev.assetOut` → return `{ assetIn: next, assetOut: prev.assetIn }` (auto-flip).
  - Else if `side === "in"` → `{ ...prev, assetIn: next }`.
  - Symmetric for `side === "out"`.
- `WishComposer.setField`: when key is `assetIn` or `assetOut`, route through `applyAssetChange`.
- `SwapSummary`: `setAssetIn` / `setAssetOut` callbacks of the two `AssetPicker`s route through `applyAssetChange`.
- Existing `validateSwapValues` stays as defense-in-depth on submit.

### Section 4 — Widget flip polish + decimals (#3, #4, #6)

**#3 Flip button polish.** `apps/web/components/primitives/WidgetCard.tsx` `SwapDir` slot:
- Bigger circle (40×40), border ink, accent bg on hover, rotating arrow icon, `aria-label="reverse swap direction"`, `title="swap direction"`.

**#4 Stale state after flip.** `plugins/uniswap/widgets/SwapSummary.tsx`:
- Replace the `balance` prop reading with `useBalances(chainId, swapper, [assetIn, assetOut])` hook (added in §2). Re-renders on `assetIn` change. Drop `balance` from prop dependency for display (keep prop as initial fallback only).
- Stop appending `${assetOut}/${assetIn}` to the `quote.rate` string in the stats row. Server already returns the rate as `"1 USDC = 0.000122 ETH"`. Render plain `quote.rate`.
- While `quoteQuery.isFetching`, show `…` not just for `amountOut` and `min received` but also for rate, route, network fee, and the safety panel `balanceChanges` row for the new from-token.
- NL summary at bottom (currently sourced from server `chat.delta`): hide it whenever local `[amountIn, assetIn, assetOut, slippageBps]` diverges from `[config.amountIn, config.assetIn, config.assetOut, config.slippageBps]`. Replace with the static text `"edit pending — re-running checks…"` until the next narration arrives. (Server narration is per-prepare and won't auto-refresh on local edits, so we mute it instead of letting it stale.)

**#6 Quote decimals corrupted.** `plugins/uniswap/prepare.ts`:
- Diagnose first: read the quote-formatting section. Suspected cause is `formatUnits(rawOut, tokenIn.decimals)` instead of `tokenOut.decimals` when the in/out roles flip.
- Fix: every `formatUnits` call must be keyed by the correct token (`tokenIn.decimals` for `amountIn`-side raw values, `tokenOut.decimals` for `amountOut` and `amountOutMin`).
- Add a unit test in `prepare.test.ts` covering both directions of the same pair: `0.1 ETH → USDC` and `0.1 USDC → ETH`. Each direction asserts the formatted `amountOut` is in the right order of magnitude.

### Section 5 — Testing, risk, file map

See "Verification" and "File touch map" below.

## Verification

**Unit tests (vitest):**
- `plugins/uniswap/intents.test.ts` — `applyAssetChange` (4 cases: in matches out, out matches in, both no-op, both arbitrary).
- `plugins/uniswap/prepare.test.ts` — quote `0.1 ETH → USDC` returns USDC value with 6-decimal scale (e.g. ~`100..400` not `~10^16`); quote `0.1 USDC → ETH` returns ETH value with 18-decimal scale (e.g. ~`1e-5`).
- `apps/web/test/AssetPicker.test.tsx` (NEW, smoke) — picker opens, renders 4 token rows, search filters, selecting commits + closes; portal positioning skipped (jsdom-limited).

**Manual chrome-devtools demo flow:**
1. Pick swap intent in step01.
2. Click `assetIn` pill → portal popover opens, balances visible, `8 MATCHES · ↑↓ ↵` header.
3. Pick USDC for `assetIn` while `assetOut === USDC` → `assetOut` auto-flips to ETH.
4. Click flip button in step01 → `assetIn`/`assetOut` swap.
5. Submit → step02 renders with single STEP 02 header (no `STEP / swap-summary`).
6. In widget, click `↕` → balance updates to new from-token, rate text not corrupted.
7. Quote shows realistic decimals both pre- and post-flip.

## Risk

- Portal click-outside in jsdom is flaky — covered manually, smoke unit only.
- `useBalances` SWR cache must include `address` + `chainId` in key; otherwise picker shows stale balances when wallet changes.
- `prepare.ts` decimal fix risks regressing already-working `0.1 USDC → ETH` quote — both-direction test covers.
- `applyAssetChange` symmetry: covered by unit test.

## Rollout

Single PR. No feature flag. Demo-blocking, ships to main once green. No data migration.

## File touch map

```
apps/web/
  app/api/wallet/balances/route.ts            NEW
  components/wish/AssetPicker.tsx              REWRITE
  components/wish/WishComposer.tsx             EDIT  (mutex, flip in sentence, applyAssetChange)
  components/workspace/StepStack.tsx           EDIT  (STEP_LABELS for swap-*)
  components/primitives/FlipButton.tsx         NEW
  components/primitives/WidgetCard.tsx         EDIT  (SwapDir polish)
  lib/useBalances.ts                           NEW
  test/AssetPicker.test.tsx                    NEW   (smoke)

plugins/uniswap/
  intents.ts                                   EDIT  (export applyAssetChange)
  intents.test.ts                              EDIT  (test applyAssetChange)
  prepare.ts                                   EDIT  (decimals fix)
  prepare.test.ts                              EDIT  (both-direction quote test)
  widgets/SwapSummary.tsx                      EDIT  (drop StepCard, useBalances, applyAssetChange, drop rate suffix, stale-edit handling)
  widgets/SwapExecute.tsx                      EDIT  (drop StepCard if present)
```

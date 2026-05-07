"use client";

import { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { WidgetCard } from "../../../apps/web/components/primitives/WidgetCard";
import { AICheckPanel } from "../../../apps/web/components/primitives/AICheckPanel";
import { AssetPicker } from "../../../apps/web/components/wish/AssetPicker";
import { useWorkspace } from "../../../apps/web/store/workspace";
import { applyAssetChange } from "../intents";
import { useBalances } from "../../../apps/web/lib/useBalances";
import type { SwapQuote, SwapConfig, Call, KeeperOffer } from "../types";

// ---------------------------------------------------------------------------
// Inline helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const is4xx = (err: unknown): boolean =>
  err instanceof HttpError
    ? err.status >= 400 && err.status < 500
    : err instanceof Error
    ? /\b4\d\d\b/.test(err.message)
    : false;

// ---------------------------------------------------------------------------
// useDebounce
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SwapSummaryProps = {
  config: SwapConfig;
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  approvalCall: Call | null;
  balance: string;
  insufficient: boolean;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];
  summaryId: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwapSummary(props: SwapSummaryProps) {
  const { config, initialQuote, initialQuoteAt, approvalCall, keeperOffers, summaryId } = props;

  const [amountIn, setAmountIn] = useState(config.amountIn);
  const [assetIn, setAssetIn] = useState(config.assetIn);
  const [assetOut, setAssetOut] = useState(config.assetOut);
  const [slippageBps, setSlippageBps] = useState(config.slippageBps);
  const [submitting, setSubmitting] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [openPicker, setOpenPicker] = useState<"in" | "out" | null>(null);

  const debouncedAmount = useDebounce(amountIn, 300);
  const executing = useWorkspace((s) => s.executing);

  const { chainId, swapper, tokenIn, tokenOut } = config;

  const liveBalances = useBalances({ chainId, address: swapper, tokens: [assetIn, assetOut] });
  const balance = liveBalances.balances[assetIn] ?? props.balance;

  const quoteQuery = useQuery<SwapQuote>({
    queryKey: ["uniswap.quote", chainId, tokenIn, tokenOut, debouncedAmount, swapper, slippageBps, assetIn, assetOut],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const r = await fetch("/api/uniswap/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId,
          tokenIn,
          tokenOut,
          amountIn: debouncedAmount,
          swapper,
          slippageBps,
          assetIn,
          assetOut,
        }),
        signal,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new HttpError(r.status, (body as { error?: string }).error ?? r.statusText);
      }
      return r.json() as Promise<SwapQuote>;
    },
    initialData: initialQuote,
    initialDataUpdatedAt: initialQuoteAt,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: (n: number, err: unknown) => n < 2 && !is4xx(err),
  });

  const quote = quoteQuery.data ?? initialQuote;
  // Recompute insufficient from live balance + amount; the server-prepared
  // props.insufficient is keyed to the initial (assetIn, amountIn) pair and
  // becomes stale after any local edit (token flip, amount change).
  const insufficient = (() => {
    const b = parseFloat(balance);
    const a = parseFloat(amountIn);
    if (!Number.isFinite(b) || !Number.isFinite(a)) return false;
    return a > b;
  })();
  const ctaDisabled = submitting || executing || insufficient || !quoteQuery.data || !!quoteQuery.error;

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

  useEffect(() => {
    if (quoteQuery.data && !quoteQuery.isFetching) setEditPending(false);
  }, [quoteQuery.data, quoteQuery.isFetching]);

  function handleExecute() {
    if (ctaDisabled) return;
    setSubmitting(true);
    window.dispatchEvent(
      new CustomEvent("wishd:wish", {
        detail: {
          wish: `execute swap ${summaryId}`,
          account: { address: swapper, chainId },
          context: {
            summaryId,
            prepared: {
              config: {
                ...config,
                assetIn,
                assetOut,
                amountIn: amountIn,
                slippageBps,
              },
              initialQuote: quoteQuery.data ?? initialQuote,
              initialQuoteAt: Date.now(),
              approvalCall,
              balance,
              insufficient,
              liquidityNote: props.liquidityNote,
              keeperOffers,
              summaryId,
            },
          },
        },
      }),
    );
    setTimeout(() => setSubmitting(false), 1000);
  }

  const txCount = approvalCall ? "2 TX" : "1 TX";

  return (
    <div className="flex flex-col gap-3">
        {/* Sepolia banner */}
        {chainId === 11155111 && (
          <div className="rounded-sm bg-warn-2 border border-warn px-3 py-2 text-sm text-ink-2">
            {props.liquidityNote ?? "testnet (Sepolia) — liquidity is thin. large slippage expected."}
          </div>
        )}

        <WidgetCard>
          <WidgetCard.Head name="swap" badge={`UNISWAP · ${txCount}`} />

          {/* Pay section */}
          <WidgetCard.PaySection>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5 flex justify-between">
              <span>you pay</span>
              <span className="font-mono text-[11px] text-ink-3">balance: {balance} {assetIn}</span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                className="font-hand text-[38px] font-bold leading-none bg-transparent outline-none w-full min-w-0"
                aria-label="amount in"
              />
              <div className="flex-shrink-0">
                <AssetPicker
                  chainId={chainId}
                  value={assetIn}
                  onChange={setAssetInGuarded}
                  address={swapper}
                  variant="from"
                  open={openPicker === "in"}
                  onOpenChange={(o) => setOpenPicker(o ? "in" : null)}
                />
              </div>
            </div>
          </WidgetCard.PaySection>

          {/* Flip direction */}
          <WidgetCard.SwapDir onFlip={handleFlip} />

          {/* Receive section */}
          <WidgetCard.ReceiveSection>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5">
              you receive
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="font-hand text-[38px] font-bold leading-none">
                {quoteQuery.isFetching ? (
                  <span className="text-ink-3 text-[24px]">…</span>
                ) : (
                  quote.amountOut
                )}
              </div>
              <div className="flex-shrink-0">
                <AssetPicker
                  chainId={chainId}
                  value={assetOut}
                  onChange={setAssetOutGuarded}
                  address={swapper}
                  variant="to"
                  open={openPicker === "out"}
                  onOpenChange={(o) => setOpenPicker(o ? "out" : null)}
                />
              </div>
            </div>
            {quote.amountOutMin && (
              <div className="font-mono text-xs text-ink-3 mt-1">
                min received: {quote.amountOutMin} {assetOut}
              </div>
            )}
          </WidgetCard.ReceiveSection>

          {/* Stats row */}
          <WidgetCard.Stats
            items={[
              { k: "rate", v: quote.rate || "—" },
              { k: "min received", v: quote.amountOutMin ? `${quote.amountOutMin} ${assetOut}` : "—" },
              { k: "route", v: quote.route || "—" },
              { k: "network fee", v: quote.gasFeeUSD ? `~$${quote.gasFeeUSD}` : (quote.networkFee ?? "—") },
            ]}
          />

          {/* Slippage row */}
          <div className="px-4 py-2.5 border-t border-rule flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">slippage</span>
            <input
              type="number"
              min={1}
              max={5000}
              value={slippageBps}
              onChange={(e) => setSlippageBps(Number(e.target.value))}
              className="w-16 font-mono text-xs bg-transparent border border-rule rounded px-1.5 py-0.5 outline-none text-ink"
              aria-label="slippage bps"
            />
            <span className="font-mono text-[10px] text-ink-3">bps ({(slippageBps / 100).toFixed(2)}%)</span>
          </div>

          {/* Insufficient balance warning */}
          {insufficient && (
            <div className="mx-4 my-3 rounded-sm bg-warn-2 border border-warn p-3 text-sm text-ink-2">
              insufficient {assetIn} balance. you have {balance} but need {amountIn}.
              fund the wallet and re-wish.
            </div>
          )}

          {/* Query error */}
          {quoteQuery.error && !quoteQuery.isFetching && (
            <div className="mx-4 my-3 rounded-sm bg-[#FDEAEA] border border-bad p-3 text-sm text-ink-2">
              quote failed: {(quoteQuery.error as Error).message}
            </div>
          )}

          <WidgetCard.Cta>
            <button
              type="button"
              onClick={handleExecute}
              disabled={ctaDisabled}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-accent border-2 border-ink text-ink py-3 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {insufficient
                ? "insufficient balance"
                : submitting
                ? "preparing…"
                : quoteQuery.isFetching
                ? "refreshing quote…"
                : "execute →"}
            </button>
          </WidgetCard.Cta>
        </WidgetCard>

        <AICheckPanel
          status={quoteQuery.isFetching ? "live" : "stale"}
          title="safety check"
          sub="reading wallet + quote + sim"
          balanceChanges={[
            { sign: "-", token: assetIn, amount: `${amountIn}` },
            { sign: "+", token: assetOut, amount: quote.amountOut },
          ]}
          safety={[
            { ok: true, text: `chain ${chainId} · swapper ${swapper.slice(0, 10)}…` },
            approvalCall
              ? { ok: false, text: "needs ERC-20 approval before swap" }
              : { ok: true, text: "no approval needed — allowance sufficient" },
            insufficient
              ? { ok: false, text: `balance ${balance} ${assetIn} < ${amountIn}` }
              : { ok: true, text: `balance covers amount (${balance} ${assetIn})` },
            quote.priceImpactBps !== undefined
              ? {
                  ok: quote.priceImpactBps < 100,
                  text: `price impact: ${(quote.priceImpactBps / 100).toFixed(2)}%`,
                }
              : { ok: true, text: "price impact data not available" },
          ]}
        />

        {/* NL summary — hidden while user is making edits */}
        {editPending ? (
          <div className="font-mono text-[11px] text-ink-3 px-2">edit pending — re-running checks…</div>
        ) : null}

        {/* Keeper offers — only for non-trivial swaps */}
        {(() => {
          const a = parseFloat(amountIn);
          const isStableIn = ["USDC", "USDT", "DAI"].includes(assetIn);
          const minAmount = isStableIn ? 50 : 0.05;
          const showOffers = Number.isFinite(a) && a >= minAmount && keeperOffers.length > 0;
          if (!showOffers) return null;
          return (
            <div className="border-[1.5px] border-dashed border-ink rounded-2xl bg-bg p-4">
              <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-3 mb-2">
                better execution options
              </div>
              {keeperOffers.map((offer, i) => (
                <div
                  key={i}
                  className={[
                    "flex items-start gap-2 p-2.5 rounded-sm border border-rule mb-1.5 text-sm",
                    offer.featured ? "bg-accent-2 border-accent" : "bg-surface-2",
                  ].join(" ")}
                >
                  <div className="flex-1">
                    <div className="font-semibold text-ink">{offer.title}</div>
                    <div className="text-xs text-ink-3 mt-0.5">{offer.desc}</div>
                    {offer.why && (
                      <div className="text-xs text-ink-2 mt-1 italic">why: {offer.why}</div>
                    )}
                  </div>
                  {offer.featured && (
                    <span className="font-mono text-[9px] bg-accent border border-ink rounded-sm px-1.5 py-0.5 flex-shrink-0">
                      featured
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
  );
}

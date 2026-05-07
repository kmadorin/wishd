"use client";

import { useState } from "react";
import { WidgetCard } from "../../../apps/web/components/primitives/WidgetCard";
import { AICheckPanel } from "../../../apps/web/components/primitives/AICheckPanel";
import type { LifiBridgePrepared } from "../types";
import { BridgeExecute } from "./BridgeExecute";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type BridgeSummaryProps = {
  prepared: LifiBridgePrepared;
  onExecute?: () => void;
  onRefresh?: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "instant";
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
  const mins = Math.round(seconds / 60);
  return `~${mins} min`;
}

function chainLabel(caip2: string): string {
  if (caip2.startsWith("solana:")) return "Solana";
  const id = caip2.startsWith("eip155:") ? Number(caip2.slice(7)) : NaN;
  switch (id) {
    case 1: return "Ethereum";
    case 8453: return "Base";
    case 42161: return "Arbitrum";
    case 10: return "Optimism";
    case 137: return "Polygon";
    default: return caip2;
  }
}

function formatAtomic(atomic: string | bigint, decimals: number, maxFrac = 6): string {
  try {
    const a = typeof atomic === "bigint" ? atomic : BigInt(atomic);
    const base = 10n ** BigInt(decimals);
    const whole = a / base;
    const frac = a % base;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return String(atomic);
  }
}

type TokenInfo = { symbol: string; decimals: number };

function readSideTokens(quote: any): { from: TokenInfo; to: TokenInfo } {
  const steps = (quote?.steps ?? []) as any[];
  const first = steps[0]?.action;
  const last = steps[steps.length - 1]?.action;
  const from: TokenInfo = {
    symbol: first?.fromToken?.symbol ?? "?",
    decimals: Number(first?.fromToken?.decimals ?? 18),
  };
  const to: TokenInfo = {
    symbol: last?.toToken?.symbol ?? "?",
    decimals: Number(last?.toToken?.decimals ?? 9),
  };
  return { from, to };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BridgeSummary({ prepared, onExecute, onRefresh }: BridgeSummaryProps) {
  const { quote, staleAfter, totalFeeUSD, totalGasUSD, estimatedDurationSec, routeNote, config, calls, insufficient, balance } = prepared;

  const [slippage, setSlippage] = useState(
    config.slippage <= 0.001 ? "0.1%" : config.slippage <= 0.005 ? "0.5%" : "1%",
  );
  const [highImpactAck, setHighImpactAck] = useState(false);
  const [executing, setExecuting] = useState(false);

  // When the parent (registry) provides no onExecute, fall through to the
  // built-in BridgeExecute widget. The summary stays mounted but swaps its
  // CTA panel for the multi-call signing flow.
  function handleExecute() {
    if (onExecute) onExecute();
    else setExecuting(true);
  }
  if (executing) return <BridgeExecute prepared={prepared} />;

  const isStale = staleAfter !== undefined && Date.now() > staleAfter;
  const priceImpactPct: number = (quote as any).priceImpactPct ?? 0;
  const needsHighImpactAck = priceImpactPct > 5;

  const executeDisabled = isStale || (needsHighImpactAck && !highImpactAck) || !!insufficient;

  const tokens = readSideTokens(quote);
  const fromAmountHuman = formatAtomic(quote.fromAmount, tokens.from.decimals);
  const balanceHuman = balance && balance !== "0" ? formatAtomic(balance, tokens.from.decimals, 4) : null;
  const toAmountHuman = formatAtomic(quote.toAmount, tokens.to.decimals);
  const toAmountMinHuman = formatAtomic(quote.toAmountMin, tokens.to.decimals);

  // Implied rate: how many `to` tokens per 1 `from` token
  const rate = (() => {
    try {
      const fA = parseFloat(fromAmountHuman);
      const tA = parseFloat(toAmountHuman);
      if (!Number.isFinite(fA) || !Number.isFinite(tA) || fA === 0) return null;
      const ratio = tA / fA;
      const rounded = ratio >= 1 ? ratio.toFixed(4) : ratio.toFixed(6);
      return `1 ${tokens.from.symbol} ≈ ${rounded} ${tokens.to.symbol}`;
    } catch { return null; }
  })();

  const routeLabel = routeNote
    ?? (quote.steps as any[])?.map((s) => s.toolDetails?.name).filter(Boolean).join(" → ")
    ?? "—";

  const txCount = (calls?.length ?? 1) >= 2 ? "2 TX" : "1 TX";
  const fromChain = chainLabel(config.fromCaip2);
  const toChain = chainLabel(config.toCaip2);
  const hasApproval = (calls?.length ?? 1) >= 2;

  return (
    <div className="flex flex-col gap-3">
      <WidgetCard>
        <WidgetCard.Head name="bridge" badge={`LI.FI · ${txCount}`} />

        {/* Pay */}
        <WidgetCard.PaySection>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5 flex justify-between items-center">
            <span>you bridge</span>
            <span className="font-mono text-[11px] text-ink-3">
              {balanceHuman ? `balance: ${balanceHuman} ${tokens.from.symbol} · ` : ""}{fromChain}
            </span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="font-hand text-[38px] font-bold leading-none">{fromAmountHuman}</div>
            <span className="inline-flex items-center gap-1.5 bg-surface-2 border-[1.5px] border-ink rounded-pill px-2.5 py-1 font-bold text-sm">
              {tokens.from.symbol}
            </span>
          </div>
        </WidgetCard.PaySection>

        {/* Direction (one-way — no flip) */}
        <div className="flex justify-center items-center p-2 bg-surface-2 border-y border-rule">
          <div
            aria-hidden
            className="w-10 h-10 rounded-full border-[1.5px] border-ink bg-surface-2 flex items-center justify-center text-lg shadow-cardSm"
            title={`${fromChain} → ${toChain}`}
          >
            ↓
          </div>
        </div>

        {/* Receive */}
        <WidgetCard.ReceiveSection>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5 flex justify-between items-center">
            <span>you receive</span>
            <span className="font-mono text-[11px] text-ink-3">{toChain}</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="font-hand text-[38px] font-bold leading-none">{toAmountHuman}</div>
            <span className="inline-flex items-center gap-1.5 bg-surface-2 border-[1.5px] border-ink rounded-pill px-2.5 py-1 font-bold text-sm">
              {tokens.to.symbol}
            </span>
          </div>
          <div className="font-mono text-xs text-ink-3 mt-1" data-testid="receive-min">
            min received: {toAmountMinHuman} {tokens.to.symbol}
          </div>
        </WidgetCard.ReceiveSection>

        {/* Stats grid (2-col) — preserves data-testids for tests */}
        <div className="grid grid-cols-2 border-t border-rule">
          <div className="px-3.5 py-2.5 border-r border-rule border-b">
            <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px]">rate</div>
            <div className="font-hand text-[15px] font-bold">{rate ?? "—"}</div>
          </div>
          <div className="px-3.5 py-2.5 border-b border-rule">
            <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px]">route</div>
            <div className="font-hand text-[15px] font-bold truncate">{routeLabel}</div>
          </div>
          <div className="px-3.5 py-2.5 border-r border-rule" data-testid="bridge-fees">
            <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px]">bridge fee</div>
            <div className="font-hand text-[17px] font-bold">${totalFeeUSD}</div>
          </div>
          <div className="px-3.5 py-2.5" data-testid="gas-cost">
            <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px]">network fee</div>
            <div className="font-hand text-[17px] font-bold">${totalGasUSD}</div>
          </div>
          <div className="px-3.5 py-2.5 border-r border-rule border-t" data-testid="eta">
            <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px]">eta</div>
            <div className="font-hand text-[17px] font-bold">{formatDuration(estimatedDurationSec)}</div>
          </div>
          <div className="px-3.5 py-2.5 border-t border-rule">
            <label
              htmlFor="lifi-slippage"
              className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px] block"
            >
              slippage
            </label>
            <select
              id="lifi-slippage"
              aria-label="slippage"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              className="font-hand text-[15px] font-bold bg-transparent border border-rule rounded px-1.5 py-0.5 text-ink outline-none"
            >
              <option value="0.1%">0.1%</option>
              <option value="0.5%">0.5%</option>
              <option value="1%">1%</option>
            </select>
          </div>
        </div>

        {/* High price impact warning */}
        {needsHighImpactAck && (
          <div className="mx-4 my-3 rounded-sm bg-warn-2 border border-warn p-3 text-sm text-ink-2">
            <div className="font-semibold mb-1">
              High price impact ({priceImpactPct.toFixed(1)}%) — this may result in significant slippage
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                aria-label="I understand"
                checked={highImpactAck}
                onChange={(e) => setHighImpactAck(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs">I understand the risk</span>
            </label>
          </div>
        )}

        {/* Insufficient balance warning */}
        {insufficient && (
          <div className="mx-4 my-3 rounded-sm bg-warn-2 border border-warn px-3 py-2 text-sm text-ink-2">
            insufficient {tokens.from.symbol} balance
            {balanceHuman ? ` — you have ${balanceHuman} ${tokens.from.symbol} but need ${fromAmountHuman}` : ""}.
            fund the wallet and re-wish.
          </div>
        )}

        {/* Stale warning */}
        {isStale && (
          <div className="mx-4 my-3 rounded-sm bg-warn-2 border border-warn px-3 py-2 text-sm text-ink-2">
            Quote expired — refresh to get a new price
          </div>
        )}

        <WidgetCard.Cta>
          <div className="flex gap-2">
            {isStale && (
              <button
                type="button"
                onClick={onRefresh}
                className="flex-1 rounded-pill border-[1.5px] border-rule px-3.5 py-2.5 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
              >
                Refresh quote
              </button>
            )}
            <button
              type="button"
              onClick={handleExecute}
              disabled={executeDisabled}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-pill bg-accent border-2 border-ink text-ink py-3 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {insufficient ? "insufficient balance" : hasApproval ? "Approve & bridge →" : "Execute →"}
            </button>
          </div>
        </WidgetCard.Cta>
      </WidgetCard>

      <AICheckPanel
        status={isStale ? "stale" : "live"}
        title="bridge safety check"
        sub="reading quote + route + allowance"
        balanceChanges={[
          { sign: "-", token: tokens.from.symbol, amount: fromAmountHuman },
          { sign: "+", token: tokens.to.symbol, amount: toAmountHuman },
        ]}
        safety={[
          { ok: true, text: `${fromChain} → ${toChain} via ${routeLabel}` },
          hasApproval
            ? { ok: false, text: `requires ${tokens.from.symbol} approval before bridge` }
            : { ok: true, text: "no approval needed — allowance sufficient" },
          {
            ok: !needsHighImpactAck,
            text: needsHighImpactAck
              ? `high price impact: ${priceImpactPct.toFixed(2)}%`
              : `min received: ${toAmountMinHuman} ${tokens.to.symbol}`,
          },
          { ok: !isStale, text: isStale ? "quote expired — refresh required" : `quote fresh — ${formatDuration(estimatedDurationSec)} ETA` },
        ]}
      />
    </div>
  );
}

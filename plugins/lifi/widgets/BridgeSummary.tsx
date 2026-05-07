"use client";

import { useState } from "react";
import type { LifiBridgePrepared } from "../types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type BridgeSummaryProps = {
  prepared: LifiBridgePrepared;
  onExecute: () => void;
  onRefresh: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `~${mins} min`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BridgeSummary({ prepared, onExecute, onRefresh }: BridgeSummaryProps) {
  const { quote, staleAfter, totalFeeUSD, totalGasUSD, estimatedDurationSec, routeNote, config } = prepared;

  const [slippage, setSlippage] = useState(
    config.slippage <= 0.001 ? "0.1%" : config.slippage <= 0.005 ? "0.5%" : "1%",
  );
  const [highImpactAck, setHighImpactAck] = useState(false);

  const isStale = staleAfter !== undefined && Date.now() > staleAfter;
  const priceImpactPct: number = (quote as any).priceImpactPct ?? 0;
  const needsHighImpactAck = priceImpactPct > 5;

  const executeDisabled = isStale || (needsHighImpactAck && !highImpactAck);

  // Build route label from steps
  const routeLabel = routeNote
    ?? quote.steps.map((s) => s.toolDetails.name).join(" → ")
    ?? "—";

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl border border-rule bg-bg">
      {/* Route */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">route</span>
        <span className="text-sm font-medium text-ink">{routeLabel}</span>
      </div>

      {/* Receive min */}
      <div className="flex items-center justify-between" data-testid="receive-min">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">receive (min)</span>
        <span className="text-sm text-ink">{quote.toAmountMin}</span>
      </div>

      {/* Bridge fees */}
      <div className="flex items-center justify-between" data-testid="bridge-fees">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">bridge fees</span>
        <span className="text-sm text-ink">${totalFeeUSD}</span>
      </div>

      {/* Gas */}
      <div className="flex items-center justify-between" data-testid="gas-cost">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">gas</span>
        <span className="text-sm text-ink">${totalGasUSD}</span>
      </div>

      {/* ETA */}
      <div className="flex items-center justify-between" data-testid="eta">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">ETA</span>
        <span className="text-sm text-ink">{formatDuration(estimatedDurationSec)}</span>
      </div>

      {/* Slippage select */}
      <div className="flex items-center justify-between">
        <label
          htmlFor="lifi-slippage"
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3"
        >
          slippage
        </label>
        <select
          id="lifi-slippage"
          aria-label="slippage"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
          className="font-mono text-xs bg-surface-2 border border-rule rounded px-2 py-0.5 text-ink outline-none"
        >
          <option value="0.1%">0.1%</option>
          <option value="0.5%">0.5%</option>
          <option value="1%">1%</option>
        </select>
      </div>

      {/* High price impact warning */}
      {needsHighImpactAck && (
        <div className="rounded-sm bg-warn-2 border border-warn p-3 text-sm text-ink-2">
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

      {/* Stale warning */}
      {isStale && (
        <div className="rounded-sm bg-warn-2 border border-warn px-3 py-2 text-sm text-ink-2">
          Quote expired — refresh to get a new price
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-2 mt-1">
        {isStale && (
          <button
            type="button"
            onClick={onRefresh}
            className="flex-1 rounded-pill border-[1.5px] border-rule px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
          >
            Refresh quote
          </button>
        )}
        <button
          type="button"
          onClick={onExecute}
          disabled={executeDisabled}
          className="flex-1 rounded-pill bg-accent border-2 border-ink text-ink py-2 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
        >
          Execute →
        </button>
      </div>
    </div>
  );
}

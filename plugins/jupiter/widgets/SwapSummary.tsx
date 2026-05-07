"use client";

import { humanizeChain, SOLANA_MAINNET, useEmit } from "@wishd/plugin-sdk";
import { WidgetCard } from "../../../apps/web/components/primitives/WidgetCard";
import type { JupiterSwapPrepared } from "../types";

function formatUnits(atoms: bigint, decimals: number): string {
  const s = atoms.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export type JupiterSwapSummaryProps = {
  id: string;
  prepared: JupiterSwapPrepared;
};

export function JupiterSwapSummary({ id, prepared }: JupiterSwapSummaryProps) {
  const emit = useEmit();
  const { config, initialQuote, decimalsOut, balance, insufficient, liquidityNote } = prepared;
  const route = initialQuote.routePlan.map((r) => r.swapInfo.label).join(" → ") || "direct";
  const outDisplay = formatUnits(BigInt(initialQuote.outAmount), decimalsOut);
  const slippage = config.dynamicSlippage ? "auto" : `${(config.slippageBps / 100).toFixed(2)}%`;

  function onExecute() {
    emit({
      type: "ui.render",
      widget: {
        id: `${id}-execute`,
        type: "jupiter-swap-execute",
        slot: "flow",
        props: { id: `${id}-execute`, prepared },
      },
    });
  }

  return (
    <WidgetCard>
      <div className="flex flex-col gap-3 p-4">
        <header className="text-sm text-neutral-500">
          Swap on {humanizeChain(SOLANA_MAINNET)}
        </header>
        <div className="text-xl font-medium">
          {config.assetIn} → {config.assetOut}
        </div>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-neutral-500">Route</dt>
          <dd>{route}</dd>
          <dt className="text-neutral-500">Estimated out</dt>
          <dd>{outDisplay} {config.assetOut}</dd>
          <dt className="text-neutral-500">Price impact</dt>
          <dd>{initialQuote.priceImpactPct}%</dd>
          <dt className="text-neutral-500">Slippage</dt>
          <dd>{slippage}</dd>
          <dt className="text-neutral-500">Balance</dt>
          <dd>{balance} {config.assetIn}</dd>
        </dl>
        {liquidityNote && <p className="text-xs text-amber-600">{liquidityNote}</p>}
        {insufficient && <p className="text-xs text-red-600">Insufficient {config.assetIn} balance.</p>}
        <button
          type="button"
          onClick={onExecute}
          disabled={insufficient}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Execute
        </button>
      </div>
    </WidgetCard>
  );
}

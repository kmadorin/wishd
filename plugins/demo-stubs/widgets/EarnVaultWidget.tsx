"use client";
import * as React from "react";

type Props = { amount?: string; asset: string; chain: string };

const VAULTS = [
  { name: "Morpho",   apy: "8.4%", tvl: "$420M", risk: "low" },
  { name: "Aave V3",  apy: "5.1%", tvl: "$2.1B", risk: "very low" },
  { name: "Compound V3", apy: "4.7%", tvl: "$1.2B", risk: "very low" },
  { name: "Yearn",    apy: "9.8%", tvl: "$180M", risk: "medium" },
];

export function EarnVaultWidget({ amount, asset, chain }: Props) {
  return (
    <div className="rounded-lg border border-rule bg-bg-2 p-4 text-sm font-mono">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>earn · {asset} · {chain}</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">DEMO ONLY</span>
      </div>
      <div className="mt-3 space-y-2">
        {VAULTS.map((v) => (
          <div key={v.name} className="flex items-center justify-between rounded-md border border-rule px-3 py-2">
            <span>{v.name}</span>
            <span className="text-ink-2">{v.apy} · TVL {v.tvl} · risk {v.risk}</span>
          </div>
        ))}
      </div>
      {amount ? <div className="mt-3 text-xs text-ink-2">deposit amount: {amount} {asset}</div> : null}
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-pill bg-bg-1 border border-rule px-4 py-2 text-xs"
      >
        deposit → (demo)
      </button>
    </div>
  );
}

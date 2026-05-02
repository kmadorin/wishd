"use client";
import * as React from "react";

type Props = { amount: string; asset: string; collateral: string; protocol: string; chain: string };

export function BorrowWidget({ amount, asset, collateral, protocol, chain }: Props) {
  return (
    <div className="rounded-lg border border-rule bg-bg-2 p-4 text-sm font-mono">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>borrow · {protocol} · {chain}</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">DEMO ONLY</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="BORROW APY" value="5.8%" />
        <Metric label="MAX LTV" value="80%" />
        <Metric label="HEALTH FACTOR" value="2.14" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <KV label="BORROW AMOUNT" value={`${amount} ${asset}`} />
        <KV label="COLLATERAL" value={collateral} />
        <KV label="REQUIRED" value="195.00 USDC" />
        <KV label="LIQUIDATION" value="$1,780 ETH" />
        <KV label="GAS EST." value="~$6.50" />
      </div>
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-pill bg-bg-1 border border-rule px-4 py-2 text-xs"
        title="demo only — wire next sprint"
      >
        borrow → (demo)
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rule p-3">
      <div className="text-lg">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-2">{label}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2">{label}</div>
      <div>{value}</div>
    </div>
  );
}

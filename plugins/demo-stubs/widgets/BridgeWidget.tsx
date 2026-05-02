"use client";
import * as React from "react";

type Props = { amount: string; asset: string; fromChain: string; toChain: string };

const NICE: Record<string, string> = {
  "ethereum-sepolia": "Sepolia",
  "ethereum": "Ethereum",
  "base": "Base",
  "arbitrum": "Arbitrum",
  "optimism": "Optimism",
  "polygon": "Polygon",
};

export function BridgeWidget({ amount, asset, fromChain, toChain }: Props) {
  const fee = "0.06%";
  const eta = "~2 min";
  return (
    <div className="rounded-lg border border-rule bg-bg-2 p-4 text-sm font-mono">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>bridge</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">DEMO ONLY</span>
      </div>
      <div className="mt-3 grid grid-cols-3 items-center gap-3">
        <div className="rounded-lg border border-rule p-3 text-center">
          <div className="text-xs text-ink-2">FROM</div>
          <div className="mt-1">{NICE[fromChain] ?? fromChain}</div>
          <div className="mt-2 text-lg">{amount} {asset}</div>
        </div>
        <div className="text-center text-xl">→</div>
        <div className="rounded-lg border border-rule p-3 text-center">
          <div className="text-xs text-ink-2">TO</div>
          <div className="mt-1">{NICE[toChain] ?? toChain}</div>
          <div className="mt-2 text-lg">≈ {amount} {asset}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-ink-2">ETA</span> {eta}</div>
        <div><span className="text-ink-2">bridge fee</span> {fee}</div>
      </div>
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-pill bg-bg-1 border border-rule px-4 py-2 text-xs"
      >
        bridge → (demo)
      </button>
    </div>
  );
}

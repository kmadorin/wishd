"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEmit } from "@wishd/plugin-sdk";
import { callPluginTool } from "@wishd/plugin-sdk/routes";
import { WidgetCard } from "../../../apps/web/components/primitives/WidgetCard";
import { AICheckPanel } from "../../../apps/web/components/primitives/AICheckPanel";
import { AssetPicker, type AssetPickerOption } from "../../../apps/web/components/wish/AssetPicker";
import { CURATED_MINTS, CURATED_SYMBOLS } from "../addresses";
import type { JupiterSwapPrepared } from "../types";

// Inline because @plugins/jupiter shouldn't depend on @plugins/uniswap.
function applyAssetChange(
  side: "in" | "out",
  next: string,
  prev: { assetIn: string; assetOut: string },
): { assetIn: string; assetOut: string } {
  if (side === "in") {
    if (next === prev.assetOut) return { assetIn: next, assetOut: prev.assetIn };
    return { ...prev, assetIn: next };
  }
  if (next === prev.assetIn) return { assetIn: prev.assetOut, assetOut: next };
  return { ...prev, assetOut: next };
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function formatAtoms(atoms: string, decimals: number): string {
  let s = atoms;
  if (s === "" || s === "0") return "0";
  s = s.padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function parseToAtomic(value: string, decimals: number): string {
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return "0";
  const [whole, frac = ""] = value.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + fracPadded).toString();
}

function bpsToLabel(bps: number, dynamic: boolean): string {
  if (dynamic) return "auto";
  return `${(bps / 100).toFixed(2)}%`;
}

const SLIPPAGE_PRESETS: Array<{ label: string; bps: number; dynamic: boolean }> = [
  { label: "0.1%", bps: 10,  dynamic: false },
  { label: "0.5%", bps: 50,  dynamic: false },
  { label: "1%",   bps: 100, dynamic: false },
  { label: "auto", bps: 50,  dynamic: true },
];

const TOKEN_OPTIONS: AssetPickerOption[] = CURATED_SYMBOLS.map((s) => ({
  symbol: s,
  name: s === "SOL" ? "Solana (native)" : s,
}));

export type JupiterSwapSummaryProps = {
  id: string;
  prepared: JupiterSwapPrepared;
};

export function JupiterSwapSummary({ id, prepared }: JupiterSwapSummaryProps) {
  const emit = useEmit();
  const initialAmount = formatAtoms(prepared.config.amountAtomic, prepared.decimalsIn);

  const [amountIn, setAmountIn] = useState(initialAmount);
  const [assetIn, setAssetIn] = useState(prepared.config.assetIn);
  const [assetOut, setAssetOut] = useState(prepared.config.assetOut);
  const [slippageBps, setSlippageBps] = useState(prepared.config.slippageBps);
  const [dynamicSlippage, setDynamicSlippage] = useState(prepared.config.dynamicSlippage);
  const [submitting, setSubmitting] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [openPicker, setOpenPicker] = useState<"in" | "out" | null>(null);
  const [activePrepared, setActivePrepared] = useState<JupiterSwapPrepared>(prepared);

  const debouncedAmount = useDebounce(amountIn, 350);

  const inMint = CURATED_MINTS[assetIn]?.mint ?? prepared.config.inputMint;
  const outMint = CURATED_MINTS[assetOut]?.mint ?? prepared.config.outputMint;
  const decimalsIn = CURATED_MINTS[assetIn]?.decimals ?? prepared.decimalsIn;
  const decimalsOut = CURATED_MINTS[assetOut]?.decimals ?? prepared.decimalsOut;

  const reQuoteQuery = useQuery({
    queryKey: ["jupiter.refresh", inMint, outMint, debouncedAmount, slippageBps, dynamicSlippage, prepared.config.swapper],
    queryFn: async (): Promise<JupiterSwapPrepared> => {
      const config = {
        ...prepared.config,
        inputMint: inMint,
        outputMint: outMint,
        assetIn,
        assetOut,
        amountAtomic: parseToAtomic(debouncedAmount, decimalsIn),
        slippageBps,
        dynamicSlippage,
      };
      const out = await callPluginTool<JupiterSwapPrepared>("jupiter", "refresh_swap", { config, summaryId: id });
      return out;
    },
    initialData: prepared,
    initialDataUpdatedAt: prepared.initialQuoteAt,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: (n: number) => n < 2,
  });

  useEffect(() => {
    if (reQuoteQuery.data) setActivePrepared(reQuoteQuery.data);
    if (reQuoteQuery.data && !reQuoteQuery.isFetching) setEditPending(false);
  }, [reQuoteQuery.data, reQuoteQuery.isFetching]);

  const liveQuote = activePrepared.initialQuote;
  const liveBalance = activePrepared.balance;
  const route = liveQuote.routePlan.map((r) => r.swapInfo.label).join(" → ") || "direct";
  const outDisplay = liveQuote.outAmount ? formatAtoms(liveQuote.outAmount, decimalsOut) : "0";
  const minOut = liveQuote.otherAmountThreshold
    ? formatAtoms(liveQuote.otherAmountThreshold, decimalsOut)
    : null;

  const insufficient = (() => {
    const b = parseFloat(liveBalance || "0");
    const a = parseFloat(amountIn);
    if (!Number.isFinite(b) || !Number.isFinite(a)) return false;
    return a > b;
  })();

  const ctaDisabled =
    submitting || insufficient || !!reQuoteQuery.error || reQuoteQuery.isFetching;

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

  function setSlippagePreset(preset: { bps: number; dynamic: boolean }) {
    setEditPending(true);
    setSlippageBps(preset.bps);
    setDynamicSlippage(preset.dynamic);
  }

  function onExecute() {
    if (ctaDisabled) return;
    setSubmitting(true);
    emit({
      type: "ui.render",
      widget: {
        id: `${id}-execute`,
        type: "jupiter-swap-execute",
        slot: "flow",
        props: { id: `${id}-execute`, prepared: activePrepared },
      },
    });
    setTimeout(() => setSubmitting(false), 600);
  }

  return (
    <div className="flex flex-col gap-3">
      <WidgetCard>
        <WidgetCard.Head name="swap" badge="JUPITER · 1 TX" />

        <WidgetCard.PaySection>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5 flex justify-between">
            <span>you pay</span>
            <span className="font-mono text-[11px] text-ink-3">balance: {liveBalance} {assetIn}</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amountIn}
              onChange={(e) => { setEditPending(true); setAmountIn(e.target.value); }}
              className="font-hand text-[38px] font-bold leading-none bg-transparent outline-none w-full min-w-0"
              aria-label="amount in"
            />
            <div className="flex-shrink-0">
              <AssetPicker
                chainId={0}
                value={assetIn}
                onChange={setAssetInGuarded}
                tokens={TOKEN_OPTIONS}
                balances={{}}
                variant="from"
                open={openPicker === "in"}
                onOpenChange={(o) => setOpenPicker(o ? "in" : null)}
              />
            </div>
          </div>
        </WidgetCard.PaySection>

        <WidgetCard.SwapDir onFlip={handleFlip} />

        <WidgetCard.ReceiveSection>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5">
            you receive
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="font-hand text-[38px] font-bold leading-none">
              {reQuoteQuery.isFetching ? (
                <span className="text-ink-3 text-[24px]">…</span>
              ) : (
                outDisplay
              )}
            </div>
            <div className="flex-shrink-0">
              <AssetPicker
                chainId={0}
                value={assetOut}
                onChange={setAssetOutGuarded}
                tokens={TOKEN_OPTIONS}
                balances={{}}
                variant="to"
                open={openPicker === "out"}
                onOpenChange={(o) => setOpenPicker(o ? "out" : null)}
              />
            </div>
          </div>
          {minOut && (
            <div className="font-mono text-xs text-ink-3 mt-1">
              min received: {minOut} {assetOut}
            </div>
          )}
        </WidgetCard.ReceiveSection>

        <WidgetCard.Stats
          items={[
            { k: "route", v: route },
            { k: "price impact", v: `${liveQuote.priceImpactPct ?? "0"}%` },
            { k: "min received", v: minOut ? `${minOut} ${assetOut}` : "—" },
            { k: "chain", v: "Solana" },
          ]}
        />

        <div className="px-4 py-2.5 border-t border-rule flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">slippage</span>
          {SLIPPAGE_PRESETS.map((p) => {
            const active = p.dynamic === dynamicSlippage && (p.dynamic || p.bps === slippageBps);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setSlippagePreset(p)}
                className={`rounded-pill border-[1.5px] px-2.5 py-0.5 font-mono text-[11px] ${
                  active ? "bg-accent border-ink text-ink" : "border-rule text-ink-2 hover:border-ink"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="ml-auto font-mono text-[10px] text-ink-3">
            {bpsToLabel(slippageBps, dynamicSlippage)}
          </span>
        </div>

        {insufficient && (
          <div className="mx-4 my-3 rounded-sm bg-warn-2 border border-warn p-3 text-sm text-ink-2">
            insufficient {assetIn} balance. you have {liveBalance} but need {amountIn}.
            fund the wallet and re-wish.
          </div>
        )}

        {reQuoteQuery.error && !reQuoteQuery.isFetching && (
          <div className="mx-4 my-3 rounded-sm bg-[#FDEAEA] border border-bad p-3 text-sm text-ink-2">
            quote failed: {(reQuoteQuery.error as Error).message}
          </div>
        )}

        <WidgetCard.Cta>
          <button
            type="button"
            onClick={onExecute}
            disabled={ctaDisabled}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-accent border-2 border-ink text-ink py-3 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {insufficient
              ? "insufficient balance"
              : submitting
              ? "preparing…"
              : reQuoteQuery.isFetching
              ? "refreshing quote…"
              : "execute →"}
          </button>
        </WidgetCard.Cta>
      </WidgetCard>

      <AICheckPanel
        status={reQuoteQuery.isFetching ? "live" : "stale"}
        title="safety check"
        sub="reading wallet + Jupiter quote"
        balanceChanges={[
          { sign: "-", token: assetIn, amount: amountIn },
          { sign: "+", token: assetOut, amount: outDisplay },
        ]}
        safety={[
          { ok: true, text: `chain Solana · swapper ${prepared.config.swapper.slice(0, 10)}…` },
          insufficient
            ? { ok: false, text: `balance ${liveBalance} ${assetIn} < ${amountIn}` }
            : { ok: true, text: `balance covers amount (${liveBalance} ${assetIn})` },
          {
            ok: parseFloat(liveQuote.priceImpactPct || "0") < 1,
            text: `price impact: ${liveQuote.priceImpactPct ?? "0"}%`,
          },
          { ok: true, text: `route via ${route}` },
        ]}
      />

      {editPending ? (
        <div className="font-mono text-[11px] text-ink-3 px-2">edit pending — re-running checks…</div>
      ) : null}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getNative, getTokens } from "@wishd/tokens";
import { tokenIconClass, tokenSymbol } from "@/lib/tokenIcons";
import { useBalances } from "@/lib/useBalances";

export type AssetPickerOption = { symbol: string; name: string };
type Option = AssetPickerOption;

function options(chainId: number): Option[] {
  const out: Option[] = [];
  const seen = new Set<string>();
  const n = getNative(chainId);
  if (n) {
    out.push({ symbol: n.symbol, name: `${n.symbol} (native)` });
    seen.add(n.symbol);
  }
  for (const t of getTokens(chainId)) {
    if (seen.has(t.symbol)) continue;
    out.push({ symbol: t.symbol, name: t.name });
    seen.add(t.symbol);
  }
  return out;
}

export type AssetPickerProps = {
  chainId: number;
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  address?: `0x${string}` | string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: "from" | "to";
  /** When provided, overrides the default EVM token discovery (getNative + getTokens). */
  tokens?: AssetPickerOption[];
  /** When provided, overrides the live useBalances lookup. */
  balances?: Record<string, string>;
};

export function AssetPicker(props: AssetPickerProps) {
  const { chainId, value, onChange, address, variant = "from", tokens, balances: balancesProp } = props;
  const all = useMemo(() => tokens ?? options(chainId), [tokens, chainId]);
  const tokenSymbols = useMemo(() => all.map((o) => o.symbol), [all]);
  const liveBalances = useBalances({
    chainId: balancesProp ? undefined : chainId,
    address: balancesProp ? undefined : address,
    tokens: balancesProp ? [] : tokenSymbols,
  });
  const balances = balancesProp ?? liveBalances.balances;
  const isLoading = balancesProp ? false : liveBalances.isLoading;

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const open = isControlled ? !!props.open : internalOpen;
  const onOpenChange = props.onOpenChange;
  const setOpen = useCallback(
    (o: boolean) => (isControlled ? onOpenChange!(o) : setInternalOpen(o)),
    [isControlled, onOpenChange],
  );

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return all;
    return all.filter((o) => o.symbol.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle));
  }, [all, q]);

  const [cursor, setCursor] = useState(0);
  useEffect(() => setCursor(0), [q, open]);

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });
  const popoverId = useId();

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const width = 320;
    const above = window.innerHeight - r.bottom < 360;
    setPos({
      top: above ? r.top + window.scrollY - 8 - 320 : r.bottom + window.scrollY + 8,
      left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left + window.scrollX)),
      width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, setOpen]);

  function commit(symbol: string) {
    onChange(symbol);
    setOpen(false);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[cursor];
      if (o) commit(o.symbol);
    } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  const anchorAria = props.ariaLabel ?? (value ? `Selected ${value}` : "Select asset");
  const variantClass = variant === "from"
    ? "bg-accent border-ink"
    : "bg-mint border-ink";

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={anchorAria}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 ${variantClass} border-[1.5px] rounded-pill px-2.5 py-1 font-bold text-sm`}
      >
        <span className={tokenIconClass(value)}>{tokenSymbol(value)}</span>
        <span>{value || "select token"}</span>
        <span className="text-xs ml-0.5">⌄</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          id={popoverId}
          role="listbox"
          aria-label="token list"
          style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 50 }}
          className="bg-surface border-2 border-ink rounded-xl shadow-cardSm p-2"
        >
          <div className="flex items-center justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
            <span>{filtered.length} matches</span>
            <span>↑↓ ↵</span>
          </div>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search…"
            className="w-full bg-transparent outline-none border border-rule rounded px-2 py-1.5 mb-2 text-sm"
          />
          <ul className="max-h-72 overflow-y-auto">
            {filtered.map((o, i) => (
              <li key={o.symbol}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(o.symbol)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${i === cursor ? "bg-accent-2" : ""}`}
                >
                  <span className={tokenIconClass(o.symbol)}>{tokenSymbol(o.symbol)}</span>
                  <span className="font-bold">{o.symbol}</span>
                  <span className="text-ink-3 truncate">{o.name}</span>
                  <span className="ml-auto font-mono text-xs text-ink-2">
                    {isLoading ? "…" : (balances[o.symbol] ?? "—")}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-ink-3 text-sm">no tokens match</li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}

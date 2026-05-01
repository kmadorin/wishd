"use client";
import { useMemo, useState } from "react";
import { getNative, getTokens } from "@wishd/tokens";
import { tokenIconClass, tokenSymbol } from "@/lib/tokenIcons";

type Option = { symbol: string; name: string };

function options(chainId: number): Option[] {
  const out: Option[] = [];
  const n = getNative(chainId);
  if (n) out.push({ symbol: n.symbol, name: `${n.symbol} (native)` });
  for (const t of getTokens(chainId)) out.push({ symbol: t.symbol, name: t.name });
  return out;
}

export function AssetPicker({ chainId, value, onChange, ariaLabel }: {
  chainId: number; value: string; onChange: (next: string) => void; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = useMemo(() => options(chainId), [chainId]);
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return all;
    return all.filter((o) => o.symbol.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle));
  }, [all, q]);

  return (
    <div className="asset-picker">
      <button type="button" aria-label={ariaLabel ?? "pick token"} onClick={() => setOpen((v) => !v)}>
        <span className={tokenIconClass(value)}>{tokenSymbol(value)}</span>
        <span>{value || "select token"}</span>
      </button>
      {open && (
        <div className="asset-picker-pop" role="listbox">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" />
          <ul>
            {filtered.map((o) => (
              <li key={o.symbol}>
                <button type="button" onClick={() => { onChange(o.symbol); setOpen(false); setQ(""); }}>
                  <span className={tokenIconClass(o.symbol)}>{tokenSymbol(o.symbol)}</span>
                  <span>{o.symbol}</span>
                  <span className="muted">{o.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="muted">no tokens match — pick a different chain or add an override to <code>@wishd/tokens</code></li>}
          </ul>
        </div>
      )}
    </div>
  );
}

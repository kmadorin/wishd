"use client";

import { useId, type ReactNode } from "react";
import { TokenDot } from "@/lib/tokenIcons";

export type ActionPillOption = {
  id: string;
  label: string;
  sub?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
};

export type ActionPillVariant = "action" | "from" | "to" | "chain" | "protocol" | "amount";

export type ActionPillProps = {
  variant: ActionPillVariant;
  value?: string;
  placeholder?: string;
  options?: ActionPillOption[];
  onChange?: (id: string) => void;
  /** Render token-dot icon on the left when variant is from/to and value matches a token. */
  iconTicker?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  inputWidthCh?: number;
  ariaLabel?: string;
};

const VARIANT_BG: Record<Exclude<ActionPillVariant, "amount">, string> = {
  action: "bg-accent",
  from: "bg-accent",
  to: "bg-mint",
  chain: "bg-mint",
  protocol: "bg-bg-2",
};

export function ActionPill(props: ActionPillProps) {
  const id = useId();
  if (props.variant === "amount") return <AmountPill {...props} />;

  const empty = !props.value;
  const label = props.value ?? props.placeholder ?? "";
  const bg = empty ? "bg-surface-2 text-ink-3" : `${VARIANT_BG[props.variant]} text-ink`;

  return (
    <span className="relative inline-flex">
      <button
        id={id}
        type="button"
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-expanded={!!props.open}
        aria-label={props.ariaLabel}
        onClick={() => props.onOpenChange?.(!props.open)}
        className={[
          "inline-flex items-center gap-1.5",
          "border-2 border-ink rounded-pill",
          "px-[14px] py-[3px]",
          "font-hand text-[16px] font-semibold",
          "whitespace-nowrap select-none cursor-pointer",
          "transition-opacity hover:opacity-80",
          "disabled:cursor-not-allowed disabled:opacity-60",
          bg,
        ].join(" ")}
      >
        {props.iconTicker && <TokenDot ticker={props.iconTicker} />}
        <span>{label}</span>
        <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2 4l4 4 4-4" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
      </button>
      {props.open && props.options && (
        <div
          role="menu"
          aria-labelledby={id}
          className="absolute top-[calc(100%+6px)] left-0 z-[100] min-w-[260px] bg-surface-2 border-2 border-ink rounded-[14px] shadow-card animate-fadeUp p-1.5"
        >
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 px-2 pt-1 pb-1.5">
            {props.options.length} option{props.options.length === 1 ? "" : "s"}
          </div>
          {props.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => { props.onChange?.(o.id); props.onOpenChange?.(false); }}
              className="w-full flex items-center justify-between gap-2.5 p-2.5 rounded-lg cursor-pointer text-sm min-h-[44px] hover:bg-accent-2 text-left"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {o.icon}
                <span className="font-bold text-ink truncate">{o.label}</span>
                {o.sub && <span className="font-normal text-ink-3 ml-1.5 truncate">{o.sub}</span>}
              </span>
              {o.trailing && <span className="font-mono text-[12.5px] text-ink-2">{o.trailing}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function AmountPill(props: ActionPillProps) {
  return (
    <span className="inline-flex items-center border-2 border-dashed border-ink rounded-pill bg-transparent overflow-hidden px-[14px] py-[3px]">
      <input
        inputMode="decimal"
        value={props.value ?? ""}
        placeholder={props.placeholder}
        aria-label={props.ariaLabel ?? props.placeholder ?? "amount"}
        onChange={(e) => props.onChange?.(e.target.value)}
        disabled={props.disabled}
        className="bg-transparent border-none outline-none font-hand text-[22px] font-bold text-ink p-0 text-center"
        style={{ width: `${props.inputWidthCh ?? 6}ch` }}
      />
    </span>
  );
}

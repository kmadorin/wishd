"use client";

export function FlipButton({ onClick, ariaLabel = "swap direction" }: {
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title="swap direction"
      className="inline-flex items-center justify-center w-7 h-7 rounded-full border-[1.5px] border-ink bg-surface-2 text-base hover:bg-accent-2 hover:rotate-180 transition-transform mx-1"
    >↕</button>
  );
}

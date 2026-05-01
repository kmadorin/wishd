import type { ReactNode } from "react";

export type SentenceBoxProps = {
  children: ReactNode;
  className?: string;
};

export function SentenceBox({ children, className = "" }: SentenceBoxProps) {
  return (
    <div
      className={[
        "border-2 border-dashed border-ink rounded-[16px]",
        "bg-surface-2 p-[18px] mb-[14px]",
        "flex flex-wrap items-center gap-y-[14px] gap-x-3",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function SentencePrefix({ children }: { children: ReactNode }) {
  return <span className="font-hand text-[28px] text-ink whitespace-nowrap">{children}</span>;
}

export function SentenceConnector({ children }: { children: ReactNode }) {
  return <span className="text-sm text-ink-3">{children}</span>;
}

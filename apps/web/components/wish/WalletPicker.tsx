"use client";

export type WalletPickerRow = {
  id: string;
  chainType: "evm" | "svm";
  label: string;
  onSelect: () => void;
};

type Props = {
  rows: WalletPickerRow[];
};

export function WalletPicker({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={row.onSelect}
            className="w-full text-left rounded-md border border-rule bg-bg-2 px-3 py-2 hover:border-accent"
          >
            <span className="text-xs text-ink-3 uppercase mr-2">
              {row.chainType === "evm" ? "EVM" : "Solana"}
            </span>
            <span className="text-sm text-ink">{row.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

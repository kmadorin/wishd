"use client";

type Props = {
  chainType: "evm" | "svm";
  address: string;
  connectorName: string;
  onDisconnect: () => void;
};

function truncate(addr: string, chainType: "evm" | "svm"): string {
  const tail = chainType === "svm" ? 5 : 4;
  if (addr.length <= 6 + tail) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-tail)}`;
}

export function WalletCard({ chainType, address, connectorName, onDisconnect }: Props) {
  const ecosystem = chainType === "evm" ? "EVM" : "Solana";
  return (
    <div className="rounded-md border border-rule bg-bg-2 p-3 flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-xs text-ink-3 uppercase">
          {ecosystem} · {connectorName}
        </span>
        <span className="font-mono text-sm text-ink">{truncate(address, chainType)}</span>
      </div>
      <button
        type="button"
        aria-label={`disconnect ${connectorName}`}
        onClick={onDisconnect}
        className="rounded-pill border border-rule px-3 py-1 text-xs text-ink-2 hover:text-ink"
      >
        disconnect
      </button>
    </div>
  );
}

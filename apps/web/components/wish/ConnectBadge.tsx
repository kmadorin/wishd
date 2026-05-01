"use client";

import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";

export function ConnectBadge() {
  const { address, isConnected } = useAccount();
  const connectors = useConnectors();
  const portoConnector = connectors[0];
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="ml-auto rounded-pill bg-bg-2 border border-rule px-3 py-1 text-xs font-mono text-ink-2 hover:text-ink"
        title="disconnect"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending || !portoConnector}
      onClick={() => portoConnector && connect({ connector: portoConnector })}
      className="ml-auto rounded-pill bg-accent text-ink px-4 py-1 text-sm font-semibold hover:bg-accent-2 disabled:opacity-50"
    >
      {isPending ? "connecting…" : "connect wallet"}
    </button>
  );
}

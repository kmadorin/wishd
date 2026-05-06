"use client";

import { useWalletMenu } from "@/store/walletMenu";
import { useWishdAccounts } from "@/lib/wallets/useWishdAccounts";

function truncate(addr: string, chainType: "evm" | "svm"): string {
  const tail = chainType === "svm" ? 5 : 4;
  if (addr.length <= 6 + tail) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-tail)}`;
}

export function ConnectBadge() {
  const { open } = useWalletMenu();
  const { evm, svm } = useWishdAccounts();
  const connectedCount = (evm ? 1 : 0) + (svm ? 1 : 0);

  if (connectedCount === 0) {
    return (
      <button
        type="button"
        onClick={open}
        className="ml-auto rounded-pill bg-accent text-ink px-4 py-1 text-sm font-semibold hover:bg-accent-2"
      >
        connect wallet
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title="manage wallets"
      className="ml-auto rounded-pill bg-bg-2 border border-rule px-3 py-1 text-xs font-mono text-ink-2 hover:text-ink flex items-center gap-2"
    >
      {evm && <span>{truncate(evm.address, "evm")}</span>}
      {evm && svm && <span className="text-ink-3">·</span>}
      {svm && <span>{truncate(svm.address, "svm")}</span>}
    </button>
  );
}

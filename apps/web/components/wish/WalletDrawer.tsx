"use client";

import { useConnect, useConnectors, useDisconnect } from "wagmi";
import { useWalletConnection } from "@solana/react-hooks";
import { useWalletMenu } from "@/store/walletMenu";
import { useWishdAccounts } from "@/lib/wallets/useWishdAccounts";
import { WalletCard } from "./WalletCard";
import { WalletPicker, type WalletPickerRow } from "./WalletPicker";

const PHANTOM_NAME = "Phantom";

export function WalletDrawer() {
  const { drawerOpen, close } = useWalletMenu();
  const { evm, svm } = useWishdAccounts();

  const wagmiConnectors = useConnectors();
  const portoConnector = wagmiConnectors.find((c) => c.id === "porto") ?? wagmiConnectors[0];
  const { connect: wagmiConnect } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const solana = useWalletConnection();
  const phantomConnector = solana.connectors.find((c) => c.name === PHANTOM_NAME);

  if (!drawerOpen) return null;

  const rows: WalletPickerRow[] = [];
  if (!evm && portoConnector) {
    rows.push({
      id: "porto",
      chainType: "evm",
      label: "Porto",
      onSelect: () => wagmiConnect({ connector: portoConnector }),
    });
  }
  if (!svm && phantomConnector) {
    rows.push({
      id: "phantom",
      chainType: "svm",
      label: "Phantom",
      onSelect: () => {
        void solana.connect(phantomConnector.id);
      },
    });
  }

  return (
    <div
      role="dialog"
      aria-label="wallets"
      className="fixed inset-y-0 right-0 z-50 w-[360px] bg-bg-1 border-l border-rule p-4 flex flex-col gap-4 overflow-y-auto"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="close wallet menu"
          onClick={close}
          className="rounded-pill border border-rule px-3 py-1 text-sm text-ink-2 hover:text-ink"
        >
          ×
        </button>
        {rows.length > 0 && (
          <span className="text-xs uppercase text-ink-3">Connect another wallet</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {evm && (
          <WalletCard
            chainType="evm"
            address={evm.address}
            connectorName={evm.connectorName}
            onDisconnect={() => wagmiDisconnect()}
          />
        )}
        {svm && (
          <WalletCard
            chainType="svm"
            address={svm.address}
            connectorName={svm.connectorName}
            onDisconnect={() => {
              void solana.disconnect();
            }}
          />
        )}
      </div>

      {rows.length > 0 && <WalletPicker rows={rows} />}
    </div>
  );
}

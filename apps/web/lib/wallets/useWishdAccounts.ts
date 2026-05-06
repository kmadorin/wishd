"use client";

import { useAccount } from "wagmi";
import { useWallet } from "@solana/react-hooks";
import type { EvmAccount, SvmAccount, WishdAccount } from "./types";

/** Minimal discriminated shape we consume from the Solana wallet status. */
type SolanaWalletView =
  | { status: "connected"; session: { address: string; connector: { name: string } } }
  | { status: "disconnected" | "connecting" | "error" };

export function useWishdAccounts(): {
  accounts: WishdAccount[];
  evm?: EvmAccount;
  svm?: SvmAccount;
} {
  const wagmi = useAccount();
  // Cast to our minimal view: in production the real WalletStatus.session.account.address
  // is an Address (string subtype); the cast collapses the nested shape without using `any`.
  const solana = useWallet() as unknown as SolanaWalletView;

  const evm: EvmAccount | undefined =
    wagmi.isConnected && wagmi.address && wagmi.chainId
      ? {
          chainType: "evm",
          address: wagmi.address,
          chainId: wagmi.chainId,
          connectorName: wagmi.connector?.name ?? "Unknown",
        }
      : undefined;

  const svm: SvmAccount | undefined =
    solana.status === "connected"
      ? {
          chainType: "svm",
          address: solana.session.address,
          connectorName: solana.session.connector.name,
        }
      : undefined;

  const accounts: WishdAccount[] = [];
  if (evm) accounts.push(evm);
  if (svm) accounts.push(svm);

  return { accounts, evm, svm };
}

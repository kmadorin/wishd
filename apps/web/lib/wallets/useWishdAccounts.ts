"use client";

import { useAccount } from "wagmi";
import { useWallet } from "@solana/react-hooks";
import type { EvmAccount, SvmAccount, WishdAccount } from "./types";

export function useWishdAccounts(): {
  accounts: WishdAccount[];
  evm?: EvmAccount;
  svm?: SvmAccount;
} {
  const wagmi = useAccount();
  const solana = useWallet();

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
          address: solana.session.account.address.toString(),
          connectorName: solana.session.connector.name,
        }
      : undefined;

  const accounts: WishdAccount[] = [];
  if (evm) accounts.push(evm);
  if (svm) accounts.push(svm);

  return { accounts, evm, svm };
}

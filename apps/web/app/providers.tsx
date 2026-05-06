"use client";

import { type State, WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SolanaProvider } from "@solana/react-hooks";
import { getConfig } from "@/lib/wagmi";
import { getSolanaClientConfig } from "@/lib/wallets/solanaConfig";
import { ClientOnly } from "@/components/primitives/ClientOnly";

// wagmi/porto sometimes ship bigints into the EIP-5792 RPC payload that
// the wallet extension JSON.stringify cannot handle natively.
if (typeof window !== "undefined" && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

type Props = {
  children: ReactNode;
  initialState: State | undefined;
};

export function Providers({ children, initialState }: Props) {
  const [config] = useState(() => getConfig());
  const [qc] = useState(() => new QueryClient());
  const [solanaConfig] = useState(() => getSolanaClientConfig());

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={qc}>
        <ClientOnly>
          <SolanaProvider
            config={solanaConfig}
            walletPersistence={{ autoConnect: true, storageKey: "wishd-solana" }}
          >
            {children}
          </SolanaProvider>
        </ClientOnly>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

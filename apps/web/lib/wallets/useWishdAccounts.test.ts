import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const wagmiState = {
  address: undefined as `0x${string}` | undefined,
  chainId: undefined as number | undefined,
  isConnected: false,
  connector: undefined as { name: string } | undefined,
};

const solanaState = {
  status: "disconnected" as "connected" | "disconnected",
  address: undefined as string | undefined,
  connectorName: undefined as string | undefined,
};

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: wagmiState.address,
    chainId: wagmiState.chainId,
    isConnected: wagmiState.isConnected,
    connector: wagmiState.connector,
  }),
}));

vi.mock("@solana/react-hooks", () => ({
  useWallet: () =>
    solanaState.status === "connected"
      ? {
          status: "connected",
          session: {
            address: solanaState.address!,
            connector: { name: solanaState.connectorName! },
          },
        }
      : { status: "disconnected" },
}));

import { useWishdAccounts } from "./useWishdAccounts";

describe("useWishdAccounts", () => {
  it("returns empty when nothing is connected", () => {
    Object.assign(wagmiState, { address: undefined, chainId: undefined, isConnected: false, connector: undefined });
    Object.assign(solanaState, { status: "disconnected", address: undefined, connectorName: undefined });
    const { result } = renderHook(() => useWishdAccounts());
    expect(result.current.accounts).toEqual([]);
    expect(result.current.evm).toBeUndefined();
    expect(result.current.svm).toBeUndefined();
  });

  it("returns EVM-only when only Porto is connected", () => {
    Object.assign(wagmiState, {
      address: "0x9e0f0000000000000000000000000000000bD92B" as `0x${string}`,
      chainId: 11155111,
      isConnected: true,
      connector: { name: "Porto" },
    });
    Object.assign(solanaState, { status: "disconnected", address: undefined, connectorName: undefined });
    const { result } = renderHook(() => useWishdAccounts());
    expect(result.current.evm).toEqual({
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    });
    expect(result.current.svm).toBeUndefined();
    expect(result.current.accounts).toHaveLength(1);
  });

  it("returns both when Porto and Phantom are connected, EVM first", () => {
    Object.assign(wagmiState, {
      address: "0x9e0f0000000000000000000000000000000bD92B" as `0x${string}`,
      chainId: 11155111,
      isConnected: true,
      connector: { name: "Porto" },
    });
    Object.assign(solanaState, {
      status: "connected",
      address: "FrXc3Ux0000000000000000000000000000D1HyJ",
      connectorName: "Phantom",
    });
    const { result } = renderHook(() => useWishdAccounts());
    expect(result.current.accounts).toHaveLength(2);
    expect(result.current.accounts[0].chainType).toBe("evm");
    expect(result.current.accounts[1].chainType).toBe("svm");
    expect(result.current.svm?.connectorName).toBe("Phantom");
  });
});

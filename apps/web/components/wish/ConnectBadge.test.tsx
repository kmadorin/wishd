import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWalletMenu } from "@/store/walletMenu";

const accountsState = {
  evm: undefined as undefined | { chainType: "evm"; address: string; chainId: number; connectorName: string },
  svm: undefined as undefined | { chainType: "svm"; address: string; connectorName: string },
};

vi.mock("@/lib/wallets/useWishdAccounts", () => ({
  useWishdAccounts: () => ({
    evm: accountsState.evm,
    svm: accountsState.svm,
    accounts: [accountsState.evm, accountsState.svm].filter(Boolean),
  }),
}));

import { ConnectBadge } from "./ConnectBadge";

describe("ConnectBadge", () => {
  beforeEach(() => {
    accountsState.evm = undefined;
    accountsState.svm = undefined;
    useWalletMenu.getState().close();
  });

  it("renders 'connect wallet' when nothing is connected", () => {
    render(<ConnectBadge />);
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("opens the drawer on click", async () => {
    render(<ConnectBadge />);
    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    expect(useWalletMenu.getState().drawerOpen).toBe(true);
  });

  it("shows the EVM truncated address (last 4) when only EVM is connected", () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    render(<ConnectBadge />);
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
  });

  it("shows both truncated addresses (SVM uses last 5) when both ecosystems connected", () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    accountsState.svm = {
      chainType: "svm",
      address: "FrXc3Ux0000000000000000000000000000D1HyJ",
      connectorName: "Phantom",
    };
    render(<ConnectBadge />);
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
    expect(screen.getByText(/FrXc3U…D1HyJ/)).toBeInTheDocument();
  });
});

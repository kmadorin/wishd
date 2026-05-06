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

const wagmiConnectMock = vi.fn();
const wagmiDisconnectMock = vi.fn();

vi.mock("wagmi", () => ({
  useConnect: () => ({ connect: wagmiConnectMock, isPending: false }),
  useDisconnect: () => ({ disconnect: wagmiDisconnectMock }),
  useConnectors: () => [{ id: "porto", name: "Porto" }],
}));

const solanaConnectMock = vi.fn();
const solanaDisconnectMock = vi.fn();
const solanaConnectorsState = {
  connectors: [{ id: "wallet-standard:phantom", name: "Phantom" }] as Array<{ id: string; name: string }>,
};

vi.mock("@solana/react-hooks", () => ({
  useWalletConnection: () => ({
    connectors: solanaConnectorsState.connectors,
    connect: solanaConnectMock,
    disconnect: solanaDisconnectMock,
    isReady: true,
  }),
}));

import { WalletDrawer } from "./WalletDrawer";

describe("WalletDrawer", () => {
  beforeEach(() => {
    accountsState.evm = undefined;
    accountsState.svm = undefined;
    solanaConnectorsState.connectors = [{ id: "wallet-standard:phantom", name: "Phantom" }];
    wagmiConnectMock.mockReset();
    wagmiDisconnectMock.mockReset();
    solanaConnectMock.mockReset();
    solanaDisconnectMock.mockReset();
    useWalletMenu.getState().close();
  });

  it("does not render when drawer is closed", () => {
    render(<WalletDrawer />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders both picker rows when nothing is connected", () => {
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    expect(screen.getByRole("button", { name: /porto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /phantom/i })).toBeInTheDocument();
  });

  it("hides Phantom row when not discovered", () => {
    solanaConnectorsState.connectors = [];
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    expect(screen.getByRole("button", { name: /porto/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /phantom/i })).toBeNull();
  });

  it("shows EVM card and hides Porto row when EVM connected", () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^porto$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /phantom/i })).toBeInTheDocument();
  });

  it("calls wagmi connect when Porto row is clicked", async () => {
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    await userEvent.click(screen.getByRole("button", { name: /porto/i }));
    expect(wagmiConnectMock).toHaveBeenCalledOnce();
  });

  it("calls solana connect with phantom id when Phantom row is clicked", async () => {
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    await userEvent.click(screen.getByRole("button", { name: /phantom/i }));
    expect(solanaConnectMock).toHaveBeenCalledOnce();
    expect(solanaConnectMock).toHaveBeenCalledWith("wallet-standard:phantom");
  });

  it("disconnects EVM only when EVM card disconnect button is clicked", async () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    await userEvent.click(screen.getByRole("button", { name: /disconnect porto/i }));
    expect(wagmiDisconnectMock).toHaveBeenCalledOnce();
    expect(solanaDisconnectMock).not.toHaveBeenCalled();
  });

  it("disconnects SVM only when SVM card disconnect button is clicked", async () => {
    accountsState.svm = {
      chainType: "svm",
      address: "FrXc3Ux0000000000000000000000000000D1HyJ",
      connectorName: "Phantom",
    };
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    await userEvent.click(screen.getByRole("button", { name: /disconnect phantom/i }));
    expect(solanaDisconnectMock).toHaveBeenCalledOnce();
    expect(wagmiDisconnectMock).not.toHaveBeenCalled();
  });
});

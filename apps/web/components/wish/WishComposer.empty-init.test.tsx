import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WishComposer } from "./WishComposer";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, chainId: undefined, isConnected: false }),
}));
vi.mock("@solana/react-hooks", () => ({
  useWalletConnection: () => ({ wallet: undefined, connected: false, connectors: [] }),
}));

describe("WishComposer empty initial state", () => {
  it("renders 'pick action' placeholder, no schema preselected", () => {
    render(<WishComposer />);
    // Placeholder should be visible; no specific verb (deposit/withdraw/swap) preselected
    expect(screen.getByText(/pick action/i)).toBeInTheDocument();
    expect(screen.queryByText(/^deposit$/i)).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BorrowWidget } from "./BorrowWidget";
import { EarnVaultWidget } from "./EarnVaultWidget";
import { BridgeWidget } from "./BridgeWidget";

describe("demo-stubs widgets render", () => {
  it("BorrowWidget shows BORROW APY, MAX LTV, HEALTH FACTOR labels", () => {
    render(<BorrowWidget amount="0.05" asset="ETH" collateral="USDC" protocol="aave-v3" chain="ethereum-sepolia" />);
    expect(screen.getByText(/BORROW APY/)).toBeInTheDocument();
    expect(screen.getByText(/MAX LTV/)).toBeInTheDocument();
    expect(screen.getByText(/HEALTH FACTOR/)).toBeInTheDocument();
  });
  it("EarnVaultWidget shows a vault list with Morpho and Aave", () => {
    render(<EarnVaultWidget amount="100" asset="USDC" chain="ethereum-sepolia" />);
    expect(screen.getByText(/Morpho/i)).toBeInTheDocument();
    expect(screen.getByText(/Aave/i)).toBeInTheDocument();
  });
  it("BridgeWidget shows from→to chain boxes and bridge fee", () => {
    render(<BridgeWidget amount="0.05" asset="ETH" fromChain="ethereum" toChain="base" />);
    expect(screen.getByText(/bridge fee/i)).toBeInTheDocument();
    expect(screen.getByText(/Base/i)).toBeInTheDocument();
  });
});

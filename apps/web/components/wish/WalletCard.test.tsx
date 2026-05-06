import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletCard } from "./WalletCard";

describe("WalletCard", () => {
  it("renders ecosystem label, truncated address, disconnect button", () => {
    render(
      <WalletCard
        chainType="evm"
        address="0x9e0f0000000000000000000000000000000bD92B"
        connectorName="Porto"
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByText(/porto/i)).toBeInTheDocument();
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("calls onDisconnect when the disconnect button is clicked", async () => {
    const onDisconnect = vi.fn();
    render(
      <WalletCard
        chainType="svm"
        address="FrXc3Ux0000000000000000000000000000D1HyJ"
        connectorName="Phantom"
        onDisconnect={onDisconnect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("truncates SVM addresses to first6…last4", () => {
    render(
      <WalletCard
        chainType="svm"
        address="FrXc3Ux0000000000000000000000000000D1HyJ"
        connectorName="Phantom"
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByText(/FrXc3U…D1HyJ/)).toBeInTheDocument();
  });
});

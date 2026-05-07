import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { IntentSchema } from "@wishd/plugin-sdk";
import { WishComposer } from "./WishComposer";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111", chainId: 11155111, isConnected: true }),
}));
vi.mock("@solana/react-hooks", () => ({
  useWalletConnection: () => ({ wallet: undefined, connected: false, connectors: [] }),
}));

vi.mock("@/lib/intentRegistry.client", () => {
  const lendSchema: IntentSchema = {
    intent: "compound-v3.lend",
    verb: "lend",
    description: "supply tokens to earn yield",
    fields: [
      { key: "amount", type: "amount", required: true, default: "10" },
      { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
      { key: "protocol", type: "select", required: true, default: "compound-v3", options: ["compound-v3", "aave-v3", "morpho", "spark"] },
      { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
    ],
    connectors: { protocol: "on", chain: "·" },
    widget: "compound-summary",
    slot: "flow",
  };
  return { CLIENT_INTENT_SCHEMAS: [lendSchema] };
});

describe("WishComposer with select field", () => {
  it("renders a protocol pill with the correct aria label", () => {
    render(<WishComposer />);
    fireEvent.click(screen.getByLabelText(/select action/i));
    fireEvent.click(screen.getByRole("menuitem", { name: /lend/i }));
    expect(screen.getByLabelText(/select protocol/i)).toBeInTheDocument();
  });
});

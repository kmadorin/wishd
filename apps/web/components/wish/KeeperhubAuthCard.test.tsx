import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeeperhubAuthCard } from "./KeeperhubAuthCard";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined }),
}));

describe("KeeperhubAuthCard", () => {
  it("renders title heading and connect button", () => {
    render(<KeeperhubAuthCard />);
    // h2 title
    expect(screen.getByRole("heading", { name: /Connect KeeperHub/i })).toBeInTheDocument();
    // the button itself
    expect(screen.getByRole("button", { name: /Connect KeeperHub/i })).toBeInTheDocument();
  });

  it("renders description text about mcp:write", () => {
    render(<KeeperhubAuthCard />);
    expect(screen.getByText(/mcp:write/i)).toBeInTheDocument();
  });

  it("accepts optional props without error", () => {
    render(<KeeperhubAuthCard stepCardId="step-1" intent="swap" userPortoAddress="0xabc" />);
    expect(screen.getByRole("button", { name: /Connect KeeperHub/i })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeeperhubAuthCard } from "./KeeperhubAuthCard";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined }),
}));

const dismissWidgetMock = vi.fn();
vi.mock("@/store/workspace", () => ({
  useWorkspace: (sel: (s: { dismissWidget: (id: string) => void }) => unknown) =>
    sel({ dismissWidget: dismissWidgetMock }),
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

  it("calls dismissWidget(id) 1.5s after kh:authed postMessage", async () => {
    vi.useFakeTimers();
    dismissWidgetMock.mockClear();
    const { rerender } = render(
      <KeeperhubAuthCard id="auth-1" intent="x" userPortoAddress="0xabc" />,
    );
    window.dispatchEvent(new MessageEvent("message", { data: { type: "wishd:kh:authed" } }));
    rerender(<KeeperhubAuthCard id="auth-1" intent="x" userPortoAddress="0xabc" />);
    expect(dismissWidgetMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(dismissWidgetMock).toHaveBeenCalledWith("auth-1");
    vi.useRealTimers();
  });
});

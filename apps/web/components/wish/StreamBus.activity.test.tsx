import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useWorkspace } from "@/store/workspace";
import { StreamBus } from "./StreamBus";

// Mock startStream so we can drive onEvent ourselves.
let mockOnEvent: ((e: any) => void) | null = null;

vi.mock("./EventStream", () => ({
  startStream: vi.fn(async ({ onEvent }: { onEvent: (e: any) => void }) => {
    mockOnEvent = onEvent;
  }),
}));

describe("StreamBus forwards events to agent activity", () => {
  beforeEach(() => {
    useWorkspace.getState().reset();
    mockOnEvent = null;
  });

  it("appends each tool.call event with its name", async () => {
    render(<StreamBus />);
    window.dispatchEvent(new CustomEvent("wishd:wish", { detail: { wish: "swap eth", account: { address: "0x1", chainId: 11155111 } } }));
    // wait a tick
    await new Promise((r) => setTimeout(r, 10));
    if (mockOnEvent) {
      mockOnEvent({ type: "tool.call", name: "uniswap.quote", input: { in: "ETH", out: "USDC" } });
      mockOnEvent({ type: "tool.call", name: "porto.prepare_swap", input: {} });
    }
    // wait for state update
    await new Promise((r) => setTimeout(r, 10));
    const log = useWorkspace.getState().agentActivity;
    const names = log.map((e: any) => e.name).filter(Boolean);
    expect(names).toEqual(["uniswap.quote", "porto.prepare_swap"]);
  });

  it("appends chat.delta events as delta agent events", async () => {
    render(<StreamBus />);
    window.dispatchEvent(new CustomEvent("wishd:wish", { detail: { wish: "swap eth", account: { address: "0x1", chainId: 11155111 } } }));
    // wait a tick
    await new Promise((r) => setTimeout(r, 10));
    if (mockOnEvent) {
      mockOnEvent({ type: "chat.delta", delta: "Checking liquidity" });
      mockOnEvent({ type: "chat.delta", delta: " on Uniswap..." });
    }
    // wait for state update
    await new Promise((r) => setTimeout(r, 10));
    const log = useWorkspace.getState().agentActivity;
    const deltas = log.filter((e: any) => e.kind === "delta");
    expect(deltas).toHaveLength(2);
    expect(deltas[0].text).toBe("Checking liquidity");
    expect(deltas[1].text).toBe(" on Uniswap...");
  });
});

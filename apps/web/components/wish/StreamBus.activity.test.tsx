import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useWorkspace } from "@/store/workspace";
import { StreamBus } from "./StreamBus";

// Mock startStream so we can drive onEvent ourselves.
vi.mock("./EventStream", () => ({
  startStream: vi.fn(async ({ onEvent }: { onEvent: (e: any) => void }) => {
    onEvent({ type: "tool.call", name: "uniswap.quote", input: { in: "ETH", out: "USDC" } });
    onEvent({ type: "tool.call", name: "porto.prepare_swap", input: {} });
  }),
}));

describe("StreamBus forwards tool.call to agent activity", () => {
  beforeEach(() => useWorkspace.getState().reset());
  it("appends each tool.call event with its name", async () => {
    render(<StreamBus />);
    window.dispatchEvent(new CustomEvent("wishd:wish", { detail: { wish: "swap eth", account: { address: "0x1", chainId: 11155111 } } }));
    // wait a tick
    await new Promise((r) => setTimeout(r, 10));
    const log = useWorkspace.getState().agentActivity;
    const names = log.map((e: any) => e.name).filter(Boolean);
    expect(names).toEqual(["uniswap.quote", "porto.prepare_swap"]);
  });
});

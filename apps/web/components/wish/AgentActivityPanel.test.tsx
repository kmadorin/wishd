import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useWorkspace } from "@/store/workspace";
import { AgentActivityPanel } from "./AgentActivityPanel";

describe("AgentActivityPanel", () => {
  beforeEach(() => useWorkspace.getState().reset());
  it("renders 'agent idle' when log is empty", () => {
    render(<AgentActivityPanel />);
    expect(screen.getByText(/agent idle/i)).toBeInTheDocument();
  });
  it("lists tool calls in arrival order", () => {
    useWorkspace.getState().appendAgentEvent({ kind: "tool.call", name: "uniswap.quote", input: {} });
    useWorkspace.getState().appendAgentEvent({ kind: "tool.call", name: "porto.prepare_swap", input: {} });
    render(<AgentActivityPanel />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/uniswap\.quote/);
    expect(items[1]).toHaveTextContent(/porto\.prepare_swap/);
  });
});

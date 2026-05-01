import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspace } from "./workspace";

describe("workspace store skeletons", () => {
  beforeEach(() => useWorkspace.getState().reset());

  it("appendSkeleton adds a pending entry", () => {
    useWorkspace.getState().appendSkeleton({ id: "s1", widgetType: "compound-summary", amount: "10", asset: "USDC" });
    const ws = useWorkspace.getState().widgets;
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ id: "s1", type: "__skeleton__", slot: "flow" });
    expect(ws[0]!.props).toMatchObject({ widgetType: "compound-summary", state: "pending", amount: "10", asset: "USDC" });
  });

  it("hydrateSkeleton swaps in place, preserving order", () => {
    useWorkspace.getState().appendSkeleton({ id: "s1", widgetType: "compound-summary", amount: "10", asset: "USDC" });
    useWorkspace.getState().appendWidget({ id: "x", type: "noise", slot: "flow", props: {} });
    useWorkspace.getState().hydrateSkeleton("s1", { id: "real", type: "compound-summary", slot: "flow", props: { foo: 1 } });
    const ws = useWorkspace.getState().widgets;
    expect(ws.map((w) => w.id)).toEqual(["real", "x"]);
    expect(ws[0]!.type).toBe("compound-summary");
  });

  it("failSkeleton flips state to error with message", () => {
    useWorkspace.getState().appendSkeleton({ id: "s1", widgetType: "compound-summary" });
    useWorkspace.getState().failSkeleton("s1", "rpc went boom");
    const ws = useWorkspace.getState().widgets;
    expect(ws[0]!.props).toMatchObject({ state: "error", errorMessage: "rpc went boom" });
  });

  it("hydrateSkeleton is a no-op if id not found", () => {
    useWorkspace.getState().appendWidget({ id: "x", type: "noise", slot: "flow", props: {} });
    useWorkspace.getState().hydrateSkeleton("missing", { id: "real", type: "compound-summary", slot: "flow", props: {} });
    expect(useWorkspace.getState().widgets.map((w) => w.id)).toEqual(["x"]);
  });
});

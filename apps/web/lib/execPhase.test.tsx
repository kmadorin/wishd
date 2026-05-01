import { describe, it, expect } from "vitest";
import { mapCompoundExec } from "./execPhase";

describe("mapCompoundExec", () => {
  it("ready + needsApprove → 4 steps, preflight active", () => {
    const r = mapCompoundExec({ phase: "ready", needsApprove: true });
    expect(r.map((s) => s.id)).toEqual(["preflight", "approve", "sign", "broadcast"]);
    expect(r[0]!.phase).toBe("active");
    expect(r[1]!.phase).toBe("queued");
  });
  it("ready without approve → 3 steps", () => {
    const r = mapCompoundExec({ phase: "ready", needsApprove: false });
    expect(r.map((s) => s.id)).toEqual(["preflight", "sign", "broadcast"]);
  });
  it("confirmed → all done", () => {
    const r = mapCompoundExec({ phase: "confirmed", needsApprove: false, txHash: "0xabc" });
    expect(r.every((s) => s.phase === "done")).toBe(true);
  });
});

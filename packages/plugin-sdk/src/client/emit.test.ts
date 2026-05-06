import { describe, it, expect, beforeEach } from "vitest";
import { _emitBusForTest, useEmitStore } from "./emit";

describe("client emit bus", () => {
  beforeEach(() => _emitBusForTest.reset());

  it("emit pushes event onto the queue", () => {
    const e = { type: "notification", level: "info", text: "hi" } as const;
    useEmitStore.getState().emit(e);
    expect(useEmitStore.getState().events).toEqual([e]);
  });

  it("clear() empties the queue", () => {
    useEmitStore.getState().emit({ type: "error", message: "x" });
    useEmitStore.getState().clear();
    expect(useEmitStore.getState().events).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { demoIntents } from "./intents";

describe("demo-stubs intents", () => {
  it("exposes 4 intents with the prototype labels", () => {
    const ids = demoIntents.map((i) => i.intent);
    expect(ids).toEqual(["demo.borrow", "demo.earn", "demo.bridge", "demo.find-vault"]);
  });
  it("borrow has a protocol select with Aave V3 default", () => {
    const borrow = demoIntents.find((i) => i.intent === "demo.borrow")!;
    const proto = borrow.fields.find((f) => f.key === "protocol")!;
    expect(proto.type).toBe("select");
    expect((proto as any).default).toBe("aave-v3");
    expect((proto as any).options).toContain("aave-v3");
  });
  it("bridge has fromChain and toChain", () => {
    const bridge = demoIntents.find((i) => i.intent === "demo.bridge")!;
    const keys = bridge.fields.map((f) => f.key);
    expect(keys).toContain("fromChain");
    expect(keys).toContain("toChain");
  });
});

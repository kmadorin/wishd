import { describe, it, expect } from "vitest";
import { CLIENT_INTENT_REGISTRY, CLIENT_INTENT_SCHEMAS } from "./intentRegistry.client";

describe("CLIENT_INTENT_REGISTRY", () => {
  it("is a Map keyed by verb", () => {
    expect(CLIENT_INTENT_REGISTRY).toBeInstanceOf(Map);
    const swap = CLIENT_INTENT_REGISTRY.get("swap");
    expect(Array.isArray(swap)).toBe(true);
    expect(swap?.length).toBeGreaterThan(0);
    expect(swap?.[0]).toMatchObject({ pluginName: "uniswap" });
  });

  it("each entry has schema + pluginName", () => {
    for (const [verb, entries] of CLIENT_INTENT_REGISTRY.entries()) {
      expect(typeof verb).toBe("string");
      for (const e of entries) {
        expect(typeof e.pluginName).toBe("string");
        expect(typeof e.schema.intent).toBe("string");
        expect(e.schema.verb).toBe(verb);
      }
    }
  });

  it("CLIENT_INTENT_SCHEMAS is preserved as flat array (back-compat)", () => {
    expect(Array.isArray(CLIENT_INTENT_SCHEMAS)).toBe(true);
    expect(CLIENT_INTENT_SCHEMAS.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { manifest } from "./manifest";
import { delegation } from "./delegation";

describe("auto-compound-comp manifest.explainer", () => {
  it("provides whatThisDoes copy", () => {
    expect(manifest.explainer.whatThisDoes.length).toBeGreaterThan(20);
  });

  it("has perCall entries for every allowlisted call target", () => {
    if (delegation.kind !== "porto-permissions") throw new Error();
    for (const c of delegation.fixed.calls) {
      const entry = manifest.explainer.perCall[c.to];
      expect(entry, `missing perCall entry for ${c.to}`).toBeDefined();
      expect(entry!.label.length).toBeGreaterThan(0);
      expect(entry!.purpose.length).toBeGreaterThan(0);
    }
  });

  it("has perToken entries with decimals for every spend bound token", () => {
    if (delegation.kind !== "porto-permissions") throw new Error();
    for (const b of delegation.spend.bounds) {
      const entry = manifest.explainer.perToken[b.token];
      expect(entry, `missing perToken entry for ${b.token}`).toBeDefined();
      expect(entry!.decimals).toBeGreaterThanOrEqual(0);
    }
  });
});

import { describe, it, expect } from "vitest";
import { loadPlugins } from "./pluginLoader";

describe("loadPlugins includes demo-stubs", () => {
  it("loads 4 demo intents", async () => {
    const { plugins } = await loadPlugins();
    const demo = plugins.find((p) => p.manifest.name === "demo-stubs");
    expect(demo).toBeDefined();
    expect(demo!.intents!.map((i) => i.intent)).toEqual([
      "demo.borrow",
      "demo.earn",
      "demo.bridge",
      "demo.find-vault",
    ]);
  });
});

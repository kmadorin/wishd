import { describe, it, expect } from "vitest";
import { loadPlugins } from "./pluginLoader";

describe("loadPlugins", () => {
  it("returns compound-v3 manifest with expected widgets", async () => {
    const { plugins, widgetTypes, allowedTools } = await loadPlugins();
    expect(plugins.map((p) => p.manifest.name)).toContain("compound-v3");
    expect(widgetTypes).toEqual(expect.arrayContaining(["compound-summary", "compound-execute"]));
    expect(allowedTools).toEqual(expect.arrayContaining(["mcp__widget__*", "mcp__compound__*"]));
  });
});

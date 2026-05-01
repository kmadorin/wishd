import { describe, it, expect } from "vitest";
import { buildIntentRegistry, getIntentSchema, listIntents } from "./intentRegistry";
import type { Plugin, IntentSchema } from "@wishd/plugin-sdk";

const schema: IntentSchema = {
  intent: "x.foo",
  verb: "foo",
  description: "do foo",
  fields: [{ key: "amount", type: "amount", required: true, default: "1" }],
  widget: "x-foo",
};

const fakePlugin = {
  manifest: { name: "x", version: "0", chains: [1], trust: "verified", provides: { intents: [], widgets: [], mcps: [] } },
  mcp: () => ({ server: {} as never, serverName: "x" }),
  widgets: {},
  intents: [schema],
} as unknown as Plugin;

describe("intentRegistry", () => {
  it("buildIntentRegistry flattens plugin.intents", () => {
    const reg = buildIntentRegistry([fakePlugin]);
    expect(reg.size).toBe(1);
    expect(reg.get("x.foo")).toEqual(schema);
  });

  it("buildIntentRegistry tolerates plugins without intents", () => {
    const without = { ...fakePlugin, intents: undefined } as Plugin;
    expect(buildIntentRegistry([without]).size).toBe(0);
  });

  it("buildIntentRegistry throws on duplicate intent ids", () => {
    expect(() => buildIntentRegistry([fakePlugin, fakePlugin])).toThrow(/duplicate intent/i);
  });

  it("getIntentSchema reads from cached registry; listIntents returns array", async () => {
    const list = await listIntents();
    expect(Array.isArray(list)).toBe(true);
    const found = await getIntentSchema("compound-v3.deposit");
    expect(found?.widget).toBe("compound-summary");
  });

  it("uniswap.swap schema is available with widget swap-summary", async () => {
    const found = await getIntentSchema("uniswap.swap");
    expect(found?.widget).toBe("swap-summary");
  });
});

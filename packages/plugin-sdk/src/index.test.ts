import { describe, it, expect } from "vitest";
import { definePlugin, defineKeeper } from "./index";
import type { Plugin, Keeper, Address } from "./index";

describe("plugin-sdk", () => {
  it("definePlugin returns input unchanged", () => {
    const stub: Plugin = {
      manifest: { name: "x", version: "0", chains: [1], trust: "verified", provides: { intents: [], widgets: [], mcps: [] } },
      mcp: () => ({ server: {} as never, serverName: "x" }),
      widgets: {},
    };
    expect(definePlugin(stub)).toBe(stub);
  });

  it("defineKeeper returns input unchanged", () => {
    const stub: Keeper = {
      manifest: {
        id: "k",
        name: "K",
        description: "test keeper",
        version: "0.0.0",
        plugins: [],
        chains: [1],
        trust: "verified",
        appliesTo: [],
      },
      delegation: {
        kind: "comet-allow",
        comet: "0x0000000000000000000000000000000000000000" as Address,
        manager: "0x0000000000000000000000000000000000000000" as Address,
      },
      buildWorkflow: () => ({ name: "w", nodes: [], edges: [] }),
    };
    expect(defineKeeper(stub)).toBe(stub);
  });

  it("Plugin accepts optional intents array of IntentSchema", () => {
    const schema: import("./index").IntentSchema = {
      intent: "compound-v3.deposit",
      verb: "deposit",
      description: "supply tokens to earn yield",
      fields: [
        { key: "amount", type: "amount", required: true, default: "10" },
        { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
        { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
      ],
      widget: "compound-summary",
      slot: "flow",
    };
    const stub: Plugin = {
      manifest: { name: "x", version: "0", chains: [1], trust: "verified", provides: { intents: [], widgets: [], mcps: [] } },
      mcp: () => ({ server: {} as never, serverName: "x" }),
      widgets: {},
      intents: [schema],
    };
    expect(definePlugin(stub).intents).toEqual([schema]);
  });
});

import { expectTypeOf } from "vitest";
import type {
  KeeperManifest,
  DelegationSpec,
  PortoPermissionsBounds,
  PortoPermissionsGrant,
  ExpiryPolicy,
  KhWorkflowJson,
  WorkflowParams,
  KeeperOffer,
  KeeperState,
} from ".";

describe("keeper types", () => {
  it("KeeperManifest carries id and appliesTo", () => {
    const m: KeeperManifest = {
      id: "x",
      name: "X",
      description: "d",
      version: "0.0.0",
      chains: [11155111],
      plugins: ["compound-v3"],
      trust: "verified",
      appliesTo: [{ intent: "compound-v3.deposit" }],
    };
    expectTypeOf(m.appliesTo).toEqualTypeOf<Array<{ intent: string }>>();
  });

  it("DelegationSpec discriminates porto-permissions w/ bounds", () => {
    const d: DelegationSpec = {
      kind: "porto-permissions",
      fixed: {
        calls: ["0x0000000000000000000000000000000000000001" as Address],
        feeToken: "0x0000000000000000000000000000000000000000" as Address,
      },
      expiryPolicy: { kind: "unlimited" },
      spend: {
        bounds: [
          { token: "0x0000000000000000000000000000000000000002" as Address, maxLimit: 1n, periods: ["month"] },
        ],
        defaults: [
          { token: "0x0000000000000000000000000000000000000002" as Address, limit: 1n, period: "month" },
        ],
      },
    };
    expectTypeOf(d.kind).toMatchTypeOf<"porto-permissions" | "comet-allow">();
  });

  it("ExpiryPolicy union", () => {
    const a: ExpiryPolicy = { kind: "unlimited" };
    const b: ExpiryPolicy = { kind: "bounded", maxDays: 30 };
    const c: ExpiryPolicy = { kind: "fixed", days: 7 };
    expectTypeOf(a).toMatchTypeOf<ExpiryPolicy>();
    expectTypeOf(b).toMatchTypeOf<ExpiryPolicy>();
    expectTypeOf(c).toMatchTypeOf<ExpiryPolicy>();
  });

  it("KhWorkflowJson allows nested data on nodes", () => {
    const w: KhWorkflowJson = {
      name: "n",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: { type: "trigger", label: "Schedule", config: { cron: "0 * * * *", enabled: false, actionType: "schedule" }, status: "idle" },
        },
      ],
      edges: [],
    };
    expectTypeOf(w.nodes[0]!.data.config).toEqualTypeOf<Record<string, unknown>>();
  });

  it("Keeper bundles manifest + delegation + buildWorkflow", () => {
    const k: Keeper = {
      manifest: {
        id: "x", name: "X", description: "d", version: "0.0.0",
        chains: [11155111], plugins: ["compound-v3"], trust: "verified",
        appliesTo: [{ intent: "compound-v3.deposit" }],
      },
      delegation: {
        kind: "porto-permissions",
        fixed: { calls: ["0x0000000000000000000000000000000000000001" as Address], feeToken: "0x0000000000000000000000000000000000000000" as Address },
        expiryPolicy: { kind: "unlimited" },
        spend: { bounds: [], defaults: [] },
      },
      buildWorkflow: (p: WorkflowParams) => ({
        name: `wishd:x:${p.userPortoAddress}`,
        nodes: [],
        edges: [],
      }),
    };
    expectTypeOf(k.buildWorkflow).parameter(0).toEqualTypeOf<WorkflowParams>();
  });

  it("KeeperOffer + KeeperState cover the recommendation API", () => {
    const o: KeeperOffer = {
      keeperId: "x",
      title: "T",
      desc: "D",
      badge: "KEEPERHUB",
      featured: true,
      state: { kind: "not_deployed" },
    };
    const s1: KeeperState = { kind: "not_deployed" };
    const s2: KeeperState = { kind: "deployed_enabled", workflowId: "w", permissionsId: "0xabc" };
    const s3: KeeperState = { kind: "deployed_disabled", workflowId: "w", permissionsId: "0xabc" };
    expectTypeOf(o.state).toEqualTypeOf<KeeperState>();
    expectTypeOf(s1).toMatchTypeOf<KeeperState>();
    expectTypeOf(s2).toMatchTypeOf<KeeperState>();
    expectTypeOf(s3).toMatchTypeOf<KeeperState>();
  });
});

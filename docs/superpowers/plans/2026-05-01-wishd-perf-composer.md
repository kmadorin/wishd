# wishd Perf Patch + Structured Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut click-to-visible latency from ~29s to <100ms (skeleton) / ~1–2s (hydrated widget on composer path) / ~5–7s (free-text path) by introducing a structured intent composer + deterministic `/api/prepare/[intent]` route, while keeping the LLM agent in the loop as a parallel narrator.

**Architecture:** Add `IntentSchema` to `@wishd/plugin-sdk`. `compound-v3` exports two schemas (deposit, withdraw). `apps/web/server/intentRegistry.ts` flattens schemas at boot. New `/api/prepare/[intent]` route calls existing `prepareDeposit`/`prepareWithdraw` directly (no agent). `WishComposer` becomes a structured single-row form driven by the registry; submit fires both `/api/prepare` (fast hydrate) and `/api/chat` with `mode: "narrate-only"` (parallel narration). Free-text path keeps the existing agent loop but switches the default model to Haiku 4.5 and tightens the system prompt + `maxTurns`. Skeleton card is shared UI; only the trigger differs.

**Tech Stack:** Existing — pnpm monorepo, Next.js 15, React 19, viem v2, Claude Agent SDK, Zustand, Vitest. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-05-01-wishd-perf-composer-design.md` (approved). Parent: `docs/superpowers/specs/2026-05-01-wishd-skeleton-design.md` (Appendix A). Style reference: `docs/superpowers/plans/2026-05-01-wishd-skeleton.md`.

**TDD pragmatics:** Pure stuff (schema types, registry flattening, route validation, intent dispatch, skeleton swap-by-id reducer, SSE narrate-only branch) gets unit tests. React composer + StreamBus + agent narration end-to-end exercised via the manual verification protocol (last task). The plan flags which is which.

---

## Phase 1 — IntentSchema in plugin-sdk

### Task 1: Extend `@wishd/plugin-sdk` with `IntentSchema` types

**Files:**
- Modify: `packages/plugin-sdk/src/index.ts`
- Modify: `packages/plugin-sdk/src/index.test.ts`

- [ ] **Step 1: Write the failing test additions**

Append to `packages/plugin-sdk/src/index.test.ts` inside `describe("plugin-sdk", ...)`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wishd/plugin-sdk test`
Expected: FAIL — `IntentSchema` not exported and/or `Plugin.intents` not allowed.

- [ ] **Step 3: Add types to `packages/plugin-sdk/src/index.ts`**

Insert after the existing `WidgetSlot` declaration:

```ts
export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset"; required?: boolean; default?: string; options: string[] }
  | { key: string; type: "chain"; required?: boolean; default: string; options: string[] };

export type IntentSchema = {
  /** Plugin-namespaced id, e.g. "compound-v3.deposit". */
  intent: string;
  /** Composer label / verb, e.g. "deposit", "withdraw". */
  verb: string;
  /** Sentence-case description shown in the action dropdown row. */
  description: string;
  /** Ordered list of fields rendered after the verb. */
  fields: IntentField[];
  /** Widget name passed to ui.render / mounted by the registry. */
  widget: string;
  /** Slot for forward-compat. v0.1 always "flow". */
  slot?: WidgetSlot;
};
```

Then extend the existing `Plugin` type, adding the `intents` line:

```ts
export type Plugin = {
  manifest: Manifest;
  mcp(ctx: PluginCtx): { server: Server; serverName: string };
  widgets: Record<string, ComponentType<any>>;
  skills?: Record<string, string>;
  intents?: IntentSchema[];
};
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @wishd/plugin-sdk test && pnpm --filter @wishd/plugin-sdk typecheck`
Expected: PASS, all tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-sdk/src/index.ts packages/plugin-sdk/src/index.test.ts
git commit -m "feat(plugin-sdk): add IntentSchema/IntentField + optional Plugin.intents"
```

---

## Phase 2 — Compound-v3 intent schemas

### Task 2: Export `compound-v3.deposit` and `compound-v3.withdraw` schemas

**Files:**
- Create: `plugins/compound-v3/intents.ts`
- Modify: `plugins/compound-v3/index.ts`
- Create: `plugins/compound-v3/intents.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/compound-v3/intents.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compoundIntents } from "./intents";

describe("compound-v3 intents", () => {
  it("exports deposit + withdraw with shared field shape", () => {
    expect(compoundIntents.map((i) => i.intent)).toEqual([
      "compound-v3.deposit",
      "compound-v3.withdraw",
    ]);
    for (const i of compoundIntents) {
      expect(i.fields.map((f) => f.type)).toEqual(["amount", "asset", "chain"]);
      const asset = i.fields.find((f) => f.key === "asset")!;
      expect(asset.type).toBe("asset");
      if (asset.type === "asset") expect(asset.options).toEqual(["USDC"]);
      const chain = i.fields.find((f) => f.key === "chain")!;
      expect(chain.type).toBe("chain");
      if (chain.type === "chain") expect(chain.options).toEqual(["ethereum-sepolia"]);
    }
  });

  it("deposit maps to compound-summary widget, withdraw to compound-withdraw-summary", () => {
    const deposit = compoundIntents.find((i) => i.intent === "compound-v3.deposit")!;
    const withdraw = compoundIntents.find((i) => i.intent === "compound-v3.withdraw")!;
    expect(deposit.widget).toBe("compound-summary");
    expect(withdraw.widget).toBe("compound-withdraw-summary");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wishd/plugin-compound-v3 test`
Expected: FAIL — module `./intents` not found.

- [ ] **Step 3: Write `plugins/compound-v3/intents.ts`**

```ts
import type { IntentSchema } from "@wishd/plugin-sdk";

const sharedFields: IntentSchema["fields"] = [
  { key: "amount", type: "amount", required: true, default: "10" },
  { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
  { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
];

export const compoundIntents: IntentSchema[] = [
  {
    intent: "compound-v3.deposit",
    verb: "deposit",
    description: "supply tokens to earn yield",
    fields: sharedFields,
    widget: "compound-summary",
    slot: "flow",
  },
  {
    intent: "compound-v3.withdraw",
    verb: "withdraw",
    description: "redeem tokens you previously supplied",
    fields: sharedFields,
    widget: "compound-withdraw-summary",
    slot: "flow",
  },
];
```

- [ ] **Step 4: Wire into the plugin export**

Edit `plugins/compound-v3/index.ts`:

```ts
import { definePlugin } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { createCompoundMcp } from "./mcp/server";
import { CompoundSummary, CompoundExecute, CompoundWithdrawSummary } from "./widgets";
import { compoundIntents } from "./intents";

export const compoundV3 = definePlugin({
  manifest,
  mcp(ctx) {
    return { server: createCompoundMcp(ctx) as any, serverName: "compound" };
  },
  widgets: {
    "compound-summary": CompoundSummary,
    "compound-execute": CompoundExecute,
    "compound-withdraw-summary": CompoundWithdrawSummary,
  },
  intents: compoundIntents,
});

export { CompoundSummary, CompoundExecute, CompoundWithdrawSummary, manifest, compoundIntents };
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter @wishd/plugin-compound-v3 test && pnpm --filter @wishd/plugin-compound-v3 typecheck`
Expected: PASS, all tests; no type errors.

- [ ] **Step 6: Commit**

```bash
git add plugins/compound-v3/intents.ts plugins/compound-v3/intents.test.ts plugins/compound-v3/index.ts
git commit -m "feat(plugin-compound-v3): export deposit + withdraw IntentSchemas"
```

---

## Phase 3 — Server intent registry

### Task 3: `apps/web/server/intentRegistry.ts`

**Files:**
- Create: `apps/web/server/intentRegistry.ts`
- Create: `apps/web/server/intentRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/server/intentRegistry.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- intentRegistry`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/server/intentRegistry.ts`**

```ts
import type { IntentSchema, Plugin } from "@wishd/plugin-sdk";
import { loadPlugins } from "./pluginLoader";

export function buildIntentRegistry(plugins: Plugin[]): Map<string, IntentSchema> {
  const reg = new Map<string, IntentSchema>();
  for (const p of plugins) {
    for (const s of p.intents ?? []) {
      if (reg.has(s.intent)) {
        throw new Error(`duplicate intent id: ${s.intent}`);
      }
      reg.set(s.intent, s);
    }
  }
  return reg;
}

let cached: Promise<Map<string, IntentSchema>> | null = null;

async function registry(): Promise<Map<string, IntentSchema>> {
  if (!cached) {
    cached = loadPlugins().then(({ plugins }) => buildIntentRegistry(plugins));
  }
  return cached;
}

export async function getIntentSchema(id: string): Promise<IntentSchema | undefined> {
  return (await registry()).get(id);
}

export async function listIntents(): Promise<IntentSchema[]> {
  return [...(await registry()).values()];
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter web test -- intentRegistry && pnpm --filter web typecheck`
Expected: PASS, 4 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/intentRegistry.ts apps/web/server/intentRegistry.test.ts
git commit -m "feat(web): server intent registry (boot-time flatten of plugin.intents)"
```

---

## Phase 4 — `/api/prepare/[intent]` route

### Task 4: Intent dispatch table for compound-v3

**Files:**
- Create: `apps/web/server/intentDispatch.ts`
- Create: `apps/web/server/intentDispatch.test.ts`

Goal: pure dispatch from `intent` id + body → `{ prepared, widget }` payload. Keeps the route handler thin.

- [ ] **Step 1: Write the failing test**

`apps/web/server/intentDispatch.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { dispatchIntent } from "./intentDispatch";

const fakePublicClient = {
  readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "allowance") return 0n;
    if (functionName === "balanceOf") return 1_000_000_000n;
    return 0n;
  }),
} as any;

describe("dispatchIntent", () => {
  it("dispatches compound-v3.deposit", async () => {
    const out = await dispatchIntent("compound-v3.deposit", {
      body: { amount: "10", asset: "USDC", chain: "ethereum-sepolia", address: "0x000000000000000000000000000000000000dead" },
      publicClient: fakePublicClient,
    });
    expect(out.widget.type).toBe("compound-summary");
    expect(out.widget.slot).toBe("flow");
    expect(out.widget.id).toMatch(/^w_/);
    expect(out.prepared.meta.asset).toBe("USDC");
    expect(out.prepared.meta.insufficient).toBe(false);
    expect(out.widget.props).toMatchObject({
      amount: "10",
      asset: "USDC",
      market: "cUSDCv3",
      chainId: 11155111,
    });
  });

  it("dispatches compound-v3.withdraw", async () => {
    fakePublicClient.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "balanceOf") return 1_000_000_000n;
      return 0n;
    });
    const out = await dispatchIntent("compound-v3.withdraw", {
      body: { amount: "5", asset: "USDC", chain: "ethereum-sepolia", address: "0x000000000000000000000000000000000000dead" },
      publicClient: fakePublicClient,
    });
    expect(out.widget.type).toBe("compound-withdraw-summary");
    expect(out.prepared.meta.supplied).toBe("1000");
  });

  it("rejects unknown intent", async () => {
    await expect(
      dispatchIntent("x.unknown", { body: { amount: "1" }, publicClient: fakePublicClient }),
    ).rejects.toThrow(/unknown intent/i);
  });

  it("validates required amount", async () => {
    await expect(
      dispatchIntent("compound-v3.deposit", {
        body: { asset: "USDC", chain: "ethereum-sepolia", address: "0x0000000000000000000000000000000000000000" },
        publicClient: fakePublicClient,
      }),
    ).rejects.toThrow(/amount/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- intentDispatch`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/server/intentDispatch.ts`**

```ts
import type { Address, PublicClient } from "viem";
import { COMPOUND_ADDRESSES } from "@plugins/compound-v3/addresses";
import { prepareDeposit, prepareWithdraw } from "@plugins/compound-v3/prepare";
import { getIntentSchema } from "./intentRegistry";

export type DispatchInput = {
  body: Record<string, unknown>;
  publicClient: Pick<PublicClient, "readContract">;
};

export type DispatchOutput = {
  prepared: unknown;
  widget: { id: string; type: string; slot: "flow"; props: Record<string, unknown> };
};

const CHAIN_TO_ID: Record<string, number> = { "ethereum-sepolia": 11155111 };

function newWidgetId(): string {
  return `w_${Math.random().toString(36).slice(2, 10)}`;
}

function requireAmount(body: Record<string, unknown>): string {
  const a = body.amount;
  if (typeof a !== "string" || a.trim() === "") throw new Error("amount required (string)");
  return a;
}

function requireAddress(body: Record<string, unknown>): Address {
  const a = body.address;
  if (typeof a !== "string" || !a.startsWith("0x")) throw new Error("address required (0x...)");
  return a as Address;
}

function requireChainId(body: Record<string, unknown>): number {
  const c = body.chain;
  if (typeof c !== "string" || !(c in CHAIN_TO_ID)) throw new Error(`unsupported chain: ${String(c)}`);
  return CHAIN_TO_ID[c]!;
}

export async function dispatchIntent(
  intent: string,
  input: DispatchInput,
): Promise<DispatchOutput> {
  const schema = await getIntentSchema(intent);
  if (!schema) throw new Error(`unknown intent: ${intent}`);

  const amount = requireAmount(input.body);
  const user = requireAddress(input.body);
  const chainId = requireChainId(input.body);

  if (intent === "compound-v3.deposit") {
    const prepared = await prepareDeposit({ amount, user, chainId, publicClient: input.publicClient as PublicClient });
    const addrs = COMPOUND_ADDRESSES[chainId]!;
    return {
      prepared,
      widget: {
        id: newWidgetId(),
        type: schema.widget,
        slot: "flow",
        props: {
          amount,
          asset: "USDC",
          market: "cUSDCv3",
          needsApprove: prepared.meta.needsApprove,
          summaryId: newWidgetId(),
          amountWei: prepared.meta.amountWei,
          chainId,
          user,
          comet: addrs.Comet,
          usdc: addrs.USDC,
          calls: prepared.calls,
          balance: prepared.meta.balance,
          insufficient: prepared.meta.insufficient,
        },
      },
    };
  }

  if (intent === "compound-v3.withdraw") {
    const prepared = await prepareWithdraw({ amount, user, chainId, publicClient: input.publicClient as PublicClient });
    const addrs = COMPOUND_ADDRESSES[chainId]!;
    return {
      prepared,
      widget: {
        id: newWidgetId(),
        type: schema.widget,
        slot: "flow",
        props: {
          amount,
          asset: "USDC",
          market: "cUSDCv3",
          summaryId: newWidgetId(),
          amountWei: prepared.meta.amountWei,
          chainId,
          user,
          comet: addrs.Comet,
          usdc: addrs.USDC,
          calls: prepared.calls,
          supplied: prepared.meta.supplied,
          insufficient: prepared.meta.insufficient,
        },
      },
    };
  }

  throw new Error(`unknown intent: ${intent}`);
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter web test -- intentDispatch && pnpm --filter web typecheck`
Expected: PASS, 4 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/intentDispatch.ts apps/web/server/intentDispatch.test.ts
git commit -m "feat(web): intent dispatch table (deposit + withdraw)"
```

### Task 5: `POST /api/prepare/[intent]` route handler

**Files:**
- Create: `apps/web/app/api/prepare/[intent]/route.ts`

Note: tested via the integration script in Task 14; route handler is a thin shell over `dispatchIntent`. No standalone unit test (would require Next request mocking — low value).

- [ ] **Step 1: Write the route**

`apps/web/app/api/prepare/[intent]/route.ts`:

```ts
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { dispatchIntent } from "@/server/intentDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ intent: string }> },
): Promise<Response> {
  const { intent } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  const t0 = Date.now();
  try {
    const out = await dispatchIntent(intent, { body, publicClient });
    console.info(JSON.stringify({ tag: "wishd:perf", event: "prepare-roundtrip-ms", intent, ms: Date.now() - t0 }));
    return Response.json(out, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unknown intent/i.test(msg)) return Response.json({ error: msg }, { status: 404 });
    if (/required|unsupported chain|amount/i.test(msg)) return Response.json({ error: msg }, { status: 400 });
    if (/insufficient/i.test(msg)) return Response.json({ error: msg }, { status: 422 });
    console.error("prepare route failure", err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/prepare/[intent]/route.ts
git commit -m "feat(web): /api/prepare/[intent] fast-path route"
```

---

## Phase 5 — Skeleton card

### Task 6: `SkeletonStepCard` component

**Files:**
- Create: `apps/web/components/workspace/SkeletonStepCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { StepCard } from "@/components/primitives/StepCard";

export type SkeletonStepCardProps = {
  step: string;
  title: string;
  sub?: string;
  amount?: string;
  asset?: string;
  state?: "pending" | "error";
  errorMessage?: string;
  onRetry?: () => void;
};

export function SkeletonStepCard(props: SkeletonStepCardProps) {
  const { step, title, sub, amount, asset, state = "pending", errorMessage, onRetry } = props;
  const shimmer = "animate-pulse bg-bg-2 rounded-sm";
  return (
    <StepCard step={step} title={title} sub={sub}>
      <div className="space-y-3">
        <div className="text-sm text-ink-2">
          {amount && asset ? (
            <span>
              <span className="font-mono">{amount}</span> <span>{asset}</span>
            </span>
          ) : (
            <span className={`inline-block h-4 w-32 ${shimmer}`} />
          )}
        </div>
        <div className={`h-12 w-full ${shimmer}`} />
        <div className="flex gap-2">
          <button type="button" disabled className="rounded-pill bg-bg-2 text-ink-3 px-4 py-2 cursor-not-allowed">
            {state === "pending" ? "preparing…" : "unavailable"}
          </button>
          {state === "error" && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2"
            >
              retry
            </button>
          )}
        </div>
        {state === "error" && errorMessage && (
          <p className="text-sm text-bad">{errorMessage}</p>
        )}
      </div>
    </StepCard>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/workspace/SkeletonStepCard.tsx
git commit -m "feat(web): skeleton step card (pending + error states)"
```

### Task 7: Extend Zustand workspace store with skeleton lifecycle

**Files:**
- Modify: `apps/web/store/workspace.ts`
- Create: `apps/web/store/workspace.test.ts`

Goal: store can hold a skeleton entry, swap it for a real widget by id, or flip it to error.

- [ ] **Step 1: Write the failing test**

`apps/web/store/workspace.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- workspace`
Expected: FAIL — `appendSkeleton`, `hydrateSkeleton`, `failSkeleton` undefined.

- [ ] **Step 3: Extend `apps/web/store/workspace.ts`**

Replace the entire file contents:

```ts
import { create } from "zustand";
import type { WidgetSlot } from "@wishd/plugin-sdk";

export type WidgetInstance = {
  id: string;
  type: string;
  slot: WidgetSlot;
  props: Record<string, unknown>;
  createdAt: number;
};

export type SkeletonInit = {
  id: string;
  widgetType: string;
  amount?: string;
  asset?: string;
};

type State = {
  widgets: WidgetInstance[];
  narration: string;
  appendWidget: (w: Omit<WidgetInstance, "createdAt">) => void;
  patchWidget: (id: string, props: Record<string, unknown>) => void;
  dismissWidget: (id: string) => void;
  appendSkeleton: (s: SkeletonInit) => void;
  hydrateSkeleton: (id: string, replacement: Omit<WidgetInstance, "createdAt">) => void;
  failSkeleton: (id: string, message: string) => void;
  appendNarration: (delta: string) => void;
  reset: () => void;
};

const STEP_FOR_WIDGET: Record<string, { step: string; title: string; sub?: string }> = {
  "compound-summary": { step: "STEP 02", title: "your supply, materialized", sub: "review and execute" },
  "compound-withdraw-summary": { step: "STEP 02", title: "your withdraw, materialized", sub: "review and execute" },
  "compound-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" },
};

export const SKELETON_TYPE = "__skeleton__";

export const useWorkspace = create<State>((set) => ({
  widgets: [],
  narration: "",
  appendWidget: (w) =>
    set((s) => ({
      widgets: [...s.widgets, { ...w, createdAt: Date.now() }],
    })),
  patchWidget: (id, props) =>
    set((s) => ({
      widgets: s.widgets.map((x) => (x.id === id ? { ...x, props: { ...x.props, ...props } } : x)),
    })),
  dismissWidget: (id) =>
    set((s) => ({ widgets: s.widgets.filter((x) => x.id !== id) })),
  appendSkeleton: ({ id, widgetType, amount, asset }) =>
    set((s) => {
      const label = STEP_FOR_WIDGET[widgetType] ?? { step: "STEP 02", title: "preparing…" };
      return {
        widgets: [
          ...s.widgets,
          {
            id,
            type: SKELETON_TYPE,
            slot: "flow",
            props: {
              widgetType,
              state: "pending",
              amount,
              asset,
              step: label.step,
              title: label.title,
              sub: label.sub,
            },
            createdAt: Date.now(),
          },
        ],
      };
    }),
  hydrateSkeleton: (id, replacement) =>
    set((s) => {
      const idx = s.widgets.findIndex((w) => w.id === id);
      if (idx === -1) return s;
      const next = s.widgets.slice();
      next[idx] = { ...replacement, createdAt: Date.now() };
      return { widgets: next };
    }),
  failSkeleton: (id, message) =>
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.id === id && w.type === SKELETON_TYPE
          ? { ...w, props: { ...w.props, state: "error", errorMessage: message } }
          : w,
      ),
    })),
  appendNarration: (delta) => set((s) => ({ narration: s.narration + delta })),
  reset: () => set({ widgets: [], narration: "" }),
}));
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter web test -- workspace && pnpm --filter web typecheck`
Expected: PASS, 4 tests; no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/store/workspace.ts apps/web/store/workspace.test.ts
git commit -m "feat(web): skeleton lifecycle in workspace store"
```

### Task 8: Render skeletons in `StepStack`

**Files:**
- Modify: `apps/web/components/workspace/StepStack.tsx`

- [ ] **Step 1: Replace `apps/web/components/workspace/StepStack.tsx`**

```tsx
"use client";

import { useWorkspace, SKELETON_TYPE } from "@/store/workspace";
import { getWidget } from "@/widgetRegistry";
import { StepCard } from "@/components/primitives/StepCard";
import { SkeletonStepCard } from "./SkeletonStepCard";

const STEP_LABELS: Record<string, { step: string; title: string; sub?: string }> = {
  "compound-summary": { step: "STEP 02", title: "your supply, materialized", sub: "review and execute" },
  "compound-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" },
  "compound-withdraw-summary": {
    step: "STEP 02",
    title: "your withdraw, materialized",
    sub: "review and execute",
  },
};

export function StepStack() {
  const widgets = useWorkspace((s) => s.widgets);
  const flow = widgets.filter((w) => w.slot === "flow");
  return (
    <>
      {flow.map((w) => {
        if (w.type === SKELETON_TYPE) {
          const p = w.props as {
            widgetType: string;
            state?: "pending" | "error";
            errorMessage?: string;
            amount?: string;
            asset?: string;
            step?: string;
            title?: string;
            sub?: string;
          };
          return (
            <SkeletonStepCard
              key={w.id}
              step={p.step ?? "STEP 02"}
              title={p.title ?? "preparing…"}
              sub={p.sub}
              amount={p.amount}
              asset={p.asset}
              state={p.state}
              errorMessage={p.errorMessage}
            />
          );
        }
        const W = getWidget(w.type);
        if (!W) return null;
        const label = STEP_LABELS[w.type] ?? { step: "STEP", title: w.type };
        return (
          <StepCard key={w.id} step={label.step} title={label.title} sub={label.sub}>
            <W {...w.props} />
          </StepCard>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/workspace/StepStack.tsx
git commit -m "feat(web): StepStack renders skeletons before hydration"
```

---

## Phase 6 — Structured composer

### Task 9: `StructuredComposer.tsx` (presentational)

**Files:**
- Create: `apps/web/components/wish/StructuredComposer.tsx`

Pure presentational component. Receives `IntentSchema[]` + handler props. WishComposer wires it to data + actions in Task 10.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState, useMemo } from "react";
import type { IntentSchema, IntentField } from "@wishd/plugin-sdk";

export type StructuredSubmit = {
  intent: string;
  values: Record<string, string>;
};

export type StructuredComposerProps = {
  schemas: IntentSchema[];
  onSubmit: (s: StructuredSubmit) => void;
  busy?: boolean;
};

function defaultsFor(schema: IntentSchema): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of schema.fields) {
    if ("default" in f && f.default != null) out[f.key] = f.default;
    else out[f.key] = "";
  }
  return out;
}

export function StructuredComposer({ schemas, onSubmit, busy }: StructuredComposerProps) {
  const [intentId, setIntentId] = useState<string>(schemas[0]?.intent ?? "");
  const schema = useMemo(() => schemas.find((s) => s.intent === intentId), [schemas, intentId]);
  const [values, setValues] = useState<Record<string, string>>(() => (schema ? defaultsFor(schema) : {}));

  function pick(id: string) {
    setIntentId(id);
    const next = schemas.find((s) => s.intent === id);
    setValues(next ? defaultsFor(next) : {});
  }

  function setField(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function submit() {
    if (!schema) return;
    for (const f of schema.fields) {
      if (f.required && !values[f.key]) return;
    }
    onSubmit({ intent: schema.intent, values });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-wrap items-center gap-2 text-base"
    >
      <span className="text-ink-2">I want to</span>
      <select
        value={intentId}
        onChange={(e) => pick(e.target.value)}
        disabled={busy}
        className="rounded-sm bg-surface-2 border border-rule px-2 py-1 font-medium text-ink"
        aria-label="action"
      >
        {schemas.map((s) => (
          <option key={s.intent} value={s.intent} title={s.description}>
            {s.verb} — {s.description}
          </option>
        ))}
      </select>
      {schema?.fields.map((f) => (
        <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setField(f.key, v)} disabled={busy} />
      ))}
      <button
        type="submit"
        disabled={busy || !schema}
        className="ml-auto rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2 disabled:opacity-50"
      >
        {busy ? "…" : "looks good →"}
      </button>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: IntentField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (field.type === "amount") {
    return (
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="amount"
        aria-label={field.key}
        className="w-24 rounded-sm bg-surface-2 border border-rule px-2 py-1 font-mono text-ink text-right"
      />
    );
  }
  if (field.type === "asset" || field.type === "chain") {
    if (field.options.length === 1) {
      return (
        <span className="rounded-pill bg-bg-2 border border-rule px-3 py-1 text-sm font-medium text-ink">
          {field.type === "chain" ? "on " : ""}
          {value || field.options[0]}
        </span>
      );
    }
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={field.key}
        className="rounded-sm bg-surface-2 border border-rule px-2 py-1 text-ink"
      >
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/wish/StructuredComposer.tsx
git commit -m "feat(web): StructuredComposer (registry-driven inline form)"
```

### Task 10: Client-side fast-path helper + intent registry export

**Files:**
- Create: `apps/web/lib/intentRegistry.client.ts`
- Create: `apps/web/lib/prepareIntent.ts`
- Create: `apps/web/lib/prepareIntent.test.ts`

The composer is a Client Component, so we cannot import the server registry from it. Mirror the schemas via a static export sourced from the plugin package. Update one place when a plugin ships a new schema (acceptable for v0.1; long-term solution is a generated module).

- [ ] **Step 1: Write `apps/web/lib/intentRegistry.client.ts`**

```ts
import type { IntentSchema } from "@wishd/plugin-sdk";
import { compoundIntents } from "@plugins/compound-v3/intents";

export const CLIENT_INTENT_SCHEMAS: IntentSchema[] = [...compoundIntents];
```

- [ ] **Step 2: Write the failing test**

`apps/web/lib/prepareIntent.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { prepareIntent, PrepareError } from "./prepareIntent";

describe("prepareIntent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to /api/prepare/[intent] and returns parsed body on 200", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ prepared: { meta: {} }, widget: { id: "w_1", type: "compound-summary", slot: "flow", props: {} } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await prepareIntent("compound-v3.deposit", { amount: "10" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/prepare/compound-v3.deposit",
      expect.objectContaining({ method: "POST" }),
    );
    expect(out.widget.id).toBe("w_1");
  });

  it("throws PrepareError with status on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 502 })));
    await expect(prepareIntent("compound-v3.deposit", {})).rejects.toMatchObject({
      name: "PrepareError",
      status: 502,
      message: "boom",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter web test -- prepareIntent`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `apps/web/lib/prepareIntent.ts`**

```ts
export type PrepareResponse = {
  prepared: unknown;
  widget: { id: string; type: string; slot: "flow"; props: Record<string, unknown> };
};

export class PrepareError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PrepareError";
    this.status = status;
  }
}

export async function prepareIntent(
  intent: string,
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<PrepareResponse> {
  const t0 = performance.now();
  const res = await fetch(`/api/prepare/${encodeURIComponent(intent)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new PrepareError(res.status, msg);
  }
  const out = (await res.json()) as PrepareResponse;
  if (typeof console !== "undefined") {
    console.info(JSON.stringify({ tag: "wishd:perf", event: "prepare-roundtrip-ms", intent, ms: Math.round(performance.now() - t0) }));
  }
  return out;
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter web test -- prepareIntent && pnpm --filter web typecheck`
Expected: PASS, 2 tests; no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/intentRegistry.client.ts apps/web/lib/prepareIntent.ts apps/web/lib/prepareIntent.test.ts
git commit -m "feat(web): client intent registry + prepareIntent fast-path helper"
```

### Task 11: Rewrite `WishComposer` — structured + free-text toggle + chips

**Files:**
- Modify: `apps/web/components/wish/WishComposer.tsx`

- [ ] **Step 1: Replace `apps/web/components/wish/WishComposer.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";
import { StepCard } from "@/components/primitives/StepCard";
import { StructuredComposer, type StructuredSubmit } from "./StructuredComposer";
import { CLIENT_INTENT_SCHEMAS } from "@/lib/intentRegistry.client";
import { prepareIntent, PrepareError } from "@/lib/prepareIntent";
import type { IntentSchema } from "@wishd/plugin-sdk";

const CHIPS: Array<{ label: string; intent: string; values: Record<string, string> }> = [
  { label: "deposit 10 USDC into Compound on Sepolia", intent: "compound-v3.deposit", values: { amount: "10", asset: "USDC", chain: "ethereum-sepolia" } },
  { label: "withdraw 10 USDC from Compound on Sepolia", intent: "compound-v3.withdraw", values: { amount: "10", asset: "USDC", chain: "ethereum-sepolia" } },
];

const SKELETON_TIMEOUT_MS = 5000;

function newSkeletonId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

export function WishComposer() {
  const [mode, setMode] = useState<"structured" | "freetext">("structured");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { address, chainId } = useAccount();
  const ws = useWorkspace();

  const account = {
    address: (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    chainId: chainId ?? 11155111,
  };

  async function submitComposer({ intent, values }: StructuredSubmit) {
    setBusy(true);
    ws.reset();
    const skeletonId = newSkeletonId();
    const schema = CLIENT_INTENT_SCHEMAS.find((s) => s.intent === intent);
    ws.appendSkeleton({
      id: skeletonId,
      widgetType: schema?.widget ?? "compound-summary",
      amount: values.amount,
      asset: values.asset,
    });
    console.info(JSON.stringify({ tag: "wishd:perf", event: "composer-submit", intent, t: Date.now() }));

    const t0 = performance.now();
    const timer = setTimeout(() => {
      ws.failSkeleton(skeletonId, "preparation timed out — retry?");
    }, SKELETON_TIMEOUT_MS);

    const fastPath = (async () => {
      try {
        const out = await prepareIntent(intent, { ...values, address: account.address });
        clearTimeout(timer);
        ws.hydrateSkeleton(skeletonId, {
          id: out.widget.id,
          type: out.widget.type,
          slot: out.widget.slot,
          props: out.widget.props,
        });
        console.info(JSON.stringify({ tag: "wishd:perf", event: "skeleton-to-hydrate-ms", intent, ms: Math.round(performance.now() - t0) }));
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof PrepareError ? err.message : err instanceof Error ? err.message : "unknown error";
        ws.failSkeleton(skeletonId, msg);
      }
    })();

    const narration = (async () => {
      try {
        await startStream({
          wish: phrase(intent, values),
          account,
          context: { mode: "narrate-only", intent, values },
          onEvent: (e) => {
            if (e.type === "chat.delta") ws.appendNarration(e.delta);
            if (e.type === "ui.patch") ws.patchWidget(e.id, e.props);
            if (e.type === "ui.dismiss") ws.dismissWidget(e.id);
            // ignore ui.render in narrate-only mode (server should not emit it)
          },
        });
      } catch {
        // narration is purely additive; surface but don't fail the flow
        ws.appendNarration("\n[narration unavailable]");
      }
    })();

    await Promise.allSettled([fastPath, narration]);
    setBusy(false);
  }

  async function submitFreeText(wish: string) {
    if (!wish.trim()) return;
    setBusy(true);
    ws.reset();
    const skeletonId = newSkeletonId();
    const guess = guessFromText(wish);
    ws.appendSkeleton({
      id: skeletonId,
      widgetType: guess.widgetType,
      amount: guess.amount,
      asset: guess.asset,
    });
    console.info(JSON.stringify({ tag: "wishd:perf", event: "freetext-submit", t: Date.now() }));

    const t0 = performance.now();
    try {
      await startStream({
        wish,
        account,
        onEvent: (e) => {
          if (e.type === "chat.delta") ws.appendNarration(e.delta);
          if (e.type === "ui.render") {
            ws.hydrateSkeleton(skeletonId, {
              id: e.widget.id,
              type: e.widget.type,
              slot: e.widget.slot ?? "flow",
              props: e.widget.props as Record<string, unknown>,
            });
            console.info(JSON.stringify({ tag: "wishd:perf", event: "freetext-roundtrip-ms", ms: Math.round(performance.now() - t0) }));
          }
          if (e.type === "ui.patch") ws.patchWidget(e.id, e.props);
          if (e.type === "ui.dismiss") ws.dismissWidget(e.id);
          if (e.type === "error") ws.failSkeleton(skeletonId, e.message);
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
      {mode === "structured" ? (
        <>
          <StructuredComposer schemas={CLIENT_INTENT_SCHEMAS} onSubmit={submitComposer} busy={busy} />
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-ink-3">or try:</span>
            {CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={busy}
                onClick={() => submitComposer({ intent: c.intent, values: c.values })}
                className="px-3 py-1 rounded-pill text-sm font-medium bg-accent-2 border border-accent text-ink hover:bg-accent disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMode("freetext")}
            className="mt-3 text-xs text-ink-3 hover:text-ink underline"
          >
            type instead
          </button>
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitFreeText(text);
            }}
            className="flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="deposit 10 USDC into Compound on Sepolia"
              className="flex-1 rounded-sm bg-surface-2 border border-rule px-3 py-2 font-sans text-ink placeholder:text-ink-3"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2 disabled:opacity-50"
            >
              {busy ? "…" : "wish"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("structured")}
            className="mt-3 text-xs text-ink-3 hover:text-ink underline"
          >
            use structured composer
          </button>
        </>
      )}
    </StepCard>
  );
}

function phrase(intent: string, v: Record<string, string>): string {
  const verb = intent === "compound-v3.withdraw" ? "withdraw" : "deposit";
  const prep = intent === "compound-v3.withdraw" ? "from" : "into";
  return `I want to ${verb} ${v.amount} ${v.asset} ${prep} Compound on Sepolia.`;
}

function guessFromText(t: string): { widgetType: string; amount?: string; asset?: string } {
  const lower = t.toLowerCase();
  const widgetType = /withdraw|redeem/.test(lower) ? "compound-withdraw-summary" : "compound-summary";
  const m = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|usd|eth)?/);
  return { widgetType, amount: m?.[1], asset: m?.[2]?.toUpperCase() };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/wish/WishComposer.tsx
git commit -m "feat(web): structured composer with chips, free-text toggle, parallel narrate-only stream"
```

---

## Phase 7 — Agent narrate-only mode + Haiku + tightened prompt

### Task 12: Add `mode` plumbing to chat route + runAgent

**Files:**
- Modify: `apps/web/app/api/chat/route.ts`
- Modify: `apps/web/server/runAgent.ts`
- Modify: `apps/web/server/systemPrompt.ts`

- [ ] **Step 1: Update `apps/web/app/api/chat/route.ts`**

Replace the file:

```ts
import type { ServerEvent } from "@wishd/plugin-sdk";
import { runAgent, type RunMode } from "@/server/runAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown> & { mode?: RunMode };
  mode?: RunMode;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const mode: RunMode = body.mode ?? body.context?.mode ?? "default";

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const enc = new TextEncoder();
      const emit = (e: ServerEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      };

      await runAgent({
        wish: body.wish,
        account: body.account ?? { address: "0x0000000000000000000000000000000000000000", chainId: 11155111 },
        context: body.context,
        mode,
        emit,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Replace `apps/web/server/runAgent.ts`**

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { ServerEvent } from "@wishd/plugin-sdk";
import { loadPlugins } from "./pluginLoader";
import { createWidgetRendererMcp } from "./mcps/widgetRenderer";
import { buildSystemPrompt } from "./systemPrompt";
import { listIntents } from "./intentRegistry";

export type RunMode = "default" | "narrate-only";

export type RunAgentInput = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  mode?: RunMode;
  emit: (e: ServerEvent) => void;
};

const HAIKU = "claude-haiku-4-5-20251001";

export async function runAgent(input: RunAgentInput): Promise<void> {
  const { wish, account, context, mode = "default", emit } = input;

  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  const { plugins, allowedTools } = await loadPlugins();
  const intents = await listIntents();

  const pluginCtx = { publicClient, emit };
  const pluginMcps = plugins.map((p) => p.mcp(pluginCtx));
  const widgetMcp = createWidgetRendererMcp(emit);

  const mcpServers: Record<string, any> = { widget: widgetMcp };
  for (const m of pluginMcps) mcpServers[m.serverName] = m.server;

  const systemPrompt = await buildSystemPrompt({ mode, intents });
  const userMessage = JSON.stringify({ wish, account, context: context ?? {}, mode });
  const t0 = Date.now();
  let firstTokenLogged = false;

  try {
    const stream = query({
      prompt: userMessage,
      options: {
        systemPrompt,
        model: HAIKU,
        mcpServers,
        allowedTools,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: mode === "narrate-only" ? 1 : 3,
      },
    });

    for await (const msg of stream as AsyncIterable<any>) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            if (!firstTokenLogged) {
              firstTokenLogged = true;
              console.info(JSON.stringify({ tag: "wishd:perf", event: "agent-first-token-ms", mode, ms: Date.now() - t0 }));
            }
            emit({ type: "chat.delta", delta: block.text });
          }
          if (block.type === "tool_use") {
            if (mode === "narrate-only") {
              // narrate-only must not invoke tools; log + drop
              console.warn(`narrate-only mode emitted tool_use ${block.name}; ignoring`);
              continue;
            }
            emit({ type: "tool.call", name: block.name, input: block.input });
          }
        }
      }
      if (msg.type === "result") {
        console.info(JSON.stringify({ tag: "wishd:perf", event: "agent-final-ms", mode, ms: Date.now() - t0 }));
        emit({ type: "result", ok: msg.subtype === "success", cost: msg.total_cost_usd });
      }
    }
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 3: Replace `apps/web/server/systemPrompt.ts`**

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import type { IntentSchema } from "@wishd/plugin-sdk";

const DEFAULT_HEADER = `You are wishd, a DeFi assistant on Sepolia (chainId 11155111).`;

const NARRATE_HEADER = `You are wishd's narrator. The widget is already prepared and rendered. Your job: stream a single short paragraph (<= 2 sentences) acknowledging the action, mentioning amount + asset + market, and stating readiness or warning if context.values + context.prepared show a problem (e.g. insufficient balance). Do NOT call any tools. Do NOT call prepare_*. Do NOT call widget.render. Plain text only.`;

function intentSummary(intents: IntentSchema[]): string {
  if (intents.length === 0) return "(none registered)";
  return intents
    .map((s) => {
      const fields = s.fields.map((f) => `${f.key}:${f.type}`).join(", ");
      return `- ${s.intent} (verb: ${s.verb}; widget: ${s.widget}; fields: ${fields})`;
    })
    .join("\n");
}

const CANONICAL_FLOWS = `Canonical flows:

A. Deposit/lend/supply intent — wishes like "deposit/lend/supply N USDC into Compound" (Sepolia):
  1. Call mcp__compound__prepare_deposit({ amount: N, user, chainId }).
  2. Call mcp__widget__render({ type: "compound-summary", props: { amount: N, asset: "USDC", market: "cUSDCv3", needsApprove, summaryId, amountWei, chainId, user, comet, usdc, calls, balance, insufficient } }).
  3. Reply with one short narration line.

B. Withdraw/redeem intent — wishes like "withdraw N USDC from Compound" (Sepolia):
  1. Call mcp__compound__prepare_withdraw({ amount: N, user, chainId }).
  2. Call mcp__widget__render({ type: "compound-withdraw-summary", props: { amount, asset, market, summaryId, amountWei, chainId, user, comet, usdc, calls, supplied, insufficient } }).
  3. Reply with one short narration line.

C. Follow-up "execute deposit <summaryId>" — user message includes context.prepared:
  1. Call mcp__widget__render({ type: "compound-execute", props: { ...context.prepared } }) (omit actionKind for deposit).
  2. Reply with one short narration line.

D. Follow-up "execute withdraw <summaryId>" — user message includes context.prepared and context.preparedKind === "withdraw":
  1. Call mcp__widget__render({ type: "compound-execute", props: { ...context.prepared, actionKind: "withdraw" } }).
  2. Reply with one short narration line.

For known intent shapes, do NOT use ToolSearch. The tools you need are listed above. ToolSearch is only for genuinely novel free-text wishes that none of the canonical flows handle.

Stop after rendering. Widgets handle clicks and chain interaction.`;

export type BuildPromptInput = {
  mode?: "default" | "narrate-only";
  intents?: IntentSchema[];
  userId?: string;
};

export async function buildSystemPrompt(input: BuildPromptInput = {}): Promise<string> {
  const { mode = "default", intents = [], userId } = input;

  let body: string;
  if (mode === "narrate-only") {
    body = `${DEFAULT_HEADER}\n\n${NARRATE_HEADER}\n\nRegistered intents (for context only — do NOT call any tools):\n${intentSummary(intents)}`;
  } else {
    body = `${DEFAULT_HEADER}

Registered intent schemas (canonical, prefer these over ToolSearch):
${intentSummary(intents)}

Tools available:
- mcp__compound__prepare_deposit({ amount, user, chainId }): prepares Compound v3 USDC deposit. Returns prepared.calls + prepared.meta { needsApprove, balance, insufficient }.
- mcp__compound__prepare_withdraw({ amount, user, chainId }): prepares Compound v3 USDC withdraw. Returns prepared.calls + prepared.meta { supplied, insufficient }.
- mcp__widget__render({ type, props, slot? }): renders a widget into the user workspace.

${CANONICAL_FLOWS}`;
  }

  if (!userId) return body;
  const profilePath = path.join(process.cwd(), "users", userId, "CLAUDE.md");
  try {
    const profile = await fs.readFile(profilePath, "utf-8");
    return `${body}\n\nUser profile:\n${profile}`;
  } catch {
    return body;
  }
}
```

- [ ] **Step 4: Typecheck + run all unit tests**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: no type errors; all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/chat/route.ts apps/web/server/runAgent.ts apps/web/server/systemPrompt.ts
git commit -m "feat(web): runAgent narrate-only + Haiku 4.5 + tightened system prompt"
```

### Task 13: Add narrate-only behavioral test for systemPrompt

**Files:**
- Create: `apps/web/server/systemPrompt.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./systemPrompt";
import type { IntentSchema } from "@wishd/plugin-sdk";

const intents: IntentSchema[] = [
  {
    intent: "compound-v3.deposit",
    verb: "deposit",
    description: "supply tokens to earn yield",
    fields: [{ key: "amount", type: "amount", required: true, default: "10" }],
    widget: "compound-summary",
  },
];

describe("buildSystemPrompt", () => {
  it("default mode lists registered intents and discourages ToolSearch", async () => {
    const p = await buildSystemPrompt({ mode: "default", intents });
    expect(p).toContain("compound-v3.deposit");
    expect(p).toMatch(/do NOT use ToolSearch/i);
    expect(p).toContain("mcp__compound__prepare_deposit");
  });

  it("narrate-only forbids tool calls", async () => {
    const p = await buildSystemPrompt({ mode: "narrate-only", intents });
    expect(p).toMatch(/Do NOT call any tools/);
    expect(p).toMatch(/Do NOT call prepare_/);
    expect(p).toMatch(/Do NOT call widget\.render/);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter web test -- systemPrompt`
Expected: PASS, 2 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/systemPrompt.test.ts
git commit -m "test(web): systemPrompt narrate-only + intent enumeration"
```

---

## Phase 8 — Surface chat narration in the UI

### Task 14: `ChatBubble` component

**Files:**
- Create: `apps/web/components/wish/ChatBubble.tsx`
- Modify: `apps/web/app/page.tsx` (mount it)

The narration store field already exists; this component reads it and renders a small bubble above (or below) the workspace. If `narration` is empty, the bubble does not render.

- [ ] **Step 1: Inspect `apps/web/app/page.tsx` to learn the current layout**

Run: `cat apps/web/app/page.tsx`
Expected: file exists; note where `WishComposer` and `StepStack` are mounted (you'll insert `ChatBubble` right above `StepStack`).

- [ ] **Step 2: Write `apps/web/components/wish/ChatBubble.tsx`**

```tsx
"use client";

import { useWorkspace } from "@/store/workspace";

export function ChatBubble() {
  const narration = useWorkspace((s) => s.narration);
  if (!narration.trim()) return null;
  return (
    <div className="my-4 rounded-lg bg-surface border border-rule px-4 py-3 text-sm leading-relaxed text-ink-2 font-sans whitespace-pre-wrap">
      {narration}
    </div>
  );
}
```

- [ ] **Step 3: Mount `<ChatBubble />` in `apps/web/app/page.tsx`**

Insert an import at the top:

```ts
import { ChatBubble } from "@/components/wish/ChatBubble";
```

Then render `<ChatBubble />` in the page tree, between `<WishComposer />` and `<StepStack />`. (If those are inside a `<main className="page">` wrapper, place the new line on its own row — same indentation. If `page.tsx` differs from this assumption, place the bubble immediately before `<StepStack />` and after `<WishComposer />`; that is the only requirement.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/ChatBubble.tsx apps/web/app/page.tsx
git commit -m "feat(web): ChatBubble surfacing narration deltas above StepStack"
```

---

## Phase 9 — Latency assertion + manual verification

### Task 15: Latency budget integration test

**Files:**
- Create: `apps/web/test/perf.budget.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";

const RPC = process.env.SEPOLIA_RPC_URL;
const ADDR = process.env.WISHD_PERF_TEST_ADDRESS;
const APP = process.env.WISHD_APP_URL ?? "http://localhost:3000";

const enabled = Boolean(RPC && ADDR);

describe.skipIf(!enabled)("/api/prepare latency budget", () => {
  it("compound-v3.deposit responds under 2.5s", async () => {
    const t0 = Date.now();
    const res = await fetch(`${APP}/api/prepare/compound-v3.deposit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "1", asset: "USDC", chain: "ethereum-sepolia", address: ADDR }),
    });
    const elapsed = Date.now() - t0;
    expect(res.status, await res.text()).toBe(200);
    expect(elapsed).toBeLessThan(2500);
  }, 5000);
});
```

- [ ] **Step 2: Confirm vitest skip behavior**

Run: `pnpm --filter web test -- perf.budget`
Expected: 0 failures (test is skipped because env vars aren't set).

- [ ] **Step 3: Commit**

```bash
git add apps/web/test/perf.budget.test.ts
git commit -m "test(web): /api/prepare latency budget (skipped without RPC env)"
```

### Task 16: Manual e2e verification on Sepolia

This task is non-coding; it verifies the system end-to-end in the browser. Treat each numbered observation as a gate — if any fails, debug + fix before claiming completion.

- [ ] **Step 1: Boot**

Run: `pnpm --filter web dev`
Expected: Next dev server up at `http://localhost:3000`. No build errors.

- [ ] **Step 2: Composer happy path — deposit chip**

In a Sepolia-funded browser wallet (Porto), connect, then click the chip "deposit 10 USDC into Compound on Sepolia".

Verify:
- Skeleton card visible within ~100ms (eyeball; check DevTools Performance if uncertain).
- Skeleton shows "10 USDC" (real values, not placeholder).
- Within ~2s the skeleton is replaced by the real `compound-summary` widget with execute button enabled.
- Chat bubble appears above the workspace and streams a short narration sentence in parallel.
- DevTools Console shows `wishd:perf` log lines for `composer-submit`, `prepare-roundtrip-ms` (server-side echo + client-side), `skeleton-to-hydrate-ms`, `agent-first-token-ms`, `agent-final-ms`.

- [ ] **Step 3: Composer happy path — withdraw chip**

Click "withdraw 10 USDC from Compound on Sepolia".
Verify the same sequence with `compound-withdraw-summary` instead. (If you've never deposited on this address, expect `insufficient: true` and a warning banner inside the widget — that's correct behavior; not an error.)

- [ ] **Step 4: Free-text path**

Toggle to "type instead", type `deposit 5 USDC into Compound on Sepolia`, submit.

Verify:
- Skeleton appears within ~100ms with `5 USDC`.
- Within ~5–7s the skeleton is replaced by `compound-summary`.
- Chat bubble streams during the wait.
- Console shows `freetext-submit` and `freetext-roundtrip-ms`.

- [ ] **Step 5: Error path — insufficient balance**

In structured mode, pick deposit, type `9999999`, submit.
Verify the prepare returns successfully but the widget renders with the existing "insufficient" banner (skeleton hydrates to a warning state, not an error). This exercises the schema's pass-through, not the route's error path.

- [ ] **Step 6: Error path — unknown intent**

In DevTools console run:
```
fetch("/api/prepare/x.unknown", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: "1" }) }).then(r => r.status)
```
Expected: `404`.

- [ ] **Step 7: Real execute on Sepolia**

From the deposit happy-path widget, click the execute button. Confirm the wallet prompt, sign, and verify the transaction confirms on Sepolia. (This validates that the dispatched `prepared.calls` payload still matches what `CompoundExecute` expects — i.e. nothing in the prepare → render contract drifted.)

- [ ] **Step 8: Latency assertion (optional)**

If `SEPOLIA_RPC_URL` and `WISHD_PERF_TEST_ADDRESS` are set, run with the dev server up:
Run: `pnpm --filter web test -- perf.budget`
Expected: PASS with the elapsed-ms under 2500.

- [ ] **Step 9: Final commit (only if any small fixups were made above)**

If the manual run uncovered a bug requiring a code change, commit each fix with an appropriate `fix:` message before declaring complete.

---

## Self-review notes

Spec coverage map (each spec section → task):

- IntentSchema in plugin-sdk → Task 1.
- compound-v3 schemas → Task 2.
- /api/prepare/[intent] route → Tasks 3 (registry), 4 (dispatch), 5 (route).
- Structured composer (registry-driven, chips, free-text toggle) → Tasks 9 (form), 10 (helpers + client registry), 11 (host).
- Skeleton lifecycle (pending/error, swap-by-id) → Tasks 6 (UI), 7 (store), 8 (StepStack rendering).
- Agent narrate-only on composer path (parallel SSE, Haiku, maxTurns:1, no tools) → Task 12, plus client-side wiring in Task 11.
- Free-text tightening (Haiku default, system prompt rewrite, maxTurns:3) → Task 12 + Task 13.
- ChatBubble surfacing → Task 14.
- Telemetry (`wishd:perf` log lines) → Tasks 5, 10, 11, 12 (each call site logs).
- Latency budget assertion → Task 15.
- E2E + Sepolia confirm → Task 16.
- Error mapping (400/404/422/502) → Task 5.
- Skeleton swap-by-id reducer test → Task 7.
- Schema validation per `IntentField` type → Task 4 (dispatch validates required fields + chain options).

Out of scope (explicitly): self-extension, Morpho, parallel tool calls, warm SDK session, RPC cache, pre-warm — none have tasks. Correct per spec.

Type-consistency check: `RunMode` (`runAgent.ts`) is consumed by `route.ts` in Task 12; both files updated together. `appendSkeleton`/`hydrateSkeleton`/`failSkeleton` defined in Task 7, called in Task 11. `prepareIntent` shape matches `dispatchIntent` output (both use `{ prepared, widget: { id, type, slot, props } }`).

---

**Plan complete. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which?

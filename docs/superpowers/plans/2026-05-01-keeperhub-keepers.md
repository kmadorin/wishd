# KeeperHub keepers — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `keepers/auto-compound-comp/` and wire it into wishd's lend-intent SuccessCard so the agent can recommend, deploy, and reconcile a Compound V3 auto-compound keeper through KeeperHub via Porto session keys.

**Architecture:** New top-level `keepers/<id>/` package (manifest + delegation + workflow + addresses). Server-side keeper registry + state-reconciliation against KeeperHub via the Anthropic Agent SDK's MCP client. Three custom Agent SDK tools (`recommend_keeper`, `propose_delegation`, `inject_keeper_offer`) layered over the auto-imported KH MCP toolset. New client deploy modal. SuccessCard's `keeperOffers` slot becomes agent-driven via existing `ui.patch` server event.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk`), `porto`, `viem`/`wagmi`, `@modelcontextprotocol/sdk`, vitest, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-05-01-keeperhub-keepers-design.md` (commit `8dc9df6`).

---

## File structure

### Create

| Path | Responsibility |
|------|---------------|
| `keepers/auto-compound-comp/package.json` | Workspace package metadata. |
| `keepers/auto-compound-comp/tsconfig.json` | TS project config, extends repo base. |
| `keepers/auto-compound-comp/vitest.config.ts` | Vitest config. |
| `keepers/auto-compound-comp/addresses.ts` | Sepolia addresses + ABIs (string snippets) used by `workflow.ts`. |
| `keepers/auto-compound-comp/delegation.ts` | Static `DelegationSpec` (fixed allowlist, expiryPolicy, spend bounds + defaults). |
| `keepers/auto-compound-comp/workflow.ts` | `buildWorkflow(params): KhWorkflowJson` — pure substitution into the KH workflow JSON template. |
| `keepers/auto-compound-comp/manifest.ts` | `KeeperManifest` (id, name, version, chains, plugins, trust, description, appliesTo). |
| `keepers/auto-compound-comp/index.ts` | Re-exports `{ manifest, delegation, buildWorkflow }`. |
| `keepers/auto-compound-comp/workflow.test.ts` | Snapshot test for `buildWorkflow` substitution + naming. |
| `keepers/auto-compound-comp/delegation.test.ts` | Sanity test for delegation shape + bounds non-empty. |
| `apps/web/server/keepers/registry.ts` | `keepersForIntent(intentId)`, `getKeeperById(id)`. |
| `apps/web/server/keepers/registry.test.ts` | Registry lookup tests. |
| `apps/web/server/keepers/state.ts` | `getKeeperState({ keeper, userPortoAddress, listWorkflows })`. |
| `apps/web/server/keepers/state.test.ts` | State reconciliation table tests w/ fake `listWorkflows`. |
| `apps/web/server/keepers/proposeDelegation.ts` | Pure clamp logic for agent-suggested delegation. |
| `apps/web/server/keepers/proposeDelegation.test.ts` | Bounds-clamp tests. |
| `apps/web/server/keepers/agentTools.ts` | Defines the three Agent SDK tools (`recommend_keeper`, `propose_delegation`, `inject_keeper_offer`). |
| `apps/web/server/keepers/khRpc.ts` | Thin HTTP RPC helper used by the deploy route to call KH MCP via Bearer token (the deploy route runs outside the agent context). |
| `apps/web/server/keepers/khTokenStore.ts` | In-memory single-tenant access-token + refresh-token store. |
| `apps/web/app/api/keepers/deploy/route.ts` | POST `/api/keepers/deploy` handler. |
| `apps/web/app/api/keepers/deploy/route.test.ts` | Vitest happy-path test using a mocked `khRpc`. |
| `apps/web/components/wish/KeeperDeployFlow.tsx` | 4-phase modal (review → grant → deploy → confirmed). |
| `apps/web/components/wish/KeeperDeployFlow.test.tsx` | RTL smoke render — modal renders review phase from props. |
| `apps/web/lib/keepers/buildPortoGrantPayload.ts` | Pure mapper from `DelegationSpec` + form values to `wallet_grantPermissions` payload. |
| `apps/web/lib/keepers/buildPortoGrantPayload.test.ts` | Mapper tests (unlimited expiry sentinel, spend caps, fee token). |
| `apps/web/lib/keepers/clientRegistry.ts` | Browser-side keeper lookup (id → manifest + delegation + label). Used by SuccessCard and KeeperDeployFlow. |
| `apps/web/store/keeperDeploy.ts` | Zustand store for the open/close + payload of the deploy modal (avoids prop drilling through SuccessCard). |

### Modify

| Path | Why |
|------|-----|
| `packages/plugin-sdk/src/index.ts` | Replace existing `Keeper`, `KhWorkflowJson`, `DelegationSpec` types with the spec'd shapes; add `KeeperManifest`, `WorkflowParams`, `ExpiryPolicy`, `PortoPermissionsBounds`, `PortoPermissionsGrant`, `KeeperOffer`, `KeeperState`. |
| `packages/plugin-sdk/src/index.test.ts` | Add type-shape compile-time tests for the new exports. |
| `apps/web/server/runAgent.ts` | Add KH remote MCP server entry; register the three custom tools alongside the existing widget MCP; pass keeper-aware system prompt; pull `userPortoAddress` from agent input. |
| `apps/web/server/systemPrompt.ts` | Add Section E (keeper recommendation flow) + auth-link rule. |
| `plugins/compound-v3/widgets/CompoundExecute.tsx:138-160` | Replace the hardcoded `keeperOffers` stub with empty array; pass `stepCardId` (id of this widget) into the rendered SuccessCard so the agent can target it. |
| `apps/web/components/primitives/SuccessCard.tsx` | Wire `deploy ✦` button to open `KeeperDeployFlow` via the new zustand store; render `manage`/`paused`/`needs_regrant` surfaces based on `offer.state`. |
| `apps/web/widgetRegistry.ts` | No registry change needed (modal mounts at the App layout level, not via widget renderer). |
| `apps/web/app/layout.tsx` | Mount `<KeeperDeployFlow />` once at the layout root so it can be opened from any SuccessCard via the store. |
| `apps/web/server/intentDispatch.ts` | Surface a structured `intent.confirmed` chat input when user message has `context.preparedKind === "deposit"` and the prior turn rendered an execute widget — used by agent to trigger `recommend_keeper`. (Verify path during impl; if existing flow already exposes confirmed signal another way, align with it.) |

---

## Phase 1 — SDK types

### Task 1: Replace SDK keeper-related types

**Files:**
- Modify: `packages/plugin-sdk/src/index.ts`
- Test: `packages/plugin-sdk/src/index.test.ts`

- [ ] **Step 1: Write failing type tests**

Append to `packages/plugin-sdk/src/index.test.ts`:

```ts
import { describe, expectTypeOf, it } from "vitest";
import type {
  Address,
  KeeperManifest,
  DelegationSpec,
  PortoPermissionsBounds,
  PortoPermissionsGrant,
  ExpiryPolicy,
  KhWorkflowJson,
  Keeper,
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
    expectTypeOf(d.kind).toEqualTypeOf<"porto-permissions" | "comet-allow">();
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
    expectTypeOf(w.nodes[0].data.config).toEqualTypeOf<Record<string, unknown>>();
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
```

- [ ] **Step 2: Run — verify failure**

```
cd packages/plugin-sdk && pnpm test
```

Expected: type errors — missing exports `KeeperManifest`, `WorkflowParams`, `KeeperOffer`, `KeeperState`, `ExpiryPolicy`, `PortoPermissionsBounds`, `PortoPermissionsGrant`; `DelegationSpec` shape mismatch; `Keeper` shape mismatch.

- [ ] **Step 3: Replace types in `packages/plugin-sdk/src/index.ts`**

Replace the existing `KhWorkflowJson`, `DelegationSpec`, `Keeper`, and `defineKeeper` blocks (lines for those three exports) with:

```ts
// ---------- keeper-related types ----------

export type ExpiryPolicy =
  | { kind: "unlimited" }
  | { kind: "bounded"; maxDays: number }
  | { kind: "fixed"; days: number };

export type SpendPeriod = "day" | "week" | "month";

export type PortoPermissionsBounds = {
  fixed: {
    calls: Address[];
    feeToken: Address;
  };
  expiryPolicy: ExpiryPolicy;
  spend: {
    bounds: Array<{ token: Address; maxLimit: bigint; periods: SpendPeriod[] }>;
    defaults: Array<{ token: Address; limit: bigint; period: SpendPeriod }>;
  };
};

export type CometAllowSpec = {
  kind: "comet-allow";
  comet: Address;
  manager: Address;
};

export type PortoPermissionsSpec = PortoPermissionsBounds & { kind: "porto-permissions" };

export type DelegationSpec = PortoPermissionsSpec | CometAllowSpec;

/** Runtime payload sent into Porto's wallet_grantPermissions. */
export type PortoPermissionsGrant = {
  expiry: number;
  feeToken?: { limit: string; symbol: string };
  key: { type: "secp256k1"; publicKey: Address };
  permissions: {
    calls: Array<{ to: Address; signature: string }>;
    spend?: Array<{ token: Address; limit: bigint; period: "hour" | SpendPeriod }>;
  };
};

export type KhWorkflowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    type: string;
    label: string;
    config: Record<string, unknown>;
    status?: string;
  };
};

export type KhWorkflowEdge = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
};

export type KhWorkflowJson = {
  name: string;
  description?: string;
  nodes: KhWorkflowNode[];
  edges: KhWorkflowEdge[];
};

export type WorkflowParams = {
  userPortoAddress: Address;
  permissionsId: `0x${string}`;
};

export type KeeperManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  chains: number[];
  plugins: string[];
  trust: TrustTier;
  appliesTo: Array<{ intent: string }>;
};

export type Keeper = {
  manifest: KeeperManifest;
  delegation: DelegationSpec;
  buildWorkflow: (params: WorkflowParams) => KhWorkflowJson;
  setupWidget?: string;
};

export function defineKeeper(k: Keeper): Keeper {
  return k;
}

export type KeeperState =
  | { kind: "not_deployed" }
  | { kind: "deployed_enabled"; workflowId: string; permissionsId: `0x${string}` }
  | { kind: "deployed_disabled"; workflowId: string; permissionsId: `0x${string}` };

export type KeeperOffer = {
  keeperId: string;
  title: string;
  desc: string;
  badge?: string;
  featured?: boolean;
  state: KeeperState;
  rationale?: string;
};

// re-export Address for downstream packages that don't depend on viem directly
export type { Address };
```

Also: at the top of the file, ensure `import type { Address } from "viem";` is present (it already is per the existing imports).

Remove the now-replaced `export type DelegationSpec`, `export type KhWorkflowJson`, `export type Keeper<TParams>`, and `export function defineKeeper<TParams>` blocks.

- [ ] **Step 4: Run tests + typecheck**

```
cd packages/plugin-sdk && pnpm test && pnpm typecheck
```

Expected: PASS for all type assertions.

- [ ] **Step 5: Commit**

```
git add packages/plugin-sdk/src/index.ts packages/plugin-sdk/src/index.test.ts
git commit -m "feat(plugin-sdk): keeper types — manifest.id+appliesTo, DelegationSpec bounds, KhWorkflowJson nested data"
```

### Task 2: Verify downstream typecheck still passes

The SDK shape change for `DelegationSpec` and `Keeper` may break callers. Existing repo has zero keepers and no caller uses old shape (verified by grep), but `runAgent.ts` and `pluginLoader.ts` should still pass.

- [ ] **Step 1: Run repo-wide typecheck**

```
pnpm -r typecheck
```

Expected: PASS. If any caller breaks, fix in the same commit (the spec said this is a clean replacement).

- [ ] **Step 2: Commit any fix-ups**

```
git add -A
git commit -m "chore: align downstream callers w/ new keeper types" --allow-empty
```

(Skip empty commit if nothing to fix.)

---

## Phase 2 — `auto-compound-comp` keeper package

### Task 3: Scaffold the package

**Files:**
- Create: `keepers/auto-compound-comp/package.json`
- Create: `keepers/auto-compound-comp/tsconfig.json`
- Create: `keepers/auto-compound-comp/vitest.config.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@wishd/keeper-auto-compound-comp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": "./index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@wishd/plugin-sdk": "workspace:*",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "moduleResolution": "bundler",
    "module": "esnext",
    "target": "es2022",
    "strict": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Install workspace + verify discovery**

```
pnpm install
pnpm --filter @wishd/keeper-auto-compound-comp typecheck
```

Expected: dependency installed, typecheck PASS (empty package).

- [ ] **Step 5: Commit**

```
git add keepers/auto-compound-comp/package.json keepers/auto-compound-comp/tsconfig.json keepers/auto-compound-comp/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(keepers): scaffold auto-compound-comp workspace package"
```

### Task 4: Sepolia addresses

**Files:**
- Create: `keepers/auto-compound-comp/addresses.ts`

- [ ] **Step 1: Write the file**

```ts
import type { Address } from "viem";

// Compound V3 Sepolia
export const COMET_USDC_SEPOLIA: Address = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
export const COMET_REWARDS_SEPOLIA: Address = "0x8bF5b658bdF0388E8b482ED51B14aef58f90abfD";

// Tokens (Sepolia)
export const COMP_SEPOLIA: Address = "0xA6c8D1c55951e8AC44a0EaA959Be5Fd21cc07531";
export const USDC_SEPOLIA: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

// Uniswap V3 SwapRouter (Sepolia)
export const UNISWAP_ROUTER_SEPOLIA: Address = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

export const SEPOLIA_CHAIN_ID = 11155111 as const;

// Decimals for unit conversion in delegation defaults/bounds
export const COMP_DECIMALS = 18;
export const USDC_DECIMALS = 6;
```

- [ ] **Step 2: Commit**

```
git add keepers/auto-compound-comp/addresses.ts
git commit -m "feat(keepers/auto-compound-comp): Sepolia addresses + decimals"
```

### Task 5: Delegation spec

**Files:**
- Create: `keepers/auto-compound-comp/delegation.ts`
- Test: `keepers/auto-compound-comp/delegation.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { delegation } from "./delegation";
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
} from "./addresses";

describe("auto-compound-comp delegation", () => {
  it("uses porto-permissions kind", () => {
    expect(delegation.kind).toBe("porto-permissions");
  });

  it("allowlist contains exactly the five keeper-touched contracts", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    expect(new Set(delegation.fixed.calls)).toEqual(new Set([
      COMET_REWARDS_SEPOLIA,
      COMP_SEPOLIA,
      UNISWAP_ROUTER_SEPOLIA,
      USDC_SEPOLIA,
      COMET_USDC_SEPOLIA,
    ]));
  });

  it("expiryPolicy is unlimited", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    expect(delegation.expiryPolicy).toEqual({ kind: "unlimited" });
  });

  it("spend bounds and defaults are non-empty and consistent", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    const tokens = new Set(delegation.spend.defaults.map((d) => d.token));
    for (const b of delegation.spend.bounds) {
      expect(tokens).toContain(b.token);
    }
    for (const d of delegation.spend.defaults) {
      const b = delegation.spend.bounds.find((bb) => bb.token === d.token);
      if (!b) throw new Error(`no bound for default token ${d.token}`);
      expect(d.limit).toBeLessThanOrEqual(b.maxLimit);
      expect(b.periods).toContain(d.period);
    }
  });
});
```

- [ ] **Step 2: Run — verify failure**

```
pnpm --filter @wishd/keeper-auto-compound-comp test
```

Expected: FAIL — module `./delegation` not found.

- [ ] **Step 3: Implement `delegation.ts`**

```ts
import type { DelegationSpec } from "@wishd/plugin-sdk";
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
  COMP_DECIMALS, USDC_DECIMALS,
} from "./addresses";

const tenPow = (n: number) => 10n ** BigInt(n);

export const delegation: DelegationSpec = {
  kind: "porto-permissions",
  fixed: {
    calls: [
      COMET_REWARDS_SEPOLIA,
      COMP_SEPOLIA,
      UNISWAP_ROUTER_SEPOLIA,
      USDC_SEPOLIA,
      COMET_USDC_SEPOLIA,
    ],
    feeToken: "0x0000000000000000000000000000000000000000",
  },
  expiryPolicy: { kind: "unlimited" },
  spend: {
    bounds: [
      { token: COMP_SEPOLIA, maxLimit: 1000n * tenPow(COMP_DECIMALS), periods: ["week", "month"] },
      { token: USDC_SEPOLIA, maxLimit: 10000n * tenPow(USDC_DECIMALS), periods: ["week", "month"] },
    ],
    defaults: [
      { token: COMP_SEPOLIA, limit: 100n * tenPow(COMP_DECIMALS), period: "month" },
      { token: USDC_SEPOLIA, limit: 1000n * tenPow(USDC_DECIMALS), period: "month" },
    ],
  },
};
```

- [ ] **Step 4: Run — verify pass**

```
pnpm --filter @wishd/keeper-auto-compound-comp test
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```
git add keepers/auto-compound-comp/delegation.ts keepers/auto-compound-comp/delegation.test.ts
git commit -m "feat(keepers/auto-compound-comp): delegation spec — fixed allowlist + unlimited expiry + spend bounds"
```

### Task 6: Manifest

**Files:**
- Create: `keepers/auto-compound-comp/manifest.ts`

- [ ] **Step 1: Write the manifest**

```ts
import type { KeeperManifest } from "@wishd/plugin-sdk";
import { SEPOLIA_CHAIN_ID } from "./addresses";

export const manifest: KeeperManifest = {
  id: "auto-compound-comp",
  name: "Auto-compound COMP rewards",
  description:
    "Hourly: claim COMP, swap to USDC, supply into your Compound V3 position. Runs via Porto session keys.",
  version: "0.0.1",
  chains: [SEPOLIA_CHAIN_ID],
  plugins: ["compound-v3"],
  trust: "verified",
  appliesTo: [{ intent: "compound-v3.deposit" }, { intent: "compound-v3.lend" }],
};
```

- [ ] **Step 2: Typecheck**

```
pnpm --filter @wishd/keeper-auto-compound-comp typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```
git add keepers/auto-compound-comp/manifest.ts
git commit -m "feat(keepers/auto-compound-comp): manifest — id, appliesTo, trust verified"
```

### Task 7: Workflow JSON template + builder

**Files:**
- Create: `keepers/auto-compound-comp/workflow.ts`
- Test: `keepers/auto-compound-comp/workflow.test.ts`

The body of `buildWorkflow` is a verbatim port of the demo workflow (KH workflow id `dtfc9u39mkgq0h3yy5apr`) with `userPortoAddress` and `permissionsId` substituted into all relevant node configs.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildWorkflow } from "./workflow";

const USER = "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3" as const;
const PERMS = "0x8aa4cc3b82173c5ed03597dbf6cbd1e7ab2ff7ce" as const;

describe("buildWorkflow", () => {
  const wf = buildWorkflow({ userPortoAddress: USER, permissionsId: PERMS });

  it("uses the wishd:<keeperId>:<userPortoAddress> name convention", () => {
    expect(wf.name).toBe(`wishd:auto-compound-comp:${USER}`);
  });

  it("trigger node carries an hourly cron, disabled by default", () => {
    const trigger = wf.nodes.find((n) => n.id === "trigger");
    if (!trigger) throw new Error("missing trigger");
    expect(trigger.data.config).toMatchObject({ cron: "0 * * * *", enabled: false, actionType: "schedule" });
  });

  it("substitutes userPortoAddress into porto/execute-call nodes", () => {
    const portoNodes = wf.nodes.filter((n) => (n.data.config as { actionType?: string }).actionType === "porto/execute-call");
    expect(portoNodes.length).toBeGreaterThan(0);
    for (const n of portoNodes) {
      expect((n.data.config as { userPortoAddress?: string }).userPortoAddress).toBe(USER);
      expect((n.data.config as { permissionsId?: string }).permissionsId).toBe(PERMS);
    }
  });

  it("includes the five-step DAG: trigger → baseToken → batchReads → cond → claim → compBal → swap → usdcBal → supply", () => {
    const ids = wf.nodes.map((n) => n.id);
    for (const id of ["trigger", "baseToken", "batchReads", "cond", "claim", "compBal", "swap", "usdcBal", "supply"]) {
      expect(ids).toContain(id);
    }
    const sources = new Set(wf.edges.map((e) => e.source));
    expect(sources).toContain("cond");
  });

  it("never embeds the placeholder default address 0x...0001", () => {
    const json = JSON.stringify(wf);
    expect(json).not.toMatch(/0x0+1\b/i);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```
pnpm --filter @wishd/keeper-auto-compound-comp test workflow.test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `workflow.ts`**

The full node JSON is long; reproduce the exact structure of the existing KH demo workflow (retrievable via `mcp__plugin_keeperhub_keeperhub__get_workflow({ workflowId: "dtfc9u39mkgq0h3yy5apr" })` and committed to the spec context). Do NOT hand-edit node positions; copy them as-is.

```ts
import type { KhWorkflowJson, WorkflowParams } from "@wishd/plugin-sdk";
import {
  COMET_REWARDS_SEPOLIA, COMP_SEPOLIA, USDC_SEPOLIA,
  COMET_USDC_SEPOLIA, UNISWAP_ROUTER_SEPOLIA, SEPOLIA_CHAIN_ID,
} from "./addresses";

const NETWORK = String(SEPOLIA_CHAIN_ID);

// Verbatim ABI snippets used by the workflow nodes — must match the demo workflow.
const ABI_BASE_TOKEN =
  '[{"inputs":[],"name":"baseToken","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"}]';

const ABI_TOTALS_BASIC =
  '[{"inputs":[],"name":"totalsBasic","outputs":[{"name":"baseSupplyIndex","type":"uint64"},{"name":"baseBorrowIndex","type":"uint64"},{"name":"trackingSupplyIndex","type":"uint64"},{"name":"trackingBorrowIndex","type":"uint64"},{"name":"totalSupplyBase","type":"uint104"},{"name":"totalBorrowBase","type":"uint104"},{"name":"lastAccrualTime","type":"uint40"},{"name":"pauseFlags","type":"uint8"}],"stateMutability":"view","type":"function"}]';

const ABI_USER_BASIC =
  '[{"inputs":[{"name":"account","type":"address"}],"name":"userBasic","outputs":[{"name":"principal","type":"int104"},{"name":"baseTrackingIndex","type":"uint64"},{"name":"baseTrackingAccrued","type":"uint64"},{"name":"assetsIn","type":"uint16"},{"name":"_reserved","type":"uint8"}],"stateMutability":"view","type":"function"}]';

const ABI_BASE_TRACKING_SUPPLY_SPEED =
  '[{"inputs":[],"name":"baseTrackingSupplySpeed","outputs":[{"name":"","type":"uint64"}],"stateMutability":"view","type":"function"}]';

const ABI_CLAIM =
  '[{"inputs":[{"name":"comet","type":"address"},{"name":"src","type":"address"},{"name":"shouldAccrue","type":"bool"}],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"}]';

const ABI_EXACT_INPUT_SINGLE =
  '[{"inputs":[{"components":[{"name":"tokenIn","type":"address"},{"name":"tokenOut","type":"address"},{"name":"fee","type":"uint24"},{"name":"recipient","type":"address"},{"name":"amountIn","type":"uint256"},{"name":"amountOutMinimum","type":"uint256"},{"name":"sqrtPriceLimitX96","type":"uint160"}],"name":"params","type":"tuple"}],"name":"exactInputSingle","outputs":[{"name":"amountOut","type":"uint256"}],"stateMutability":"payable","type":"function"}]';

const ABI_SUPPLY =
  '[{"inputs":[{"name":"asset","type":"address"},{"name":"amount","type":"uint256"}],"name":"supply","outputs":[],"stateMutability":"nonpayable","type":"function"}]';

const ABI_APPROVE =
  '[{"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]';

export function buildWorkflow({ userPortoAddress, permissionsId }: WorkflowParams): KhWorkflowJson {
  return {
    name: `wishd:auto-compound-comp:${userPortoAddress}`,
    description: "wishd-managed auto-compound for Compound V3 Sepolia",
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          type: "trigger",
          label: "Schedule",
          config: { cron: "0 * * * *", enabled: false, actionType: "schedule" },
          status: "idle",
        },
      },
      {
        id: "baseToken",
        type: "action",
        position: { x: 252, y: 0 },
        data: {
          type: "action",
          label: "Get Base Token",
          config: {
            abi: ABI_BASE_TOKEN,
            network: NETWORK,
            actionType: "web3/read-contract",
            abiFunction: "baseToken",
            functionArgs: "[]",
            contractAddress: COMET_USDC_SEPOLIA,
          },
          status: "idle",
        },
      },
      {
        id: "batchReads",
        type: "action",
        position: { x: 504, y: 0 },
        data: {
          type: "action",
          label: "Read Comet State",
          config: {
            calls: JSON.stringify([
              {
                network: NETWORK,
                contractAddress: COMET_USDC_SEPOLIA,
                abiFunction: "totalsBasic",
                abi: ABI_TOTALS_BASIC,
                args: [],
              },
              {
                network: NETWORK,
                contractAddress: COMET_USDC_SEPOLIA,
                abiFunction: "userBasic",
                abi: ABI_USER_BASIC,
                args: [userPortoAddress],
              },
              {
                network: NETWORK,
                contractAddress: COMET_USDC_SEPOLIA,
                abiFunction: "baseTrackingSupplySpeed",
                abi: ABI_BASE_TRACKING_SUPPLY_SPEED,
                args: [],
              },
            ]),
            inputMode: "mixed",
            actionType: "web3/batch-read-contract",
          },
          status: "idle",
        },
      },
      {
        id: "cond",
        type: "action",
        position: { x: 756, y: 0 },
        data: {
          type: "action",
          label: "Owed > 0.0001 COMP",
          config: {
            condition:
              "({{@batchReads:Read Comet State.results[1].result.baseTrackingAccrued}} + {{@batchReads:Read Comet State.results[1].result.principal}} * {{@batchReads:Read Comet State.results[0].result.baseSupplyIndex}} * ({{@batchReads:Read Comet State.results[0].result.trackingSupplyIndex}} + {{@batchReads:Read Comet State.results[2].result}} * ({{@__system:System.unixTimestamp}} - {{@batchReads:Read Comet State.results[0].result.lastAccrualTime}}) * 1000000 / {{@batchReads:Read Comet State.results[0].result.totalSupplyBase}} - {{@batchReads:Read Comet State.results[1].result.baseTrackingIndex}}) / 1000000000000000 / 1000000000000000) * 1000000000000 > 100000000000000",
            actionType: "Condition",
          },
          status: "idle",
        },
      },
      {
        id: "claim",
        type: "action",
        position: { x: 1008, y: 0 },
        data: {
          type: "action",
          label: "Claim COMP (Porto)",
          config: {
            abi: ABI_CLAIM,
            network: NETWORK,
            feeToken: "ETH",
            actionType: "porto/execute-call",
            abiFunction: "claim",
            functionArgs: JSON.stringify([COMET_USDC_SEPOLIA, userPortoAddress, true]),
            permissionsId,
            contractAddress: COMET_REWARDS_SEPOLIA,
            userPortoAddress,
            waitForInclusion: "true",
          },
          status: "idle",
        },
      },
      {
        id: "compBal",
        type: "action",
        position: { x: 1260, y: 0 },
        data: {
          type: "action",
          label: "COMP Balance (user)",
          config: {
            address: userPortoAddress,
            network: NETWORK,
            actionType: "web3/check-token-balance",
            tokenConfig: JSON.stringify({ mode: "custom", customToken: { address: COMP_SEPOLIA, symbol: "COMP" } }),
          },
          status: "idle",
        },
      },
      {
        id: "swap",
        type: "action",
        position: { x: 1512, y: 0 },
        data: {
          type: "action",
          label: "Approve+Swap COMP -> USDC (Porto atomic)",
          config: {
            abi: ABI_EXACT_INPUT_SINGLE,
            network: NETWORK,
            feeToken: "ETH",
            actionType: "porto/execute-call",
            abiFunction: "exactInputSingle",
            functionArgs: JSON.stringify([
              [
                COMP_SEPOLIA,
                USDC_SEPOLIA,
                3000,
                userPortoAddress,
                "{{@compBal:COMP Balance (user).balance.balanceRaw}}",
                "0",
                "0",
              ],
            ]),
            prependCalls: JSON.stringify([
              {
                to: COMP_SEPOLIA,
                abi: ABI_APPROVE,
                abiFunction: "approve",
                functionArgs: JSON.stringify([
                  UNISWAP_ROUTER_SEPOLIA,
                  "{{@compBal:COMP Balance (user).balance.balanceRaw}}",
                ]),
              },
            ]),
            permissionsId,
            contractAddress: UNISWAP_ROUTER_SEPOLIA,
            userPortoAddress,
            waitForInclusion: "true",
          },
          status: "idle",
        },
      },
      {
        id: "usdcBal",
        type: "action",
        position: { x: 1764, y: 0 },
        data: {
          type: "action",
          label: "USDC Balance (user)",
          config: {
            address: userPortoAddress,
            network: NETWORK,
            actionType: "web3/check-token-balance",
            tokenConfig: JSON.stringify({ mode: "custom", customToken: { address: USDC_SEPOLIA, symbol: "USDC" } }),
          },
          status: "idle",
        },
      },
      {
        id: "supply",
        type: "action",
        position: { x: 2016, y: 0 },
        data: {
          type: "action",
          label: "Approve+Supply USDC (Porto atomic)",
          config: {
            abi: ABI_SUPPLY,
            network: NETWORK,
            feeToken: "ETH",
            actionType: "porto/execute-call",
            abiFunction: "supply",
            functionArgs: JSON.stringify([USDC_SEPOLIA, "{{@usdcBal:USDC Balance (user).balance.balanceRaw}}"]),
            prependCalls: JSON.stringify([
              {
                to: USDC_SEPOLIA,
                abi: ABI_APPROVE,
                abiFunction: "approve",
                functionArgs: JSON.stringify([
                  COMET_USDC_SEPOLIA,
                  "{{@usdcBal:USDC Balance (user).balance.balanceRaw}}",
                ]),
              },
            ]),
            permissionsId,
            contractAddress: COMET_USDC_SEPOLIA,
            userPortoAddress,
            waitForInclusion: "true",
          },
          status: "idle",
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "baseToken" },
      { id: "e2", source: "baseToken", target: "batchReads" },
      { id: "e3", source: "batchReads", target: "cond" },
      { id: "e4", source: "cond", target: "claim", sourceHandle: "true" },
      { id: "e5", source: "claim", target: "compBal" },
      { id: "e6", source: "compBal", target: "swap" },
      { id: "e7", source: "swap", target: "usdcBal" },
      { id: "e8", source: "usdcBal", target: "supply" },
    ],
  };
}
```

- [ ] **Step 4: Run tests**

```
pnpm --filter @wishd/keeper-auto-compound-comp test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add keepers/auto-compound-comp/workflow.ts keepers/auto-compound-comp/workflow.test.ts
git commit -m "feat(keepers/auto-compound-comp): buildWorkflow — port of demo DAG with placeholder substitution"
```

### Task 8: Index re-exports

**Files:**
- Create: `keepers/auto-compound-comp/index.ts`

- [ ] **Step 1: Write file**

```ts
export { manifest } from "./manifest";
export { delegation } from "./delegation";
export { buildWorkflow } from "./workflow";
import { manifest } from "./manifest";
import { delegation } from "./delegation";
import { buildWorkflow } from "./workflow";
import type { Keeper } from "@wishd/plugin-sdk";

export const keeper: Keeper = { manifest, delegation, buildWorkflow };
export default keeper;
```

- [ ] **Step 2: Typecheck**

```
pnpm --filter @wishd/keeper-auto-compound-comp typecheck
```

- [ ] **Step 3: Commit**

```
git add keepers/auto-compound-comp/index.ts
git commit -m "feat(keepers/auto-compound-comp): index — re-export keeper bundle"
```

---

## Phase 3 — Server keeper runtime (registry + state + propose-delegation)

### Task 9: Add keeper as dep of `apps/web`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add dependency**

In `apps/web/package.json` `dependencies`:

```json
"@wishd/keeper-auto-compound-comp": "workspace:*"
```

- [ ] **Step 2: Install**

```
pnpm install
```

- [ ] **Step 3: Commit**

```
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(apps/web): depend on @wishd/keeper-auto-compound-comp"
```

### Task 10: Server keeper registry

**Files:**
- Create: `apps/web/server/keepers/registry.ts`
- Create: `apps/web/server/keepers/registry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { keepersForIntent, getKeeperById, allKeepers } from "./registry";

describe("keeper registry", () => {
  it("lists at least the auto-compound-comp keeper", () => {
    const ids = allKeepers().map((k) => k.manifest.id);
    expect(ids).toContain("auto-compound-comp");
  });

  it("returns the keeper for compound-v3.deposit", () => {
    const list = keepersForIntent("compound-v3.deposit");
    expect(list.map((k) => k.manifest.id)).toContain("auto-compound-comp");
  });

  it("also matches compound-v3.lend", () => {
    const list = keepersForIntent("compound-v3.lend");
    expect(list.map((k) => k.manifest.id)).toContain("auto-compound-comp");
  });

  it("returns empty for unrelated intent", () => {
    expect(keepersForIntent("aave-v3.borrow")).toEqual([]);
  });

  it("getKeeperById returns null for unknown id", () => {
    expect(getKeeperById("nope")).toBeNull();
  });

  it("getKeeperById returns the keeper for a known id", () => {
    expect(getKeeperById("auto-compound-comp")?.manifest.id).toBe("auto-compound-comp");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```
pnpm --filter web test server/keepers/registry
```

Expected: FAIL.

- [ ] **Step 3: Implement registry**

```ts
import type { Keeper } from "@wishd/plugin-sdk";
import autoCompoundComp from "@wishd/keeper-auto-compound-comp";

const KEEPERS: Keeper[] = [autoCompoundComp];

export function allKeepers(): Keeper[] {
  return KEEPERS;
}

export function keepersForIntent(intentId: string): Keeper[] {
  return KEEPERS.filter((k) => k.manifest.appliesTo.some((a) => a.intent === intentId));
}

export function getKeeperById(id: string): Keeper | null {
  return KEEPERS.find((k) => k.manifest.id === id) ?? null;
}
```

- [ ] **Step 4: Run tests**

```
pnpm --filter web test server/keepers/registry
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add apps/web/server/keepers/registry.ts apps/web/server/keepers/registry.test.ts
git commit -m "feat(server/keepers): registry — keepersForIntent + getKeeperById"
```

### Task 11: State reconciliation

**Files:**
- Create: `apps/web/server/keepers/state.ts`
- Create: `apps/web/server/keepers/state.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { getKeeperState, _testing } from "./state";
import type { Keeper, KhWorkflowNode } from "@wishd/plugin-sdk";

const dummyKeeper = {
  manifest: { id: "auto-compound-comp" },
} as unknown as Keeper;

const USER = "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3" as const;
const PERMS = "0x8aa4cc3b82173c5ed03597dbf6cbd1e7ab2ff7ce" as const;

function fakeWorkflow({ name, enabled, perms }: { name: string; enabled: boolean; perms?: string }) {
  return {
    id: "wf-1",
    name,
    enabled,
    nodes: [
      perms
        ? ({
            id: "claim",
            type: "action",
            position: { x: 0, y: 0 },
            data: { type: "action", label: "x", config: { permissionsId: perms } },
          } satisfies KhWorkflowNode)
        : ({ id: "x", type: "action", position: { x: 0, y: 0 }, data: { type: "action", label: "x", config: {} } } satisfies KhWorkflowNode),
    ],
    edges: [],
  };
}

describe("getKeeperState", () => {
  beforeEach(() => _testing.clearCache());

  it("returns not_deployed when no matching workflow", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s).toEqual({ kind: "not_deployed" });
  });

  it("returns deployed_enabled when workflow.enabled=true", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([
      fakeWorkflow({ name: `wishd:auto-compound-comp:${USER}`, enabled: true, perms: PERMS }),
    ]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s).toEqual({ kind: "deployed_enabled", workflowId: "wf-1", permissionsId: PERMS });
  });

  it("returns deployed_disabled when workflow.enabled=false", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([
      fakeWorkflow({ name: `wishd:auto-compound-comp:${USER}`, enabled: false, perms: PERMS }),
    ]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s.kind).toBe("deployed_disabled");
  });

  it("ignores workflows with non-matching name", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([
      fakeWorkflow({ name: `wishd:other-keeper:${USER}`, enabled: true, perms: PERMS }),
    ]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s).toEqual({ kind: "not_deployed" });
  });

  it("caches result for ~30s by (userPortoAddress, keeperId)", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([]);
    await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(listWorkflows).toHaveBeenCalledTimes(1);
  });
});
```

(Add `import { beforeEach } from "vitest";` at top.)

- [ ] **Step 2: Run — verify failure**

```
pnpm --filter web test server/keepers/state
```

Expected: FAIL.

- [ ] **Step 3: Implement `state.ts`**

```ts
import type { Address, Keeper, KeeperState, KhWorkflowJson, KhWorkflowNode } from "@wishd/plugin-sdk";

type RemoteWorkflow = KhWorkflowJson & { id: string; enabled: boolean };
type ListWorkflowsFn = () => Promise<RemoteWorkflow[]>;

const TTL_MS = 30_000;
const cache = new Map<string, { state: KeeperState; fetchedAt: number }>();

function key(userPortoAddress: Address, keeperId: string): string {
  return `${userPortoAddress.toLowerCase()}::${keeperId}`;
}

function extractPermissionsId(nodes: KhWorkflowNode[]): `0x${string}` | null {
  for (const n of nodes) {
    const v = (n.data?.config as { permissionsId?: unknown } | undefined)?.permissionsId;
    if (typeof v === "string" && v.startsWith("0x")) return v as `0x${string}`;
  }
  return null;
}

export async function getKeeperState(args: {
  keeper: Keeper;
  userPortoAddress: Address;
  listWorkflows: ListWorkflowsFn;
}): Promise<KeeperState> {
  const k = key(args.userPortoAddress, args.keeper.manifest.id);
  const cached = cache.get(k);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.state;

  const wfs = await args.listWorkflows();
  const expectedName = `wishd:${args.keeper.manifest.id}:${args.userPortoAddress}`;
  const wf = wfs.find((w) => w.name === expectedName);
  if (!wf) {
    const state: KeeperState = { kind: "not_deployed" };
    cache.set(k, { state, fetchedAt: Date.now() });
    return state;
  }
  const permissionsId = extractPermissionsId(wf.nodes);
  if (!permissionsId) {
    const state: KeeperState = { kind: "not_deployed" };
    cache.set(k, { state, fetchedAt: Date.now() });
    return state;
  }
  const state: KeeperState = wf.enabled
    ? { kind: "deployed_enabled", workflowId: wf.id, permissionsId }
    : { kind: "deployed_disabled", workflowId: wf.id, permissionsId };
  cache.set(k, { state, fetchedAt: Date.now() });
  return state;
}

export const _testing = {
  clearCache: () => cache.clear(),
};
```

- [ ] **Step 4: Run tests**

```
pnpm --filter web test server/keepers/state
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add apps/web/server/keepers/state.ts apps/web/server/keepers/state.test.ts
git commit -m "feat(server/keepers): state reconciliation w/ 30s TTL cache, name-convention lookup"
```

### Task 12: Propose-delegation clamp

**Files:**
- Create: `apps/web/server/keepers/proposeDelegation.ts`
- Create: `apps/web/server/keepers/proposeDelegation.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { proposeDelegation, type DelegationProposal } from "./proposeDelegation";
import autoCompoundComp from "@wishd/keeper-auto-compound-comp";
import { COMP_SEPOLIA, USDC_SEPOLIA, COMP_DECIMALS, USDC_DECIMALS } from "@wishd/keeper-auto-compound-comp/addresses";

const KEEPER = autoCompoundComp;

describe("proposeDelegation", () => {
  it("returns defaults when agent suggestion is null", () => {
    const p = proposeDelegation({ keeper: KEEPER, agentSuggestion: null });
    expect(p.expiry.kind).toBe("unlimited");
    expect(p.spend.length).toBeGreaterThan(0);
  });

  it("clamps spend limit above maxLimit down to maxLimit", () => {
    const huge = 99_999n * 10n ** BigInt(COMP_DECIMALS);
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: COMP_SEPOLIA, limit: huge, period: "month" }] },
    });
    const comp = p.spend.find((s) => s.token === COMP_SEPOLIA);
    if (!comp) throw new Error("missing COMP entry");
    expect(comp.limit).toBe(1000n * 10n ** BigInt(COMP_DECIMALS)); // bound max
  });

  it("preserves valid in-bounds limit unchanged", () => {
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: USDC_SEPOLIA, limit: 500n * 10n ** BigInt(USDC_DECIMALS), period: "month" }] },
    });
    const usdc = p.spend.find((s) => s.token === USDC_SEPOLIA);
    expect(usdc?.limit).toBe(500n * 10n ** BigInt(USDC_DECIMALS));
  });

  it("rejects period not in bounds.periods (falls back to default period for that token)", () => {
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: COMP_SEPOLIA, limit: 1n, period: "day" as never }] },
    });
    const comp = p.spend.find((s) => s.token === COMP_SEPOLIA);
    expect(comp?.period).toBe("month"); // default fallback
  });

  it("ignores spend entries for tokens not in bounds", () => {
    const random = "0x000000000000000000000000000000000000dEaD" as const;
    const p = proposeDelegation({
      keeper: KEEPER,
      agentSuggestion: { spend: [{ token: random, limit: 1n, period: "month" }] },
    });
    expect(p.spend.find((s) => s.token === random)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify failure**

```
pnpm --filter web test server/keepers/proposeDelegation
```

- [ ] **Step 3: Implement `proposeDelegation.ts`**

```ts
import type { Address, Keeper, ExpiryPolicy, SpendPeriod } from "@wishd/plugin-sdk";

export type DelegationProposal = {
  expiry: ExpiryPolicy;
  spend: Array<{ token: Address; limit: bigint; period: SpendPeriod }>;
  rationale?: string;
};

export type AgentSuggestion = {
  expiry?: ExpiryPolicy;
  spend?: Array<{ token: Address; limit: bigint; period: SpendPeriod }>;
  rationale?: string;
} | null;

export function proposeDelegation(args: {
  keeper: Keeper;
  agentSuggestion: AgentSuggestion;
}): DelegationProposal {
  const { keeper, agentSuggestion } = args;
  if (keeper.delegation.kind !== "porto-permissions") {
    throw new Error("proposeDelegation only supports porto-permissions delegations");
  }
  const { expiryPolicy, spend } = keeper.delegation;

  // Expiry — keeper-author policy wins for "fixed" + "unlimited"; only "bounded" is user/agent adjustable.
  let expiry: ExpiryPolicy = expiryPolicy;
  if (expiryPolicy.kind === "bounded") {
    const sug = agentSuggestion?.expiry;
    if (sug?.kind === "bounded") {
      const days = Math.max(1, Math.min(expiryPolicy.maxDays, sug.maxDays));
      expiry = { kind: "bounded", maxDays: days };
    }
  }

  // Spend — start from defaults, layer in agent suggestions clamped to bounds.
  const out = new Map<Address, { token: Address; limit: bigint; period: SpendPeriod }>();
  for (const d of spend.defaults) out.set(d.token, { ...d });

  if (agentSuggestion?.spend) {
    for (const sug of agentSuggestion.spend) {
      const bound = spend.bounds.find((b) => b.token === sug.token);
      if (!bound) continue; // not in allowlist
      const period: SpendPeriod = bound.periods.includes(sug.period)
        ? sug.period
        : (out.get(sug.token)?.period ?? bound.periods[0]);
      const limit = sug.limit > bound.maxLimit ? bound.maxLimit : sug.limit < 0n ? 0n : sug.limit;
      out.set(sug.token, { token: sug.token, limit, period });
    }
  }

  return {
    expiry,
    spend: [...out.values()],
    rationale: agentSuggestion?.rationale,
  };
}
```

- [ ] **Step 4: Run tests**

```
pnpm --filter web test server/keepers/proposeDelegation
```

- [ ] **Step 5: Commit**

```
git add apps/web/server/keepers/proposeDelegation.ts apps/web/server/keepers/proposeDelegation.test.ts
git commit -m "feat(server/keepers): proposeDelegation clamp logic"
```

---

## Phase 4 — KeeperHub MCP wiring (server)

### Task 13: KH token store (single-tenant in-memory)

**Files:**
- Create: `apps/web/server/keepers/khTokenStore.ts`

The Agent SDK's MCP client manages OAuth internally, but the deploy route runs outside the agent stream and needs the token to call KH directly. We expose a small store the SDK can write to (via custom OAuth handler) and the route can read from.

- [ ] **Step 1: Write file**

```ts
type Token = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
};

let current: Token | null = null;

export const khTokenStore = {
  get(): Token | null {
    if (!current) return null;
    if (Date.now() >= current.expiresAt - 5_000) return null; // expired or near-expired
    return current;
  },
  set(t: Token): void {
    current = t;
  },
  clear(): void {
    current = null;
  },
};
```

- [ ] **Step 2: Commit**

```
git add apps/web/server/keepers/khTokenStore.ts
git commit -m "feat(server/keepers): single-tenant in-memory KH token store"
```

### Task 14: KH RPC helper for direct (non-agent) calls

The deploy route calls `create_workflow` and `update_workflow` directly via HTTP using KH's MCP route. This avoids piping a full agent loop through the user click → response path.

**Files:**
- Create: `apps/web/server/keepers/khRpc.ts`

- [ ] **Step 1: Write the file**

```ts
import { khTokenStore } from "./khTokenStore";

const KH_BASE = process.env.KH_BASE_URL ?? "https://app.keeperhub.dev";

type JsonRpcRequest = { jsonrpc: "2.0"; id: string; method: string; params: unknown };
type JsonRpcResponse = { jsonrpc: "2.0"; id: string; result?: unknown; error?: { code: number; message: string } };

export class KhUnauthorizedError extends Error {
  constructor(message = "KeeperHub MCP returned 401 — agent must re-authorize via SDK") {
    super(message);
  }
}

async function rpc(method: string, params: unknown): Promise<unknown> {
  const tok = khTokenStore.get();
  if (!tok) throw new KhUnauthorizedError("no KH access token cached — run a recommend_keeper agent turn first");

  const body: JsonRpcRequest = { jsonrpc: "2.0", id: crypto.randomUUID(), method: `tools/call`, params: { name: method, arguments: params } };
  const res = await fetch(`${KH_BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tok.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    khTokenStore.clear();
    throw new KhUnauthorizedError();
  }
  if (!res.ok) {
    throw new Error(`KH MCP HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) throw new Error(`KH MCP error: ${json.error.message}`);
  return json.result;
}

export async function khCreateWorkflow(input: { name: string; description?: string; nodes: unknown[]; edges: unknown[] }): Promise<{ workflowId: string }> {
  const result = (await rpc("create_workflow", input)) as { id: string };
  return { workflowId: result.id };
}

export async function khUpdateWorkflow(input: { workflowId: string; nodes?: unknown[]; edges?: unknown[]; name?: string; description?: string }): Promise<void> {
  await rpc("update_workflow", input);
}

export async function khListWorkflows(): Promise<Array<{ id: string; name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] }>> {
  const result = (await rpc("list_workflows", {})) as Array<{ id: string; name: string; enabled: boolean; nodes: unknown[]; edges: unknown[] }>;
  return result;
}
```

- [ ] **Step 2: Commit**

```
git add apps/web/server/keepers/khRpc.ts
git commit -m "feat(server/keepers): khRpc HTTP wrapper around KH MCP /mcp endpoint"
```

### Task 15: Wire KH MCP server into runAgent + token capture

**Files:**
- Modify: `apps/web/server/runAgent.ts`

Add KH as a remote MCP server in Agent SDK options + an OAuth handler that writes captured tokens to `khTokenStore`. The exact handler shape depends on `@anthropic-ai/claude-agent-sdk` API — verify against installed version (`apps/web/node_modules/@anthropic-ai/claude-agent-sdk` package + types) before writing.

- [ ] **Step 1: Locate current SDK MCP-server config shape**

```
grep -rn "mcpServers" apps/web/node_modules/@anthropic-ai/claude-agent-sdk/dist 2>/dev/null | head -20
grep -rn "transport\|streamable-http\|oauth" apps/web/node_modules/@anthropic-ai/claude-agent-sdk/dist 2>/dev/null | head -20
```

Read what configurations are accepted. If the SDK supports remote MCP via URL + OAuth callback, use that. If not, fall back to launching a local MCP proxy that handles OAuth and exposes stdio (out of scope for this plan — flag as blocker if encountered).

- [ ] **Step 2: Modify `runAgent.ts` to register KH MCP**

Append KH to `mcpServers` map. Replace the existing block:

```ts
const mcpServers: Record<string, any> = { widget: widgetMcp };
for (const m of pluginMcps) mcpServers[m.serverName] = m.server;
```

with:

```ts
import { khTokenStore } from "./keepers/khTokenStore";

const KH_BASE = process.env.KH_BASE_URL ?? "https://app.keeperhub.dev";
const mcpServers: Record<string, any> = { widget: widgetMcp };
for (const m of pluginMcps) mcpServers[m.serverName] = m.server;

// Remote MCP — KeeperHub. SDK handles OAuth discovery, dynamic registration, PKCE, and pending-auth surfacing.
mcpServers.keeperhub = {
  type: "http",
  url: `${KH_BASE}/mcp`,
  // Capture access tokens so the /api/keepers/deploy route can call KH directly.
  onTokenChange: (token: { accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }) => {
    khTokenStore.set({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: Date.now() + (token.expiresIn ?? 3600) * 1000,
      scope: token.scope ?? "mcp:write",
    });
  },
};
```

> **Verify during impl:** the exact field name (`type`, `transport`, etc.) and OAuth-token-capture hook may differ between Agent SDK minor versions. Read SDK source under `apps/web/node_modules/@anthropic-ai/claude-agent-sdk/dist/types.d.ts` (or equivalent) before finalizing. If no `onTokenChange` callback exists, alternative: read the SDK's internal token state via a documented `getMcpTokens()` API; if neither exists, call out as a blocker and keep token capture as a manual env paste for the demo.

- [ ] **Step 3: Allow KH MCP tool names**

In `pluginLoader.ts` or wherever `allowedTools` is built, ensure prefix `mcp__keeperhub__*` is included. Search:

```
grep -n "allowedTools" apps/web/server/pluginLoader.ts apps/web/server/runAgent.ts
```

Patch the array/glob so KH MCP tools are reachable by the agent.

- [ ] **Step 4: Typecheck**

```
pnpm --filter web typecheck
```

- [ ] **Step 5: Commit**

```
git add apps/web/server/runAgent.ts apps/web/server/pluginLoader.ts
git commit -m "feat(server): register KeeperHub remote MCP + capture OAuth tokens"
```

---

## Phase 5 — Agent custom tools

### Task 16: Define custom tools

**Files:**
- Create: `apps/web/server/keepers/agentTools.ts`

Custom tools are registered via the Agent SDK's tool-definition API. Inspect SDK before writing — likely a `tool({...})` factory. The shape below uses a hypothetical `tool` import; replace with actual SDK API during impl.

- [ ] **Step 1: Write file**

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent, KeeperOffer, Address } from "@wishd/plugin-sdk";
import { keepersForIntent, getKeeperById } from "./registry";
import { getKeeperState } from "./state";
import { khListWorkflows } from "./khRpc";
import { proposeDelegation, type DelegationProposal, type AgentSuggestion } from "./proposeDelegation";

export function buildKeeperAgentTools(args: { emit: (e: ServerEvent) => void }) {
  const recommendKeeper = tool({
    name: "recommend_keeper",
    description:
      "After a user's intent confirms, look up applicable keepers and return a single offer if one is appropriate. Read-only. Returns null if no useful recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        intentId: { type: "string" },
        userPortoAddress: { type: "string" },
      },
      required: ["intentId", "userPortoAddress"],
    },
    handler: async (input: { intentId: string; userPortoAddress: Address }) => {
      const candidates = keepersForIntent(input.intentId);
      if (candidates.length === 0) return { offer: null };
      const keeper = candidates[0];
      const state = await getKeeperState({
        keeper,
        userPortoAddress: input.userPortoAddress,
        listWorkflows: khListWorkflows,
      });
      const offer: KeeperOffer = {
        keeperId: keeper.manifest.id,
        title: keeper.manifest.name,
        desc: keeper.manifest.description,
        badge: "KEEPERHUB",
        featured: true,
        state,
      };
      return { offer };
    },
  });

  const proposeDelegationTool = tool({
    name: "propose_delegation",
    description:
      "Propose Porto delegation values (expiry + spend caps) within the keeper's bounds. Server clamps any out-of-range suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        keeperId: { type: "string" },
        suggestion: {
          type: "object",
          additionalProperties: true,
          description: "Optional agent suggestion: { expiry?, spend?: [{ token, limit, period }], rationale? }",
        },
      },
      required: ["keeperId"],
    },
    handler: async (input: { keeperId: string; suggestion?: AgentSuggestion }) => {
      const keeper = getKeeperById(input.keeperId);
      if (!keeper) throw new Error(`unknown keeper ${input.keeperId}`);
      const proposal: DelegationProposal = proposeDelegation({
        keeper,
        agentSuggestion: input.suggestion ?? null,
      });
      // Note: bigint -> string for JSON safety
      return {
        expiry: proposal.expiry,
        spend: proposal.spend.map((s) => ({ token: s.token, limit: s.limit.toString(), period: s.period })),
        rationale: proposal.rationale ?? null,
      };
    },
  });

  const injectKeeperOffer = tool({
    name: "inject_keeper_offer",
    description:
      "Push a keeper offer into the success card identified by stepCardId. Replaces the empty keeperOffers slot. Must be called after recommend_keeper returned a non-null offer.",
    inputSchema: {
      type: "object",
      properties: {
        stepCardId: { type: "string" },
        offer: { type: "object", additionalProperties: true },
        suggestedDelegation: { type: "object", additionalProperties: true },
      },
      required: ["stepCardId", "offer"],
    },
    handler: async (input: { stepCardId: string; offer: KeeperOffer; suggestedDelegation?: DelegationProposal }) => {
      // Defense-in-depth: keeper must exist in the registry.
      if (!getKeeperById(input.offer.keeperId)) {
        throw new Error(`unknown keeper ${input.offer.keeperId}`);
      }
      args.emit({
        type: "ui.patch",
        id: input.stepCardId,
        props: {
          keeperOffers: [{ ...input.offer, suggestedDelegation: input.suggestedDelegation ?? null }],
        },
      });
      return { ok: true };
    },
  });

  return [recommendKeeper, proposeDelegationTool, injectKeeperOffer];
}
```

> **Verify during impl:** `tool` import path and signature against `@anthropic-ai/claude-agent-sdk` v0.2.x. If the SDK uses a different API (e.g. `defineTool`, `createTool`, raw object literal in options), adapt the file. Update `runAgent.ts` to attach the returned tools (probably via `options.tools: [...]`).

- [ ] **Step 2: Wire tools into `runAgent.ts`**

Inside `runAgent`, after the existing pluginCtx lines, before the `query({...})` call:

```ts
import { buildKeeperAgentTools } from "./keepers/agentTools";

const keeperTools = buildKeeperAgentTools({ emit });
```

Then in `query({ ... })`'s `options`:

```ts
options: {
  systemPrompt,
  model: HAIKU,
  mcpServers,
  allowedTools,
  tools: keeperTools,                       // NEW
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  maxTurns: mode === "narrate-only" ? 1 : 4, // bumped from 3 to allow recommend → propose → inject
},
```

- [ ] **Step 3: Typecheck**

```
pnpm --filter web typecheck
```

- [ ] **Step 4: Commit**

```
git add apps/web/server/keepers/agentTools.ts apps/web/server/runAgent.ts
git commit -m "feat(server): three Agent SDK tools — recommend_keeper, propose_delegation, inject_keeper_offer"
```

---

## Phase 6 — Deploy API route

### Task 17: Validate-and-deploy POST handler

**Files:**
- Create: `apps/web/app/api/keepers/deploy/route.ts`
- Create: `apps/web/app/api/keepers/deploy/route.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as khRpc from "@/server/keepers/khRpc";

describe("POST /api/keepers/deploy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns 400 on invalid body", async () => {
    const req = new Request("http://x/api/keepers/deploy", { method: "POST", body: "{}" });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 404 on unknown keeperId", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ keeperId: "nope", userPortoAddress: "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3", permissionsId: "0xabc" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(404);
  });

  it("calls create_workflow then update_workflow to enable, returns workflowId", async () => {
    const create = vi.spyOn(khRpc, "khCreateWorkflow").mockResolvedValue({ workflowId: "wf-1" });
    const update = vi.spyOn(khRpc, "khUpdateWorkflow").mockResolvedValue();

    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        keeperId: "auto-compound-comp",
        userPortoAddress: "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3",
        permissionsId: "0x8aa4cc3b82173c5ed03597dbf6cbd1e7ab2ff7ce",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ workflowId: "wf-1" });
    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ workflowId: "wf-1" }));
  });
});
```

- [ ] **Step 2: Run — verify failure**

```
pnpm --filter web test app/api/keepers/deploy/route
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```ts
import { NextResponse } from "next/server";
import type { Address } from "@wishd/plugin-sdk";
import { getKeeperById } from "@/server/keepers/registry";
import { khCreateWorkflow, khUpdateWorkflow, KhUnauthorizedError } from "@/server/keepers/khRpc";

type Body = {
  keeperId: string;
  userPortoAddress: Address;
  permissionsId: `0x${string}`;
};

function isAddress(s: unknown): s is Address {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
}
function isHex(s: unknown): s is `0x${string}` {
  return typeof s === "string" && /^0x[0-9a-fA-F]+$/.test(s);
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.keeperId !== "string" || !isAddress(body.userPortoAddress) || !isHex(body.permissionsId)) {
    return NextResponse.json({ error: "missing or invalid keeperId/userPortoAddress/permissionsId" }, { status: 400 });
  }

  const keeper = getKeeperById(body.keeperId);
  if (!keeper) return NextResponse.json({ error: `unknown keeper ${body.keeperId}` }, { status: 404 });

  const workflow = keeper.buildWorkflow({
    userPortoAddress: body.userPortoAddress,
    permissionsId: body.permissionsId,
  });

  try {
    const { workflowId } = await khCreateWorkflow({
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      edges: workflow.edges,
    });

    // Enable: patch trigger node config.enabled=true and resend nodes.
    const enabledNodes = workflow.nodes.map((n) =>
      n.id === "trigger"
        ? { ...n, data: { ...n.data, config: { ...n.data.config, enabled: true } } }
        : n,
    );
    await khUpdateWorkflow({ workflowId, nodes: enabledNodes, edges: workflow.edges });

    return NextResponse.json({ workflowId });
  } catch (err) {
    if (err instanceof KhUnauthorizedError) {
      return NextResponse.json({ error: err.message, code: "kh_unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run tests**

```
pnpm --filter web test app/api/keepers/deploy/route
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add apps/web/app/api/keepers/deploy/route.ts apps/web/app/api/keepers/deploy/route.test.ts
git commit -m "feat(api/keepers/deploy): create + enable workflow on KeeperHub"
```

---

## Phase 7 — Client deploy modal

### Task 18: Client-side keeper registry (manifest+delegation only)

**Files:**
- Create: `apps/web/lib/keepers/clientRegistry.ts`

The browser cannot import `@wishd/keeper-auto-compound-comp` directly without bundling addresses, but we want labels + delegation for the modal. Re-export from the keeper package — Next bundler handles workspace deps.

- [ ] **Step 1: Write file**

```ts
import autoCompoundComp from "@wishd/keeper-auto-compound-comp";
import type { Keeper } from "@wishd/plugin-sdk";

const KEEPERS: Keeper[] = [autoCompoundComp];

export function clientGetKeeper(id: string): Keeper | null {
  return KEEPERS.find((k) => k.manifest.id === id) ?? null;
}
```

- [ ] **Step 2: Commit**

```
git add apps/web/lib/keepers/clientRegistry.ts
git commit -m "feat(client): keeper client registry — manifest+delegation lookup"
```

### Task 19: Porto grant payload mapper

**Files:**
- Create: `apps/web/lib/keepers/buildPortoGrantPayload.ts`
- Create: `apps/web/lib/keepers/buildPortoGrantPayload.test.ts`

Reference impl: `crypto-bro-calls/frontend/app/demo-workflow` — port the mapping logic. The "unlimited" expiry sentinel must match what Porto/EIP-7715 expects; reference impl is authoritative.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildPortoGrantPayload, UNLIMITED_EXPIRY_SENTINEL } from "./buildPortoGrantPayload";
import autoCompoundComp from "@wishd/keeper-auto-compound-comp";
import type { Address } from "@wishd/plugin-sdk";

describe("buildPortoGrantPayload", () => {
  it("uses far-future sentinel for unlimited expiry", () => {
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: { expiry: { kind: "unlimited" }, spend: [] },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(payload.expiry).toBe(UNLIMITED_EXPIRY_SENTINEL);
  });

  it("maps allowlist 1:1 from delegation.fixed.calls", () => {
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: { expiry: { kind: "unlimited" }, spend: [] },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    if (autoCompoundComp.delegation.kind !== "porto-permissions") throw new Error();
    expect(payload.permissions.calls.map((c) => c.to.toLowerCase()))
      .toEqual(autoCompoundComp.delegation.fixed.calls.map((a) => a.toLowerCase()));
  });

  it("includes spend entries from the proposal", () => {
    if (autoCompoundComp.delegation.kind !== "porto-permissions") throw new Error();
    const t = autoCompoundComp.delegation.fixed.calls[0]; // any
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: {
        expiry: { kind: "unlimited" },
        spend: [{ token: t, limit: 5n, period: "month" }],
      },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(payload.permissions.spend?.[0]).toMatchObject({ token: t, limit: 5n, period: "month" });
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { Address, Keeper, PortoPermissionsGrant } from "@wishd/plugin-sdk";
import type { DelegationProposal } from "@/server/keepers/proposeDelegation";

// Year 2106 sentinel — fits uint32 expiry fields. If Porto/EIP-7715 uses uint256, swap to a larger value.
// Verify against reference impl in crypto-bro-calls/frontend/app/demo-workflow during integration.
export const UNLIMITED_EXPIRY_SENTINEL = 4_102_444_800; // 2100-01-01 UTC seconds

export function buildPortoGrantPayload(args: {
  keeper: Keeper;
  proposal: DelegationProposal;
  sessionPublicKey: Address;
}): PortoPermissionsGrant {
  const { keeper, proposal, sessionPublicKey } = args;
  if (keeper.delegation.kind !== "porto-permissions") {
    throw new Error("buildPortoGrantPayload: keeper delegation is not porto-permissions");
  }

  let expiry: number;
  switch (proposal.expiry.kind) {
    case "unlimited":
      expiry = UNLIMITED_EXPIRY_SENTINEL;
      break;
    case "bounded":
      expiry = Math.floor(Date.now() / 1000) + proposal.expiry.maxDays * 86_400;
      break;
    case "fixed":
      expiry = Math.floor(Date.now() / 1000) + proposal.expiry.days * 86_400;
      break;
  }

  return {
    expiry,
    feeToken: undefined,
    key: { type: "secp256k1", publicKey: sessionPublicKey },
    permissions: {
      calls: keeper.delegation.fixed.calls.map((to) => ({ to, signature: "" })),
      spend: proposal.spend.map((s) => ({ token: s.token, limit: s.limit, period: s.period })),
    },
  };
}
```

- [ ] **Step 3: Run tests**

```
pnpm --filter web test lib/keepers/buildPortoGrantPayload
```

- [ ] **Step 4: Commit**

```
git add apps/web/lib/keepers/buildPortoGrantPayload.ts apps/web/lib/keepers/buildPortoGrantPayload.test.ts
git commit -m "feat(client): buildPortoGrantPayload — DelegationSpec → wallet_grantPermissions input"
```

### Task 20: Deploy modal store

**Files:**
- Create: `apps/web/store/keeperDeploy.ts`

- [ ] **Step 1: Write file**

```ts
import { create } from "zustand";
import type { KeeperOffer } from "@wishd/plugin-sdk";
import type { DelegationProposal } from "@/server/keepers/proposeDelegation";

type State = {
  open: boolean;
  payload: { offer: KeeperOffer; suggestedDelegation?: DelegationProposal } | null;
  openDeploy: (p: { offer: KeeperOffer; suggestedDelegation?: DelegationProposal }) => void;
  close: () => void;
};

export const useKeeperDeploy = create<State>((set) => ({
  open: false,
  payload: null,
  openDeploy: (p) => set({ open: true, payload: p }),
  close: () => set({ open: false, payload: null }),
}));
```

- [ ] **Step 2: Commit**

```
git add apps/web/store/keeperDeploy.ts
git commit -m "feat(client): zustand store for keeper deploy modal"
```

### Task 21: KeeperDeployFlow modal

**Files:**
- Create: `apps/web/components/wish/KeeperDeployFlow.tsx`
- Create: `apps/web/components/wish/KeeperDeployFlow.test.tsx`

The modal has four phases: review → grant → deploy → confirmed. Granting uses Porto via the existing wagmi/porto integration in `apps/web/lib/wagmi.ts`.

- [ ] **Step 1: Write smoke render test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useKeeperDeploy } from "@/store/keeperDeploy";
import { KeeperDeployFlow } from "./KeeperDeployFlow";

describe("KeeperDeployFlow", () => {
  it("renders review phase title when an offer is opened", () => {
    useKeeperDeploy.getState().openDeploy({
      offer: {
        keeperId: "auto-compound-comp",
        title: "Auto-compound COMP rewards",
        desc: "Hourly auto-compound",
        state: { kind: "not_deployed" },
      },
    });
    render(<KeeperDeployFlow />);
    expect(screen.getByText(/Auto-compound COMP rewards/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("renders nothing when not open", () => {
    useKeeperDeploy.getState().close();
    const { container } = render(<KeeperDeployFlow />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify failure**

```
pnpm --filter web test components/wish/KeeperDeployFlow
```

- [ ] **Step 3: Implement modal**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnectorClient } from "wagmi";
import { useKeeperDeploy } from "@/store/keeperDeploy";
import { clientGetKeeper } from "@/lib/keepers/clientRegistry";
import { buildPortoGrantPayload } from "@/lib/keepers/buildPortoGrantPayload";
import type { DelegationProposal } from "@/server/keepers/proposeDelegation";
import type { SpendPeriod, Address } from "@wishd/plugin-sdk";

type Phase = "review" | "granting" | "deploying" | "confirmed" | "error";

export function KeeperDeployFlow(): JSX.Element | null {
  const { open, payload, close } = useKeeperDeploy();
  const { address } = useAccount();
  const { data: walletClient } = useConnectorClient();
  const [phase, setPhase] = useState<Phase>("review");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposal, setProposal] = useState<DelegationProposal | null>(null);

  const keeper = useMemo(() => (payload ? clientGetKeeper(payload.offer.keeperId) : null), [payload]);

  useEffect(() => {
    if (!open) {
      setPhase("review");
      setErrorMsg(null);
      setProposal(null);
      return;
    }
    if (!keeper) return;
    if (keeper.delegation.kind !== "porto-permissions") return;
    setProposal(
      payload?.suggestedDelegation ?? {
        expiry: keeper.delegation.expiryPolicy,
        spend: keeper.delegation.spend.defaults.map((d) => ({ token: d.token, limit: d.limit, period: d.period })),
      },
    );
  }, [open, keeper, payload]);

  if (!open || !payload || !keeper || !proposal) return null;
  if (keeper.delegation.kind !== "porto-permissions") return null;

  async function handleContinue(): Promise<void> {
    if (!walletClient || !address) {
      setErrorMsg("connect a Porto wallet first");
      setPhase("error");
      return;
    }
    setPhase("granting");
    try {
      const sessionKey = ("0x" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")).slice(0, 42) as Address;
      // TODO during impl: derive sessionKey from Porto SDK helper instead of placeholder; reference crypto-bro-calls/frontend.
      const grant = buildPortoGrantPayload({
        keeper: keeper!,
        proposal: proposal!,
        sessionPublicKey: sessionKey,
      });
      const result = (await (walletClient as any).request({
        method: "wallet_grantPermissions",
        params: [grant],
      })) as { permissionsId: `0x${string}` };

      setPhase("deploying");
      const res = await fetch("/api/keepers/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keeperId: keeper!.manifest.id,
          userPortoAddress: address,
          permissionsId: result.permissionsId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `deploy failed ${res.status}`);
      }
      setPhase("confirmed");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function setSpendLimit(token: Address, limit: bigint): void {
    setProposal((p) => p && { ...p, spend: p.spend.map((s) => (s.token === token ? { ...s, limit } : s)) });
  }
  function setSpendPeriod(token: Address, period: SpendPeriod): void {
    setProposal((p) => p && { ...p, spend: p.spend.map((s) => (s.token === token ? { ...s, period } : s)) });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="bg-surface-1 w-full max-w-md rounded-md border border-rule p-5">
        <header className="flex items-start justify-between mb-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">deploy keeper</div>
            <h2 className="font-hand text-2xl font-bold leading-tight">{keeper.manifest.name}</h2>
            <p className="text-xs text-ink-3 mt-1">{keeper.manifest.description}</p>
          </div>
          <button type="button" className="text-ink-3 text-sm" onClick={close}>×</button>
        </header>

        {phase === "review" && (
          <section className="space-y-3">
            <Block label="this session may call">
              <ul className="text-xs space-y-1">
                {keeper.delegation.fixed.calls.map((a) => (
                  <li key={a} className="font-mono">{a}</li>
                ))}
              </ul>
            </Block>
            <Block label="expiry">
              {keeper.delegation.expiryPolicy.kind === "unlimited" && (
                <span className="text-xs">no expiry · revoke anytime in your Porto wallet</span>
              )}
              {keeper.delegation.expiryPolicy.kind === "fixed" && (
                <span className="text-xs">{keeper.delegation.expiryPolicy.days} days (fixed)</span>
              )}
              {keeper.delegation.expiryPolicy.kind === "bounded" && (
                <span className="text-xs">up to {keeper.delegation.expiryPolicy.maxDays} days</span>
              )}
            </Block>
            <Block label="spend caps">
              {proposal.spend.map((s) => {
                const bound = keeper.delegation.kind === "porto-permissions"
                  ? keeper.delegation.spend.bounds.find((b) => b.token === s.token)
                  : undefined;
                return (
                  <div key={s.token} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
                    <span className="font-mono">{s.token.slice(0, 10)}…</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="bg-surface-2 border border-rule rounded px-2 py-1 w-28 font-mono"
                      value={s.limit.toString()}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        if (!v) return;
                        const n = BigInt(v);
                        const max = bound?.maxLimit ?? n;
                        setSpendLimit(s.token, n > max ? max : n);
                      }}
                    />
                    <select
                      className="bg-surface-2 border border-rule rounded px-2 py-1 text-xs"
                      value={s.period}
                      onChange={(e) => setSpendPeriod(s.token, e.target.value as SpendPeriod)}
                    >
                      {(bound?.periods ?? ["month"]).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </Block>
            {payload.suggestedDelegation?.rationale && (
              <p className="text-xs text-ink-3 italic">agent suggested: {payload.suggestedDelegation.rationale}</p>
            )}
            <button
              type="button"
              className="bg-accent border-[1.5px] border-ink rounded-pill px-4 py-1.5 text-sm font-semibold"
              onClick={handleContinue}
            >Continue →</button>
          </section>
        )}

        {phase === "granting" && <p className="text-sm">Approve in your Porto wallet…</p>}
        {phase === "deploying" && <p className="text-sm">Creating workflow on KeeperHub…</p>}
        {phase === "confirmed" && (
          <section>
            <p className="text-sm font-bold mb-2">auto-compound active ✓</p>
            <button type="button" className="text-xs underline" onClick={close}>close</button>
          </section>
        )}
        {phase === "error" && (
          <section>
            <p className="text-sm text-warn mb-2">{errorMsg ?? "unknown error"}</p>
            <button type="button" className="text-xs underline" onClick={() => setPhase("review")}>back</button>
          </section>
        )}
      </div>
    </div>
  );
}

function Block(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="border-t border-rule pt-2">
      <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3 mb-1">{props.label}</div>
      {props.children}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```
pnpm --filter web test components/wish/KeeperDeployFlow
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add apps/web/components/wish/KeeperDeployFlow.tsx apps/web/components/wish/KeeperDeployFlow.test.tsx
git commit -m "feat(client): KeeperDeployFlow modal — review → grant → deploy → confirmed"
```

### Task 22: Mount modal in app layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Read current layout**

```
sed -n '1,80p' apps/web/app/layout.tsx
```

- [ ] **Step 2: Add KeeperDeployFlow mount**

Inside the existing layout's body content, after the main wrapper, add:

```tsx
import { KeeperDeployFlow } from "@/components/wish/KeeperDeployFlow";
// ...
// Inside the JSX, alongside StreamBus / providers:
<KeeperDeployFlow />
```

- [ ] **Step 3: Typecheck + dev smoke**

```
pnpm --filter web typecheck
```

Then in the running dev server: open the page, dispatch a fake offer via DevTools console:

```js
window.__wishd_test_open_keeper?.()
```

(Optional helper — wire this in only if convenient. Otherwise, manual smoke happens in Phase 10.)

- [ ] **Step 4: Commit**

```
git add apps/web/app/layout.tsx
git commit -m "feat(client): mount KeeperDeployFlow at layout root"
```

---

## Phase 8 — SuccessCard wiring

### Task 23: SuccessCard reads agent-injected offers + opens modal

**Files:**
- Modify: `apps/web/components/primitives/SuccessCard.tsx`
- Modify: `plugins/compound-v3/widgets/CompoundExecute.tsx`

- [ ] **Step 1: SuccessCard — wire deploy button to store**

Replace the `onClick` of the `deploy ✦` button (currently disabled) with:

```tsx
import { useKeeperDeploy } from "@/store/keeperDeploy";
// ...
const openDeploy = useKeeperDeploy((s) => s.openDeploy);
// In the offer map's deploy button:
<button
  type="button"
  disabled={o.comingSoon}
  onClick={() => openDeploy({ offer: o as any })}
  className="bg-accent border-[1.5px] border-ink rounded-pill px-3 py-1 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
>deploy ✦</button>
```

(Type cast `o as any` is acceptable here while `KeeperOffer` and `SuccessCard.KeeperOffer` align — collapse to the SDK `KeeperOffer` type in a follow-up by replacing `SuccessCard.KeeperOffer` with the SDK type entirely.)

- [ ] **Step 2: CompoundExecute — empty default keeperOffers + pass stepCardId**

In `plugins/compound-v3/widgets/CompoundExecute.tsx` (around lines 138–160), change:

```tsx
keeperOffers={isWithdraw ? [] : [
  { id: "auto-compound", badge: "KEEPERHUB", featured: true,
    title: "Auto-compound yield",
    desc: "claim and re-supply rewards weekly. uses session permissions.",
    comingSoon: true },
]}
```

to:

```tsx
keeperOffers={props.keeperOffers ?? []}
```

And ensure `props` declares the optional shape:

```tsx
keeperOffers?: Array<{ id: string; badge?: string; title: string; desc: string; featured?: boolean; comingSoon?: boolean }>;
```

(The agent will inject offers via `ui.patch` — see Phase 5.)

- [ ] **Step 3: Typecheck**

```
pnpm --filter web typecheck && pnpm --filter @wishd/plugin-compound-v3 typecheck
```

- [ ] **Step 4: Commit**

```
git add apps/web/components/primitives/SuccessCard.tsx plugins/compound-v3/widgets/CompoundExecute.tsx
git commit -m "feat(ui): SuccessCard opens KeeperDeployFlow; CompoundExecute defers offers to agent"
```

### Task 24: Pass `stepCardId` from CompoundExecute → agent context

The agent's `inject_keeper_offer` needs the SuccessCard widget id to target via `ui.patch`. The widget renderer assigns an id when the agent calls `mcp__widget__render`. We need the agent to pass that id to `inject_keeper_offer`.

- [ ] **Step 1: Confirm widget id flow**

```
grep -n "ui.render\|widget.*id" apps/web/server/mcps/widgetRenderer.ts | head
```

Read the renderer to confirm the id is server-generated and surfaced to the agent in the tool result.

- [ ] **Step 2: Adjust system prompt** (if needed) so the agent stores the id of the rendered execute widget and passes it to `inject_keeper_offer.stepCardId` later.

This intersects with Phase 9 — capture as part of the system prompt edit there.

- [ ] **Step 3: No code change in this task — proceed to Phase 9 with this requirement noted.**

---

## Phase 9 — System prompt + agent integration

### Task 25: Add keeper recommendation flow to system prompt

**Files:**
- Modify: `apps/web/server/systemPrompt.ts`

- [ ] **Step 1: Read current `CANONICAL_FLOWS`**

```
sed -n '1,200p' apps/web/server/systemPrompt.ts
```

- [ ] **Step 2: Append flow E**

Add a new section to `CANONICAL_FLOWS`:

```
E. Post-execution keeper recommendation — fires after canonical flows C or D succeed (you'll see `intent.confirmed` in the user message context). After rendering the compound-execute widget:
  1. Note the widget id you used in step C/D (the `id` you passed to `mcp__widget__render`). You'll need it as `stepCardId`.
  2. Call `recommend_keeper({ intentId: "<the intent id, e.g. compound-v3.deposit>", userPortoAddress: "<account.address>" })`.
  3. If the result.offer is null, stop. Do not surface a recommendation.
  4. If non-null and offer.state.kind === "not_deployed":
     a. Optionally call `propose_delegation({ keeperId: offer.keeperId, suggestion: { ... } })` based on context (deposit size, etc.). Stay within the keeper's bounds — the server will clamp anyway. You can skip this and rely on defaults.
     b. Call `inject_keeper_offer({ stepCardId: <id from step 1>, offer, suggestedDelegation })`.
     c. Emit a one-line chat message inviting the user to set it up (e.g. "while we're here — auto-compound your COMP rewards?").
  5. If offer.state.kind starts with "deployed_": skip injection (the SuccessCard already shows the active state).

Auth note: if any KeeperHub tool returns an authorization error, post the auth URL to chat as a clear link (e.g. "Connect KeeperHub to continue: <url>") and pause. Do not retry until the user confirms they have authorized.

Trust note: never widen `delegation.fixed.calls`. Never propose spend caps or expiry outside `delegation.bounds`. The server clamps any out-of-range proposals — do not try to bypass.
```

- [ ] **Step 3: Typecheck + commit**

```
pnpm --filter web typecheck
git add apps/web/server/systemPrompt.ts
git commit -m "feat(server): system prompt — keeper recommendation flow + auth/trust rules"
```

### Task 26: Trigger `intent.confirmed` follow-up turn

CompoundExecute's confirmation already happens client-side. After the user sees the success state, the next chat turn (or an auto-fired turn) needs to carry `context.preparedKind === "deposit"` + `context.confirmed === true` so the system prompt can route to flow E.

- [ ] **Step 1: Identify confirmation point**

```
grep -n "phase === \"confirmed\"\|callsStatus.data" plugins/compound-v3/widgets/CompoundExecute.tsx
```

- [ ] **Step 2: Dispatch follow-up wish on confirmation**

When `phase === "confirmed"` becomes true and `callsStatus.data?.status === "success"`, dispatch a synthetic `wishd:wish` event with a generated wish + context:

```tsx
useEffect(() => {
  if (callsStatus.data?.status !== "success") return;
  const account = props.account ?? { address: props.user, chainId: props.chainId };
  window.dispatchEvent(new CustomEvent("wishd:wish", {
    detail: {
      wish: `intent confirmed: ${kind} ${props.amount} ${props.asset}`,
      account,
      context: {
        intent: kind === "deposit" ? "compound-v3.deposit" : "compound-v3.withdraw",
        confirmed: true,
        userPortoAddress: account.address,
        stepCardId: props.id,                        // success card id, see widgetRenderer
        txHash,
      },
    },
  }));
}, [callsStatus.data?.status, kind, props, txHash]);
```

> **Verify during impl:** the `props.id` passed by widgetRenderer is the widget id used by the agent. If not directly available, plumb it through the rendered widget's props in `widgetRenderer.ts`.

- [ ] **Step 3: Typecheck + commit**

```
pnpm --filter @wishd/plugin-compound-v3 typecheck && pnpm --filter web typecheck
git add plugins/compound-v3/widgets/CompoundExecute.tsx
git commit -m "feat(compound-v3): on confirm, dispatch follow-up wish carrying intent.confirmed context"
```

---

## Phase 10 — Manual E2E smoke

### Task 27: End-to-end demo run

This task is human-driven — no automated test. Document each click + expected observation.

- [ ] **Step 1: Start dev server**

```
cd apps/web && pnpm dev:https
```

- [ ] **Step 2: Open `https://localhost:3000`, connect Porto wallet**

Expected: "0x9dd0…D5F3" badge appears top right.

- [ ] **Step 3: Click suggestion "deposit 10 USDC into Compound on Sepolia"**

Expected: WishComposer fills, Step 02 (CompoundSummary) renders with safety checks all green.

- [ ] **Step 4: Click "execute →"**

Expected: Step 03 ExecuteTimeline runs preflight → sign → broadcast → confirmed. SuccessCard appears.

- [ ] **Step 5: Wait ≤10s for agent**

Expected: agent emits a one-line message ("while we're here — auto-compound your COMP rewards?"). SuccessCard's `keeperOffers` now shows "Auto-compound COMP rewards" card with `deploy ✦` enabled (no longer "coming soon").

If KeeperHub MCP not yet authorized, expected: an "Connect KeeperHub: [Authorize]" link in chat first. Click → KH OAuth page → approve → return → recommendation appears.

- [ ] **Step 6: Click `deploy ✦`**

Expected: `KeeperDeployFlow` modal opens. Review phase shows: 5 contract addresses (CometRewards / COMP / Uniswap router / USDC / Comet USDC), expiry "no expiry · revoke anytime", spend caps editable (COMP 100/month, USDC 1000/month).

- [ ] **Step 7: Click "Continue →"**

Expected: Porto wallet prompts `wallet_grantPermissions` with the spec. Approve. Modal transitions to "deploying". Server posts `/api/keepers/deploy`, calls KH `create_workflow` then `update_workflow`. Modal transitions to "auto-compound active ✓".

- [ ] **Step 8: Verify on KeeperHub**

```
# in this session, KH MCP is connected:
# call list_workflows and look for wishd:auto-compound-comp:0x9dd0…
```

Expected: workflow exists, `enabled: true`, trigger node `cron: "0 * * * *"`, `enabled: true`.

- [ ] **Step 9: Reload the page and re-run the same lend wish**

Expected: SuccessCard now shows "auto-compound active ✓" surface (state from `getKeeperState` reflects `deployed_enabled`); no offer card.

- [ ] **Step 10: Note + log any deviations**

Append findings to a follow-up issue or to spec §11 "Open questions" if a verification flagged there turned out differently.

---

## Self-review (post-write)

### Spec coverage

| Spec section | Plan task(s) |
|--------------|--------------|
| §3 architecture overview | Task 10 (registry), 11 (state), 16 (agent tools), 17 (deploy route), 21 (modal), 25 (system prompt) |
| §3 state reconciliation | Task 11, 23 (SuccessCard surfaces) |
| §4 keeper structure | Task 3–8 |
| §4 delegation.ts (fixed/bounds/defaults/expiryPolicy) | Task 5 |
| §5 SDK additions | Task 1 |
| §6 server runtime | Task 10–17 |
| §7 client (modal + SuccessCard) | Task 19–23 |
| §8 auth via SDK MCP | Task 13–15 (token store + RPC + runAgent wiring) |
| §9 system prompt additions | Task 25 |
| §10 testing | Tasks 1, 5, 7, 10, 11, 12, 17, 19, 21, 27 |
| §11 open questions (`update_workflow` enable, Porto mapper, expiry sentinel, SDK pending-auth surface) | Tasks 15, 17, 19 — flagged inline as "Verify during impl" |

### Placeholder scan

- All steps contain code or commands. Where empirical SDK behavior differs (Tasks 15, 22, 26), tasks include grep commands + a "verify during impl" pointer to a concrete file under `node_modules`.
- `crypto.randomUUID()`-based session key in Task 21 Step 3 is flagged as a TODO inside the code with a pointer to the reference impl — replace before merge. Acceptable for hackathon demo path, but note this is not crypto-grade key generation.
- No "TBD" or "implement later" strings remain.

### Type consistency

- `KeeperOffer.state` (SDK) is consumed by `recommend_keeper` (Task 16) and `KeeperDeployFlow` modal (Task 21). Same shape.
- `DelegationProposal` (Task 12) consumed by `agentTools.ts` (Task 16) and `buildPortoGrantPayload` (Task 19). Same shape.
- `SuccessCard.KeeperOffer` is local to that component; Task 23 leaves an `as any` cast pending a follow-up to unify with SDK `KeeperOffer`. Listed as a known follow-up; not a bug.
- `khListWorkflows` returns `{ id, name, enabled, nodes, edges }` (Task 14); state.ts `listWorkflows` parameter (Task 11) accepts the same shape via `KhWorkflowJson & { id, enabled }`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-01-keeperhub-keepers.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

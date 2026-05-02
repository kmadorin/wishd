# Hackathon Demo Prerequisites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship every prerequisite from `docs/superpowers/specs/2026-05-02-demo-script-design.md` so the 60-second app-demo recording can be made as scripted.

**Architecture:** Pure additive — no refactor. Extend the plugin SDK with a `select` field type, ship a new `demo-stubs` plugin for the four mocked intents, extend `compound-v3` with a wired `lend` intent that has a protocol pill, mount an `AgentActivityPanel` that consumes the existing `tool.call` SSE events, write `FEEDBACK.md`, fix one composer init line.

**Tech Stack:** Next.js 15.5 (Webpack), TypeScript, vitest, zustand, Server-Sent Events via Web ReadableStream, Claude Agent SDK, viem/wagmi, Porto AA wallet, KeeperHub MCP.

---

## File Structure

**New files:**
- `apps/web/components/wish/AgentActivityPanel.tsx` — right-side panel rendering tool-call log
- `apps/web/components/wish/AgentActivityPanel.test.tsx` — component test
- `plugins/demo-stubs/manifest.ts` — plugin manifest
- `plugins/demo-stubs/intents.ts` — 4 demo intent schemas
- `plugins/demo-stubs/index.ts` — plugin definition + MCP server (no-op)
- `plugins/demo-stubs/widgets/BorrowWidget.tsx`
- `plugins/demo-stubs/widgets/EarnVaultWidget.tsx`
- `plugins/demo-stubs/widgets/BridgeWidget.tsx`
- `plugins/demo-stubs/widgets/index.ts` — re-export
- `plugins/demo-stubs/package.json` — workspace package
- `plugins/demo-stubs/tsconfig.json`
- `FEEDBACK.md` — Uniswap prize requirement (repo root)
- `docs/superpowers/runbooks/2026-05-02-demo-recording.md` — pre-recording ops checklist
- `apps/web/server/intentDispatch.demo.test.ts` — dispatcher test for demo intents

**Modified files:**
- `apps/web/components/wish/WishComposer.tsx:49,55` — empty initial state
- `packages/plugin-sdk/src/index.ts:12-15` — add `select` IntentField variant
- `packages/plugin-sdk/src/index.test.ts` — type-level test (compile-only)
- `apps/web/components/wish/WishComposer.tsx:407-445` — `pillVariantFor` / `ariaLabelForField` handle `select`
- `apps/web/server/pluginLoader.ts:1-13` — register demo-stubs
- `apps/web/widgetRegistry.ts:1-21` — register 3 demo widget components
- `plugins/compound-v3/intents.ts` — add `compound-v3.lend` intent with protocol pill
- `apps/web/server/intentDispatch.ts` — branches for `compound-v3.lend` (route by protocol) and demo intents
- `apps/web/store/workspace.ts` — add `agentActivity` log + actions
- `apps/web/store/workspace.test.ts` — tests for new actions
- `apps/web/components/wish/StreamBus.tsx` — push `tool.call` events to log
- `apps/web/app/page.tsx` — grid layout with `<AgentActivityPanel />`
- `pnpm-workspace.yaml` — include new plugin path if not already glob-covered

**Test framework:** vitest. Run from repo root: `pnpm test --filter @wishd/web` for web tests; `pnpm test --filter @wishd/plugin-sdk` for SDK; `pnpm -r test` for everything.

---

## Task 1: Composer empty initial state

**Files:**
- Modify: `apps/web/components/wish/WishComposer.tsx:49,54-56`
- Test: `apps/web/components/wish/WishComposer.empty-init.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/wish/WishComposer.empty-init.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WishComposer } from "./WishComposer";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, chainId: undefined, isConnected: false }),
}));

describe("WishComposer empty initial state", () => {
  it("renders 'pick action' placeholder, no schema preselected", () => {
    render(<WishComposer />);
    // Placeholder should be visible; no specific verb (deposit/withdraw/swap) preselected
    expect(screen.getByText(/pick action/i)).toBeInTheDocument();
    expect(screen.queryByText(/^deposit$/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/WishComposer.empty-init.test.tsx
```

Expected: FAIL — placeholder absent because `intentId` is preselected.

- [ ] **Step 3: Implement — edit `WishComposer.tsx`**

In `apps/web/components/wish/WishComposer.tsx` change:

```tsx
const [intentId, setIntentId] = useState(CLIENT_INTENT_SCHEMAS[0]?.intent ?? "");
```
to:
```tsx
const [intentId, setIntentId] = useState("");
```

And change:

```tsx
const [values, setValues] = useState<Record<string, string>>(() =>
  CLIENT_INTENT_SCHEMAS[0] ? defaultsFor(CLIENT_INTENT_SCHEMAS[0]) : {},
);
```
to:
```tsx
const [values, setValues] = useState<Record<string, string>>({});
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/WishComposer.empty-init.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Run the full web test suite to confirm no regression**

```bash
pnpm --filter @wishd/web test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/wish/WishComposer.tsx apps/web/components/wish/WishComposer.empty-init.test.tsx
git commit -m "fix(web/composer): empty initial state — no preselected intent"
```

---

## Task 2: FEEDBACK.md (Uniswap prize blocker)

**Files:**
- Create: `FEEDBACK.md` (repo root)

- [ ] **Step 1: Write the file**

Create `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/FEEDBACK.md`:

```markdown
# Builder Feedback — Uniswap Trading API & Developer Platform

Project: wishd (ETHGlobal Open Agents).
Stack: Trading API v2 + direct V3 (QuoterV2 / SwapRouter02) on Sepolia + Porto AA wallet.

## What worked

- Trading API `/quote` and `/swap` returned production-grade responses out of the box on mainnet, Base, Arbitrum, Optimism, Polygon, Unichain.
- Approval-checking endpoint (`/check_approval`) saved a contract round-trip when wiring the swap widget.
- Documentation for the swap calldata response shape (encoded `to`/`data`/`value`) was clear enough to drop directly into `wagmi.useSendCalls()` for Porto AA.

## What didn't / DX friction

- **No Permit2-bundled swap path.** For an AA wallet we wanted a single bundle: permit2-sign → swap. Trading API forced separate `approve` + `swap` txs, doubling user signatures and gas overhead. We worked around it by prepending the approval call inside the Porto bundle, but a Permit2-aware swap response would eliminate that workaround entirely.
- **No batch-quote endpoint.** Comparing routes / fee tiers required N sequential `/quote` calls. A `/quotes` endpoint accepting an array of input/output pairs would help routing UIs.
- **No agent-discoverable intent format.** Other agents cannot easily respond to a swap intent ("I want to swap X→Y at price Z by time T") because there is no standard schema for posting intents. An intent broadcasting endpoint would unlock agent-to-agent coordination.
- **Sepolia coverage gap.** Trading API does not cover Sepolia, so we fell back to direct V3 contracts. The QuoterV2 / SwapRouter02 addresses for Sepolia are not surfaced in the Trading API docs; we had to discover them from the v3-deployments repo. A unified addresses index linked from the Trading API docs would have saved an hour of hunting.
- **Slippage model is implicit.** The default slippage tolerance applied by `/quote` is not stated in the docs; we had to inspect responses to back-derive it. Make this explicit (default + override).
- **No webhook for swap settlement.** For agentic flows that fire-and-forget a swap, polling the chain is the only confirmation path. A webhook on settlement would integrate cleanly with KeeperHub-style execution layers.

## Bugs hit

- The `/check_approval` response on Polygon occasionally returned `approval = null` for tokens that clearly required allowance; manually probing `allowance(owner, spender)` then matched the correct on-chain state. We did not fully reproduce; suspected race against indexing.

## Feature requests, in priority order

1. Permit2-bundled swap response.
2. Batch quote endpoint.
3. Sepolia + L2 testnet support in Trading API (or a documented direct-V3 fallback bundle).
4. Agent intent broadcast endpoint.
5. Settlement webhook.

## Contact

Team: wishd. Repo: this repository. Demo built during Open Agents (ETHGlobal).
```

- [ ] **Step 2: Commit**

```bash
git add FEEDBACK.md
git commit -m "docs: add FEEDBACK.md (Uniswap prize requirement)"
```

---

## Task 3: Add `select` IntentField variant to plugin-sdk

**Files:**
- Modify: `packages/plugin-sdk/src/index.ts:12-15`
- Test: `packages/plugin-sdk/src/index.test.ts`

Rationale: `lend` intent and demo intents need a protocol pill (Compound v3 / Aave v3 / Morpho / Spark) and `bridge` needs two chain-style fields with different option sets. Adding a generic `select` field type with arbitrary `options` covers both cleanly without re-purposing `chain`.

- [ ] **Step 1: Write the failing test (type smoke)**

Append to `packages/plugin-sdk/src/index.test.ts`:

```ts
import type { IntentField, IntentSchema } from "./index";

describe("IntentField select variant", () => {
  it("accepts a select field with options + default", () => {
    const f: IntentField = {
      key: "protocol",
      type: "select",
      required: true,
      default: "compound-v3",
      options: ["compound-v3", "aave-v3", "morpho", "spark"],
    };
    const s: IntentSchema = {
      intent: "x.y",
      verb: "x",
      description: "x",
      fields: [f],
      widget: "w",
    };
    expect(s.fields[0].type).toBe("select");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/plugin-sdk test
```
Expected: type error — `"select"` not assignable to existing union.

- [ ] **Step 3: Implement — extend the union**

In `packages/plugin-sdk/src/index.ts` replace the `IntentField` union:

```ts
export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset"; required?: boolean; default?: string; options: string[] }
  | { key: string; type: "chain"; required?: boolean; default: string; options: string[] }
  | { key: string; type: "select"; required?: boolean; default: string; options: string[] };
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @wishd/plugin-sdk test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-sdk/src/index.ts packages/plugin-sdk/src/index.test.ts
git commit -m "feat(plugin-sdk): add 'select' IntentField variant"
```

---

## Task 4: WishComposer renders `select` field

**Files:**
- Modify: `apps/web/components/wish/WishComposer.tsx:407-445` (`pillVariantFor`, `ariaLabelForField`)
- Test: `apps/web/components/wish/WishComposer.select.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/wish/WishComposer.select.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { IntentSchema } from "@wishd/plugin-sdk";
import { WishComposer } from "./WishComposer";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111", chainId: 11155111, isConnected: true }),
}));

const lendSchema: IntentSchema = {
  intent: "compound-v3.lend",
  verb: "lend",
  description: "supply tokens to earn yield",
  fields: [
    { key: "amount", type: "amount", required: true, default: "10" },
    { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
    { key: "protocol", type: "select", required: true, default: "compound-v3", options: ["compound-v3", "aave-v3", "morpho", "spark"] },
    { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
  ],
  connectors: { protocol: "on", chain: "·" },
  widget: "compound-summary",
  slot: "flow",
};

vi.mock("@/lib/intentRegistry.client", () => ({ CLIENT_INTENT_SCHEMAS: [lendSchema] }));

describe("WishComposer with select field", () => {
  it("renders a protocol pill with the correct aria label", () => {
    render(<WishComposer />);
    fireEvent.click(screen.getByLabelText(/select action/i));
    fireEvent.click(screen.getByRole("menuitem", { name: /lend/i }));
    expect(screen.getByLabelText(/select protocol/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/WishComposer.select.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement — extend `pillVariantFor` and `ariaLabelForField`**

In `apps/web/components/wish/WishComposer.tsx` replace those two helpers:

```ts
function pillVariantFor(field: IntentField): ActionPillVariant {
  if (field.type === "amount") return "amount";
  if (field.type === "asset") return "from";
  if (field.type === "select" && field.key.toLowerCase().includes("protocol")) return "protocol";
  if (field.key.toLowerCase().includes("protocol")) return "protocol";
  return "chain";
}

function ariaLabelForField(field: IntentField): string {
  if (field.type === "amount") return "Enter amount";
  if (field.type === "asset") return "Select asset";
  if (field.type === "select" && field.key.toLowerCase().includes("protocol")) return "Select protocol";
  if (field.type === "select") return `Select ${field.key}`;
  if (field.key.toLowerCase().includes("protocol")) return "Select protocol";
  return "Select chain";
}
```

`FieldPill` already falls through to the generic `ActionPill` renderer using `field.options`, which exists on `select`. No further change needed there.

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/WishComposer.select.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/WishComposer.tsx apps/web/components/wish/WishComposer.select.test.tsx
git commit -m "feat(web/composer): render 'select' field as protocol pill"
```

---

## Task 5: `demo-stubs` plugin scaffold

**Files:**
- Create: `plugins/demo-stubs/package.json`
- Create: `plugins/demo-stubs/tsconfig.json`
- Create: `plugins/demo-stubs/manifest.ts`
- Create: `plugins/demo-stubs/intents.ts`
- Create: `plugins/demo-stubs/index.ts`
- Create: `plugins/demo-stubs/widgets/index.ts` (placeholder, populated in Task 6)
- Test: `plugins/demo-stubs/intents.test.ts`

- [ ] **Step 1: Inspect a sibling plugin's package.json to mirror conventions**

```bash
cat plugins/compound-v3/package.json
```

- [ ] **Step 2: Create `plugins/demo-stubs/package.json` mirroring it**

```json
{
  "name": "@wishd/plugin-demo-stubs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./intents": "./intents.ts",
    "./widgets": "./widgets/index.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@wishd/plugin-sdk": "workspace:*",
    "@modelcontextprotocol/sdk": "*",
    "react": "*",
    "viem": "*"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "@types/react": "*",
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Create `plugins/demo-stubs/tsconfig.json`** (copy from compound-v3, adjust if needed)

```bash
cp plugins/compound-v3/tsconfig.json plugins/demo-stubs/tsconfig.json
```

- [ ] **Step 4: Create `plugins/demo-stubs/manifest.ts`**

```ts
import type { Manifest } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "demo-stubs",
  version: "0.0.0",
  chains: [11155111, 1, 8453, 42161, 10, 137],
  trust: "unverified",
  provides: {
    intents: ["borrow", "earn", "bridge", "find-vault"],
    widgets: ["borrow-demo", "earn-demo", "bridge-demo"],
    mcps: ["demo_stubs"],
  },
};
```

- [ ] **Step 5: Write the failing test for intents**

Create `plugins/demo-stubs/intents.test.ts`:

```ts
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
```

- [ ] **Step 6: Run, confirm fail**

```bash
pnpm --filter @wishd/plugin-demo-stubs test
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement `plugins/demo-stubs/intents.ts`**

```ts
import type { IntentSchema } from "@wishd/plugin-sdk";

const chainOptions = ["ethereum-sepolia", "ethereum", "base", "arbitrum", "optimism", "polygon"];

export const demoIntents: IntentSchema[] = [
  {
    intent: "demo.borrow",
    verb: "borrow",
    description: "against collateral",
    fields: [
      { key: "amount", type: "amount", required: true, default: "0.05" },
      { key: "asset", type: "asset", required: true, default: "ETH", options: ["ETH", "USDC", "WBTC"] },
      { key: "collateral", type: "asset", required: true, default: "USDC", options: ["USDC", "ETH", "DAI"] },
      { key: "protocol", type: "select", required: true, default: "aave-v3", options: ["aave-v3", "compound-v3", "euler", "morpho"] },
      { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: chainOptions },
    ],
    connectors: { collateral: "against", protocol: "on", chain: "·" },
    widget: "borrow-demo",
    slot: "flow",
  },
  {
    intent: "demo.earn",
    verb: "earn yield on",
    description: "auto-route best APY",
    fields: [
      { key: "amount", type: "amount", required: true, default: "100" },
      { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC", "DAI", "ETH"] },
      { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: chainOptions },
    ],
    connectors: { chain: "on" },
    widget: "earn-demo",
    slot: "flow",
  },
  {
    intent: "demo.bridge",
    verb: "bridge",
    description: "cross-chain transfer",
    fields: [
      { key: "amount", type: "amount", required: true, default: "0.05" },
      { key: "asset", type: "asset", required: true, default: "ETH", options: ["ETH", "USDC", "WBTC"] },
      { key: "fromChain", type: "chain", required: true, default: "ethereum", options: chainOptions },
      { key: "toChain", type: "chain", required: true, default: "base", options: chainOptions },
    ],
    connectors: { fromChain: "from", toChain: "to" },
    widget: "bridge-demo",
    slot: "flow",
  },
  {
    intent: "demo.find-vault",
    verb: "find vault for",
    description: "best risk-adjusted yield",
    fields: [
      { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC", "DAI", "ETH"] },
      { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: chainOptions },
    ],
    connectors: { chain: "on" },
    widget: "earn-demo",
    slot: "flow",
  },
];
```

- [ ] **Step 8: Create the placeholder widgets re-export**

`plugins/demo-stubs/widgets/index.ts`:

```ts
export { BorrowWidget } from "./BorrowWidget";
export { EarnVaultWidget } from "./EarnVaultWidget";
export { BridgeWidget } from "./BridgeWidget";
```

(Files referenced here are created in Task 6. Don't run typecheck yet.)

- [ ] **Step 9: Create `plugins/demo-stubs/index.ts`** (no-op MCP — only schemas matter; dispatcher handles execution)

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { definePlugin, type Plugin, type PluginCtx } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { demoIntents } from "./intents";
import { BorrowWidget, EarnVaultWidget, BridgeWidget } from "./widgets";

function buildMcp(_ctx: PluginCtx): { server: Server; serverName: string } {
  // No tools — demo intents are short-circuited by the dispatcher.
  // The MCP exists only so the plugin loader registers the namespace.
  const server = new Server(
    { name: "demo_stubs", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  return { server, serverName: "demo_stubs" };
}

export const demoStubs: Plugin = definePlugin({
  manifest,
  intents: demoIntents,
  mcp: buildMcp,
  widgets: {
    "borrow-demo": BorrowWidget,
    "earn-demo": EarnVaultWidget,
    "bridge-demo": BridgeWidget,
  },
});
```

- [ ] **Step 10: Add the package to `pnpm-workspace.yaml` if not already covered**

```bash
grep -n "plugins/" pnpm-workspace.yaml
```

If the existing pattern (e.g. `plugins/*`) does not include `demo-stubs`, add it. If it does (most likely), skip.

- [ ] **Step 11: Install workspace deps**

```bash
pnpm install
```

- [ ] **Step 12: Commit (intents only — widgets follow in Task 6)**

```bash
git add plugins/demo-stubs/manifest.ts plugins/demo-stubs/intents.ts plugins/demo-stubs/intents.test.ts plugins/demo-stubs/index.ts plugins/demo-stubs/widgets/index.ts plugins/demo-stubs/package.json plugins/demo-stubs/tsconfig.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(plugin/demo-stubs): scaffold + 4 demo intents"
```

(intent test will pass; the index.ts referencing widgets will fail typecheck — fixed by Task 6.)

---

## Task 6: Demo widget components (Borrow / EarnVault / Bridge)

**Files:**
- Create: `plugins/demo-stubs/widgets/BorrowWidget.tsx`
- Create: `plugins/demo-stubs/widgets/EarnVaultWidget.tsx`
- Create: `plugins/demo-stubs/widgets/BridgeWidget.tsx`
- Modify: `apps/web/widgetRegistry.ts` (register all 3)
- Test: `plugins/demo-stubs/widgets/widgets.test.tsx` (smoke render)

- [ ] **Step 1: Write the failing smoke test**

Create `plugins/demo-stubs/widgets/widgets.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BorrowWidget } from "./BorrowWidget";
import { EarnVaultWidget } from "./EarnVaultWidget";
import { BridgeWidget } from "./BridgeWidget";

describe("demo-stubs widgets render", () => {
  it("BorrowWidget shows BORROW APY, MAX LTV, HEALTH FACTOR labels", () => {
    render(<BorrowWidget amount="0.05" asset="ETH" collateral="USDC" protocol="aave-v3" chain="ethereum-sepolia" />);
    expect(screen.getByText(/BORROW APY/)).toBeInTheDocument();
    expect(screen.getByText(/MAX LTV/)).toBeInTheDocument();
    expect(screen.getByText(/HEALTH FACTOR/)).toBeInTheDocument();
  });
  it("EarnVaultWidget shows a vault list with Morpho and Aave", () => {
    render(<EarnVaultWidget amount="100" asset="USDC" chain="ethereum-sepolia" />);
    expect(screen.getByText(/Morpho/i)).toBeInTheDocument();
    expect(screen.getByText(/Aave/i)).toBeInTheDocument();
  });
  it("BridgeWidget shows from→to chain boxes and bridge fee", () => {
    render(<BridgeWidget amount="0.05" asset="ETH" fromChain="ethereum" toChain="base" />);
    expect(screen.getByText(/bridge fee/i)).toBeInTheDocument();
    expect(screen.getByText(/Base/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/plugin-demo-stubs test
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `BorrowWidget.tsx`**

```tsx
"use client";
import * as React from "react";

type Props = { amount: string; asset: string; collateral: string; protocol: string; chain: string };

export function BorrowWidget({ amount, asset, collateral, protocol, chain }: Props) {
  return (
    <div className="rounded-lg border border-rule bg-bg-2 p-4 text-sm font-mono">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>borrow · {protocol} · {chain}</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">DEMO ONLY</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="BORROW APY" value="5.8%" />
        <Metric label="MAX LTV" value="80%" />
        <Metric label="HEALTH FACTOR" value="2.14" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <KV label="BORROW AMOUNT" value={`${amount} ${asset}`} />
        <KV label="COLLATERAL" value={collateral} />
        <KV label="REQUIRED" value="195.00 USDC" />
        <KV label="LIQUIDATION" value="$1,780 ETH" />
        <KV label="GAS EST." value="~$6.50" />
      </div>
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-pill bg-bg-1 border border-rule px-4 py-2 text-xs"
        title="demo only — wire next sprint"
      >
        borrow → (demo)
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rule p-3">
      <div className="text-lg">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-2">{label}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2">{label}</div>
      <div>{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `EarnVaultWidget.tsx`**

```tsx
"use client";
import * as React from "react";

type Props = { amount?: string; asset: string; chain: string };

const VAULTS = [
  { name: "Morpho",   apy: "8.4%", tvl: "$420M", risk: "low" },
  { name: "Aave V3",  apy: "5.1%", tvl: "$2.1B", risk: "very low" },
  { name: "Compound V3", apy: "4.7%", tvl: "$1.2B", risk: "very low" },
  { name: "Yearn",    apy: "9.8%", tvl: "$180M", risk: "medium" },
];

export function EarnVaultWidget({ amount, asset, chain }: Props) {
  return (
    <div className="rounded-lg border border-rule bg-bg-2 p-4 text-sm font-mono">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>earn · {asset} · {chain}</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">DEMO ONLY</span>
      </div>
      <div className="mt-3 space-y-2">
        {VAULTS.map((v) => (
          <div key={v.name} className="flex items-center justify-between rounded-md border border-rule px-3 py-2">
            <span>{v.name}</span>
            <span className="text-ink-2">{v.apy} · TVL {v.tvl} · risk {v.risk}</span>
          </div>
        ))}
      </div>
      {amount ? <div className="mt-3 text-xs text-ink-2">deposit amount: {amount} {asset}</div> : null}
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-pill bg-bg-1 border border-rule px-4 py-2 text-xs"
      >
        deposit → (demo)
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Implement `BridgeWidget.tsx`**

```tsx
"use client";
import * as React from "react";

type Props = { amount: string; asset: string; fromChain: string; toChain: string };

const NICE: Record<string, string> = {
  "ethereum-sepolia": "Sepolia",
  "ethereum": "Ethereum",
  "base": "Base",
  "arbitrum": "Arbitrum",
  "optimism": "Optimism",
  "polygon": "Polygon",
};

export function BridgeWidget({ amount, asset, fromChain, toChain }: Props) {
  const fee = "0.06%";
  const eta = "~2 min";
  return (
    <div className="rounded-lg border border-rule bg-bg-2 p-4 text-sm font-mono">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>bridge</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">DEMO ONLY</span>
      </div>
      <div className="mt-3 grid grid-cols-3 items-center gap-3">
        <div className="rounded-lg border border-rule p-3 text-center">
          <div className="text-xs text-ink-2">FROM</div>
          <div className="mt-1">{NICE[fromChain] ?? fromChain}</div>
          <div className="mt-2 text-lg">{amount} {asset}</div>
        </div>
        <div className="text-center text-xl">→</div>
        <div className="rounded-lg border border-rule p-3 text-center">
          <div className="text-xs text-ink-2">TO</div>
          <div className="mt-1">{NICE[toChain] ?? toChain}</div>
          <div className="mt-2 text-lg">≈ {amount} {asset}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-ink-2">ETA</span> {eta}</div>
        <div><span className="text-ink-2">bridge fee</span> {fee}</div>
      </div>
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-pill bg-bg-1 border border-rule px-4 py-2 text-xs"
      >
        bridge → (demo)
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Run widgets test, confirm pass**

```bash
pnpm --filter @wishd/plugin-demo-stubs test
```
Expected: PASS.

- [ ] **Step 7: Register widgets in the web `widgetRegistry`**

In `apps/web/widgetRegistry.ts` add imports + entries:

```ts
import { BorrowWidget, EarnVaultWidget, BridgeWidget } from "@wishd/plugin-demo-stubs/widgets";
```

And in the `widgetRegistry` object add:

```ts
  "borrow-demo": BorrowWidget,
  "earn-demo": EarnVaultWidget,
  "bridge-demo": BridgeWidget,
```

- [ ] **Step 8: Run web typecheck**

```bash
pnpm --filter @wishd/web typecheck
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add plugins/demo-stubs/widgets apps/web/widgetRegistry.ts
git commit -m "feat(plugin/demo-stubs): borrow/earn/bridge widgets + register"
```

---

## Task 7: Register `demo-stubs` plugin in pluginLoader

**Files:**
- Modify: `apps/web/server/pluginLoader.ts:1-13`
- Modify: `apps/web/package.json` (add workspace dep)
- Test: `apps/web/server/pluginLoader.test.ts` (extend or new)

- [ ] **Step 1: Add workspace dependency**

In `apps/web/package.json` add to `dependencies`:

```json
"@wishd/plugin-demo-stubs": "workspace:*"
```

Run:
```bash
pnpm install
```

- [ ] **Step 2: Write the failing test**

Find the existing pluginLoader test or create `apps/web/server/pluginLoader.demo-stubs.test.ts`:

```ts
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
```

- [ ] **Step 3: Run, confirm fail**

```bash
pnpm --filter @wishd/web test apps/web/server/pluginLoader.demo-stubs.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement — register the plugin**

In `apps/web/server/pluginLoader.ts` change:

```ts
import { compoundV3 } from "@wishd/plugin-compound-v3";
import { uniswap }    from "@wishd/plugin-uniswap";
import { demoStubs }  from "@wishd/plugin-demo-stubs";
import type { Plugin } from "@wishd/plugin-sdk";
```

And in `loadPlugins`:

```ts
const plugins: Plugin[] = [compoundV3, uniswap, demoStubs];
```

- [ ] **Step 5: Run, confirm pass**

```bash
pnpm --filter @wishd/web test apps/web/server/pluginLoader.demo-stubs.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/server/pluginLoader.ts apps/web/server/pluginLoader.demo-stubs.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): register demo-stubs plugin in loader"
```

---

## Task 8: Dispatcher branch for demo intents

**Files:**
- Modify: `apps/web/server/intentDispatch.ts`
- Test: `apps/web/server/intentDispatch.demo.test.ts` (new)

Demo intents short-circuit: dispatcher returns a synthetic `widget` payload with the user's input echoed into props. No on-chain calls.

- [ ] **Step 1: Write the failing test**

Create `apps/web/server/intentDispatch.demo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dispatchIntent } from "./intentDispatch";

const dummyClient = { readContract: async () => 0n } as any;

describe("dispatchIntent — demo intents", () => {
  it("demo.borrow returns borrow-demo widget with passed props", async () => {
    const out = await dispatchIntent("demo.borrow", {
      body: { amount: "0.05", asset: "ETH", collateral: "USDC", protocol: "aave-v3", chain: "ethereum-sepolia", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    expect(out.widget.type).toBe("borrow-demo");
    expect(out.widget.props).toMatchObject({ amount: "0.05", asset: "ETH", protocol: "aave-v3" });
  });
  it("demo.bridge returns bridge-demo with from/to chains", async () => {
    const out = await dispatchIntent("demo.bridge", {
      body: { amount: "0.05", asset: "ETH", fromChain: "ethereum", toChain: "base", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    expect(out.widget.type).toBe("bridge-demo");
    expect(out.widget.props).toMatchObject({ fromChain: "ethereum", toChain: "base" });
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/web test apps/web/server/intentDispatch.demo.test.ts
```
Expected: FAIL — `unknown intent: demo.borrow`.

- [ ] **Step 3: Implement — add demo branch to `dispatchIntent`**

In `apps/web/server/intentDispatch.ts`, before the final `throw new Error(...)`, insert:

```ts
  if (intent.startsWith("demo.")) {
    const widgetTypeByIntent: Record<string, string> = {
      "demo.borrow":     "borrow-demo",
      "demo.earn":       "earn-demo",
      "demo.bridge":     "bridge-demo",
      "demo.find-vault": "earn-demo",
    };
    const widgetType = widgetTypeByIntent[intent];
    if (!widgetType) throw new Error(`unknown intent: ${intent}`);
    const { address, ...rest } = input.body;
    return {
      prepared: { kind: "demo", intent } as Record<string, unknown>,
      widget: {
        id: newWidgetId(),
        type: widgetType,
        slot: "flow",
        props: rest as Record<string, unknown>,
      },
    };
  }
```

Note: keep `requireAmount` / `requireAddress` calls outside this branch, and move the final `throw new Error(...)` after this branch. The current implementation calls `requireAmount` and `requireAddress` near the top of `dispatchIntent`; for `demo.find-vault` (which has no amount) those would throw. To handle that, move the demo branch to ABOVE the `const amount = requireAmount(...)` line and only require `address`:

```ts
  // (Insert this BEFORE `const amount = requireAmount(input.body);`)
  if (intent.startsWith("demo.")) { /* as above, also drop requireAmount */ }
```

- [ ] **Step 4: Run demo test, confirm pass**

```bash
pnpm --filter @wishd/web test apps/web/server/intentDispatch.demo.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run full dispatcher test suite, confirm no regression**

```bash
pnpm --filter @wishd/web test apps/web/server/intentDispatch
```
Expected: existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/server/intentDispatch.ts apps/web/server/intentDispatch.demo.test.ts
git commit -m "feat(web/dispatch): demo.* short-circuit returns stub widget"
```

---

## Task 9: Wired `lend` intent + dispatcher routing

**Files:**
- Modify: `plugins/compound-v3/intents.ts` — add `compound-v3.lend` intent
- Modify: `apps/web/server/intentDispatch.ts` — branch for `compound-v3.lend`
- Test: `apps/web/server/intentDispatch.lend.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/server/intentDispatch.lend.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { dispatchIntent } from "./intentDispatch";

vi.mock("@plugins/compound-v3/prepare", async (orig) => {
  const real = await orig<typeof import("@plugins/compound-v3/prepare")>();
  return {
    ...real,
    prepareDeposit: vi.fn(async () => ({
      meta: { needsApprove: false, amountWei: "10000000", balance: "20000000", insufficient: false },
      calls: [],
    })),
  };
});

const dummyClient = { readContract: async () => 0n } as any;

describe("dispatchIntent — compound-v3.lend", () => {
  it("compound-v3 protocol routes to compound-summary widget", async () => {
    const out = await dispatchIntent("compound-v3.lend", {
      body: { amount: "10", asset: "USDC", protocol: "compound-v3", chain: "ethereum-sepolia", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    expect(out.widget.type).toBe("compound-summary");
  });
  it("non-compound protocol returns demo-style stub widget", async () => {
    const out = await dispatchIntent("compound-v3.lend", {
      body: { amount: "10", asset: "USDC", protocol: "aave-v3", chain: "ethereum-sepolia", address: "0x1111111111111111111111111111111111111111" },
      publicClient: dummyClient,
    });
    // Earn widget reused for non-compound lend stubs (vault-list shape works).
    expect(out.widget.type).toBe("earn-demo");
    expect(out.widget.props).toMatchObject({ protocol: "aave-v3" });
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/web test apps/web/server/intentDispatch.lend.test.ts
```
Expected: FAIL — `unknown intent: compound-v3.lend`.

- [ ] **Step 3: Add the intent in `plugins/compound-v3/intents.ts`**

Append to the exported array:

```ts
export const compoundIntents: IntentSchema[] = [
  // ... existing deposit + withdraw entries unchanged ...
  {
    intent: "compound-v3.lend",
    verb: "lend",
    description: "supply tokens to earn yield",
    fields: [
      { key: "amount",   type: "amount",  required: true,  default: "10" },
      { key: "asset",    type: "asset",   required: true,  default: "USDC", options: ["USDC"] },
      { key: "protocol", type: "select",  required: true,  default: "compound-v3", options: ["compound-v3", "aave-v3", "morpho", "spark"] },
      { key: "chain",    type: "chain",   required: true,  default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
    ],
    connectors: { protocol: "on", chain: "·" },
    widget: "compound-summary", // overridden by dispatcher when protocol != compound-v3
    slot: "flow",
  },
];
```

- [ ] **Step 4: Add dispatcher branch in `apps/web/server/intentDispatch.ts`**

Before the existing `compound-v3.deposit` branch, add:

```ts
  if (intent === "compound-v3.lend") {
    const protocol = String(input.body.protocol ?? "compound-v3");
    if (protocol === "compound-v3") {
      // Route to the same prepare path as deposit; return compound-summary widget.
      const chainId = requireChainId(input.body);
      const prepared = await prepareDeposit({ amount, user, chainId, publicClient: input.publicClient });
      const addrs = COMPOUND_ADDRESSES[chainId]!;
      return {
        prepared,
        widget: {
          id: newWidgetId(),
          type: "compound-summary",
          slot: "flow",
          props: {
            amount, asset: "USDC", market: "cUSDCv3",
            needsApprove: prepared.meta.needsApprove,
            summaryId: newWidgetId(),
            amountWei: prepared.meta.amountWei,
            chainId, user, comet: addrs.Comet, usdc: addrs.USDC,
            calls: prepared.calls,
            balance: prepared.meta.balance,
            insufficient: prepared.meta.insufficient,
          },
        },
      };
    }
    // Non-Compound protocols: return earn-demo widget echoing inputs, no on-chain.
    const { address, ...rest } = input.body;
    return {
      prepared: { kind: "demo", intent, protocol } as Record<string, unknown>,
      widget: {
        id: newWidgetId(),
        type: "earn-demo",
        slot: "flow",
        props: rest as Record<string, unknown>,
      },
    };
  }
```

(Place this branch after `requireAddress(...)` / `requireAmount(...)` setup but BEFORE the `requireChainId` call that the deposit branch uses, since it does its own conditional `requireChainId` only on the compound-v3 path. If the existing structure makes that awkward, move `const amount = requireAmount(...)` and `const user = requireAddress(...)` to be invoked inside each branch instead of at the top — that's a small refactor permitted here because it removes a footgun.)

- [ ] **Step 5: Run, confirm pass**

```bash
pnpm --filter @wishd/web test apps/web/server/intentDispatch.lend.test.ts
```
Expected: PASS.

- [ ] **Step 6: Run full web test suite, confirm no regression**

```bash
pnpm --filter @wishd/web test
```

- [ ] **Step 7: Commit**

```bash
git add plugins/compound-v3/intents.ts apps/web/server/intentDispatch.ts apps/web/server/intentDispatch.lend.test.ts
git commit -m "feat(web): wired 'lend' intent — Compound routed, others stubbed"
```

---

## Task 10: Workspace store — agent activity log

**Files:**
- Modify: `apps/web/store/workspace.ts`
- Modify: `apps/web/store/workspace.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/store/workspace.test.ts`:

```ts
describe("agent activity log", () => {
  it("appendAgentEvent adds an entry with timestamp and tool name", () => {
    const { appendAgentEvent } = useWorkspace.getState();
    appendAgentEvent({ kind: "tool.call", name: "uniswap.quote", input: { foo: "bar" } });
    const log = useWorkspace.getState().agentActivity;
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1].name).toBe("uniswap.quote");
    expect(typeof log[log.length - 1].at).toBe("number");
  });
  it("clearAgentActivity empties the log", () => {
    const { appendAgentEvent, clearAgentActivity } = useWorkspace.getState();
    appendAgentEvent({ kind: "tool.call", name: "x", input: {} });
    clearAgentActivity();
    expect(useWorkspace.getState().agentActivity).toEqual([]);
  });
  it("reset() also clears agentActivity", () => {
    const { appendAgentEvent, reset } = useWorkspace.getState();
    appendAgentEvent({ kind: "tool.call", name: "x", input: {} });
    reset();
    expect(useWorkspace.getState().agentActivity).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/web test apps/web/store/workspace.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement in `apps/web/store/workspace.ts`**

Add type:

```ts
export type AgentEvent =
  | { kind: "tool.call"; name: string; input: unknown; at: number }
  | { kind: "delta"; text: string; at: number };
```

Add to `State`:

```ts
  agentActivity: AgentEvent[];
  appendAgentEvent: (e: Omit<AgentEvent, "at">) => void;
  clearAgentActivity: () => void;
```

In `useWorkspace = create<State>(...)` add:

```ts
  agentActivity: [],
  appendAgentEvent: (e) =>
    set((s) => ({ agentActivity: [...s.agentActivity, { ...e, at: Date.now() } as AgentEvent] })),
  clearAgentActivity: () => set({ agentActivity: [] }),
```

And update `reset` to clear it:

```ts
  reset: () => set({ widgets: [], narration: "", executing: false, agentActivity: [] }),
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @wishd/web test apps/web/store/workspace.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/store/workspace.ts apps/web/store/workspace.test.ts
git commit -m "feat(web/store): agent activity log fields + actions"
```

---

## Task 11: Wire `tool.call` events from StreamBus into the activity log

**Files:**
- Modify: `apps/web/components/wish/StreamBus.tsx`
- Modify: `apps/web/components/wish/WishComposer.tsx` (its inline `startStream` onEvent in `submitStructuredWith` and `submitFreeText`)
- Test: `apps/web/components/wish/StreamBus.activity.test.tsx` (new)

The agent emits `tool.call` events into the SSE stream. They are currently ignored at the client. Forward them into `agentActivity`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/wish/StreamBus.activity.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useWorkspace } from "@/store/workspace";
import { StreamBus } from "./StreamBus";

// Mock startStream so we can drive onEvent ourselves.
vi.mock("./EventStream", () => ({
  startStream: vi.fn(async ({ onEvent }: { onEvent: (e: any) => void }) => {
    onEvent({ type: "tool.call", name: "uniswap.quote", input: { in: "ETH", out: "USDC" } });
    onEvent({ type: "tool.call", name: "porto.prepare_swap", input: {} });
  }),
}));

describe("StreamBus forwards tool.call to agent activity", () => {
  beforeEach(() => useWorkspace.getState().reset());
  it("appends each tool.call event with its name", async () => {
    render(<StreamBus />);
    window.dispatchEvent(new CustomEvent("wishd:wish", { detail: { wish: "swap eth", account: { address: "0x1", chainId: 11155111 } } }));
    // wait a tick
    await new Promise((r) => setTimeout(r, 0));
    const log = useWorkspace.getState().agentActivity;
    const names = log.map((e) => "name" in e ? e.name : "");
    expect(names).toEqual(["uniswap.quote", "porto.prepare_swap"]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/StreamBus.activity.test.tsx
```
Expected: FAIL — log empty.

- [ ] **Step 3: Implement in `StreamBus.tsx`**

Add `appendAgentEvent` to the destructure of `useWorkspace()`:

```tsx
const { appendWidget, patchWidget, dismissWidget, appendNarration, reset, setExecuting, appendAgentEvent } = useWorkspace();
```

In `onEvent` handler add:

```tsx
if (ev.type === "tool.call") appendAgentEvent({ kind: "tool.call", name: ev.name, input: ev.input });
```

Add `appendAgentEvent` to the effect dep array.

- [ ] **Step 4: Apply the same forwarding inside `WishComposer.tsx`** (`submitStructuredWith` + `submitFreeText` both call `startStream` directly with their own `onEvent`)

In `WishComposer.tsx`, in both `onEvent` handlers (`submitStructuredWith` around line 119 and `submitFreeText` around line 209), add inside each:

```ts
if (e.type === "tool.call") ws.appendAgentEvent?.({ kind: "tool.call", name: e.name, input: e.input });
```

(`ws.appendAgentEvent?.` is safe-call syntax in case the store hasn't rehydrated; in practice it always exists.)

- [ ] **Step 5: Run, confirm pass**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/StreamBus.activity.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/wish/StreamBus.tsx apps/web/components/wish/WishComposer.tsx apps/web/components/wish/StreamBus.activity.test.tsx
git commit -m "feat(web/stream): forward tool.call events to agent activity log"
```

---

## Task 12: AgentActivityPanel component + page mount

**Files:**
- Create: `apps/web/components/wish/AgentActivityPanel.tsx`
- Create: `apps/web/components/wish/AgentActivityPanel.test.tsx`
- Modify: `apps/web/app/page.tsx` — grid layout with sidebar
- Modify: `apps/web/app/globals.css` (only if existing `.page` width prevents the grid)

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/wish/AgentActivityPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useWorkspace } from "@/store/workspace";
import { AgentActivityPanel } from "./AgentActivityPanel";

describe("AgentActivityPanel", () => {
  beforeEach(() => useWorkspace.getState().reset());
  it("renders 'agent idle' when log is empty", () => {
    render(<AgentActivityPanel />);
    expect(screen.getByText(/agent idle/i)).toBeInTheDocument();
  });
  it("lists tool calls in arrival order", () => {
    useWorkspace.getState().appendAgentEvent({ kind: "tool.call", name: "uniswap.quote", input: {} });
    useWorkspace.getState().appendAgentEvent({ kind: "tool.call", name: "porto.prepare_swap", input: {} });
    render(<AgentActivityPanel />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/uniswap\.quote/);
    expect(items[1]).toHaveTextContent(/porto\.prepare_swap/);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/AgentActivityPanel.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement `AgentActivityPanel.tsx`**

```tsx
"use client";

import { useWorkspace } from "@/store/workspace";

export function AgentActivityPanel() {
  const events = useWorkspace((s) => s.agentActivity);
  return (
    <aside className="agent-activity hidden md:block sticky top-10 h-[calc(100vh-3rem)] w-[280px] overflow-y-auto rounded-lg border border-rule bg-bg-2 p-3 text-xs font-mono">
      <div className="mb-2 flex items-center justify-between text-ink-2">
        <span className="uppercase tracking-wider">agent</span>
        <span className="rounded-pill bg-bg-1 px-2 py-0.5">{events.length} events</span>
      </div>
      {events.length === 0 ? (
        <div className="text-ink-2">agent idle — type a wish</div>
      ) : (
        <ul className="space-y-1">
          {events.map((e, i) => (
            <li key={i} className="rounded-md border border-rule px-2 py-1">
              {e.kind === "tool.call" ? (
                <>
                  <span className="text-ink-2">{formatTime(e.at)} · tool</span>{" "}
                  <span className="text-accent">{e.name}</span>
                  {summarizeInput(e.input)}
                </>
              ) : (
                <span className="text-ink-2">{formatTime(e.at)} · {e.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function summarizeInput(input: unknown): string {
  try {
    const s = JSON.stringify(input);
    if (!s || s === "{}") return "";
    return ` ${s.length > 60 ? s.slice(0, 57) + "…" : s}`;
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @wishd/web test apps/web/components/wish/AgentActivityPanel.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Mount in `app/page.tsx`**

Replace the body of `Page()`:

```tsx
import { WishComposer } from "@/components/wish/WishComposer";
import { StepStack } from "@/components/workspace/StepStack";
import { StreamBus } from "@/components/wish/StreamBus";
import { ChatBubble } from "@/components/wish/ChatBubble";
import { ConnectBadge } from "@/components/wish/ConnectBadge";
import { AgentActivityPanel } from "@/components/wish/AgentActivityPanel";

export default function Page() {
  return (
    <main className="page mx-auto max-w-[1100px] grid grid-cols-1 md:grid-cols-[minmax(0,760px)_280px] gap-6">
      <StreamBus />
      <div className="min-w-0">
        <header className="pt-10 pb-4 flex items-baseline gap-3">
          <h1 className="font-hand text-4xl">wishd</h1>
          <span className="text-sm text-ink-2">defi by wishing it</span>
          <ConnectBadge />
        </header>
        <div className="flex flex-col gap-6">
          <WishComposer />
          <StepStack />
        </div>
        <ChatBubble />
      </div>
      <AgentActivityPanel />
    </main>
  );
}
```

- [ ] **Step 6: Visual check (manual)**

```bash
pnpm --filter @wishd/web dev
```
Open `http://localhost:3000`. Confirm sidebar appears on right at >=md breakpoint. Type a wish in free-text mode; confirm tool calls stream into the sidebar.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/wish/AgentActivityPanel.tsx apps/web/components/wish/AgentActivityPanel.test.tsx apps/web/app/page.tsx
git commit -m "feat(web): AgentActivityPanel sidebar mounted on page"
```

---

## Task 13: Free-text parser smoke test

**Files:**
- Test: `apps/web/server/runAgent.freetext-parse.test.ts` (new)

Verify the agent's `narrate-only` parse for the demo phrasings produces the right intent + values. We test by mocking the SDK `query()` to return a canned result and asserting the dispatch call shape — this is a contract test, not a live LLM run.

Lightweight alternative: skip programmatic test and run a one-shot manual check before the recording. The plan covers both.

- [ ] **Step 1: Write a smoke script (manual rehearsal aid)**

Create `apps/web/scripts/freetext-rehearsal.md`:

```markdown
# Free-text rehearsal phrasings

Run dev server. In free-text mode (`type instead`), submit each phrasing and confirm the resulting widget fields match expectation.

| Phrasing | Expected widget | Expected fields |
|---|---|---|
| `swap 0.001 eth for usdc on sepolia` | swap-summary | amount=0.001, assetIn=ETH, assetOut=USDC, chain=ethereum-sepolia |
| `lend 50 usdc on compound` | compound-summary | amount=50, asset=USDC, chain=ethereum-sepolia, protocol=compound-v3 |

If a phrasing fails, capture the actual call in the AgentActivityPanel, then either adjust the system prompt or pick a different phrasing for the recording.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/scripts/freetext-rehearsal.md
git commit -m "docs(web): free-text rehearsal phrasings checklist"
```

- [ ] **Step 3: Run rehearsal once before recording day**

(Out of band; not a code task.)

---

## Task 14: Pre-recording runbook

**Files:**
- Create: `docs/superpowers/runbooks/2026-05-02-demo-recording.md`

- [ ] **Step 1: Write runbook**

```markdown
# Demo Recording Runbook (2026-05-02)

## 0. Prereqs

- All tasks 1–13 from `docs/superpowers/plans/2026-05-02-demo-prerequisites.md` are merged.
- Porto delegation modal work (separate workstream) is merged.
- Porto wallet on Sepolia funded with: ≥0.05 ETH for gas, ≥100 USDC for Compound deposit + auto-compound headroom.
- KeeperHub account exists; auth dance completed at least once so token cache is warm.
- `KH_BASE_URL` and `KH_ACCESS_TOKEN` (or full OAuth token in cache) present in `.env.local`.
- Anthropic key present (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`).

## 1. Build + serve

```bash
pnpm install
pnpm -r build
pnpm --filter @wishd/web start
```

Verify `http://localhost:3000` loads. Use HTTP, not HTTPS — avoids cert warning.

## 2. Browser setup

- Fresh Chrome profile, no extensions.
- Window: 1920×1080.
- Cursor highlight extension installed (e.g. "Pointer Crosshair") and enabled.
- Notification banners disabled (system + browser).
- Tab 1: `http://localhost:3000`.
- Tab 2: `https://app.keeperhub.com` — logged in to the same account.

## 3. State reset

- Reload tab 1 to ensure composer is in empty initial state.
- KeeperHub dashboard: scroll to the workflows list so a freshly-deployed workflow will be visible without scrolling during the cmd-tab cut.

## 4. Rehearsal pass

Run the full 60-second script silently. Time each beat. If over 60s, trim VO; do not cut beats.

## 5. Take

- OBS or QuickTime recording at 1080p, 60fps.
- Multiple takes for beat 2 (Uniswap swap) and beat 3 (Compound deposit) — Sepolia confirm latency is variable. Keep the cleanest.

## 6. Post

- Voiceover recorded separately, timed to the script in `docs/superpowers/specs/2026-05-02-demo-script-design.md` §2.
- Render at 1080p.
- Upload to submission form.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/runbooks/2026-05-02-demo-recording.md
git commit -m "docs: pre-recording runbook for hackathon demo"
```

---

## Self-Review (run after writing the plan)

**1. Spec coverage:** Map each spec section to a task.

| Spec § | Implementing task |
|---|---|
| 3.1 Composer empty initial state | T1 |
| 3.2 FEEDBACK.md | T2 |
| 3.3 Agent activity sidebar (MVP) | T10 + T11 + T12 |
| 3.4 Four mocked intents (borrow/earn/bridge/find-vault) + 3 widgets | T3 + T4 + T5 + T6 + T7 + T8 |
| 3.5 Lend framing — option (c) | T9 |
| 3.6 Free-text parser polish | T13 |
| 3.7 Porto delegation modal | Separate workstream — explicitly out of scope; flagged as prereq in T14 |
| 3.8 KeeperHub dashboard tab | T14 (runbook) |
| 3.9 Wallet/funds fixture | T14 (runbook) |
| 3.10 Recording cosmetics | T14 (runbook) |

All spec items mapped. ✓

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "similar to Task N", "write tests for the above" without code. ✓

**3. Type consistency:**
- `IntentField.select` defined in T3 with `default: string; options: string[]`. Used identically in T5 (demo-stubs intents) and T9 (compound-v3.lend protocol field). ✓
- `AgentEvent` defined in T10. Used consistently in T11 (`appendAgentEvent({ kind: "tool.call", name, input })`) and T12 (panel renders `kind === "tool.call"`). ✓
- Widget type ids — `borrow-demo`, `earn-demo`, `bridge-demo` — declared in plugin `widgets` map (T5 step 9), registered in `widgetRegistry` (T6 step 7), produced by dispatcher (T8 step 3 + T9 step 4). All match. ✓
- `compound-v3.lend` declared in T9 step 3, dispatched in T9 step 4. Matches.

**4. Cross-task ordering:**
- T6 (widget components) depends on T5 (plugin scaffold + index.ts re-exporting them). T5 step 12 commits intents but typecheck will be deferred until T6 lands; noted in plan.
- T7 (pluginLoader register) depends on T6 (widget files exist so the plugin's index.ts type-checks). Order respects this.
- T9 (lend) uses `select` field — depends on T3 + T4. Order respects this.
- T11 + T12 depend on T10 (store fields). Order respects this.

No ambiguities found in re-read. Plan ready.

---

## Out of scope (explicitly deferred)

- **Plugin-author hero moment** (agent scaffolds new protocol on stage) — out of demo arc per spec §4.
- **Memory / Soul / CLAUDE.md panel** — sub-project B.
- **Workflow-builder meta-agent** — separate workstream, not surfaced.
- **Self-deployable container for judges** — sub-project C.
- **Porto delegation modal implementation** — separate workstream; runbook lists it as prereq.

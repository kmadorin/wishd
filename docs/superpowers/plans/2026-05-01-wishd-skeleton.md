# wishd v0 Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v0 vertical slice from `docs/superpowers/specs/2026-05-01-wishd-skeleton-design.md` — agent → dynamic widget → wallet → chain pipeline for "deposit USDC into Compound on Sepolia."

**Architecture:** pnpm monorepo. `packages/plugin-sdk` (types only) + `plugins/compound-v3` (one MCP, two widgets) + `apps/web` (Next.js 15 App Router, SSE pipeline, Claude Agent SDK loop). Single-column prototype-shaped UI. Plugin-shape from day one; keepers/profile/reflection deferred but seam reserved.

**Tech Stack:** pnpm workspaces, TypeScript strict, Next.js 15, React 19, Tailwind, wagmi v2, viem v2, Porto, Zustand, Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), MCP SDK (`@modelcontextprotocol/sdk`), Vitest.

**TDD pragmatics:** Pure functions (amount helpers, prepare logic, EventStream parser, plugin loader) get unit tests. React widgets, wagmi setup, agent loop, and Next.js route plumbing are exercised via the manual verification protocol (Task 31). The plan flags which is which.

---

## Phase 1 — Workspace foundation

### Task 1: pnpm workspace + root config

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.local.example`

- [ ] **Step 1: Verify pnpm available**

Run: `pnpm --version`
Expected: prints a version (e.g. `9.x` or `10.x`). If not installed, run `npm i -g pnpm`.

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "plugins/*"
  - "keepers/*"
```

- [ ] **Step 3: Write root `package.json`**

```json
{
  "name": "wishd",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": false,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "baseUrl": "."
  }
}
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
.next/
dist/
.turbo/
*.tsbuildinfo
.env.local
.env*.local
.DS_Store
coverage/
```

- [ ] **Step 6: Write `.env.local.example`**

```
ANTHROPIC_API_KEY=
```

- [ ] **Step 7: Initialize and verify**

Run: `pnpm install`
Expected: completes with no errors, creates `pnpm-lock.yaml` and `node_modules/`.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json .gitignore .env.local.example pnpm-lock.yaml
git commit -m "chore: bootstrap pnpm monorepo"
```

---

## Phase 2 — Plugin SDK

### Task 2: `packages/plugin-sdk` package skeleton

**Files:**
- Create: `packages/plugin-sdk/package.json`
- Create: `packages/plugin-sdk/tsconfig.json`

- [ ] **Step 1: Write `packages/plugin-sdk/package.json`**

```json
{
  "name": "@wishd/plugin-sdk",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.0.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/plugin-sdk/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-sdk/package.json packages/plugin-sdk/tsconfig.json pnpm-lock.yaml
git commit -m "feat(plugin-sdk): package skeleton"
```

### Task 3: Plugin SDK types

**Files:**
- Create: `packages/plugin-sdk/src/index.ts`
- Create: `packages/plugin-sdk/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/plugin-sdk/src/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { definePlugin, defineKeeper } from "./index";
import type { Plugin, Keeper } from "./index";

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
      manifest: { name: "k", version: "0", plugins: [], chains: [1], trust: "verified", description: "" },
      paramsSchema: {},
      buildWorkflow: () => ({ name: "w", nodes: [], edges: [] }),
      delegation: () => ({ kind: "comet-allow", comet: "0x0000000000000000000000000000000000000000", manager: "0x0000000000000000000000000000000000000000" }),
    };
    expect(defineKeeper(stub)).toBe(stub);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wishd/plugin-sdk test`
Expected: FAIL — module `./index` not found or symbols not exported.

- [ ] **Step 3: Write `packages/plugin-sdk/src/index.ts`**

```ts
import type { ComponentType } from "react";
import type { Address, PublicClient } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/index.js";

export type TrustTier = "verified" | "community" | "unverified";

export type WidgetSlot = "flow" | "results" | "pinned" | "panel";

export type Manifest = {
  name: string;
  version: string;
  chains: number[];
  trust: TrustTier;
  provides: {
    intents: string[];
    widgets: string[];
    mcps: string[];
  };
};

export type KhWorkflowJson = {
  name: string;
  schedule?: { cron: string };
  nodes: Array<{
    id: string;
    label: string;
    actionType: string;
    config: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    sourceHandle?: "true" | "false" | "loop" | "done";
  }>;
  enabled?: boolean;
};

export type DelegationSpec =
  | { kind: "comet-allow"; comet: Address; manager: Address }
  | {
      kind: "porto-permissions";
      payload: {
        expiry: number;
        feeToken?: { limit: string; symbol: string };
        key: { type: "secp256k1"; publicKey: Address };
        permissions: {
          calls: Array<{ to: Address; signature: string }>;
          spend?: Array<{ token: Address; limit: bigint; period: "hour" | "day" | "week" | "month" }>;
        };
      };
    };

export type ServerEvent =
  | { type: "chat.delta"; delta: string }
  | { type: "tool.call"; name: string; input: unknown }
  | { type: "ui.render"; widget: { id: string; type: string; slot?: WidgetSlot; props: unknown } }
  | { type: "ui.patch"; id: string; props: Record<string, unknown> }
  | { type: "ui.dismiss"; id: string }
  | { type: "notification"; level: "info" | "warn" | "error"; text: string }
  | { type: "result"; ok: boolean; cost?: number }
  | { type: "error"; message: string };

export type PluginCtx = {
  publicClient: PublicClient;
  emit: (e: ServerEvent) => void;
};

export type Plugin = {
  manifest: Manifest;
  mcp(ctx: PluginCtx): { server: McpServer; serverName: string };
  widgets: Record<string, ComponentType<any>>;
  skills?: Record<string, string>;
};

export function definePlugin(p: Plugin): Plugin {
  return p;
}

export type Keeper<TParams = Record<string, unknown>> = {
  manifest: {
    name: string;
    version: string;
    plugins: string[];
    chains: number[];
    trust: TrustTier;
    description: string;
  };
  paramsSchema: unknown;
  buildWorkflow(params: TParams & { userAddress: Address; chainId: number }): KhWorkflowJson;
  delegation(params: TParams & { userAddress: Address; chainId: number }): DelegationSpec;
  widgets?: Record<string, ComponentType<any>>;
};

export function defineKeeper<TParams>(k: Keeper<TParams>): Keeper<TParams> {
  return k;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wishd/plugin-sdk test`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @wishd/plugin-sdk typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-sdk/src/
git commit -m "feat(plugin-sdk): types + definePlugin/defineKeeper"
```

---

## Phase 3 — Next.js app shell + libs

### Task 4: Next.js app bootstrap

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/next-env.d.ts`

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@tanstack/react-query": "^5.59.0",
    "@wishd/plugin-sdk": "workspace:*",
    "@wishd/plugin-compound-v3": "workspace:*",
    "next": "^15.0.0",
    "porto": "^0.0.20",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0",
    "zod": "^3.23.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

If `@anthropic-ai/claude-agent-sdk` or `porto` resolve to a different latest, update to that. Run `pnpm view @anthropic-ai/claude-agent-sdk version` and `pnpm view porto version` if uncertain.

- [ ] **Step 2: Write `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"],
      "@plugins/*": ["../../plugins/*"],
      "@keepers/*": ["../../keepers/*"]
    },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 3: Write `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wishd/plugin-sdk", "@wishd/plugin-compound-v3"],
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@modelcontextprotocol/sdk"],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Write `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Write `apps/web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../plugins/**/widgets/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        mint: "var(--mint)",
        "mint-2": "var(--mint-2)",
        pink: "var(--pink)",
        warn: "var(--warn)",
        "warn-2": "var(--warn-2)",
        good: "var(--good)",
        bad: "var(--bad)",
        rule: "var(--rule)",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
        hand: ["Caveat", "cursive"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        DEFAULT: "var(--r)",
        lg: "var(--r-lg)",
        pill: "var(--r-pill)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Write `apps/web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 7: Install**

Run: `pnpm install`
Expected: succeeds. If `@anthropic-ai/claude-agent-sdk` or `porto` versions don't resolve, update `package.json` to the actual latest from `pnpm view`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts apps/web/tailwind.config.ts apps/web/postcss.config.mjs apps/web/next-env.d.ts pnpm-lock.yaml
git commit -m "feat(web): next.js + tailwind + deps bootstrap"
```

### Task 5: Global CSS lifted from prototype

**Files:**
- Create: `apps/web/app/globals.css`

- [ ] **Step 1: Write `apps/web/app/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Caveat:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg:       #FBF4E8;
  --bg-2:     #F4EAD5;
  --surface:  #FFFCF3;
  --surface-2:#FFFFFF;
  --ink:      #1F1B16;
  --ink-2:    #5A4F40;
  --ink-3:    #9A8E78;
  --accent:   #E89A6B;
  --accent-2: #FFD9C2;
  --mint:     #B8E6C9;
  --mint-2:   #DCF1E2;
  --pink:     #F5C2C7;
  --warn:     #F5DC8A;
  --warn-2:   #FAEEBC;
  --good:     #9FD9B0;
  --bad:      #E89999;
  --rule:     #E5DAC0;
  --shadow:   rgba(31,27,22,0.08);
  --r-sm:     6px;
  --r:        12px;
  --r-lg:     20px;
  --r-pill:   999px;
}

html { background: var(--bg); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; color: var(--ink); }
body {
  min-height: 100vh; position: relative; overflow-x: hidden;
  background:
    radial-gradient(circle at 12% 18%, rgba(232,154,107,0.07) 0, rgba(232,154,107,0.07) 280px, transparent 281px),
    radial-gradient(circle at 88% 78%, rgba(184,230,201,0.1) 0, rgba(184,230,201,0.1) 320px, transparent 321px),
    radial-gradient(circle at 50% 110%, rgba(245,220,138,0.08) 0, rgba(245,220,138,0.08) 380px, transparent 381px),
    var(--bg);
}

.page { position: relative; z-index: 1; max-width: 760px; margin: 0 auto; padding: 0 20px 80px; }
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): global css lifted from prototype palette"
```

### Task 6: `lib/tokens.ts`

**Files:**
- Create: `apps/web/lib/tokens.ts`

- [ ] **Step 1: Write `apps/web/lib/tokens.ts`**

```ts
export const TOKENS = {
  "11155111": {
    USDC: {
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      symbol: "USDC",
      decimals: 6,
    },
  },
} as const;

export type ChainId = keyof typeof TOKENS;
export type TokenSymbol<C extends ChainId> = keyof (typeof TOKENS)[C];

export function getToken<C extends ChainId, S extends TokenSymbol<C>>(
  chainId: C,
  symbol: S,
): (typeof TOKENS)[C][S] {
  return TOKENS[chainId][symbol];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/tokens.ts
git commit -m "feat(web): tokens registry (sepolia usdc)"
```

### Task 7: `lib/amount.ts` with TDD

**Files:**
- Create: `apps/web/lib/amount.ts`
- Create: `apps/web/lib/amount.test.ts`
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 1: Write vitest config**

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
  },
});
```

- [ ] **Step 2: Write the failing test**

`apps/web/lib/amount.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toWei, fromWei } from "./amount";

const usdc = { decimals: 6 };
const weth = { decimals: 18 };

describe("amount helpers", () => {
  it("toWei converts decimal string to bigint with token decimals", () => {
    expect(toWei("10", usdc)).toBe(10_000_000n);
    expect(toWei("0.5", usdc)).toBe(500_000n);
    expect(toWei("1", weth)).toBe(10n ** 18n);
  });

  it("fromWei round-trips", () => {
    expect(fromWei(10_000_000n, usdc)).toBe("10");
    expect(fromWei(500_000n, usdc)).toBe("0.5");
  });

  it("toWei handles small fractions for usdc", () => {
    expect(toWei("0.000001", usdc)).toBe(1n);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — module `./amount` not found.

- [ ] **Step 4: Write `apps/web/lib/amount.ts`**

```ts
import { parseUnits, formatUnits } from "viem";

export const toWei = (h: string, t: { decimals: number }) => parseUnits(h, t.decimals);
export const fromWei = (w: bigint, t: { decimals: number }) => formatUnits(w, t.decimals);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/lib/amount.ts apps/web/lib/amount.test.ts
git commit -m "feat(web): toWei/fromWei helpers with tests"
```

### Task 8: `lib/wagmi.ts` (Porto + Sepolia)

**Files:**
- Create: `apps/web/lib/wagmi.ts`

- [ ] **Step 1: Write `apps/web/lib/wagmi.ts`**

```ts
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { porto } from "porto/wagmi";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [porto()],
  transports: {
    [sepolia.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
```

Note: `porto/wagmi` exports a `porto()` connector. If the install path differs (e.g. `porto/connectors`), check `node_modules/porto/package.json` `exports` field and adjust the import. Crypto-bro-calls demo uses the same Sepolia setup — copy from there if uncertain.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/wagmi.ts
git commit -m "feat(web): wagmi config (porto + sepolia)"
```

### Task 9: Zustand workspace store

**Files:**
- Create: `apps/web/store/workspace.ts`

- [ ] **Step 1: Write `apps/web/store/workspace.ts`**

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

type State = {
  widgets: WidgetInstance[];
  narration: string;
  appendWidget: (w: Omit<WidgetInstance, "createdAt">) => void;
  patchWidget: (id: string, props: Record<string, unknown>) => void;
  dismissWidget: (id: string) => void;
  appendNarration: (delta: string) => void;
  reset: () => void;
};

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
  appendNarration: (delta) => set((s) => ({ narration: s.narration + delta })),
  reset: () => set({ widgets: [], narration: "" }),
}));
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/store/workspace.ts
git commit -m "feat(web): zustand workspace store (widget list + slots)"
```

### Task 10: `<StepCard>` primitive

**Files:**
- Create: `apps/web/components/primitives/StepCard.tsx`

- [ ] **Step 1: Write `apps/web/components/primitives/StepCard.tsx`**

```tsx
import type { ReactNode } from "react";

export type StepPhase = "locked" | "in-progress" | "complete";

export type StepCardProps = {
  step: string;
  title: string;
  status?: string;
  sub?: string;
  phase?: StepPhase;
  children?: ReactNode;
};

export function StepCard({ step, title, status, sub, phase = "in-progress", children }: StepCardProps) {
  const lockedCls = phase === "locked" ? "opacity-50 pointer-events-none" : "";
  return (
    <section
      className={`mt-5 rounded-lg bg-surface border border-rule shadow-[0_2px_8px_var(--shadow)] p-6 ${lockedCls}`}
    >
      <header className="flex items-baseline gap-3">
        <span className="text-[11px] tracking-[0.18em] font-mono uppercase text-ink-3">{step}</span>
        <h2 className="text-xl font-semibold text-ink flex-1">{title}</h2>
        {status && (
          <span className="text-xs px-2 py-0.5 rounded-pill bg-warn-2 text-ink-2">{status}</span>
        )}
      </header>
      {sub && <p className="text-[13.5px] text-ink-2 mt-1 mb-3">{sub}</p>}
      <div>{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/primitives/StepCard.tsx
git commit -m "feat(web): StepCard primitive matching prototype"
```

---

## Phase 4 — Compound v3 plugin

### Task 11: Plugin package skeleton

**Files:**
- Create: `plugins/compound-v3/package.json`
- Create: `plugins/compound-v3/tsconfig.json`

- [ ] **Step 1: Write `plugins/compound-v3/package.json`**

```json
{
  "name": "@wishd/plugin-compound-v3",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": "./index.ts",
    "./widgets": "./widgets/index.ts",
    "./mcp": "./mcp/server.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@wishd/plugin-sdk": "workspace:*",
    "react": "^19.0.0",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `plugins/compound-v3/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "noEmit": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: succeeds, links workspace deps.

- [ ] **Step 4: Commit**

```bash
git add plugins/compound-v3/package.json plugins/compound-v3/tsconfig.json pnpm-lock.yaml
git commit -m "feat(plugin-compound-v3): package skeleton"
```

### Task 12: Compound addresses + ABIs

**Files:**
- Create: `plugins/compound-v3/addresses.ts`
- Create: `plugins/compound-v3/abis/erc20.ts`
- Create: `plugins/compound-v3/abis/comet.ts`

- [ ] **Step 1: Write `plugins/compound-v3/addresses.ts`**

```ts
import type { Address } from "viem";

export const COMPOUND_ADDRESSES: Record<number, {
  USDC: Address;
  Comet: Address;
  CometRewards: Address;
  COMP: Address;
}> = {
  11155111: {
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    Comet: "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e",
    CometRewards: "0x8bF5b658bdF0388E8b482ED51B14aef58f90abfD",
    COMP: "0xA6c8D1c55951e8AC44a0EaA959Be5Fd21cc07531",
  },
};

export const SUPPORTED_CHAINS = [11155111] as const;
```

- [ ] **Step 2: Write `plugins/compound-v3/abis/erc20.ts`**

```ts
export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
```

- [ ] **Step 3: Write `plugins/compound-v3/abis/comet.ts`**

```ts
export const cometAbi = [
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "supplyTo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dst", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "allow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "manager", type: "address" },
      { name: "isAllowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
```

- [ ] **Step 4: Commit**

```bash
git add plugins/compound-v3/addresses.ts plugins/compound-v3/abis/
git commit -m "feat(plugin-compound-v3): sepolia addresses + abi fragments"
```

### Task 13: `prepare.ts` with TDD

**Files:**
- Create: `plugins/compound-v3/prepare.ts`
- Create: `plugins/compound-v3/prepare.test.ts`
- Create: `plugins/compound-v3/vitest.config.ts`

- [ ] **Step 1: Write vitest config**

`plugins/compound-v3/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

- [ ] **Step 2: Write the failing test**

`plugins/compound-v3/prepare.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { prepareDeposit } from "./prepare";

const FAKE_USER = "0x0000000000000000000000000000000000000001" as const;

function fakeClient(allowance: bigint) {
  return {
    readContract: vi.fn().mockResolvedValue(allowance),
  } as any;
}

describe("prepareDeposit", () => {
  it("emits approve + supply when allowance is zero", async () => {
    const out = await prepareDeposit({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: fakeClient(0n),
    });
    expect(out.calls).toHaveLength(2);
    expect(out.meta.needsApprove).toBe(true);
    expect(out.meta.amountWei).toBe("0x" + (10_000_000n).toString(16));
    expect(out.meta.asset).toBe("USDC");
    expect(out.meta.market).toBe("cUSDCv3");
  });

  it("emits supply only when allowance is sufficient", async () => {
    const out = await prepareDeposit({
      amount: "10",
      user: FAKE_USER,
      chainId: 11155111,
      publicClient: fakeClient(100_000_000n),
    });
    expect(out.calls).toHaveLength(1);
    expect(out.meta.needsApprove).toBe(false);
  });

  it("throws on unsupported chain", async () => {
    await expect(
      prepareDeposit({
        amount: "1",
        user: FAKE_USER,
        chainId: 1,
        publicClient: fakeClient(0n),
      }),
    ).rejects.toThrow(/unsupported chain/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @wishd/plugin-compound-v3 test`
Expected: FAIL — `./prepare` not found.

- [ ] **Step 4: Write `plugins/compound-v3/prepare.ts`**

```ts
import { encodeFunctionData, maxUint256, toHex, type Address, type PublicClient } from "viem";
import { parseUnits } from "viem";
import { COMPOUND_ADDRESSES, SUPPORTED_CHAINS } from "./addresses";
import { erc20Abi } from "./abis/erc20";
import { cometAbi } from "./abis/comet";

const USDC_DECIMALS = 6;

export type PreparedCall = {
  to: Address;
  data: `0x${string}`;
  value: `0x${string}`;
};

export type PreparedDeposit = {
  calls: PreparedCall[];
  meta: {
    needsApprove: boolean;
    amountWei: `0x${string}`;
    asset: "USDC";
    market: "cUSDCv3";
    chainId: number;
    user: Address;
  };
};

export type PrepareDepositInput = {
  amount: string;
  user: Address;
  chainId: number;
  publicClient: Pick<PublicClient, "readContract">;
};

export async function prepareDeposit(input: PrepareDepositInput): Promise<PreparedDeposit> {
  const { amount, user, chainId, publicClient } = input;

  if (!SUPPORTED_CHAINS.includes(chainId as 11155111)) {
    throw new Error(`unsupported chain: ${chainId}`);
  }

  const addrs = COMPOUND_ADDRESSES[chainId]!;
  const amountWei = parseUnits(amount, USDC_DECIMALS);

  const allowance = (await publicClient.readContract({
    address: addrs.USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [user, addrs.Comet],
  })) as bigint;

  const needsApprove = allowance < amountWei;

  const calls: PreparedCall[] = [];

  if (needsApprove) {
    calls.push({
      to: addrs.USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [addrs.Comet, maxUint256],
      }),
      value: "0x0",
    });
  }

  calls.push({
    to: addrs.Comet,
    data: encodeFunctionData({
      abi: cometAbi,
      functionName: "supply",
      args: [addrs.USDC, amountWei],
    }),
    value: "0x0",
  });

  return {
    calls,
    meta: {
      needsApprove,
      amountWei: toHex(amountWei),
      asset: "USDC",
      market: "cUSDCv3",
      chainId,
      user,
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @wishd/plugin-compound-v3 test`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add plugins/compound-v3/prepare.ts plugins/compound-v3/prepare.test.ts plugins/compound-v3/vitest.config.ts
git commit -m "feat(plugin-compound-v3): prepareDeposit + tests"
```

### Task 14: Compound MCP server

**Files:**
- Create: `plugins/compound-v3/mcp/server.ts`

- [ ] **Step 1: Write `plugins/compound-v3/mcp/server.ts`**

```ts
import { z } from "zod";
import type { PluginCtx } from "@wishd/plugin-sdk";
import { prepareDeposit } from "../prepare";
// Claude Agent SDK provides createSdkMcpServer + tool helpers
// (via @anthropic-ai/claude-agent-sdk; alternate name on some versions: @anthropic/sdk-agents)
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

export function createCompoundMcp(ctx: PluginCtx) {
  return createSdkMcpServer({
    name: "compound",
    version: "0.0.0",
    tools: [
      tool(
        "prepare_deposit",
        "Prepare a Compound v3 USDC deposit. Reads allowance via viem and returns prepared calls (approve + supply, or supply only).",
        {
          amount: z.string().describe("USDC amount, decimal string e.g. '10'"),
          user: z
            .string()
            .regex(/^0x[a-fA-F0-9]{40}$/)
            .describe("User EOA / smart-account address"),
          chainId: z.number().int().describe("Chain id, e.g. 11155111 for Sepolia"),
        },
        async (args) => {
          const prepared = await prepareDeposit({
            amount: args.amount,
            user: args.user as `0x${string}`,
            chainId: args.chainId,
            publicClient: ctx.publicClient,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(prepared) }],
          };
        },
      ),
    ],
  });
}
```

If the Claude Agent SDK exports `createSdkMcpServer` from a sub-path, adjust the import. Verify with: `node -e "console.log(Object.keys(require('@anthropic-ai/claude-agent-sdk')))"` after install.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-compound-v3 typecheck`
Expected: no errors. If `createSdkMcpServer` import fails, locate the correct path in `node_modules/@anthropic-ai/claude-agent-sdk/package.json` `exports` and update.

- [ ] **Step 3: Commit**

```bash
git add plugins/compound-v3/mcp/server.ts
git commit -m "feat(plugin-compound-v3): mcp server with prepare_deposit tool"
```

### Task 15: CompoundSummary widget (Step 02)

**Files:**
- Create: `plugins/compound-v3/widgets/CompoundSummary.tsx`

- [ ] **Step 1: Write `plugins/compound-v3/widgets/CompoundSummary.tsx`**

```tsx
"use client";

import { useState } from "react";

export type CompoundSummaryProps = {
  amount: string;
  asset: string;
  market: string;
  needsApprove: boolean;
  summaryId: string;
  amountWei: string;
  chainId: number;
  user: `0x${string}`;
  comet: `0x${string}`;
  usdc: `0x${string}`;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: `0x${string}` }>;
};

export function CompoundSummary(props: CompoundSummaryProps) {
  const [submitting, setSubmitting] = useState(false);

  async function execute() {
    setSubmitting(true);
    try {
      // Embed the full prepared payload in context so the agent's next turn
      // can render compound-execute without re-reading allowance.
      await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wish: `execute deposit ${props.summaryId}`,
          account: { address: props.user, chainId: props.chainId },
          context: {
            summaryId: props.summaryId,
            prepared: {
              amount: props.amount,
              asset: props.asset,
              market: props.market,
              needsApprove: props.needsApprove,
              amountWei: props.amountWei,
              chainId: props.chainId,
              user: props.user,
              comet: props.comet,
              usdc: props.usdc,
              calls: props.calls,
            },
          },
        }),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Kv label="amount" value={`${props.amount} ${props.asset}`} />
        <Kv label="market" value={props.market} />
        <Kv label="action" value={props.needsApprove ? "approve + supply" : "supply"} />
      </div>
      <button
        type="button"
        onClick={execute}
        disabled={submitting}
        className="mt-5 w-full rounded-pill bg-accent text-ink py-3 font-semibold hover:bg-accent-2 disabled:opacity-50"
      >
        {submitting ? "preparing…" : "execute"}
      </button>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-surface-2 border border-rule px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="font-mono text-ink">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-compound-v3 typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/compound-v3/widgets/CompoundSummary.tsx
git commit -m "feat(plugin-compound-v3): CompoundSummary widget"
```

### Task 16: CompoundExecute widget (Step 03/04)

**Files:**
- Create: `plugins/compound-v3/widgets/CompoundExecute.tsx`

- [ ] **Step 1: Write `plugins/compound-v3/widgets/CompoundExecute.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useSendCalls,
  useWaitForCallsStatus,
  useReadContract,
} from "wagmi";
import type { Address } from "viem";

type Phase =
  | "connect"
  | "switch-chain"
  | "approve"
  | "approving"
  | "deposit"
  | "depositing"
  | "confirmed"
  | "error";

export type CompoundExecuteProps = {
  asset: string;
  market: string;
  amount: string;
  amountWei: string;
  chainId: number;
  user: Address;
  comet: Address;
  usdc: Address;
  calls: Array<{ to: Address; data: `0x${string}`; value: `0x${string}` }>;
  needsApprove: boolean;
};

const erc20AllowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function CompoundExecute(props: CompoundExecuteProps) {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const { sendCalls, data: sendData, error: sendError, isPending: sendPending } = useSendCalls();
  const { data: status } = useWaitForCallsStatus({ id: sendData?.id });
  const { data: liveAllowance, refetch: refetchAllowance } = useReadContract({
    address: props.usdc,
    abi: erc20AllowanceAbi,
    functionName: "allowance",
    args: address ? [address, props.comet] : undefined,
    query: { enabled: !!address },
  });

  const amountWei = BigInt(props.amountWei);
  const hasAllowance = (liveAllowance as bigint | undefined ?? 0n) >= amountWei;

  const [phase, setPhase] = useState<Phase>(() => initialPhase(isConnected, chainId === props.chainId, !!hasAllowance));
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) return setPhase("connect");
    if (chainId !== props.chainId) return setPhase("switch-chain");
    if (sendPending) return setPhase((p) => (p === "approve" ? "approving" : "depositing"));
    if (sendError) {
      setErrMsg(sendError.message);
      return setPhase("error");
    }
    if (status?.status === "success") {
      if (phase === "approving") {
        refetchAllowance();
        setPhase("deposit");
      } else if (phase === "depositing") {
        setPhase("confirmed");
      }
    }
  }, [isConnected, chainId, sendPending, sendError, status, phase, props.chainId, refetchAllowance]);

  const approveCall = useMemo(() => props.calls.find((c) => c.to === props.usdc), [props.calls, props.usdc]);
  const supplyCall = useMemo(() => props.calls.find((c) => c.to === props.comet), [props.calls, props.comet]);

  function onClick() {
    if (phase === "connect") {
      const c = connectors[0];
      if (c) connect({ connector: c });
      return;
    }
    if (phase === "switch-chain") {
      switchChain({ chainId: props.chainId });
      return;
    }
    if (phase === "approve" && approveCall) {
      sendCalls({ calls: [approveCall] });
      setPhase("approving");
      return;
    }
    if (phase === "deposit" && supplyCall) {
      sendCalls({ calls: [supplyCall] });
      setPhase("depositing");
      return;
    }
  }

  const label = labelFor(phase);
  const txHash = status?.receipts?.[0]?.transactionHash;
  const confirmations = status?.receipts?.[0]?.blockNumber ? "confirmed" : "pending";

  return (
    <div>
      {phase === "confirmed" && txHash ? (
        <div className="rounded-sm bg-mint-2 border border-mint p-4 text-sm">
          <div className="font-semibold text-ink">deposited {props.amount} {props.asset} into {props.market}</div>
          <a
            className="text-accent underline mt-2 inline-block font-mono text-xs"
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={phase === "approving" || phase === "depositing"}
          className="w-full rounded-pill bg-accent text-ink py-3 font-semibold hover:bg-accent-2 disabled:opacity-50"
        >
          {label}
        </button>
      )}
      {phase === "error" && errMsg && <p className="mt-2 text-xs text-bad">{errMsg}</p>}
    </div>
  );
}

function initialPhase(connected: boolean, rightChain: boolean, hasAllowance: boolean): Phase {
  if (!connected) return "connect";
  if (!rightChain) return "switch-chain";
  return hasAllowance ? "deposit" : "approve";
}

function labelFor(p: Phase): string {
  switch (p) {
    case "connect": return "Connect Wallet";
    case "switch-chain": return "Switch Network";
    case "approve": return "Approve";
    case "approving": return "Approving…";
    case "deposit": return "Deposit";
    case "depositing": return "Depositing…";
    case "confirmed": return "Confirmed";
    case "error": return "Retry";
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @wishd/plugin-compound-v3 typecheck`
Expected: no errors. If wagmi hook signatures differ in your installed version, consult `pnpm view wagmi exports` and adjust (especially `useSendCalls` and `useWaitForCallsStatus` — these are EIP-5792 helpers). Crypto-bro-calls compound-deposit page used the same hooks; reference for exact return shape.

- [ ] **Step 3: Commit**

```bash
git add plugins/compound-v3/widgets/CompoundExecute.tsx
git commit -m "feat(plugin-compound-v3): CompoundExecute widget with state machine"
```

### Task 17: Plugin manifest + index

**Files:**
- Create: `plugins/compound-v3/manifest.ts`
- Create: `plugins/compound-v3/widgets/index.ts`
- Create: `plugins/compound-v3/index.ts`

- [ ] **Step 1: Write `plugins/compound-v3/manifest.ts`**

```ts
import type { Manifest } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "compound-v3",
  version: "0.0.0",
  chains: [11155111],
  trust: "verified",
  provides: {
    intents: ["deposit", "lend", "supply"],
    widgets: ["compound-summary", "compound-execute"],
    mcps: ["compound"],
  },
};
```

- [ ] **Step 2: Write `plugins/compound-v3/widgets/index.ts`**

```ts
export { CompoundSummary } from "./CompoundSummary";
export { CompoundExecute } from "./CompoundExecute";
```

- [ ] **Step 3: Write `plugins/compound-v3/index.ts`**

```ts
import { definePlugin } from "@wishd/plugin-sdk";
import { manifest } from "./manifest";
import { createCompoundMcp } from "./mcp/server";
import { CompoundSummary, CompoundExecute } from "./widgets";

export const compoundV3 = definePlugin({
  manifest,
  mcp(ctx) {
    return { server: createCompoundMcp(ctx) as any, serverName: "compound" };
  },
  widgets: {
    "compound-summary": CompoundSummary,
    "compound-execute": CompoundExecute,
  },
});

export { CompoundSummary, CompoundExecute, manifest };
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @wishd/plugin-compound-v3 typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add plugins/compound-v3/manifest.ts plugins/compound-v3/widgets/index.ts plugins/compound-v3/index.ts
git commit -m "feat(plugin-compound-v3): plugin definition"
```

---

## Phase 5 — Agent server

### Task 18: Generic widget-renderer MCP

**Files:**
- Create: `apps/web/server/mcps/widgetRenderer.ts`

- [ ] **Step 1: Write `apps/web/server/mcps/widgetRenderer.ts`**

```ts
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "@wishd/plugin-sdk";
import { randomUUID } from "node:crypto";

export function createWidgetRendererMcp(emit: (e: ServerEvent) => void) {
  return createSdkMcpServer({
    name: "widget",
    version: "0.0.0",
    tools: [
      tool(
        "render",
        "Render a widget into the user workspace. Use AFTER preparing data with a plugin tool.",
        {
          type: z.string().describe("Widget type, e.g. compound-summary, compound-execute"),
          props: z.record(z.any()).describe("Props for the widget."),
          slot: z.enum(["flow", "results", "pinned", "panel"]).optional().default("flow"),
        },
        async (args) => {
          const id = randomUUID();
          emit({
            type: "ui.render",
            widget: { id, type: args.type, slot: args.slot, props: args.props as Record<string, unknown> },
          });
          return { content: [{ type: "text", text: `rendered ${args.type} as ${id}` }] };
        },
      ),
    ],
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/mcps/widgetRenderer.ts
git commit -m "feat(web): generic widget-renderer mcp"
```

### Task 19: Plugin loader

**Files:**
- Create: `apps/web/server/pluginLoader.ts`
- Create: `apps/web/server/pluginLoader.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/server/pluginLoader.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `./pluginLoader` not found.

- [ ] **Step 3: Write `apps/web/server/pluginLoader.ts`**

```ts
import { compoundV3 } from "@wishd/plugin-compound-v3";
import type { Plugin } from "@wishd/plugin-sdk";

export type LoadedPlugins = {
  plugins: Plugin[];
  widgetTypes: string[];
  allowedTools: string[];
  mcpNames: string[];
};

export async function loadPlugins(): Promise<LoadedPlugins> {
  const plugins: Plugin[] = [compoundV3];
  const widgetTypes = plugins.flatMap((p) => Object.keys(p.widgets));
  const mcpNames = plugins.flatMap((p) => p.manifest.provides.mcps);
  const allowedTools = ["mcp__widget__*", ...mcpNames.map((n) => `mcp__${n}__*`)];
  return { plugins, widgetTypes, allowedTools, mcpNames };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/pluginLoader.ts apps/web/server/pluginLoader.test.ts
git commit -m "feat(web): plugin loader + tests"
```

### Task 20: Widget registry

**Files:**
- Create: `apps/web/widgetRegistry.ts`

- [ ] **Step 1: Write `apps/web/widgetRegistry.ts`**

```ts
import type { ComponentType } from "react";
import { compoundV3 } from "@wishd/plugin-compound-v3";

export const widgetRegistry: Record<string, ComponentType<any>> = {
  ...compoundV3.widgets,
};

export function getWidget(type: string): ComponentType<any> | undefined {
  return widgetRegistry[type];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/widgetRegistry.ts
git commit -m "feat(web): widget registry"
```

### Task 21: System prompt

**Files:**
- Create: `apps/web/server/systemPrompt.ts`

- [ ] **Step 1: Write `apps/web/server/systemPrompt.ts`**

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

const BASE_PROMPT = `You are wishd, a DeFi assistant on Sepolia (chainId 11155111).

Tools available:
- mcp__compound__prepare_deposit({ amount, user, chainId }): prepares a Compound v3 USDC deposit. Returns prepared.calls (approve + supply, or just supply) and prepared.meta. Pass the prepared object to the widget below.
- mcp__widget__render({ type, props, slot? }): renders a widget into the user workspace.

Canonical flows:
- For wishes like "deposit/lend/supply N USDC into Compound" (Sepolia):
  1. Call mcp__compound__prepare_deposit({ amount: N, user, chainId }).
  2. Call mcp__widget__render({ type: "compound-summary", props: { amount: N, asset: "USDC", market: "cUSDCv3", needsApprove: prepared.meta.needsApprove, summaryId: <unique id you generate>, amountWei: prepared.meta.amountWei, chainId, user, comet: <Comet address>, usdc: <USDC address>, calls: prepared.calls } }).
  3. Reply with one short narration line in chat (e.g. "got it — preparing your supply.").

- For follow-up wishes like "execute deposit <summaryId>" — the user message will include a context.prepared object with all data needed:
  1. Call mcp__widget__render({ type: "compound-execute", props: { asset: prepared.asset, market: prepared.market, amount: prepared.amount, amountWei: prepared.amountWei, chainId: prepared.chainId, user: prepared.user, comet: prepared.comet, usdc: prepared.usdc, calls: prepared.calls, needsApprove: prepared.needsApprove } }).
  2. Reply with one short narration line.

Stop after rendering. Widgets handle clicks and chain interaction.`;

export async function buildSystemPrompt(userId?: string): Promise<string> {
  if (!userId) return BASE_PROMPT;
  const profilePath = path.join(process.cwd(), "users", userId, "CLAUDE.md");
  try {
    const profile = await fs.readFile(profilePath, "utf-8");
    return `${BASE_PROMPT}\n\nUser profile:\n${profile}`;
  } catch {
    return BASE_PROMPT;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/systemPrompt.ts
git commit -m "feat(web): system prompt with profile-read seam"
```

### Task 22: Agent runner

**Files:**
- Create: `apps/web/server/runAgent.ts`

- [ ] **Step 1: Write `apps/web/server/runAgent.ts`**

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { ServerEvent } from "@wishd/plugin-sdk";
import { loadPlugins } from "./pluginLoader";
import { createWidgetRendererMcp } from "./mcps/widgetRenderer";
import { buildSystemPrompt } from "./systemPrompt";

export type RunAgentInput = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  emit: (e: ServerEvent) => void;
};

export async function runAgent(input: RunAgentInput): Promise<void> {
  const { wish, account, context, emit } = input;

  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  const { plugins, allowedTools } = await loadPlugins();

  const pluginCtx = { publicClient, emit };
  const pluginMcps = plugins.map((p) => p.mcp(pluginCtx));
  const widgetMcp = createWidgetRendererMcp(emit);

  const mcpServers: Record<string, any> = { widget: widgetMcp };
  for (const m of pluginMcps) mcpServers[m.serverName] = m.server;

  const systemPrompt = await buildSystemPrompt();

  const userMessage = JSON.stringify({ wish, account, context: context ?? {} });

  try {
    const stream = query({
      prompt: userMessage,
      options: {
        systemPrompt,
        mcpServers,
        allowedTools,
        permissionMode: "bypassPermissions",
        maxTurns: 4,
      },
    });

    for await (const msg of stream) {
      // Translate SDK messages into ServerEvent stream.
      // The SDK's exact shape varies by version; this branch covers the common cases.
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            emit({ type: "chat.delta", delta: block.text });
          }
          if (block.type === "tool_use") {
            emit({ type: "tool.call", name: block.name, input: block.input });
          }
        }
      }
      if (msg.type === "result") {
        emit({ type: "result", ok: msg.subtype === "success", cost: msg.total_cost_usd });
      }
    }
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
```

The SDK message shape may need small adjustments after install. Verify with: after running once, log the raw `msg` to console and refine the branches. The contract `emit({type:"chat.delta"|"tool.call"|"result"|"error"})` is what the client depends on.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors. If the SDK message types are stricter than `any`, narrow with `as any` casts in the offending branches; this is acceptable as the contract on the wire is the SSE event, not the SDK's internal types.

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/runAgent.ts
git commit -m "feat(web): agent runner wires plugins + mcps + sse emitter"
```

### Task 23: `/api/chat` SSE route

**Files:**
- Create: `apps/web/app/api/chat/route.ts`

- [ ] **Step 1: Write `apps/web/app/api/chat/route.ts`**

```ts
import type { ServerEvent } from "@wishd/plugin-sdk";
import { runAgent } from "@/server/runAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

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

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/chat/route.ts
git commit -m "feat(web): /api/chat SSE endpoint"
```

---

## Phase 6 — Frontend wiring

### Task 24: SSE event reader with TDD

**Files:**
- Create: `apps/web/components/wish/EventStream.ts`
- Create: `apps/web/components/wish/EventStream.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/components/wish/EventStream.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSseChunk } from "./EventStream";

describe("parseSseChunk", () => {
  it("parses single complete event", () => {
    const buffer = `data: {"type":"chat.delta","delta":"hi"}\n\n`;
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual([{ type: "chat.delta", delta: "hi" }]);
    expect(rest).toBe("");
  });

  it("retains incomplete trailing event in rest", () => {
    const buffer = `data: {"type":"chat.delta","delta":"a"}\n\ndata: {"type":"cha`;
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual([{ type: "chat.delta", delta: "a" }]);
    expect(rest).toBe(`data: {"type":"cha`);
  });

  it("ignores non-data lines", () => {
    const buffer = `: comment\nevent: foo\ndata: {"type":"result","ok":true}\n\n`;
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toEqual([{ type: "result", ok: true }]);
    expect(rest).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL.

- [ ] **Step 3: Write `apps/web/components/wish/EventStream.ts`**

```ts
import type { ServerEvent } from "@wishd/plugin-sdk";

export type ParseResult = {
  events: ServerEvent[];
  rest: string;
};

export function parseSseChunk(buffer: string): ParseResult {
  const events: ServerEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const dataLines = part
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice("data: ".length));
    if (dataLines.length === 0) continue;
    try {
      events.push(JSON.parse(dataLines.join("\n")) as ServerEvent);
    } catch {
      // skip malformed
    }
  }
  return { events, rest };
}

export type StartStreamArgs = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  onEvent: (e: ServerEvent) => void;
  signal?: AbortSignal;
};

export async function startStream(args: StartStreamArgs): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wish: args.wish, account: args.account, context: args.context }),
    signal: args.signal,
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;
    for (const ev of events) args.onEvent(ev);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/EventStream.ts apps/web/components/wish/EventStream.test.ts
git commit -m "feat(web): SSE event stream reader + parser tests"
```

### Task 25: WishComposer

**Files:**
- Create: `apps/web/components/wish/WishComposer.tsx`

- [ ] **Step 1: Write `apps/web/components/wish/WishComposer.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";
import { StepCard } from "@/components/primitives/StepCard";

const ACTIONS = [
  { id: "lend", label: "lend", enabled: true },
  { id: "swap", label: "swap", enabled: false },
  { id: "borrow", label: "borrow", enabled: false },
  { id: "earn", label: "earn", enabled: false },
  { id: "bridge", label: "bridge", enabled: false },
  { id: "find-vault", label: "find vault", enabled: false },
];

export function WishComposer() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { address, chainId } = useAccount();
  const { appendWidget, patchWidget, dismissWidget, appendNarration, reset } = useWorkspace();

  async function submit(wish: string) {
    if (!wish.trim()) return;
    setBusy(true);
    reset();
    try {
      await startStream({
        wish,
        account: {
          address: (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
          chainId: chainId ?? 11155111,
        },
        onEvent: (e) => {
          if (e.type === "chat.delta") appendNarration(e.delta);
          if (e.type === "ui.render") {
            appendWidget({
              id: e.widget.id,
              type: e.widget.type,
              slot: e.widget.slot ?? "flow",
              props: e.widget.props as Record<string, unknown>,
            });
          }
          if (e.type === "ui.patch") patchWidget(e.id, e.props);
          if (e.type === "ui.dismiss") dismissWidget(e.id);
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
      <div className="flex flex-wrap gap-2 mb-3">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={!a.enabled || busy}
            onClick={() => submit(`I want to ${a.id} 10 USDC into Compound on Sepolia.`)}
            title={a.enabled ? "" : "coming soon"}
            className={`px-3 py-1 rounded-pill text-sm font-medium border ${
              a.enabled
                ? "bg-accent-2 border-accent text-ink hover:bg-accent"
                : "bg-bg-2 border-rule text-ink-3 cursor-not-allowed"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
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
    </StepCard>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/wish/WishComposer.tsx
git commit -m "feat(web): WishComposer with action chips + free-text"
```

### Task 26: StepStack

**Files:**
- Create: `apps/web/components/workspace/StepStack.tsx`

- [ ] **Step 1: Write `apps/web/components/workspace/StepStack.tsx`**

```tsx
"use client";

import { useWorkspace } from "@/store/workspace";
import { getWidget } from "@/widgetRegistry";
import { StepCard } from "@/components/primitives/StepCard";

const STEP_LABELS: Record<string, { step: string; title: string; sub?: string }> = {
  "compound-summary": { step: "STEP 02", title: "your supply, materialized", sub: "review and execute" },
  "compound-execute": { step: "STEP 03", title: "execute", sub: "native · don't close the tab" },
};

export function StepStack() {
  const widgets = useWorkspace((s) => s.widgets);
  const flow = widgets.filter((w) => w.slot === "flow");
  return (
    <>
      {flow.map((w) => {
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
git commit -m "feat(web): StepStack renders workspace widgets in flow slot"
```

### Task 27: Providers, layout, page

**Files:**
- Create: `apps/web/app/providers.tsx`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`

- [ ] **Step 1: Write `apps/web/app/providers.tsx`**

```tsx
"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
```

- [ ] **Step 2: Write `apps/web/app/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata = {
  title: "wishd — defi by wishing it",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Write `apps/web/app/page.tsx`**

```tsx
import { WishComposer } from "@/components/wish/WishComposer";
import { StepStack } from "@/components/workspace/StepStack";

export default function Page() {
  return (
    <main className="page">
      <header className="pt-10 pb-4 flex items-baseline gap-3">
        <h1 className="font-hand text-4xl">wishd</h1>
        <span className="text-sm text-ink-2">defi by wishing it</span>
      </header>
      <WishComposer />
      <StepStack />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/providers.tsx apps/web/app/layout.tsx apps/web/app/page.tsx
git commit -m "feat(web): root layout + page with WishComposer + StepStack"
```

### Task 28: keepers/README + project README

**Files:**
- Create: `keepers/README.md`
- Create: `README.md`

- [ ] **Step 1: Write `keepers/README.md`**

```markdown
# Keepers

Top-level multi-protocol artifacts. Each keeper:

- Lives at `keepers/<id>/`
- Declares `manifest.plugins: string[]` (which protocol plugins it composes)
- Ships `workflow.ts` (returns a `KhWorkflowJson` for hosted KeeperHub deploys)
- Ships `delegation.ts` (`comet-allow` or `porto-permissions`)
- Optionally ships setup widgets

v0 ships zero keepers. The `Keeper` type is exported from `@wishd/plugin-sdk` so adding `keepers/auto-compound-comp/` later is a drop-in.

Reference graph for the planned `auto-compound-comp` keeper lives at `crypto-bro-calls/project-docs/keeperhub-workflow.md` (sibling project).
```

- [ ] **Step 2: Write `README.md`**

```markdown
# wishd — defi by wishing it

Agentic DeFi assistant. v0 vertical slice: deposit USDC into Compound v3 on Sepolia, driven by a Claude Agent SDK loop that emits dynamic widgets over SSE.

## Run

```bash
pnpm install
cp .env.local.example .env.local
# edit .env.local: ANTHROPIC_API_KEY=sk-ant-...
pnpm dev
```

Open http://localhost:3000. Connect Porto. Fund with Sepolia ETH + Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`). Type or pick a wish.

## Layout

- `apps/web` — Next.js 15 App Router, agent route, UI
- `packages/plugin-sdk` — types (Plugin, Keeper, ServerEvent)
- `plugins/compound-v3` — only plugin v0
- `keepers/` — empty in v0; reserved
- `prototype/` — original visual reference

## Spec + plan

- Spec: `docs/superpowers/specs/2026-05-01-wishd-skeleton-design.md`
- Plan: `docs/superpowers/plans/2026-05-01-wishd-skeleton.md`

## Tests

```bash
pnpm test          # unit tests for pure functions
pnpm typecheck     # strict TS across workspaces
```

Integration is verified manually per the spec's verification section.
```

- [ ] **Step 3: Commit**

```bash
git add keepers/README.md README.md
git commit -m "docs: project + keepers readmes"
```

---

## Phase 7 — Verification

### Task 29: Workspace-wide typecheck + tests

- [ ] **Step 1: Typecheck all workspaces**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: all green. Test counts:
- `@wishd/plugin-sdk`: 2
- `@wishd/plugin-compound-v3`: 3
- `web`: 7 (3 amount + 1 plugin loader + 3 SSE parser)

- [ ] **Step 3: If failures, fix in place and re-run**

No commit if no fixes.

### Task 30: Manual end-to-end on Sepolia

This task is exercise-only. No code changes. Run through the full happy path.

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`
Expected: Next.js dev server up at http://localhost:3000.

- [ ] **Step 2: Open and connect Porto**

Open http://localhost:3000. Click "lend" chip. Watch the request fire.
Expected: Step 02 card appears showing "your supply, materialized" with amount=10 USDC, market=cUSDCv3.

- [ ] **Step 3: Click execute**

Step 03 card appears with state-machine button.
Expected: button label = "Connect Wallet" if wallet not connected, else "Approve" or "Deposit".

- [ ] **Step 4: Connect wallet**

Click "Connect Wallet". Porto popup. Approve. Account funded with Sepolia ETH + Sepolia USDC.
Expected: button flips to "Approve" (if no allowance) or "Deposit".

- [ ] **Step 5: If wrong chain**

Click "Switch Network". Confirm switch in wallet.
Expected: button updates.

- [ ] **Step 6: Approve**

Click "Approve". Approving… state. Wait for confirmation.
Expected: button flips to "Deposit".

- [ ] **Step 7: Deposit**

Click "Deposit". Depositing… state. Wait for confirmation.
Expected: terminal "confirmed" panel with green background, tx hash linking to Sepolia Etherscan.

- [ ] **Step 8: Etherscan check**

Click the tx hash link.
Expected: Etherscan shows the supply call to the Comet contract.

- [ ] **Step 9: Refresh and re-deposit**

Refresh the page. Type "deposit 5 USDC into Compound on Sepolia." Submit.
Expected: Approve step is skipped (allowance is now max). Direct path: connect → deposit → confirmed.

- [ ] **Step 10: Failure-mode spot checks**

  - **Disconnect wallet mid-flow:** button reverts to "Connect Wallet"
  - **Switch to wrong chain in wallet:** button reverts to "Switch Network"
  - **Insufficient USDC:** tx reverts; widget shows error message; agent loop unaffected (composer still works)
  - **Empty `ANTHROPIC_API_KEY`:** stop server, blank the env var, restart, submit a wish; expect an `error` SSE event surfaced in the UI (the workspace narration shows the error string)

- [ ] **Step 11: Plugin-shape sanity (optional but recommended)**

Briefly add `plugins/null-protocol/` with a manifest, no-op MCP, one trivial widget. Register in pluginLoader. App still builds and behaves identically. **Revert before final commit.**

- [ ] **Step 12: Final commit (if any docs/fixes were needed)**

```bash
git add -u
git commit -m "fix: post-verification adjustments"
```

If no changes needed, skip the commit.

---

## Self-review notes (post-write)

This section is the writer's checklist, not part of the executable plan.

**Spec coverage:**
- L0/L1/L2 implemented ✓ (Tasks 5, 9, 10, 16, 26, 27)
- L3 profile reserved ✓ (Task 21 reads users/<id>/CLAUDE.md if present)
- L4 events reserved ✓ (ServerEvent union includes notification.* — Task 3)
- Plugin SDK types ✓ (Task 3 — Plugin, Keeper, KhWorkflowJson, DelegationSpec, ServerEvent, WidgetSlot)
- Compound plugin v0 ✓ (Tasks 11–17 — addresses, ABIs, prepare, MCP, two widgets, manifest)
- Generic widget renderer MCP ✓ (Task 18)
- Decimals registry + helpers ✓ (Tasks 6, 7)
- wagmi + Porto Sepolia ✓ (Task 8)
- Workspace as `WidgetInstance[]` with slot ✓ (Task 9)
- ui.render | ui.patch | ui.dismiss in reader ✓ (Task 24 + WishComposer dispatch)
- System prompt with profile-read seam ✓ (Task 21)
- API route SSE ✓ (Task 23)
- WishComposer + StepCard primitive matching prototype ✓ (Tasks 10, 25)
- StepStack ✓ (Task 26)
- keepers/README ✓ (Task 28)
- README + env example ✓ (Tasks 1, 28)
- Manual verification ✓ (Task 30)

**No placeholders:** every code step has full code. No "TBD." Two acknowledged adjustment notes (Claude Agent SDK message shape narrowing in Task 22; wagmi hook signature differences in Task 16) — both marked as "verify after install" with concrete diagnostic commands. Acceptable given SDK volatility; not a TODO in the spec sense.

**Type consistency:** `WidgetInstance.slot` typed as `WidgetSlot` from plugin-sdk; ServerEvent.ui.render carries `slot?: WidgetSlot`; appendWidget signature matches. EventStream.parseSseChunk returns `ServerEvent[]` consistent with WishComposer dispatch.

**Open follow-ups (not blockers):**
- Resolved during self-review: CompoundSummary now embeds the prepared payload (`calls`, addresses, meta) in its `context.prepared` POST body. The agent's system prompt (Task 21) reads from `context.prepared` on the follow-up turn. No server-side session state needed for v0.

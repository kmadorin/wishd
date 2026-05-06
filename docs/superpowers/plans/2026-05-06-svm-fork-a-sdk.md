# Fork A — chain-agnostic plugin SDK (PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@wishd/plugin-sdk` with CAIP-2/10/19 chain identity, a discriminated `Call` union (EVM + Solana), and a formal `Prepared<TExtras>` return shape — then migrate `uniswap`, `compound-v3`, and `demo-stubs` to the new shape with **zero runtime behavior change**.

**Architecture:** Pure type-extension PR. New SDK files (`caip.ts`, `call.ts`, `ctx.ts`, `observation.ts`, `prepared.ts`, `explorers.ts`, `routes.ts`, plus `svm/`, `evm/`, `client/` subpaths) compose to a wider surface. `Manifest.chains` switches from `number[]` to CAIP-2 `string[]`. Web app gets a generic plugin-tool Next route mount, an array-keyed intent registry, a chain-family disambiguation min-rule in `prepareIntent.ts`, CAIP-10 keyed address book, and a CAIP-19 keyed token list. Three EVM plugins migrate by hand (small enough; no codemod needed).

**Tech Stack:** TypeScript, Next.js 15 App Router, viem, `@solana/kit` types (peer-dep only — no runtime add), `@solana/react-hooks` (peer-dep), zustand, vitest, `expectTypeOf` for type-level tests.

**Spec:** `docs/superpowers/specs/2026-05-06-svm-fork-a-sdk-design.md`

---

## File Structure

**New SDK files (`packages/plugin-sdk/src/`):**
- `caip.ts` — CAIP-2/10/19 parsers, builders, family guards, `humanizeChain`.
- `call.ts` — `EvmCall`, `SvmTxCall`, `SvmInstructionsCall` types + `isEvmCall`/`isSvmCall` guards.
- `ctx.ts` — `EvmCtx | SvmCtx` discriminated `PluginCtx` union.
- `observation.ts` — `Placeholder`, `LifiStatusObservation`, `Observation` union skeleton.
- `prepared.ts` — `Prepared<TExtras>` shape.
- `explorers.ts` — extensible explorer URL registry + `registerExplorer`.
- `routes.ts` — `registerPluginTool`, `handlePluginToolRoute`, `callPluginTool` client helper.
- `svm/priorityFees.ts` — `getPriorityFeeEstimate(rpc, accounts)`.
- `svm/blockhash.ts` — `isStale(staleAfter, nowMs?)` helper.
- `svm/react.ts` — re-exports of `@solana/react-hooks`.
- `svm/testing.ts` — `mockSolanaRpc()` + fixtures.
- `evm/react.ts` — re-exports of wagmi/viem hooks.
- `client/emit.ts` — zustand client emit bus + `useEmit()` hook.

**New SDK test files (co-located):**
- `caip.test.ts`, `call.test.ts`, `explorers.test.ts`, `prepared.test-d.ts` (type-level), `routes.test.ts`, `svm/priorityFees.test.ts`, `svm/blockhash.test.ts`, `svm/testing.test.ts`, `client/emit.test.ts`.

**Modified SDK files:**
- `packages/plugin-sdk/src/index.ts` — `Manifest.chains: string[]`, optional `primaryChainField`, `IntentField` `chain.options: string[]` (CAIP-2), `Call = EvmCall | SvmCall` re-export, `PluginCtx` union re-export, `Prepared` re-export, `ServerEvent.recovery` field.
- `packages/plugin-sdk/package.json` — add subpath exports (`./caip`, `./call`, `./svm/react`, `./svm/testing`, `./evm/react`, `./client/emit`, `./routes`); add `@solana/react-hooks` + `@solana/kit` as **peer** deps (optional).

**Modified workspace files:**
- `packages/wishd-tokens/src/types.ts` — add `caip19` field to `TokenInfo`.
- `packages/wishd-tokens/src/api.ts` — add `findByCaip19`, `listForChain(caip2)`.
- `packages/wishd-tokens/src/native.ts` — add canonical CAIP-19 ids (`eip155:<id>/slip44:60`, `solana:.../slip44:501`).
- `apps/web/lib/addressBook.ts` — re-key by CAIP-10; add `lookupCaip10`, `addressShort` accepts both EVM hex and base58.
- `apps/web/lib/intentRegistry.client.ts` — export `CLIENT_INTENT_REGISTRY: Map<string, RegisteredIntent[]>`.
- `apps/web/lib/prepareIntent.ts` — array-aware lookup with chain-family disambiguation min-rule.
- `apps/web/next.config.ts` — keep all existing `transpilePackages` entries (per `apps/web/CLAUDE.md` recurring trap).
- `plugins/uniswap/manifest.ts`, `plugins/uniswap/intents.ts`, `plugins/uniswap/prepare.ts`, `plugins/uniswap/types.ts` — CAIP-2 chains, `calls: Call[]` plural, `family: "evm"` + `caip2` on every Call literal.
- `plugins/compound-v3/manifest.ts`, `plugins/compound-v3/intents.ts`, `plugins/compound-v3/prepare.ts` — same.
- `plugins/demo-stubs/manifest.ts`, `plugins/demo-stubs/intents.ts` — same (no `prepare.ts`).

**New web file:**
- `apps/web/app/api/wish/[plugin]/[tool]/route.ts` — single mount, delegates to `handlePluginToolRoute`.

**Untouched:**
- `KeeperManifest.chains` stays `number[]` (deferred per spec).
- `lib/wagmi.ts`, layout, providers, all keeper code, all widgets.

---

## Phase A: SDK type primitives (CAIP, Call, Ctx, Observation, Prepared)

### Task A1: `caip.ts` — failing tests

**Files:**
- Test: `packages/plugin-sdk/src/caip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  EIP155, SOLANA_MAINNET, SOLANA_DEVNET,
  isEvmCaip2, isSvmCaip2, evmChainId, humanizeChain,
  parseCaip10, buildCaip10, parseCaip19,
} from "./caip";

describe("caip helpers", () => {
  it("EIP155 builds eip155:<id>", () => {
    expect(EIP155(1)).toBe("eip155:1");
    expect(EIP155(8453)).toBe("eip155:8453");
  });

  it("Solana mainnet/devnet constants are 32-char base58 prefixes", () => {
    expect(SOLANA_MAINNET).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(SOLANA_DEVNET).toBe("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  });

  it("isEvmCaip2 / isSvmCaip2 family guards", () => {
    expect(isEvmCaip2("eip155:1")).toBe(true);
    expect(isEvmCaip2(SOLANA_MAINNET)).toBe(false);
    expect(isSvmCaip2(SOLANA_MAINNET)).toBe(true);
    expect(isSvmCaip2("eip155:1")).toBe(false);
  });

  it("evmChainId extracts numeric id, throws on non-eip155", () => {
    expect(evmChainId("eip155:42161")).toBe(42161);
    expect(() => evmChainId(SOLANA_MAINNET)).toThrow(/eip155/);
  });

  it("humanizeChain returns label for known and raw caip2 for unknown", () => {
    expect(humanizeChain("eip155:1")).toBe("Ethereum");
    expect(humanizeChain("eip155:8453")).toBe("Base");
    expect(humanizeChain("eip155:11155111")).toBe("Sepolia");
    expect(humanizeChain(SOLANA_MAINNET)).toBe("Solana");
    expect(humanizeChain(SOLANA_DEVNET)).toBe("Solana Devnet");
    expect(humanizeChain("eip155:9999")).toBe("eip155:9999");
  });

  it("parseCaip10 / buildCaip10 round-trip", () => {
    const s = "eip155:1:0xAbC0000000000000000000000000000000000001";
    const p = parseCaip10(s);
    expect(p.caip2).toBe("eip155:1");
    expect(p.address).toBe("0xAbC0000000000000000000000000000000000001");
    expect(buildCaip10(p.caip2, p.address)).toBe(s);
  });

  it("parseCaip19 splits chain / namespace / reference", () => {
    const p = parseCaip19("eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    expect(p.caip2).toBe("eip155:1");
    expect(p.assetNamespace).toBe("erc20");
    expect(p.assetReference).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

    const sol = parseCaip19(`${SOLANA_MAINNET}/slip44:501`);
    expect(sol.caip2).toBe(SOLANA_MAINNET);
    expect(sol.assetNamespace).toBe("slip44");
    expect(sol.assetReference).toBe("501");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @wishd/plugin-sdk test -- caip
```

Expected: FAIL — module `./caip` not found.

### Task A2: `caip.ts` — implementation

**Files:**
- Create: `packages/plugin-sdk/src/caip.ts`

- [ ] **Step 1: Write the implementation**

```ts
export const EIP155 = (id: number): `eip155:${number}` => `eip155:${id}`;

export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;
export const SOLANA_DEVNET  = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;

const HUMAN_LABELS: Record<string, string> = {
  "eip155:1":         "Ethereum",
  "eip155:8453":      "Base",
  "eip155:42161":     "Arbitrum",
  "eip155:10":        "Optimism",
  "eip155:137":       "Polygon",
  "eip155:130":       "Unichain",
  "eip155:11155111":  "Sepolia",
  [SOLANA_MAINNET]:   "Solana",
  [SOLANA_DEVNET]:    "Solana Devnet",
};

export function isEvmCaip2(c: string): boolean { return c.startsWith("eip155:"); }
export function isSvmCaip2(c: string): boolean { return c.startsWith("solana:"); }

export function evmChainId(caip2: string): number {
  if (!isEvmCaip2(caip2)) throw new Error(`not an eip155 caip2: ${caip2}`);
  const n = Number(caip2.slice("eip155:".length));
  if (!Number.isInteger(n)) throw new Error(`malformed eip155 caip2: ${caip2}`);
  return n;
}

export function humanizeChain(caip2: string): string {
  return HUMAN_LABELS[caip2] ?? caip2;
}

export function parseCaip10(s: string): { caip2: string; address: string } {
  // CAIP-10: <namespace>:<reference>:<address>. Address may itself contain ':'? No — CAIP-10 disallows.
  const lastColon = s.lastIndexOf(":");
  if (lastColon < 0) throw new Error(`malformed caip10: ${s}`);
  return { caip2: s.slice(0, lastColon), address: s.slice(lastColon + 1) };
}

export function buildCaip10(caip2: string, address: string): string {
  return `${caip2}:${address}`;
}

export function parseCaip19(s: string): { caip2: string; assetNamespace: string; assetReference: string } {
  const slash = s.indexOf("/");
  if (slash < 0) throw new Error(`malformed caip19: ${s}`);
  const caip2 = s.slice(0, slash);
  const rest  = s.slice(slash + 1);
  const colon = rest.indexOf(":");
  if (colon < 0) throw new Error(`malformed caip19 asset part: ${rest}`);
  return { caip2, assetNamespace: rest.slice(0, colon), assetReference: rest.slice(colon + 1) };
}
```

- [ ] **Step 2: Run test, verify pass**

```bash
pnpm --filter @wishd/plugin-sdk test -- caip
```

Expected: 7 PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-sdk/src/caip.ts packages/plugin-sdk/src/caip.test.ts
git commit -m "feat(plugin-sdk): add CAIP-2/10/19 helpers"
```

### Task A3: `call.ts` — discriminated Call union + guards

**Files:**
- Test: `packages/plugin-sdk/src/call.test.ts`
- Create: `packages/plugin-sdk/src/call.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, expectTypeOf } from "vitest";
import type { Call, EvmCall, SvmCall, SvmTxCall, SvmInstructionsCall } from "./call";
import { isEvmCall, isSvmCall, isSvmTxCall, isSvmInstructionsCall } from "./call";

describe("Call discriminated union", () => {
  const evm: EvmCall = {
    family: "evm",
    caip2: "eip155:1",
    to: "0x0000000000000000000000000000000000000001",
    data: "0xdeadbeef",
    value: 0n,
  };
  const tx: SvmTxCall = {
    family: "svm",
    caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    kind: "tx",
    base64: "AAAA",
    lastValidBlockHeight: 1n,
  };
  const ix: SvmInstructionsCall = {
    family: "svm",
    caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    kind: "instructions",
    instructions: [],
    feePayer: "FrXc3Ux0000000000000000000000000000D1HyJ",
    lifetime: { kind: "blockhash", blockhash: "x", lastValidBlockHeight: 1n } as any,
  };

  it("isEvmCall narrows to EvmCall", () => {
    const v: Call = evm;
    if (isEvmCall(v)) expectTypeOf(v).toEqualTypeOf<EvmCall>();
    expect(isEvmCall(evm)).toBe(true);
    expect(isEvmCall(tx)).toBe(false);
  });

  it("isSvmCall narrows to SvmCall", () => {
    const v: Call = tx;
    if (isSvmCall(v)) expectTypeOf(v).toEqualTypeOf<SvmCall>();
    expect(isSvmCall(tx)).toBe(true);
    expect(isSvmCall(ix)).toBe(true);
    expect(isSvmCall(evm)).toBe(false);
  });

  it("isSvmTxCall vs isSvmInstructionsCall", () => {
    expect(isSvmTxCall(tx)).toBe(true);
    expect(isSvmTxCall(ix)).toBe(false);
    expect(isSvmInstructionsCall(ix)).toBe(true);
    expect(isSvmInstructionsCall(tx)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm --filter @wishd/plugin-sdk test -- call
```

- [ ] **Step 3: Implement `call.ts`**

```ts
import type { Address, Hex } from "viem";

// Solana types kept structural — no @solana/kit runtime import. Plugin authors
// pass kit-shaped values through. Avoids new runtime dep.
export type SvmInstruction = {
  programAddress: string;
  accounts: ReadonlyArray<{ address: string; role: number }>;
  data?: Uint8Array | string;
};

export type BlockhashLifetime = {
  kind: "blockhash";
  blockhash: string;
  lastValidBlockHeight: bigint;
};
export type DurableNonceLifetime = {
  kind: "nonce";
  nonceAccountAddress: string;
  nonceAuthorityAddress: string;
  nonceValue: string;
};

export type EvmCall = {
  family: "evm";
  caip2: string;
  to: Address;
  data: Hex;
  value: bigint;
};

export type SvmTxCall = {
  family: "svm";
  caip2: string;
  kind: "tx";
  base64: string;
  lastValidBlockHeight: bigint;
  staleAfter?: number;
};

export type SvmInstructionsCall = {
  family: "svm";
  caip2: string;
  kind: "instructions";
  instructions: SvmInstruction[];
  feePayer: string;
  lifetime: BlockhashLifetime | DurableNonceLifetime;
};

export type SvmCall = SvmTxCall | SvmInstructionsCall;
export type Call    = EvmCall | SvmCall;

export function isEvmCall(c: Call): c is EvmCall { return c.family === "evm"; }
export function isSvmCall(c: Call): c is SvmCall { return c.family === "svm"; }
export function isSvmTxCall(c: Call): c is SvmTxCall {
  return c.family === "svm" && c.kind === "tx";
}
export function isSvmInstructionsCall(c: Call): c is SvmInstructionsCall {
  return c.family === "svm" && c.kind === "instructions";
}
```

- [ ] **Step 4: Run, verify PASS, commit**

```bash
pnpm --filter @wishd/plugin-sdk test -- call
git add packages/plugin-sdk/src/call.ts packages/plugin-sdk/src/call.test.ts
git commit -m "feat(plugin-sdk): add discriminated Call union (EVM + SVM)"
```

### Task A4: `observation.ts` skeleton

**Files:**
- Create: `packages/plugin-sdk/src/observation.ts`

- [ ] **Step 1: Write the file**

```ts
export type Placeholder =
  | { from: "callResult"; index: number; field: "hash" | "signature" };

export type LifiStatusObservation = {
  family: "lifi-status";
  endpoint: string;
  query: {
    txHash: string | Placeholder;
    fromChain: string | number;
    toChain:   string | number;
    bridge?: string;
  };
  successWhen: { path: string; equals: string };
  failureWhen: { path: string; equalsAny: string[] };
  pollMs?: { initial: number; maxBackoff: number; factor: number };
  timeoutMs?: number;
  display: { title: string; fromLabel: string; toLabel: string };
};

// Union grows in PR3+: EvmEventLogObservation, SvmAccountWatchObservation, etc.
export type Observation = LifiStatusObservation;

export function isPlaceholder(v: unknown): v is Placeholder {
  return !!v && typeof v === "object" && (v as any).from === "callResult";
}
```

- [ ] **Step 2: Type-check; commit**

```bash
pnpm --filter @wishd/plugin-sdk typecheck
git add packages/plugin-sdk/src/observation.ts
git commit -m "feat(plugin-sdk): add Observation union skeleton + Placeholder"
```

### Task A5: `prepared.ts` + `ctx.ts`

**Files:**
- Create: `packages/plugin-sdk/src/prepared.ts`
- Create: `packages/plugin-sdk/src/ctx.ts`

- [ ] **Step 1: Write `prepared.ts`**

```ts
import type { Call } from "./call";
import type { Observation } from "./observation";

export type Prepared<TExtras extends Record<string, unknown> = {}> = TExtras & {
  calls: Call[];
  observations?: Observation[];
  staleAfter?: number;
};
```

- [ ] **Step 2: Write `ctx.ts`**

```ts
import type { PublicClient } from "viem";
import type { ServerEvent } from "./index";

// Solana RPC kept structural — peer-dep typing only.
export type SolanaRpcLike = {
  getBalance: (address: string) => { send: () => Promise<{ value: bigint }> };
  getBlockHeight: () => { send: () => Promise<bigint> };
  getSignatureStatuses: (sigs: string[]) => { send: () => Promise<unknown> };
  getRecentPrioritizationFees: (accounts?: string[]) => { send: () => Promise<Array<{ slot: bigint; prioritizationFee: number }>> };
  sendTransaction: (tx: string | Uint8Array) => { send: () => Promise<string> };
  getTokenAccountBalance: (address: string) => { send: () => Promise<{ value: { amount: string; decimals: number } }> };
};

export type Emit = (e: ServerEvent) => void;

export type EvmCtx = { family: "evm"; publicClient: PublicClient; emit: Emit };
export type SvmCtx = { family: "svm"; rpc: SolanaRpcLike; emit: Emit; caip2: string };

export type PluginCtx = EvmCtx | SvmCtx;

export function isEvmCtx(c: PluginCtx): c is EvmCtx { return c.family === "evm"; }
export function isSvmCtx(c: PluginCtx): c is SvmCtx { return c.family === "svm"; }
```

- [ ] **Step 3: Add type-level test `prepared.test-d.ts`**

`packages/plugin-sdk/src/prepared.test-d.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest";
import type { Prepared } from "./prepared";
import type { Call, EvmCall, SvmCall } from "./call";

describe("Prepared<TExtras>", () => {
  it("calls is required Call[]", () => {
    type P = Prepared;
    expectTypeOf<P["calls"]>().toEqualTypeOf<Call[]>();
  });

  it("extras merge into outer object", () => {
    type P = Prepared<{ initialQuote: string; balance: string }>;
    expectTypeOf<P["initialQuote"]>().toEqualTypeOf<string>();
    expectTypeOf<P["balance"]>().toEqualTypeOf<string>();
  });

  it("Call narrows by family", () => {
    const c: Call = {} as any;
    if (c.family === "evm") expectTypeOf(c).toEqualTypeOf<EvmCall>();
    else expectTypeOf(c).toEqualTypeOf<SvmCall>();
  });
});
```

- [ ] **Step 4: Run typecheck + tests, commit**

```bash
pnpm --filter @wishd/plugin-sdk typecheck
pnpm --filter @wishd/plugin-sdk test
git add packages/plugin-sdk/src/prepared.ts packages/plugin-sdk/src/ctx.ts packages/plugin-sdk/src/prepared.test-d.ts
git commit -m "feat(plugin-sdk): add Prepared<TExtras> + PluginCtx union + ctx guards"
```

### Task A6: Wire new types into `index.ts`

**Files:**
- Modify: `packages/plugin-sdk/src/index.ts`

- [ ] **Step 1: Update `Manifest`**

In `index.ts`, replace the `Manifest` definition:

```ts
export type Manifest = {
  name: string;
  version: string;
  chains: string[];          // CAIP-2 list (was number[])
  trust: TrustTier;
  /**
   * Optional. For plugins with multiple `chain`-typed IntentFields,
   * names the field whose CAIP-2 value drives ctx selection + disambiguation.
   * Default fallbacks (in order): single chain field → that one;
   * field named "fromChain" | "sourceChain" | "chain"; first chain field.
   */
  primaryChainField?: string;
  provides: {
    intents: string[];
    widgets: string[];
    mcps: string[];
  };
};
```

- [ ] **Step 2: Update `IntentField` `chain.options` semantics (no shape change)**

Keep `options: string[]` but document them as CAIP-2 values:

```ts
export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset"; required?: boolean; default?: string; options: string[] /* CAIP-19 ids */ }
  | { key: string; type: "chain"; required?: boolean; default: string; options: string[] /* CAIP-2 ids */ }
  | { key: string; type: "select"; required?: boolean; default: string; options: string[] };
```

- [ ] **Step 3: Replace `PluginCtx` and add `Call` re-export**

Remove the old object-shape `PluginCtx` and replace with re-exports:

```ts
export type { Call, EvmCall, SvmCall, SvmTxCall, SvmInstructionsCall } from "./call";
export {
  isEvmCall, isSvmCall, isSvmTxCall, isSvmInstructionsCall,
} from "./call";

export type { PluginCtx, EvmCtx, SvmCtx, Emit, SolanaRpcLike } from "./ctx";
export { isEvmCtx, isSvmCtx } from "./ctx";

export type { Prepared } from "./prepared";
export type { Observation, LifiStatusObservation, Placeholder } from "./observation";
export { isPlaceholder } from "./observation";

export * from "./caip";
```

- [ ] **Step 4: Add `recovery` to `ServerEvent` result variant**

Replace the result variant:

```ts
| {
    type: "result";
    ok: boolean;
    cost?: number;
    summary?: string;
    artifacts?: Array<{ kind: "tx"; caip2: string; hash: string }>;
    recovery?: { kind: "link"; url: string; label: string };
  }
```

- [ ] **Step 5: Keep the `Plugin` type compatible**

`Plugin.mcp(ctx: PluginCtx)` now takes the union — for EVM plugins this is a widening; their callsites narrow with `isEvmCtx`. We will fix the three plugins' MCP servers in Phase E. For now, run typecheck to surface the breakages and confirm they are isolated to plugin packages:

```bash
pnpm typecheck 2>&1 | tail -40
```

Expected: `@wishd/plugin-sdk` itself compiles; `plugins/uniswap`, `plugins/compound-v3`, `plugins/demo-stubs`, `apps/web` will have errors that Phase D/E fix.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-sdk/src/index.ts
git commit -m "feat(plugin-sdk): widen Manifest.chains to CAIP-2; re-export Call/Prepared/PluginCtx unions; add ServerEvent.recovery"
```

---

## Phase B: SDK helpers (explorers, routes, svm/evm subpaths, client emit)

### Task B1: Explorer registry

**Files:**
- Test: `packages/plugin-sdk/src/explorers.test.ts`
- Create: `packages/plugin-sdk/src/explorers.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { explorerTxUrl, explorerAddressUrl, registerExplorer } from "./explorers";
import { EIP155, SOLANA_MAINNET, SOLANA_DEVNET } from "./caip";

describe("explorer registry", () => {
  it("Etherscan tx + address", () => {
    expect(explorerTxUrl(EIP155(1), "0xabc")).toBe("https://etherscan.io/tx/0xabc");
    expect(explorerAddressUrl(EIP155(1), "0xdef")).toBe("https://etherscan.io/address/0xdef");
  });

  it("Base + Arbitrum + Optimism + Unichain + Sepolia covered", () => {
    expect(explorerTxUrl(EIP155(8453), "0x1")).toContain("basescan.org");
    expect(explorerTxUrl(EIP155(42161), "0x1")).toContain("arbiscan.io");
    expect(explorerTxUrl(EIP155(10), "0x1")).toContain("optimistic.etherscan.io");
    expect(explorerTxUrl(EIP155(130), "0x1")).toContain("uniscan.xyz");
    expect(explorerTxUrl(EIP155(11155111), "0x1")).toContain("sepolia.etherscan.io");
  });

  it("Solana mainnet + devnet (with cluster=devnet)", () => {
    expect(explorerTxUrl(SOLANA_MAINNET, "sigA")).toBe("https://solscan.io/tx/sigA");
    expect(explorerTxUrl(SOLANA_DEVNET,  "sigB")).toBe("https://solscan.io/tx/sigB?cluster=devnet");
    expect(explorerAddressUrl(SOLANA_DEVNET, "addrB")).toContain("?cluster=devnet");
  });

  it("registerExplorer extends without SDK edit", () => {
    registerExplorer({
      caip2: "eip155:42220",
      txUrl: (s) => `https://celoscan.io/tx/${s}`,
      addressUrl: (a) => `https://celoscan.io/address/${a}`,
    });
    expect(explorerTxUrl("eip155:42220", "0x9")).toBe("https://celoscan.io/tx/0x9");
  });

  it("unknown caip2 returns empty string", () => {
    expect(explorerTxUrl("eip155:99999", "x")).toBe("");
  });
});
```

- [ ] **Step 2: Run FAIL → implement → PASS**

```ts
// explorers.ts
import { EIP155, SOLANA_MAINNET, SOLANA_DEVNET } from "./caip";

export type ExplorerEntry = {
  caip2: string;
  txUrl: (sig: string) => string;
  addressUrl: (addr: string) => string;
};

const registry = new Map<string, ExplorerEntry>();

const eth = (root: string) => ({
  txUrl: (s: string) => `${root}/tx/${s}`,
  addressUrl: (a: string) => `${root}/address/${a}`,
});

registry.set(EIP155(1),         { caip2: EIP155(1),         ...eth("https://etherscan.io") });
registry.set(EIP155(8453),      { caip2: EIP155(8453),      ...eth("https://basescan.org") });
registry.set(EIP155(42161),     { caip2: EIP155(42161),     ...eth("https://arbiscan.io") });
registry.set(EIP155(10),        { caip2: EIP155(10),        ...eth("https://optimistic.etherscan.io") });
registry.set(EIP155(137),       { caip2: EIP155(137),       ...eth("https://polygonscan.com") });
registry.set(EIP155(130),       { caip2: EIP155(130),       ...eth("https://uniscan.xyz") });
registry.set(EIP155(11155111),  { caip2: EIP155(11155111),  ...eth("https://sepolia.etherscan.io") });
registry.set(SOLANA_MAINNET, {
  caip2: SOLANA_MAINNET,
  txUrl: (s) => `https://solscan.io/tx/${s}`,
  addressUrl: (a) => `https://solscan.io/account/${a}`,
});
registry.set(SOLANA_DEVNET, {
  caip2: SOLANA_DEVNET,
  txUrl: (s) => `https://solscan.io/tx/${s}?cluster=devnet`,
  addressUrl: (a) => `https://solscan.io/account/${a}?cluster=devnet`,
});

export function registerExplorer(e: ExplorerEntry): void { registry.set(e.caip2, e); }
export function explorerTxUrl(caip2: string, sig: string): string {
  return registry.get(caip2)?.txUrl(sig) ?? "";
}
export function explorerAddressUrl(caip2: string, addr: string): string {
  return registry.get(caip2)?.addressUrl(addr) ?? "";
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter @wishd/plugin-sdk test -- explorers
git add packages/plugin-sdk/src/explorers.ts packages/plugin-sdk/src/explorers.test.ts
git commit -m "feat(plugin-sdk): add extensible explorer URL registry"
```

### Task B2: Plugin-tool route helper

**Files:**
- Test: `packages/plugin-sdk/src/routes.test.ts`
- Create: `packages/plugin-sdk/src/routes.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { registerPluginTool, handlePluginToolRoute, _resetRegistryForTest } from "./routes";

describe("plugin-tool route", () => {
  beforeEach(() => _resetRegistryForTest());

  it("dispatches POST /api/wish/<plugin>/<tool> to registered fn", async () => {
    registerPluginTool("uniswap", "refresh_quote", async (body) => ({ echo: body }));
    const req = new Request("http://x/api/wish/uniswap/refresh_quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ echo: { a: 1 } });
  });

  it("returns 404 when plugin/tool not registered", async () => {
    const req = new Request("http://x/api/wish/missing/tool", { method: "POST", body: "{}" });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(404);
  });

  it("returns 500 when handler throws", async () => {
    registerPluginTool("p", "t", async () => { throw new Error("boom"); });
    const req = new Request("http://x/api/wish/p/t", { method: "POST", body: "{}" });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });

  it("rejects non-POST", async () => {
    const req = new Request("http://x/api/wish/p/t", { method: "GET" });
    const res = await handlePluginToolRoute(req);
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run FAIL → implement**

```ts
// routes.ts
type Handler = (body: unknown) => Promise<unknown>;
const registry = new Map<string, Handler>();
const key = (plugin: string, tool: string) => `${plugin}/${tool}`;

export function registerPluginTool(plugin: string, tool: string, fn: Handler): void {
  registry.set(key(plugin, tool), fn);
}

/** @internal */
export function _resetRegistryForTest(): void { registry.clear(); }

export async function handlePluginToolRoute(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // .../api/wish/<plugin>/<tool>
  const plugin = parts[parts.length - 2];
  const tool   = parts[parts.length - 1];
  const fn = plugin && tool ? registry.get(key(plugin, tool)) : undefined;
  if (!fn) {
    return new Response(JSON.stringify({ error: `unknown plugin tool: ${plugin}/${tool}` }), {
      status: 404, headers: { "content-type": "application/json" },
    });
  }
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  try {
    const out = await fn(body);
    return new Response(JSON.stringify(out ?? null), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

export async function callPluginTool<T = unknown>(plugin: string, tool: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/wish/${encodeURIComponent(plugin)}/${encodeURIComponent(tool)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? null),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json() as { error?: string }; if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 3: Run PASS → commit**

```bash
pnpm --filter @wishd/plugin-sdk test -- routes
git add packages/plugin-sdk/src/routes.ts packages/plugin-sdk/src/routes.test.ts
git commit -m "feat(plugin-sdk): add plugin-tool route helper + callPluginTool client"
```

### Task B3: `svm/blockhash.ts` + tests

**Files:**
- Test: `packages/plugin-sdk/src/svm/blockhash.test.ts`
- Create: `packages/plugin-sdk/src/svm/blockhash.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { isStale } from "./blockhash";

describe("isStale", () => {
  it("undefined staleAfter → never stale", () => {
    expect(isStale(undefined, 1_000_000)).toBe(false);
  });
  it("now < staleAfter → false", () => {
    expect(isStale(2_000, 1_000)).toBe(false);
  });
  it("now >= staleAfter → true", () => {
    expect(isStale(1_000, 1_000)).toBe(true);
    expect(isStale(500, 1_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// blockhash.ts
export function isStale(staleAfter: number | undefined, nowMs: number = Date.now()): boolean {
  if (staleAfter === undefined) return false;
  return nowMs >= staleAfter;
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter @wishd/plugin-sdk test -- blockhash
git add packages/plugin-sdk/src/svm/blockhash.ts packages/plugin-sdk/src/svm/blockhash.test.ts
git commit -m "feat(plugin-sdk): add svm/blockhash isStale helper"
```

### Task B4: `svm/priorityFees.ts` + tests

**Files:**
- Test: `packages/plugin-sdk/src/svm/priorityFees.test.ts`
- Create: `packages/plugin-sdk/src/svm/priorityFees.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { getPriorityFeeEstimate } from "./priorityFees";

describe("getPriorityFeeEstimate", () => {
  it("returns p75 of recent prioritization fees from rpc", async () => {
    const rpc = {
      getRecentPrioritizationFees: vi.fn(() => ({
        send: () => Promise.resolve([
          { slot: 1n, prioritizationFee: 100 },
          { slot: 2n, prioritizationFee: 200 },
          { slot: 3n, prioritizationFee: 300 },
          { slot: 4n, prioritizationFee: 400 },
        ]),
      })),
    } as any;
    const fee = await getPriorityFeeEstimate(rpc, []);
    // p75 of [100,200,300,400] = 350 (linear interp) — accept 300 as ceil index
    expect(fee).toBeGreaterThanOrEqual(300);
    expect(fee).toBeLessThanOrEqual(400);
  });

  it("returns 0 when rpc returns empty array", async () => {
    const rpc = {
      getRecentPrioritizationFees: vi.fn(() => ({ send: () => Promise.resolve([]) })),
    } as any;
    expect(await getPriorityFeeEstimate(rpc, [])).toBe(0);
  });

  it("forwards account list to rpc", async () => {
    const send = vi.fn(() => Promise.resolve([]));
    const rpc = { getRecentPrioritizationFees: vi.fn(() => ({ send })) } as any;
    await getPriorityFeeEstimate(rpc, ["addr1", "addr2"]);
    expect(rpc.getRecentPrioritizationFees).toHaveBeenCalledWith(["addr1", "addr2"]);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// priorityFees.ts
import type { SolanaRpcLike } from "../ctx";

export async function getPriorityFeeEstimate(
  rpc: Pick<SolanaRpcLike, "getRecentPrioritizationFees">,
  accounts: string[],
): Promise<number> {
  const fees = await rpc.getRecentPrioritizationFees(accounts).send();
  if (fees.length === 0) return 0;
  const sorted = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  return sorted[idx]!;
}
```

Note: Helius `getPriorityFeeEstimate` integration deferred to PR2 (when a real plugin needs it). PR1 ships the rpc-only path.

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter @wishd/plugin-sdk test -- priorityFees
git add packages/plugin-sdk/src/svm/priorityFees.ts packages/plugin-sdk/src/svm/priorityFees.test.ts
git commit -m "feat(plugin-sdk): add svm/priorityFees p75 helper"
```

### Task B5: `svm/testing.ts` mockSolanaRpc

**Files:**
- Test: `packages/plugin-sdk/src/svm/testing.test.ts`
- Create: `packages/plugin-sdk/src/svm/testing.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { mockSolanaRpc } from "./testing";

describe("mockSolanaRpc", () => {
  it("each method is a vi.fn returning { send } with overridable resolved value", async () => {
    const rpc = mockSolanaRpc();
    rpc.getBalance.mockReturnValueOnce({ send: () => Promise.resolve({ value: 42n }) } as any);
    expect(await rpc.getBalance("addr").send()).toEqual({ value: 42n });
  });

  it("default returns sensible empty shapes", async () => {
    const rpc = mockSolanaRpc();
    expect(await rpc.getRecentPrioritizationFees([]).send()).toEqual([]);
    expect(await rpc.getBlockHeight().send()).toEqual(0n);
  });

  it("sendTransaction default returns deterministic signature", async () => {
    const rpc = mockSolanaRpc();
    expect(await rpc.sendTransaction("xxx").send()).toBe("MOCK_SIG");
  });
});
```

- [ ] **Step 2: Implement**

```ts
// testing.ts
import { vi } from "vitest";
import type { SolanaRpcLike } from "../ctx";

export function mockSolanaRpc(): {
  [K in keyof SolanaRpcLike]: ReturnType<typeof vi.fn>;
} {
  const wrap = <T>(value: T) => ({ send: () => Promise.resolve(value) });
  return {
    getBalance:                  vi.fn(() => wrap({ value: 0n })),
    getBlockHeight:              vi.fn(() => wrap(0n)),
    getSignatureStatuses:        vi.fn(() => wrap({ value: [] })),
    getRecentPrioritizationFees: vi.fn(() => wrap([])),
    sendTransaction:             vi.fn(() => wrap("MOCK_SIG")),
    getTokenAccountBalance:      vi.fn(() => wrap({ value: { amount: "0", decimals: 0 } })),
  } as any;
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter @wishd/plugin-sdk test -- testing
git add packages/plugin-sdk/src/svm/testing.ts packages/plugin-sdk/src/svm/testing.test.ts
git commit -m "feat(plugin-sdk): add svm/testing mockSolanaRpc fixture"
```

### Task B6: `svm/react.ts` + `evm/react.ts` re-exports

**Files:**
- Create: `packages/plugin-sdk/src/svm/react.ts`
- Create: `packages/plugin-sdk/src/evm/react.ts`

- [ ] **Step 1: Write `svm/react.ts`**

```ts
"use client";

// Blessed re-exports so plugins import from one place.
// Peer dep — not a runtime dep of @wishd/plugin-sdk.
export {
  useSolanaClient,
  useWalletConnection,
  useWalletAccountTransactionSendingSigner,
  useStake,
  useSolTransfer,
  useWrapSol,
  useSplToken,
  useWallets,
  useWallet,
  useWalletStandardConnect,
  useWalletStandardDisconnect,
} from "@solana/react-hooks";
```

- [ ] **Step 2: Write `evm/react.ts`**

```ts
"use client";

export {
  useAccount,
  usePublicClient,
  useWalletClient,
  useSendTransaction,
  useConnect,
  useConnectors,
  useDisconnect,
} from "wagmi";
```

- [ ] **Step 3: Add to `package.json` exports**

Edit `packages/plugin-sdk/package.json` `exports` block to include subpaths. Add (preserving existing entries):

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./svm/react":   { "types": "./dist/svm/react.d.ts",   "import": "./dist/svm/react.js" },
    "./svm/testing": { "types": "./dist/svm/testing.d.ts", "import": "./dist/svm/testing.js" },
    "./svm/priorityFees": { "types": "./dist/svm/priorityFees.d.ts", "import": "./dist/svm/priorityFees.js" },
    "./svm/blockhash":    { "types": "./dist/svm/blockhash.d.ts",    "import": "./dist/svm/blockhash.js" },
    "./evm/react":   { "types": "./dist/evm/react.d.ts",   "import": "./dist/evm/react.js" },
    "./client/emit": { "types": "./dist/client/emit.d.ts", "import": "./dist/client/emit.js" },
    "./routes":      { "types": "./dist/routes.d.ts",      "import": "./dist/routes.js" }
  },
  "peerDependencies": {
    "@solana/react-hooks": "*",
    "wagmi": "*"
  },
  "peerDependenciesMeta": {
    "@solana/react-hooks": { "optional": true }
  }
}
```

(Keep existing entries; merge by hand. Do not remove `viem` or `react`.)

- [ ] **Step 4: Typecheck workspace**

```bash
pnpm --filter @wishd/plugin-sdk typecheck
```

Expected: PASS (the re-exports compile because `@solana/react-hooks` is installed in `apps/web` and hoisted by pnpm; if not hoisted, this task additionally requires `pnpm add -D @solana/react-hooks` in `packages/plugin-sdk`. Confirm with `pnpm why @solana/react-hooks`).

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-sdk/src/svm/react.ts packages/plugin-sdk/src/evm/react.ts packages/plugin-sdk/package.json
git commit -m "feat(plugin-sdk): add svm/react + evm/react blessed re-exports"
```

### Task B7: `client/emit.ts` zustand bus

**Files:**
- Test: `packages/plugin-sdk/src/client/emit.test.ts`
- Create: `packages/plugin-sdk/src/client/emit.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { _emitBusForTest, useEmitStore } from "./emit";

describe("client emit bus", () => {
  beforeEach(() => _emitBusForTest.reset());

  it("emit pushes event onto the queue", () => {
    const e = { type: "notification", level: "info", text: "hi" } as const;
    useEmitStore.getState().emit(e);
    expect(useEmitStore.getState().events).toEqual([e]);
  });

  it("clear() empties the queue", () => {
    useEmitStore.getState().emit({ type: "error", message: "x" });
    useEmitStore.getState().clear();
    expect(useEmitStore.getState().events).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// emit.ts
"use client";

import { create } from "zustand";
import type { ServerEvent } from "../index";

type State = {
  events: ServerEvent[];
  emit: (e: ServerEvent) => void;
  clear: () => void;
};

export const useEmitStore = create<State>((set) => ({
  events: [],
  emit:  (e) => set((s) => ({ events: [...s.events, e] })),
  clear: () => set({ events: [] }),
}));

export function useEmit(): (e: ServerEvent) => void {
  return useEmitStore((s) => s.emit);
}

/** @internal */
export const _emitBusForTest = {
  reset: () => useEmitStore.setState({ events: [] }),
};
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter @wishd/plugin-sdk test -- emit
git add packages/plugin-sdk/src/client/emit.ts packages/plugin-sdk/src/client/emit.test.ts
git commit -m "feat(plugin-sdk): add client/emit zustand bus + useEmit hook"
```

---

## Phase C: Tokens + address book migration

### Task C1: `@wishd/tokens` add `caip19` field + `findByCaip19`

**Files:**
- Modify: `packages/wishd-tokens/src/types.ts`
- Modify: `packages/wishd-tokens/src/native.ts`
- Modify: `packages/wishd-tokens/src/api.ts`
- Test: `packages/wishd-tokens/src/api.test.ts` (create or extend)

- [ ] **Step 1: Add `caip19` to `TokenInfo`**

In `types.ts`, add to the `TokenInfo` type:

```ts
export type TokenInfo = {
  // ...existing fields
  caip19: string;   // canonical CAIP-19 id
};
```

- [ ] **Step 2: Update native list with canonical CAIP-19**

In `native.ts`, every existing native entry must produce a `caip19` field:
- Native ETH on chain `<id>` → `caip19: "eip155:<id>/slip44:60"`.
- Native MATIC on Polygon (chainId 137) → `caip19: "eip155:137/slip44:966"`.
- Native SOL → `caip19: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501"` (added even though no Solana tokens exist yet, to lock the canonical id).

For ERC-20 entries currently flowing through merge logic, ensure synthesis derives `caip19` from `chainId` + address as `"eip155:<id>/erc20:<address>"`. Update `packages/wishd-tokens/src/merge.ts` to set the field on every output entry.

- [ ] **Step 3: Add `findByCaip19` and `listForChain` to `api.ts`**

```ts
export function findByCaip19(caip19: string): TokenInfo | undefined {
  return ALL_TOKENS.find((t) => t.caip19 === caip19);
}

export function listForChain(caip2: string): TokenInfo[] {
  return ALL_TOKENS.filter((t) => t.caip19.startsWith(caip2 + "/"));
}
```

(Use whatever `ALL_TOKENS` aggregator the package already exposes; do not introduce a new global. If there is no aggregator, build one from the existing `merge` output.)

- [ ] **Step 4: Test**

```ts
import { describe, it, expect } from "vitest";
import { findByCaip19, listForChain } from "./api";

describe("CAIP-19 token lookup", () => {
  it("returns native ETH on Ethereum mainnet", () => {
    const t = findByCaip19("eip155:1/slip44:60");
    expect(t?.symbol).toBe("ETH");
  });
  it("returns native SOL", () => {
    const t = findByCaip19("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501");
    expect(t?.symbol).toBe("SOL");
  });
  it("listForChain('eip155:1') returns >1 token and all share prefix", () => {
    const xs = listForChain("eip155:1");
    expect(xs.length).toBeGreaterThan(1);
    for (const t of xs) expect(t.caip19.startsWith("eip155:1/")).toBe(true);
  });
});
```

- [ ] **Step 5: Run, commit**

```bash
pnpm --filter @wishd/tokens test
pnpm --filter @wishd/tokens typecheck
git add packages/wishd-tokens/src
git commit -m "feat(tokens): add caip19 field + findByCaip19 + listForChain"
```

### Task C2: `apps/web/lib/addressBook.ts` CAIP-10 keying

**Files:**
- Modify: `apps/web/lib/addressBook.ts`
- Modify: `apps/web/lib/addressBook.test.ts`

- [ ] **Step 1: Update tests first (failing)**

Edit `addressBook.test.ts` to assert CAIP-10 lookup:

```ts
import { describe, it, expect } from "vitest";
import { lookupCaip10, addressShort } from "./addressBook";

describe("addressBook CAIP-10", () => {
  it("looks up Sepolia COMP token by caip10", () => {
    const c10 = "eip155:11155111:" + "0x2f535da74048c0874400f0371f5e2cf08bc69e26".toLowerCase();
    const e = lookupCaip10(c10);
    expect(e?.label).toBe("COMP");
    expect(e?.decimals).toBe(18);
  });

  it("returns null for unknown caip10", () => {
    expect(lookupCaip10("eip155:1:0x0000000000000000000000000000000000000000")).toBeNull();
  });

  it("addressShort works for EVM hex", () => {
    expect(addressShort("0x9e0f0000000000000000000000000000000bD92B")).toBe("0x9e0f…D92B");
  });

  it("addressShort works for base58 SVM", () => {
    expect(addressShort("FrXc3Ux0000000000000000000000000000D1HyJ")).toBe("FrXc3U…D1HyJ");
  });
});
```

(The current Sepolia COMP address constant is imported via `@wishd/keeper-auto-compound-comp/addresses`; substitute the real value when writing the test if `0x2f535...` differs.)

- [ ] **Step 2: Run, FAIL, implement**

Replace `addressBook.ts`:

```ts
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
} from "@wishd/keeper-auto-compound-comp/addresses";
import { buildCaip10, EIP155 } from "@wishd/plugin-sdk";

export type AddressEntry = { label: string; decimals?: number };

const sepolia = EIP155(11155111);

const map: Record<string, AddressEntry> = {
  [buildCaip10(sepolia, COMP_SEPOLIA.toLowerCase())]:           { label: "COMP", decimals: 18 },
  [buildCaip10(sepolia, USDC_SEPOLIA.toLowerCase())]:           { label: "USDC", decimals: 6 },
  [buildCaip10(sepolia, COMET_USDC_SEPOLIA.toLowerCase())]:     { label: "Compound · cUSDCv3" },
  [buildCaip10(sepolia, COMET_REWARDS_SEPOLIA.toLowerCase())]:  { label: "Compound · CometRewards" },
  [buildCaip10(sepolia, UNISWAP_ROUTER_SEPOLIA.toLowerCase())]: { label: "Uniswap V3 Router" },
};

export function lookupCaip10(caip10: string): AddressEntry | null {
  // case-insensitive on EVM hex address part only
  const i = caip10.lastIndexOf(":");
  if (i < 0) return null;
  const norm = caip10.slice(0, i + 1) + caip10.slice(i + 1).toLowerCase();
  return map[norm] ?? null;
}

/** Back-compat: keep a hex-only lookup that delegates to the new key (Sepolia by default). */
export function lookup(addr: `0x${string}`, caip2: string = sepolia): AddressEntry | null {
  return lookupCaip10(buildCaip10(caip2, addr.toLowerCase()));
}

const HEX_RE = /^0x[0-9a-fA-F]{40}$/;

export function addressShort(addr: string): string {
  if (HEX_RE.test(addr)) return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  // base58 / other
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-5)}`;
}
```

- [ ] **Step 3: Update existing callers**

Search for `lookup(` callsites:

```bash
grep -rn "from \"@/lib/addressBook\"\|from \"./addressBook\"" apps/web
```

For each callsite that imports the old `lookup`, leave the import alone — the back-compat shim accepts hex addresses and defaults to Sepolia, preserving today's behavior.

- [ ] **Step 4: Run web tests**

```bash
pnpm --filter web test -- addressBook
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/addressBook.ts apps/web/lib/addressBook.test.ts
git commit -m "feat(web): re-key addressBook by CAIP-10; keep hex shim"
```

---

## Phase D: Intent registry + Next route mount + prepareIntent disambiguation

### Task D1: Intent registry → `Map<verb, RegisteredIntent[]>`

**Files:**
- Modify: `apps/web/lib/intentRegistry.client.ts`
- Test: `apps/web/lib/intentRegistry.client.test.ts` (create)

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2: Implement**

Replace `intentRegistry.client.ts`:

```ts
import type { IntentSchema } from "@wishd/plugin-sdk";
import { compoundIntents } from "@plugins/compound-v3/intents";
import { uniswapIntents }  from "@plugins/uniswap/intents";

export type RegisteredIntent = {
  schema: IntentSchema;
  pluginName: string;
};

const sources: Array<{ pluginName: string; schemas: IntentSchema[] }> = [
  { pluginName: "compound-v3", schemas: compoundIntents },
  { pluginName: "uniswap",     schemas: uniswapIntents },
];

export const CLIENT_INTENT_REGISTRY: Map<string, RegisteredIntent[]> = (() => {
  const m = new Map<string, RegisteredIntent[]>();
  for (const { pluginName, schemas } of sources) {
    for (const schema of schemas) {
      const arr = m.get(schema.verb) ?? [];
      arr.push({ schema, pluginName });
      m.set(schema.verb, arr);
    }
  }
  return m;
})();

// Back-compat flat array — used by anything that currently iterates schemas.
export const CLIENT_INTENT_SCHEMAS: IntentSchema[] =
  [...CLIENT_INTENT_REGISTRY.values()].flat().map((r) => r.schema);
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter web test -- intentRegistry.client
git add apps/web/lib/intentRegistry.client.ts apps/web/lib/intentRegistry.client.test.ts
git commit -m "feat(web): expose CLIENT_INTENT_REGISTRY as Map<verb, RegisteredIntent[]>"
```

### Task D2: `prepareIntent.ts` array-aware + chain-family disambiguation min-rule

**Files:**
- Modify: `apps/web/lib/prepareIntent.ts`
- Modify: `apps/web/lib/prepareIntent.test.ts`

- [ ] **Step 1: Failing test — extend existing**

Add cases to `prepareIntent.test.ts` covering the new pure helper `resolveClaimant`:

```ts
import { describe, it, expect } from "vitest";
import { resolveClaimant } from "./prepareIntent";
import type { RegisteredIntent } from "./intentRegistry.client";

const evmSwap: RegisteredIntent = {
  pluginName: "uniswap",
  schema: {
    intent: "uniswap.swap", verb: "swap", description: "", widget: "w",
    fields: [{ key: "chain", type: "chain", required: true, default: "eip155:1", options: ["eip155:1", "eip155:8453"] }],
  },
};
const svmSwap: RegisteredIntent = {
  pluginName: "jupiter",
  schema: {
    intent: "jupiter.swap", verb: "swap", description: "", widget: "w",
    fields: [{ key: "chain", type: "chain", required: true, default: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", options: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"] }],
  },
};

describe("resolveClaimant", () => {
  it("single claimant short-circuits", () => {
    expect(resolveClaimant([evmSwap], { connectedFamilies: ["evm"], values: { chain: "eip155:1" } }).pluginName).toBe("uniswap");
  });

  it("disambiguates by chain field family when EVM connected", () => {
    const r = resolveClaimant([evmSwap, svmSwap], { connectedFamilies: ["evm"], values: { chain: "eip155:1" } });
    expect(r.pluginName).toBe("uniswap");
  });

  it("disambiguates by chain field family when SVM connected", () => {
    const r = resolveClaimant([evmSwap, svmSwap], { connectedFamilies: ["svm"], values: { chain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" } });
    expect(r.pluginName).toBe("jupiter");
  });

  it("throws when both wallets connected and both families claim", () => {
    expect(() =>
      resolveClaimant([evmSwap, svmSwap], { connectedFamilies: ["evm", "svm"], values: { chain: "eip155:1" } }),
    ).toThrow(/ambiguous/i);
  });

  it("throws when zero claimants", () => {
    expect(() => resolveClaimant([], { connectedFamilies: ["evm"], values: {} })).toThrow(/no plugin claims/i);
  });
});
```

- [ ] **Step 2: Run FAIL → implement**

Append to `prepareIntent.ts`:

```ts
import type { RegisteredIntent } from "./intentRegistry.client";
import { isEvmCaip2, isSvmCaip2 } from "@wishd/plugin-sdk";

export type ChainFamily = "evm" | "svm";

export type ResolveCtx = {
  connectedFamilies: ChainFamily[];   // wallets currently connected
  values: Record<string, unknown>;
};

function pickChainField(schema: RegisteredIntent["schema"], primaryKey: string | undefined): string | undefined {
  const chainFields = schema.fields.filter((f) => f.type === "chain");
  if (chainFields.length === 0) return undefined;
  if (primaryKey) {
    const hit = chainFields.find((f) => f.key === primaryKey);
    if (hit) return hit.key;
  }
  if (chainFields.length === 1) return chainFields[0]!.key;
  const named = chainFields.find((f) => /^(from|source)?chain$/i.test(f.key));
  return (named ?? chainFields[0]!).key;
}

function familyOf(caip2: string): ChainFamily | undefined {
  if (isEvmCaip2(caip2)) return "evm";
  if (isSvmCaip2(caip2)) return "svm";
  return undefined;
}

export function resolveClaimant(
  claimants: RegisteredIntent[],
  ctx: ResolveCtx,
  primaryKeyByPlugin: Record<string, string | undefined> = {},
): RegisteredIntent {
  if (claimants.length === 0) throw new Error("no plugin claims this intent");
  if (claimants.length === 1) return claimants[0]!;

  const candidates = claimants.filter((c) => {
    const k = pickChainField(c.schema, primaryKeyByPlugin[c.pluginName]);
    if (!k) return false;
    const v = ctx.values[k];
    if (typeof v !== "string") return false;
    const fam = familyOf(v);
    return !!fam && ctx.connectedFamilies.includes(fam);
  });

  if (candidates.length === 0) throw new Error("ambiguous intent: no claimant matches connected wallet family");
  if (candidates.length > 1) throw new Error("ambiguous intent: multiple claimants match connected wallets");
  return candidates[0]!;
}
```

The existing `prepareIntent` function (network call) is unchanged.

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter web test -- prepareIntent
git add apps/web/lib/prepareIntent.ts apps/web/lib/prepareIntent.test.ts
git commit -m "feat(web): add resolveClaimant chain-family disambiguation min-rule"
```

### Task D3: Generic plugin-tool Next route mount

**Files:**
- Create: `apps/web/app/api/wish/[plugin]/[tool]/route.ts`
- Test: `apps/web/app/api/wish/[plugin]/[tool]/route.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { registerPluginTool, _resetRegistryForTest } from "@wishd/plugin-sdk/routes";

describe("/api/wish/[plugin]/[tool] route", () => {
  beforeEach(() => _resetRegistryForTest());

  it("delegates to handlePluginToolRoute", async () => {
    registerPluginTool("uniswap", "ping", async () => ({ pong: true }));
    const res = await POST(new Request("http://x/api/wish/uniswap/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });
});
```

- [ ] **Step 2: Implement**

```ts
// route.ts
import { handlePluginToolRoute } from "@wishd/plugin-sdk/routes";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  return handlePluginToolRoute(req);
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm --filter web test -- api/wish
git add apps/web/app/api/wish
git commit -m "feat(web): mount generic plugin-tool Next route"
```

---

## Phase E: Migrate EVM plugins (uniswap, compound-v3, demo-stubs)

### Task E1: Uniswap manifest + intents → CAIP-2

**Files:**
- Modify: `plugins/uniswap/manifest.ts`
- Modify: `plugins/uniswap/intents.ts`
- Modify: `plugins/uniswap/intents.test.ts`

- [ ] **Step 1: Manifest CAIP-2**

Replace `plugins/uniswap/manifest.ts`:

```ts
import { type Manifest, EIP155 } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "uniswap",
  version: "0.0.0",
  chains: [
    EIP155(1), EIP155(8453), EIP155(42161), EIP155(10),
    EIP155(137), EIP155(130), EIP155(11155111),
  ],
  trust: "verified",
  provides: {
    intents: ["uniswap.swap"],
    widgets: ["swap-summary", "swap-execute"],
    mcps: ["uniswap"],
  },
};
```

- [ ] **Step 2: Intents — keep slug→chainId map, expose CAIP-2 options, add `caip2BySlug`**

Replace `intents.ts`:

```ts
import { type IntentSchema, EIP155 } from "@wishd/plugin-sdk";

export const SUPPORTED_CHAIN_SLUGS = [
  "ethereum", "base", "arbitrum", "optimism", "polygon", "unichain", "ethereum-sepolia",
] as const;

export const CHAIN_ID_BY_SLUG: Record<string, number> = {
  "ethereum":         1,
  "base":             8453,
  "arbitrum":         42161,
  "optimism":         10,
  "polygon":          137,
  "unichain":         130,
  "ethereum-sepolia": 11155111,
};

export const CAIP2_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(CHAIN_ID_BY_SLUG).map(([slug, id]) => [slug, EIP155(id)]),
);

const ASSET_OPTIONS = ["ETH", "USDC", "USDT", "WETH", "DAI", "WBTC", "MATIC"];

export const uniswapIntents: IntentSchema[] = [{
  intent: "uniswap.swap",
  verb: "swap",
  description: "exchange one token for another",
  fields: [
    { key: "amount",   type: "amount", required: true, default: "0.1" },
    { key: "assetIn",  type: "asset",  required: true, default: "ETH",  options: ASSET_OPTIONS },
    { key: "assetOut", type: "asset",  required: true, default: "USDC", options: ASSET_OPTIONS },
    {
      key: "chain", type: "chain", required: true,
      default: CAIP2_BY_SLUG["ethereum-sepolia"]!,
      options: SUPPORTED_CHAIN_SLUGS.map((s) => CAIP2_BY_SLUG[s]!),
    },
  ],
  connectors: { assetIn: "", assetOut: "to", chain: "on" },
  widget: "swap-summary",
  slot: "flow",
}];

export function validateSwapValues(v: { amount: string; assetIn: string; assetOut: string; chain: string }): void {
  // accept either CAIP-2 or legacy slug for one release
  const slugById = (caip2: string) =>
    Object.entries(CAIP2_BY_SLUG).find(([, c]) => c === caip2)?.[0];
  const slug = CHAIN_ID_BY_SLUG[v.chain] ? v.chain : slugById(v.chain);
  if (!slug || !CHAIN_ID_BY_SLUG[slug]) throw new Error(`unsupported chain: ${v.chain}`);
  if (v.assetIn === v.assetOut) throw new Error("pick two different assets");
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(v.amount)) throw new Error(`invalid amount: ${v.amount}`);
}
```

- [ ] **Step 3: Update existing tests**

In `intents.test.ts`, update the "rejects unknown chain slug" case if needed (passes "moonbeam"; still fine — neither slug nor caip2). Add a new case:

```ts
it("accepts CAIP-2 chain values", () => {
  expect(() => validateSwapValues({ amount: "1", assetIn: "ETH", assetOut: "USDC", chain: "eip155:8453" }))
    .not.toThrow();
});
```

- [ ] **Step 4: Run plugin tests**

```bash
pnpm --filter @wishd/plugin-uniswap test
```

Expected: PASS (slug path still works thanks to back-compat).

- [ ] **Step 5: Commit**

```bash
git add plugins/uniswap/manifest.ts plugins/uniswap/intents.ts plugins/uniswap/intents.test.ts
git commit -m "feat(uniswap): manifest+intents emit CAIP-2; keep slug back-compat"
```

### Task E2: Uniswap `prepare.ts` returns `Prepared<TExtras>`

**Files:**
- Modify: `plugins/uniswap/types.ts`
- Modify: `plugins/uniswap/prepare.ts`
- Modify: `plugins/uniswap/prepare.test.ts`
- Modify: `plugins/uniswap/strategies/*` (callsites that build Call literals)

- [ ] **Step 1: Update `types.ts`**

The plugin's local `Call` alias must align with the SDK's `EvmCall`. Replace:

```ts
import type { EvmCall, Prepared } from "@wishd/plugin-sdk";

export type Call = EvmCall;

export type SwapPreparedExtras = {
  config: SwapConfig;
  initialQuote: SwapQuote;
  initialQuoteAt: number;
  balance: string;
  insufficient: boolean;
  liquidityNote?: string;
  keeperOffers: KeeperOffer[];
};

export type SwapPrepared = Prepared<SwapPreparedExtras>;
```

(Keep `SwapConfig`, `SwapQuote`, `KeeperOffer` as-is.)

- [ ] **Step 2: Update strategies to emit `family: "evm"` + `caip2`**

Find every place strategies build a `Call`-shaped object:

```bash
grep -rn "approvalCall\|swapCall" plugins/uniswap/strategies plugins/uniswap/mcp
```

For each Call constructor, add the two fields. Example:

```ts
const approvalCall: Call = {
  family: "evm",
  caip2: EIP155(chainId),
  to: token,
  data: encoded,
  value: 0n,
};
```

- [ ] **Step 3: Replace `prepare.ts` return shape**

Edit `prepareSwap` so the return becomes:

```ts
return {
  calls: [approval.approvalCall, /* swap call gets appended at execute time today; uniswap currently
                                    only returns the approval Call. PR1 keeps that. */]
    .filter((c): c is Call => !!c),
  config,
  initialQuote: quote,
  initialQuoteAt: Date.now(),
  balance,
  insufficient,
  liquidityNote: chainId === 11155111 ? "Sepolia liquidity is sparse — preview only, this may revert on execute." : undefined,
  keeperOffers: STATIC_KEEPER_OFFERS,
} satisfies SwapPrepared;
```

If today's `prepare` exposes `approvalCall` directly to callers, also keep `approvalCall` in extras (`approvalCall: approval.approvalCall`) to avoid breaking widget reads — verify by searching:

```bash
grep -rn "\.approvalCall" plugins/uniswap apps/web
```

If callers exist, keep both `calls` AND `approvalCall` populated for one release.

- [ ] **Step 4: Update `prepare.test.ts`**

Adjust assertions to expect `result.calls.length >= 0` and `result.calls[0]?.family === "evm"` when an approval is needed. Keep all other existing assertions intact (they test extras unchanged).

- [ ] **Step 5: Run plugin + web tests**

```bash
pnpm --filter @wishd/plugin-uniswap test
pnpm --filter web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/uniswap/types.ts plugins/uniswap/prepare.ts plugins/uniswap/prepare.test.ts plugins/uniswap/strategies plugins/uniswap/mcp
git commit -m "feat(uniswap): return Prepared<TExtras>; tag Calls with family+caip2"
```

### Task E3: Uniswap MCP — narrow ctx with `isEvmCtx`

**Files:**
- Modify: `plugins/uniswap/mcp/server.ts` (or whatever `createUniswapMcp` lives in)

- [ ] **Step 1: Use the SDK ctx guard**

`PluginCtx` is now a union. The MCP factory must narrow:

```ts
import { isEvmCtx, type PluginCtx } from "@wishd/plugin-sdk";

export function createUniswapMcp(ctx: PluginCtx): { server: Server; serverName: string } {
  if (!isEvmCtx(ctx)) throw new Error("uniswap requires an EVM ctx");
  // existing body uses ctx.publicClient, ctx.emit
  ...
}
```

- [ ] **Step 2: Run plugin tests**

```bash
pnpm --filter @wishd/plugin-uniswap test
```

- [ ] **Step 3: Commit**

```bash
git add plugins/uniswap/mcp
git commit -m "fix(uniswap): narrow PluginCtx via isEvmCtx"
```

### Task E4: Compound-v3 manifest + intents + prepare migration

**Files:**
- Modify: `plugins/compound-v3/manifest.ts`
- Modify: `plugins/compound-v3/intents.ts`
- Modify: `plugins/compound-v3/prepare.ts`
- Modify: `plugins/compound-v3/intents.test.ts`, `prepare.test.ts`
- Modify: `plugins/compound-v3/mcp/*` (ctx narrowing)

- [ ] **Step 1: Manifest CAIP-2**

```ts
import { type Manifest, EIP155 } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "compound-v3",
  version: "0.0.0",
  chains: [EIP155(11155111)],
  trust: "verified",
  provides: {
    intents: ["deposit", "lend", "supply", "withdraw", "redeem"],
    widgets: ["compound-summary", "compound-execute", "compound-withdraw-summary"],
    mcps: ["compound"],
  },
};
```

- [ ] **Step 2: Intents — chain field options to CAIP-2**

For each compound intent that has a `chain` field, change `options` and `default` to CAIP-2 (`EIP155(11155111)`). If the existing intents do not include a `chain` field, this step is a no-op — verify by reading `compound-v3/intents.ts` first.

- [ ] **Step 3: `prepare.ts` `Prepared<TExtras>` shape**

Same pattern as uniswap. Build `calls: [approvalCall, supplyCall].filter(Boolean)` and tag each Call with `family: "evm"` + `caip2: EIP155(11155111)`. Define a `CompoundPrepared = Prepared<CompoundExtras>` alias.

- [ ] **Step 4: MCP `isEvmCtx` narrowing**

Same as uniswap.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @wishd/plugin-compound-v3 test
```

- [ ] **Step 6: Commit**

```bash
git add plugins/compound-v3
git commit -m "feat(compound-v3): migrate to CAIP-2 chains + Prepared<TExtras>"
```

### Task E5: Demo-stubs migration

**Files:**
- Modify: `plugins/demo-stubs/manifest.ts`
- Modify: `plugins/demo-stubs/intents.ts`
- Modify: `plugins/demo-stubs/intents.test.ts`

- [ ] **Step 1: Manifest CAIP-2**

```ts
import { type Manifest, EIP155 } from "@wishd/plugin-sdk";

export const manifest: Manifest = {
  name: "demo-stubs",
  version: "0.0.0",
  chains: [
    EIP155(11155111), EIP155(1), EIP155(8453),
    EIP155(42161), EIP155(10), EIP155(137),
  ],
  trust: "unverified",
  provides: {
    intents: ["borrow", "earn", "bridge", "find-vault"],
    widgets: ["borrow-demo", "earn-demo", "bridge-demo"],
    mcps: ["demo_stubs"],
  },
};
```

- [ ] **Step 2: Intents chain options to CAIP-2**

For any intent in `intents.ts` with a `chain` field, switch options + default to CAIP-2. Update tests accordingly.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @wishd/plugin-demo-stubs test
```

- [ ] **Step 4: Commit**

```bash
git add plugins/demo-stubs
git commit -m "feat(demo-stubs): migrate to CAIP-2 chains"
```

---

## Phase F: Workspace verification

### Task F1: Workspace typecheck + tests green

**Files:** none.

- [ ] **Step 1: Typecheck workspace**

```bash
pnpm typecheck
```

Expected: PASS across `@wishd/plugin-sdk`, `@wishd/tokens`, `@wishd/plugin-uniswap`, `@wishd/plugin-compound-v3`, `@wishd/plugin-demo-stubs`, `web`. If anything fails, fix in-place — do not loosen types. Common fix-ups will be in plugin widgets that read `prepared.approvalCall` directly; redirect them to `prepared.calls[0]` or keep the back-compat extra.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: PASS across workspace. No skips that weren't skipped before this PR.

- [ ] **Step 3: Web build**

```bash
pnpm --filter web build
```

Expected: PASS. The build exercise also catches the recurring "No QueryClient set" trap (`apps/web/CLAUDE.md`) — confirm `transpilePackages` still includes every `@wishd/plugin-*` and `@wishd/tokens`.

- [ ] **Step 4: Web smoke test**

```bash
pnpm --filter web dev
```

Open http://localhost:3000. Run a Sepolia uniswap swap intent end-to-end (the same one used to validate multi-wallet PR). Confirm:
- Wish composer accepts the input.
- Prepare round-trip succeeds.
- Approval / signing path through Porto works exactly as before.
- Widget renders without console errors.

Stop dev server.

- [ ] **Step 5: No new runtime deps in `@wishd/plugin-sdk`**

```bash
node -e "const p = require('./packages/plugin-sdk/package.json'); console.log(Object.keys(p.dependencies || {}))"
```

Expected: same set as before this PR (no `@solana/react-hooks`, `@solana/kit`, or zustand added to `dependencies`). Zustand was already a dep — confirm. New `@solana/react-hooks` lives only in `peerDependencies`.

- [ ] **Step 6: Final commit if anything moved**

If steps 1–5 surfaced fixes, commit. Otherwise skip.

```bash
git status
```

---

## Verification checklist (maps to spec acceptance criteria)

- [ ] All existing plugin tests pass with no logic changes — Tasks E1–E5 + F1 step 2.
- [ ] Type-level test: `Call` narrows to `EvmCall` / `SvmCall` by `family` — Task A5 step 3 (`prepared.test-d.ts`).
- [ ] `humanizeChain("eip155:1") === "Ethereum"`, `humanizeChain(SOLANA_MAINNET) === "Solana"` — Task A1.
- [ ] `explorerTxUrl(SOLANA_DEVNET, sig)` includes `?cluster=devnet` — Task B1.
- [ ] `registerExplorer({ caip2: "eip155:42220", ... })` adds Celo without SDK source edit — Task B1.
- [ ] `findByCaip19("solana:.../slip44:501")` returns native SOL entry — Task C1.
- [ ] Every migrated plugin returns `{ calls: Call[], ...extras }` with `calls` plural — Tasks E2, E4, E5.
- [ ] Disambiguation min-rule: `resolveClaimant` resolves verb-collision by chain field's CAIP-2 family — Task D2.
- [ ] `callPluginTool("uniswap", "any-tool", body)` POSTs to `/api/wish/uniswap/any-tool` — Tasks B2 + D3.
- [ ] `mockSolanaRpc()` from `@wishd/plugin-sdk/svm/testing` produces a typed mock — Task B5.
- [ ] `pnpm typecheck` clean across workspace — Task F1 step 1.
- [ ] `pnpm test` green across workspace — Task F1 step 2.
- [ ] No new runtime deps in `@wishd/plugin-sdk` — Task F1 step 5.
- [ ] Web smoke test: existing Sepolia uniswap swap works end-to-end — Task F1 step 4.
- [ ] `apps/web/CLAUDE.md` `transpilePackages` invariant preserved — Task F1 step 3.

---

## Out of scope (deferred to PR2 / PR3)

- **PR2 (`@wishd/plugin-jupiter`):** First real SVM plugin. Validates `SvmTxCall` end-to-end, blockhash refresh path, Jupiter priority-fee strategy, plugin-tool route consumer pattern.
- **PR3 (`@wishd/plugin-lifi`):** Pattern X cross-chain bridge. Validates `observations[]`, multi-chain-field intents, `Manifest.primaryChainField`, observation placeholder substitution, `recovery` UX, multi-leg observation polling.
- **Disambiguation UX spec:** Full clarifying-question flow in agent mode beyond the chain-family min-rule shipped here. Multi-claimant verbs that cannot be resolved by family will throw; that error becomes the trigger for the future UX.
- **Keeper SDK migration:** `KeeperManifest.chains` stays `number[]` (EVM subset). Solana keepers deferred — no SVM keeper exists yet to drive the design.
- **Trust tier reform:** Field stays as today (`"verified" | "community" | "unverified"`). All v1 plugins are first-party "verified".
- **Helius `getPriorityFeeEstimate` integration:** Stub returns rpc-only p75 in PR1. PR2 can add Helius branch when `HELIUS_API_KEY` is set, driven by Jupiter's needs.
- **Solana executor in the agent runtime:** PR1 ships SDK types only. The host app's executor that reads `prepared.calls`, signs Solana transactions via `useWalletAccountTransactionSendingSigner`, and substitutes observation placeholders is implemented in PR2 alongside the first SVM plugin.
- **`outputFileTracingRoot` / lockfile bridge guards:** Already pinned in `apps/web/next.config.ts` per existing CLAUDE.md note. PR1 must not touch these.
- **Codemod script:** Three plugins are small enough to migrate by hand. No codemod tooling shipped.
- **Dual-export tokens shim:** Hard-cut to CAIP-19. All consumers in the workspace; atomic rename.

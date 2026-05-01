# wishd `@wishd/tokens` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-01-wishd-tokens-design.md`

**Goal:** Ship a small workspace package `packages/wishd-tokens` that adopts the Uniswap Token Lists schema, sources prod-chain tokens from `@uniswap/default-token-list`, and adds a Sepolia override. Becomes the single source of truth for token metadata across the monorepo.

**Non-goals:** No logo CDN, no runtime token-API fetching, no contribution form, no consumer migrations (those ship in their own plans). Just the package + tests + an integration check from one consumer.

**Architecture:** One private workspace package. JSON-schema-validated merge of one upstream list + one or more overrides. Tiny ergonomic API exported from `src/index.ts`. Next.js + Vitest consume TypeScript sources directly via the existing workspace alias setup.

**Success criteria:**

1. `pnpm --filter @wishd/tokens test` passes — all overrides validate against the Uniswap schema, all API behaviours covered.
2. `pnpm typecheck` across the workspace passes.
3. `getToken(11155111, "USDC")` returns the Sepolia USDC address (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`).
4. `getToken(8453, "USDC")` returns Base USDC, sourced from upstream.
5. Adding a malformed entry to `overrides/sepolia.tokenlist.json` (e.g., a 41-char address) makes `pnpm test` fail.
6. The Compound deposit happy path on Sepolia still works after a one-line swap of the USDC address source from the local `addresses.ts` constant to `getToken(11155111, "USDC")!.address` (verified manually as the integration check; the migration itself ships in the swap plan or its own follow-up, but we exercise the API here).

---

## Phase 1 — Scaffold the package

### Task 1.1 — Create package skeleton

- [ ] Create `packages/wishd-tokens/package.json`:
  ```jsonc
  {
    "name": "@wishd/tokens",
    "version": "0.0.1",
    "private": true,
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "scripts": {
      "test":      "vitest run",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "@uniswap/default-token-list": "^11.0.0",
      "@uniswap/token-lists":         "^1.0.3",
      "ajv":                          "^8.12.0",
      "ajv-formats":                  "^2.1.1"
    },
    "devDependencies": {
      "vitest":     "<match repo root>",
      "typescript": "<match repo root>"
    }
  }
  ```
  Pin upstream versions to the latest stable at install time.
- [ ] Create `packages/wishd-tokens/tsconfig.json` extending `tsconfig.base.json` (mirror `packages/plugin-sdk/tsconfig.json`). Confirm `resolveJsonModule: true` is present in the inherited base; if not, override locally.
- [ ] Create `packages/wishd-tokens/README.md` — one paragraph: what the package is, link to the spec.
- [ ] Run `pnpm install` from the repo root. Verify `pnpm-lock.yaml` updated and the new dependencies resolved.
- **Verification:** `pnpm --filter @wishd/tokens typecheck` runs (will pass trivially with no code yet — confirms wiring).

### Task 1.2 — Confirm Next.js can resolve the package

- [ ] Read `apps/web/next.config.ts`. If `transpilePackages` exists, append `"@wishd/tokens"`. If `@wishd/plugin-sdk` is not already there, add both. If `transpilePackages` doesn't exist, add it with both entries.
- [ ] Run `pnpm --filter web typecheck` and `pnpm --filter web build` (or `dev` briefly). Build must succeed even though nothing imports `@wishd/tokens` yet.
- **Risk:** Next.js sometimes requires explicit `experimental.externalDir: true` for monorepo TS sources outside the app dir. Already working for `@wishd/plugin-sdk`, so the existing config likely covers us. Verify rather than assume.

---

## Phase 2 — Types and native registry

### Task 2.1 — Re-export Uniswap schema types

- [ ] Create `packages/wishd-tokens/src/types.ts`:
  ```ts
  import type { TokenInfo as UniswapTokenInfo, TokenList } from "@uniswap/token-lists";

  export type Address = `0x${string}`;
  export type TokenInfo = UniswapTokenInfo;
  export type { TokenList };
  ```
- **Verification:** `import type { TokenInfo } from "@wishd/tokens"` from a scratch file in `apps/web` resolves once Phase 4's index export is in place.

### Task 2.2 — Native token registry

- [ ] Create `packages/wishd-tokens/src/native.ts` per the spec's pinned table (Mainnet/Optimism/Unichain/Polygon/Base/Arbitrum/Sepolia, with `MATIC` for chainId 137). Export `NATIVE_PLACEHOLDER`, `NativeInfo`, `getNative(chainId)`. Pure data + one-function lookup.
- [ ] Unit test in `test/native.test.ts`: `getNative(137)?.symbol === "MATIC"`, `getNative(8453)?.wrappedSymbol === "WETH"`, `getNative(99999)` returns `undefined`.

---

## Phase 3 — Merge logic + validation

### Task 3.1 — Schema validation harness

- [ ] Create `packages/wishd-tokens/src/validate.ts`:
  ```ts
  import { schema } from "@uniswap/token-lists";
  import Ajv, { type ValidateFunction } from "ajv";
  import addFormats from "ajv-formats";
  import type { TokenList } from "./types";

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validator: ValidateFunction = ajv.compile(schema);

  export function validateTokenList(list: unknown): asserts list is TokenList {
    if (!validator(list)) {
      const messages = (validator.errors ?? []).map(e => `${e.instancePath} ${e.message}`).join("; ");
      throw new Error(`Token list failed schema validation: ${messages}`);
    }
  }
  ```
- [ ] Quick smoke test in `test/validate.test.ts`: feed a minimal valid list (from a fixture) → no throw; feed a list missing `version` → throws.

### Task 3.2 — Merge function

- [ ] Create `packages/wishd-tokens/src/merge.ts`:
  ```ts
  import type { TokenInfo, TokenList } from "./types";

  export function mergeTokenLists(base: TokenList, ...overrides: TokenList[]): TokenInfo[] {
    const map = new Map<string, TokenInfo>();
    const key = (t: TokenInfo) => `${t.chainId}:${t.address.toLowerCase()}`;
    for (const t of base.tokens) map.set(key(t), t);
    for (const o of overrides) {
      for (const t of o.tokens) map.set(key(t), t);     // overrides win
    }
    return [...map.values()];
  }
  ```
- [ ] Unit test in `test/merge.test.ts`:
  - Two lists with disjoint tokens → merged length is sum of inputs.
  - Override tokens replace base tokens on `(chainId, address)` collision (case-insensitive).
  - Empty override is a no-op.
  - Multiple overrides: last one wins on collision.

---

## Phase 4 — Public API

### Task 4.1 — Build the indexed registry

- [ ] Create `packages/wishd-tokens/src/api.ts`:
  ```ts
  import upstream from "@uniswap/default-token-list/build/uniswap-default.tokenlist.json";
  import sepolia  from "./overrides/sepolia.tokenlist.json";
  import { mergeTokenLists } from "./merge";
  import { validateTokenList } from "./validate";
  import type { Address, TokenInfo, TokenList } from "./types";

  // Validate at module load — surfaces malformed overrides immediately.
  validateTokenList(upstream as TokenList);
  validateTokenList(sepolia  as TokenList);

  const ALL: TokenInfo[] = mergeTokenLists(upstream as TokenList, sepolia as TokenList);

  const byChainSymbol  = new Map<string, TokenInfo>();
  const byChainAddress = new Map<string, TokenInfo>();
  const chainIds       = new Set<number>();
  for (const t of ALL) {
    byChainSymbol.set(`${t.chainId}:${t.symbol.toUpperCase()}`, t);
    byChainAddress.set(`${t.chainId}:${t.address.toLowerCase()}`, t);
    chainIds.add(t.chainId);
  }

  export function getToken(chainId: number, symbol: string): TokenInfo | undefined {
    return byChainSymbol.get(`${chainId}:${symbol.toUpperCase()}`);
  }

  export function getTokens(chainId: number): TokenInfo[] {
    return ALL.filter(t => t.chainId === chainId);
  }

  export function findByAddress(chainId: number, address: Address): TokenInfo | undefined {
    return byChainAddress.get(`${chainId}:${address.toLowerCase()}`);
  }

  export function listChains(): number[] {
    return [...chainIds].sort((a, b) => a - b);
  }
  ```
- **Note:** the JSON import path (`@uniswap/default-token-list/build/uniswap-default.tokenlist.json`) needs verification at install — package layout has changed historically. Alternative paths: `dist/uniswap-default.tokenlist.json` or `build/index.json`. Check `node_modules/@uniswap/default-token-list/package.json` `main` after install and adjust.

### Task 4.2 — Public index

- [ ] Create `packages/wishd-tokens/src/index.ts`:
  ```ts
  export * from "./api";
  export * from "./native";
  export type { TokenInfo, TokenList, Address } from "./types";
  ```

### Task 4.3 — Tests

- [ ] `test/api.test.ts`:
  - `getToken(11155111, "USDC")?.address.toLowerCase()` matches the pinned Sepolia USDC.
  - `getToken(11155111, "usdc")` (lowercase) returns the same token.
  - `getToken(8453, "USDC")` is defined and `chainId === 8453`.
  - `getToken(8453, "WBTC")` is defined (sanity for upstream coverage).
  - `getToken(1, "DOES_NOT_EXIST")` returns `undefined`.
  - `findByAddress(11155111, "0x1C7D4B196Cb0C7B01d743Fbc6116a902379C7238")` returns the same token (mixed-case address).
  - `getTokens(11155111).length >= 2` (USDC + WETH minimum).
  - `listChains()` includes at least `[1, 8453, 42161, 11155111]`.

---

## Phase 5 — Sepolia override

### Task 5.1 — Author the Sepolia override

- [ ] Create `packages/wishd-tokens/src/overrides/sepolia.tokenlist.json` per the spec template — at minimum: USDC and WETH on Sepolia. Pull the WETH9 address (`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`) from the prototype's existing reference; pull the USDC address from `plugins/compound-v3/addresses.ts` (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`).
- [ ] Set `version: { major: 0, minor: 0, patch: 1 }`, current ISO timestamp, `keywords: ["wishd", "sepolia", "testnet"]`.
- **Verification:** `pnpm --filter @wishd/tokens test` passes — the file validates and is picked up by the API tests.

### Task 5.2 — Override authoring docs

- [ ] Create `packages/wishd-tokens/src/overrides/README.md`:
  - When to add an override (upstream missing a token; needing a `logoURI` correction; testnet support).
  - Required schema fields (`name`, `address`, `symbol`, `decimals`, `chainId`).
  - Bump the override file's `version.patch` on every meaningful edit.
  - Reminder: `pnpm test` validates against the Uniswap schema; failures block CI.

---

## Phase 6 — Integration check

### Task 6.1 — Wire one consumer (read-only check, no migration)

- [ ] In a temporary scratch file under `apps/web/test/` (vitest test, not committed beyond the test if useful), import `@wishd/tokens` and assert `getToken(11155111, "USDC")?.address` matches the value currently exported from `plugins/compound-v3/addresses.ts`. This proves the alias chain works end-to-end without committing a real consumer migration yet.
- [ ] Run `pnpm test` from the workspace root. Both the package's own tests and the new web-side check pass.
- **If the Next.js dev server is started** (`pnpm dev`), confirm the existing Compound deposit page still loads and works. No actual code path uses `@wishd/tokens` yet at runtime.

### Task 6.2 — Final sanity

- [ ] Inspect bundle size delta: build `apps/web` before and after the package is added (even unused — Next.js may tree-shake heavily). Record the delta in the plan if non-trivial. Acceptable budget: under 30 KB increase to the gzipped client bundle. If higher, add a follow-up task to expose a client-side projection (`getTokensClient(chainId)` returning `{symbol, logoURI?}[]`) and import that in the composer.
- [ ] Commit. Suggested message:
  ```
  feat(wishd-tokens): add token registry package

  Workspace package built on the Uniswap Token Lists schema. Sources
  prod-chain tokens from @uniswap/default-token-list; adds a Sepolia
  override for USDC and WETH. Foundation for the swap plugin's
  multi-chain registry and Compound's address consolidation.
  ```

---

## Risks / open questions inline

- **Upstream import path.** `@uniswap/default-token-list` historically shipped under `dist/`, currently `build/`. The path in Task 4.1 may need adjustment after `pnpm install`. If the package only exports a `default` field for the JSON, switch to `import upstream from "@uniswap/default-token-list"` (the `main` field).
- **Schema strict mode.** `Ajv` v8 with `strict: false` accepts the Uniswap schema's older Draft-07 idioms. If we later upgrade Ajv to a stricter version, may need explicit `meta: false` or to vendor the schema.
- **JSON imports + Vitest.** Vitest defaults handle JSON imports; double-check by running the package's tests fresh after Phase 5.
- **CommonJS vs ESM in `@uniswap/token-lists`.** The `schema` named export must be reachable in ESM. If the package only exports CJS, fall back to `import * as TokenLists from "@uniswap/token-lists"; const schema = (TokenLists as any).schema ?? TokenLists.default?.schema;` and cast at the boundary. Keep the cast confined to `validate.ts`.
- **Symbol collisions on the same chain.** USDC.e vs USDC on Polygon/Arbitrum is a known gotcha. v0 uses whichever the upstream list canonicalises as `USDC`. Note in the override README that adding a `USDC.e` alias requires a per-chain decision — punt to the consumer (the swap plugin can offer both via `getTokens(chainId)` and let the user pick).
- **Stale upstream token lists.** Pinning `@uniswap/default-token-list` to a major-version range (`^11.0.0`) keeps us patch-current without breaking changes. Bump deliberately when adding new chains.

---

## File change map (recap)

```
NEW   packages/wishd-tokens/package.json
NEW   packages/wishd-tokens/tsconfig.json
NEW   packages/wishd-tokens/README.md
NEW   packages/wishd-tokens/src/index.ts
NEW   packages/wishd-tokens/src/types.ts
NEW   packages/wishd-tokens/src/merge.ts
NEW   packages/wishd-tokens/src/validate.ts
NEW   packages/wishd-tokens/src/native.ts
NEW   packages/wishd-tokens/src/api.ts
NEW   packages/wishd-tokens/src/overrides/sepolia.tokenlist.json
NEW   packages/wishd-tokens/src/overrides/README.md
NEW   packages/wishd-tokens/test/api.test.ts
NEW   packages/wishd-tokens/test/merge.test.ts
NEW   packages/wishd-tokens/test/validate.test.ts
NEW   packages/wishd-tokens/test/native.test.ts
NEW   packages/wishd-tokens/test/fixtures/synthetic.tokenlist.json
EDIT  apps/web/next.config.ts                                    # transpilePackages includes @wishd/tokens
```

Consumer migrations (Compound `addresses.ts`, swap plugin's per-chain registry, composer's asset dropdown) ship in their own plans, not here. The swap plan's "Token registry refactor" task should be replaced with consumer migrations onto `@wishd/tokens`.

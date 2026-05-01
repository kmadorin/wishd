# wishd — `@wishd/tokens` Package Design

**Date:** 2026-05-01
**Status:** Draft (pending user review)
**Scope:** Introduce a small workspace package, `packages/wishd-tokens`, that becomes the single source of truth for ERC-20 / native-token metadata across the monorepo. Built on the Uniswap Token Lists JSON-schema standard. Foundation for the swap plugin's multi-chain registry and a cleanup target for the Compound plugin's hardcoded addresses.

## Goal

Today wishd has token metadata sprinkled in `apps/web/lib/tokens.ts` (single chain, USDC only) and `plugins/compound-v3/addresses.ts` (Sepolia addresses + decimals). The swap plugin needs token data for ~5 assets across 7 chains, and the upcoming UI parity work needs an asset-dot icon mapping. Without consolidation we end up with three half-registries.

This package:

1. Adopts the **Uniswap Token Lists** specification (schema published at `https://uniswap.org/tokenlist.schema.json`, used by Uniswap, CoW Swap, LiFi, 1inch — the de-facto industry standard).
2. Sources prod-chain tokens from upstream `@uniswap/default-token-list` (auto-updates).
3. Adds an `overrides/` directory of hand-curated lists for chains the upstream undercovers (Sepolia, future testnets, and any non-default assets we want surfaced).
4. Validates merged output against the Uniswap schema via `ajv` at build time.
5. Exports a tiny ergonomic API (`getToken`, `getTokens`, `findByAddress`).

## Non-goals (this spec)

- No logo CDN — use upstream `logoURI` when present; UI keeps the prototype's stylized `asset-dot` classes for known symbols, falls back to `logoURI` for unknown.
- No runtime LiFi-style token-API fetching — purely static, bundled at build time.
- No tag taxonomy beyond what upstream provides (`stablecoin`, `wrapped-native`, etc.) — we don't author tags.
- No issue-form contribution flow (CoW pattern). Manual edits to overrides for v0.
- No bridge-info extensions — the schema supports them, we don't populate.
- No price feed — only static metadata (address, decimals, symbol, chainId, optional logoURI).

## Why this matters now

Listed in dependency order:

1. **Swap plugin** (`docs/superpowers/specs/2026-05-01-wishd-swap-design.md`) defines `plugins/uniswap/tokens.ts` as a per-chain `Record<chainId, Record<symbol, TokenInfo>>`. That registry is now redundant — replace with calls into `@wishd/tokens`.
2. **UI parity** asset pickers (`ActionPill variant="from|to"`) need a list of tokens per chain to populate the dropdown. They consume `getTokens(chainId)`.
3. **Compound plugin** Sepolia USDC is hardcoded. After this lands, `plugins/compound-v3/addresses.ts` reads from `@wishd/tokens` for the address; only the Comet/CometRewards/COMP addresses remain locally (those are protocol-specific, not token-registry data).

## Package shape

```
packages/wishd-tokens/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                 # public API (re-exports)
│   ├── types.ts                 # re-export Uniswap schema types + our narrow TokenInfo
│   ├── merge.ts                 # merge upstream + overrides → flat indexed map
│   ├── validate.ts              # ajv schema validation; runs in tests
│   ├── native.ts                # NATIVE_PLACEHOLDER (0x000…000) + per-chain native symbol/decimals
│   ├── api.ts                   # getToken / getTokens / findByAddress / listChains
│   └── overrides/
│       ├── sepolia.tokenlist.json     # Sepolia USDC + WETH + (future) test tokens
│       └── README.md                  # how/when to add an override
└── test/
    ├── api.test.ts                    # vitest unit tests for the public API
    ├── merge.test.ts                  # upstream + override merge edge cases
    ├── validate.test.ts               # every override file validates against schema
    └── fixtures/
        └── synthetic.tokenlist.json   # for merge tests; not shipped at runtime
```

`package.json`:

```jsonc
{
  "name": "@wishd/tokens",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "validate": "vitest run validate.test.ts"
  },
  "dependencies": {
    "@uniswap/default-token-list": "^11.0.0",
    "@uniswap/token-lists":         "^1.0.3",
    "ajv":                          "^8.12.0",
    "ajv-formats":                  "^2.1.1"
  }
}
```

(Versions pinned at first install; `pnpm-workspace.yaml` already lists `packages/*`.)

## Public API

```ts
// packages/wishd-tokens/src/types.ts
import type { TokenInfo as UniswapTokenInfo } from "@uniswap/token-lists";

export type Address = `0x${string}`;
export type TokenInfo = UniswapTokenInfo;        // { name, address, symbol, decimals, chainId, logoURI?, tags?, extensions? }

// packages/wishd-tokens/src/api.ts
export function getToken(chainId: number, symbol: string): TokenInfo | undefined;
export function getTokens(chainId: number): TokenInfo[];
export function findByAddress(chainId: number, address: Address): TokenInfo | undefined;
export function listChains(): number[];

// Native (ETH/MATIC/...) — represented by the zero address per Uniswap convention.
export const NATIVE_PLACEHOLDER: Address = "0x0000000000000000000000000000000000000000";
export type NativeInfo = { chainId: number; symbol: string; decimals: number; wrappedSymbol: string };
export function getNative(chainId: number): NativeInfo | undefined;
```

Symbol lookup is case-insensitive (`getToken(1, "usdc")` and `getToken(1, "USDC")` both succeed). Address lookup is case-insensitive against the lower-cased canonical.

`listChains()` returns the union of chain IDs present in the merged dataset. Used by the composer to enumerate `chain` field options.

## Data sources + merge order

1. **Upstream:** `@uniswap/default-token-list` ships a `dist/uniswap-default.tokenlist.json`. Loaded at build/bundle time, treated as the base layer.
2. **Overrides:** Every JSON file under `src/overrides/*.tokenlist.json`. Each must validate independently against the Uniswap schema. Tokens in overrides win on `(chainId, address)` collision (so we can patch upstream entries — e.g., correct an address or add a `logoURI`).
3. Merged result indexed in-memory at module load time:
   - `byChainSymbol: Map<string, TokenInfo>` keyed by `${chainId}:${symbol.toUpperCase()}`
   - `byChainAddress: Map<string, TokenInfo>` keyed by `${chainId}:${address.toLowerCase()}`
   - `chainIds: Set<number>`

Validation runs as part of `pnpm test` (specifically the `validate.test.ts` suite). Adding an override that fails the schema breaks tests immediately.

## Override file template

```jsonc
// packages/wishd-tokens/src/overrides/sepolia.tokenlist.json
{
  "name": "wishd Sepolia overrides",
  "timestamp": "2026-05-01T00:00:00.000Z",
  "version": { "major": 0, "minor": 0, "patch": 1 },
  "tags": {},
  "logoURI": "",
  "keywords": ["wishd", "sepolia", "testnet"],
  "tokens": [
    {
      "name": "USD Coin (Sepolia)",
      "address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      "symbol": "USDC",
      "decimals": 6,
      "chainId": 11155111,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48/logo.png"
    },
    {
      "name": "Wrapped Ether (Sepolia)",
      "address": "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      "symbol": "WETH",
      "decimals": 18,
      "chainId": 11155111,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png"
    }
  ]
}
```

The schema requires `name`, `timestamp`, `version`, `tokens` at the list level and `name`, `address`, `symbol`, `decimals`, `chainId` at the token level. `tags` and `logoURI` are optional but recommended.

## Native token handling

Uniswap's default list does not include native ETH/MATIC entries — only WETH/WMATIC. Conventions vary across DEXes (`0xeeee...eeee` and `0x000…000` both seen). We pin to `0x0000000000000000000000000000000000000000` for our internal use:

```ts
// packages/wishd-tokens/src/native.ts
export const NATIVE: Record<number, NativeInfo> = {
  1:        { chainId: 1,        symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"  },
  10:       { chainId: 10,       symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"  },
  130:      { chainId: 130,      symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"  },
  137:      { chainId: 137,      symbol: "MATIC", decimals: 18, wrappedSymbol: "WMATIC"},
  8453:     { chainId: 8453,     symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"  },
  42161:    { chainId: 42161,    symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"  },
  11155111: { chainId: 11155111, symbol: "ETH",   decimals: 18, wrappedSymbol: "WETH"  },
};
```

Consumers that want to display native ETH alongside ERC-20s call `getTokens(chainId)` then prepend a synthetic native entry built from `getNative(chainId)`. The swap plugin uses `NATIVE_PLACEHOLDER` directly when sending to the Trading API or when wrapping in the direct V3 strategy.

## Consumer migrations

| File | Before | After |
|------|--------|-------|
| `apps/web/lib/tokens.ts` | local `TOKENS` map (single chain, USDC) | `export * from "@wishd/tokens"` (re-export shim, optional helpers) |
| `apps/web/lib/amount.ts` | imports `TOKENS["11155111"].USDC` | imports `getToken(chainId, symbol)` |
| `plugins/compound-v3/addresses.ts` | hardcoded USDC address | `getToken(11155111, "USDC")!.address`; protocol addresses (Comet, CometRewards, COMP) stay local |
| `plugins/uniswap/tokens.ts` (per swap spec) | per-chain `Record` | replaced with `@wishd/tokens` calls; the file is deleted |
| `apps/web/components/wish/StructuredComposer.tsx` (and successor `ActionPill`) | hardcoded `USDC` option | reads `getTokens(chainId)`; asset dropdown auto-populated |
| `pnpm-workspace.yaml` | already covers `packages/*` | no change |

The migrations stay local to each consumer's task — this spec ships only the package itself.

## Build / runtime considerations

- The package is `private: true`; not published, internal workspace dep only.
- `main` and `types` point at `src/index.ts`. No separate build step. Next.js + Vitest both consume TS sources directly via the workspace alias chain (already established for `@wishd/plugin-sdk`).
- Module load reads `@uniswap/default-token-list/build/uniswap-default.tokenlist.json` (or whatever the published dist path is — confirm at install time) once. Merge is computed once and memoised; subsequent calls are O(1) map lookups.
- Bundle impact: full Uniswap default list is roughly 200 KB minified gzipped at the JSON level. We import only the merged result on the server (Next.js API routes) and a *symbol-only projection* in the client (composer only needs `{symbol, chainId, logoURI?}` for the picker). Provide `getTokensClient(chainId): { symbol, logoURI? }[]` to keep client bundle slim. Server uses full `getTokens` for address/decimals.

## Verification

1. `pnpm --filter @wishd/tokens test` — unit tests for `getToken`, `getTokens`, `findByAddress`, case-insensitive lookups, override-precedence rule, missing-chain returns `[]`/`undefined`. All overrides validate against the Uniswap schema.
2. `pnpm typecheck` across the workspace — types from `@uniswap/token-lists` flow through. No `any` in public API.
3. Manual sanity: `getToken(11155111, "USDC")` returns address `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`. `getToken(8453, "USDC")` returns Base USDC. `getToken(1, "WETH")` returns `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`.
4. Compound flow on Sepolia: switch the deposit widget to source `USDC` via `getToken`. End-to-end deposit completes unchanged.
5. Bundle inspection: client bundle increase < 30 KB after the symbol-only projection lands. (Manual: `pnpm --filter web build` and inspect `.next/static/.../page-*.js` size.)

## Open risks

1. **Upstream churn.** `@uniswap/default-token-list` updates might add or remove tokens between releases. Pin to a specific version in `package.json`; bump deliberately.
2. **Schema drift.** A future override that doesn't match the schema breaks tests but only at install time. CI must run `pnpm test` (not just `typecheck`).
3. **Symbol collisions across chains.** `USDC` legitimately exists on every chain with different addresses — `(chainId, symbol)` keying handles this. But the same symbol used by two different tokens *on the same chain* (rare; Bridge tokens like `USDC.e` vs native `USDC`) requires a chain-specific override that aliases or marks the canonical one. Document via overrides README.
4. **Package alias resolution under Next.js.** Workspace TS sources are imported directly today (no compile step). Next.js needs `transpilePackages: ["@wishd/tokens", "@wishd/plugin-sdk"]` in `next.config.ts`. Confirm `@wishd/plugin-sdk` is already there; if not, add both.
5. **Loading the upstream JSON.** `@uniswap/default-token-list` ships JSON in `build/uniswap-default.tokenlist.json`. JSON imports in Next.js + TS need `resolveJsonModule: true` in `tsconfig.json` — likely already set; verify.
6. **Override timestamp staleness.** Schema requires a `timestamp` field; we write it manually. Stale timestamps don't break anything, just look weird. Acceptable.

## Appendix — file change map

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
NEW   packages/wishd-tokens/src/overrides/README.md
NEW   packages/wishd-tokens/src/overrides/sepolia.tokenlist.json
NEW   packages/wishd-tokens/test/api.test.ts
NEW   packages/wishd-tokens/test/merge.test.ts
NEW   packages/wishd-tokens/test/validate.test.ts
NEW   packages/wishd-tokens/test/fixtures/synthetic.tokenlist.json
EDIT  apps/web/next.config.ts                                    # add to transpilePackages if missing
```

Consumer-side migrations (`apps/web/lib/*`, `plugins/compound-v3/addresses.ts`, swap-plan task 1) ship in their own plans, not here.

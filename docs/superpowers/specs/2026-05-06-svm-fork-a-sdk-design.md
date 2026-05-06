# Fork A: chain-agnostic plugin SDK (CAIP-2/19)

**Status:** brainstormed, pending review → implementation plan
**Scope:** SDK type extensions + codemod for existing EVM plugins. Zero new behavior. Existing flows unchanged. PR1 of a 3-PR sequence.
**Out of scope:** Solana plugins themselves (PR2: `@wishd/plugin-jupiter`), cross-chain plugin (PR3: Li.Fi), intent disambiguation (separate spec), Solana keepers (deferred).

## Goal

Extend `@wishd/plugin-sdk` so a plugin can target any chain family (EVM, Solana) and so a single plugin can span multiple families (cross-chain). Replace numeric EVM `chainId` everywhere in the SDK contract with CAIP-2 chain references. Replace EVM-only `Call` with a discriminated `Call` union covering EVM calls and Solana transactions/instructions. Migrate existing EVM plugins (uniswap, compound-v3, demo-stubs) via codemod with no behavior change — every existing test stays green.

The motivation is the cross-chain intent case: "swap 10 USDC on Ethereum to SOL on Solana via Li.Fi". Today the SDK can't represent that intent at all. After PR1 it can be expressed in types; PR2/PR3 implement actual plugins.

## Non-goals

- New runtime behavior beyond the minimum disambiguation rule below. PR1 is types + helpers + manual migration.
- Solana action implementations (deferred to PR2).
- Cross-chain bridge implementations (deferred to PR3).
- Full intent disambiguation UX (clarifying questions in agent mode). PR1 ships only the chain-family minimum rule needed by PR2; richer resolution stays a separate spec.
- Keeper SDK migration. `KeeperManifest.chains` stays `number[]` (EVM subset). Solana keepers deferred.
- Trust tier reform. Field stays as-is; v1 = all plugins first-party using existing `"verified"` tier.

## Decisions locked from brainstorm

| Q | Answer |
|---|---|
| Chain identity | CAIP-2 strings (`eip155:1`, `solana:5eykt4...`, `solana:EtWTRABZaYq...` for devnet). Tiny `humanizeChain()` helper for UI labels. |
| RPC strategy | Server prepares: env `SOLANA_RPC_URL_SERVER` (mainnet) + `SOLANA_RPC_URL_SERVER_DEVNET`, fall back to public `api.{mainnet-beta,devnet}.solana.com`. Client reads via existing `useSolanaClient()`. Plugins receive RPC via `PluginCtx`. |
| Signing surface | `SvmCall` discriminated union: `{ kind: "tx", base64, lastValidBlockHeight }` (REST plugins) or `{ kind: "instructions", instructions, feePayer, lifetime }` (program plugins). Executor handles both. |
| Prepare location | Server-side, matches uniswap pattern. |
| Asset model | Unified `@wishd/tokens` keyed by **CAIP-19** asset ids. Codemod existing entries. No separate `@wishd/svm-tokens`. |
| Address book | Unified, keyed by **CAIP-10** (`eip155:1:0x...`, `solana:.../<base58>`). Family-aware validators. |
| Cluster scope | Mainnet + devnet both supported. Devnet = different CAIP-2 reference, not a flag. |
| Intent registry | `Map<intent, IntentSchema[]>` — multi-claim allowed. Resolution deferred to disambiguation spec. |
| Cross-chain pattern | **Pattern X only**: one source-tx + observation. No multi-leg user signing in v1. Sufficient for Li.Fi demo. |
| Observation hosting | `Observation` discriminated union lives in PR1 SDK. PR3 contributes `LifiStatusObservation` variant; PR1 ships union skeleton + executor placeholder-substitution contract. |
| `prepare()` return shape | Formalized in PR1: `{ calls: Call[]; observations?: Observation[]; staleAfter?: number; ...pluginExtras }`. All plugins (existing EVM + new SVM/cross-chain) use `calls` plural even if length 1. |
| Disambiguation min-rule | PR1 ships minimum rule in `prepareIntent.ts`: when multiple plugins claim same verb, pick claimant whose `chain`-typed field's CAIP-2 family matches connected wallet (or, if multiple chain fields, the field named in `Manifest.primaryChainField` else first chain field). |
| Migration | Phased 3-PR: SDK types (this), Jupiter plugin, Li.Fi plugin. |
| Naming | `@wishd/plugin-jupiter`, `@wishd/plugin-lifi` — no chain prefix in pkg name. |
| Trust | Unchanged. |
| Widgets | Per-plugin widgets initially; extract shared primitives only after second SVM swap plugin lands. Visual coherence from `components/primitives/` + Tailwind tokens. |

## Decisions made by author (deferred-self choices)

### A. Blockhash freshness

Solana txs include a recent blockhash that expires (~150 slots, ~60 s). Jupiter REST returns a tx with their blockhash → may be stale by the time the user clicks Confirm.

Rule:
- `kind: "instructions"` plugins → executor compiles message + fresh blockhash at sign time. No staleness.
- `kind: "tx"` plugins → `prepared` MAY include `staleAfter: number` (epoch ms). Plugin SHOULD also expose an optional `refresh(prepared) → Promise<Prepared>` MCP tool. Executor checks `staleAfter` immediately before sign; if stale and `refresh` exists, calls it. If no `refresh`, attempts sign anyway and surfaces error.

Plugin authors: prefer `instructions` kind when feasible. Use `tx` only when REST returns a pre-built tx (Jupiter, Magic Eden, Tensor). Always set `staleAfter` and provide `refresh` for tx kind.

### D. Priority fees

Each plugin responsible for its own priority fees inside `prepare()`. Executor does NOT inject ComputeBudget ixs.

Reasons:
- Jupiter `/swap` accepts `prioritizationFeeLamports: "auto"` → defer to Jupiter.
- For `instructions` kind, plugin prepends `ComputeBudgetProgram.setComputeUnitPrice` ix using server-side fee estimate.
- Executor injection wouldn't work for `tx` kind anyway (tx is already compiled).
- Plugin-owned = plugin chooses fee strategy (aggressive for arb, polite for stake).

SDK ships `@wishd/plugin-sdk/svm/priorityFees`: `getPriorityFeeEstimate(rpc, accounts)` helper that wraps `getRecentPrioritizationFees` + Helius's `getPriorityFeeEstimate` if `HELIUS_API_KEY` env set. Plugins call it; executor doesn't.

### E. Explorer URL — extensible registry

Future-proof against more chains. Plugin SDK ships:

```ts
type ExplorerEntry = {
  caip2: string;
  txUrl: (sig: string) => string;
  addressUrl: (addr: string) => string;
};

export const explorers: Record<string, ExplorerEntry>;  // keyed by caip2
export function explorerTxUrl(caip2: string, sig: string): string;
export function explorerAddressUrl(caip2: string, addr: string): string;
export function registerExplorer(entry: ExplorerEntry): void;  // host app or plugin can extend
```

Defaults: Ethereum, Base, Arbitrum, Optimism, Unichain, Sepolia (Etherscan family); Solana mainnet + devnet (Solscan, with `?cluster=devnet` for devnet). Adding a chain = one `registerExplorer` call. No SDK PR required to support a new chain.

### G. Testing strategy

- **Unit tests (default, run in CI)**: vitest with mocked `@solana/client` RPC and mocked Jupiter/Li.Fi REST. Mirrors uniswap's mocked-viem approach.
- **Integration tests (opt-in, manual run)**: vitest tag `@integration`. Runs against devnet. CI doesn't run by default to avoid flakiness. `pnpm test:integration` in plugin packages. Documented in plugin READMEs.
- **No mainnet integration tests** — too risky.

PR1 itself ships only type-level tests (tsd or `expectTypeOf`) plus the codemod's regression tests (existing plugin tests stay green).

### H. Intent registry shape

```ts
// before
export const CLIENT_INTENT_SCHEMAS: IntentSchema[] = [...]

// after
export type RegisteredIntent = {
  schema: IntentSchema;
  pluginName: string;
};

export const CLIENT_INTENT_REGISTRY: Map<string, RegisteredIntent[]>;
//                                       ^ intent verb → plugins claiming it
```

Today every intent claimed by exactly one plugin → array length 1. Future Jupiter swap + Uniswap swap → array length 2 under verb `swap` (if we generalize). Disambiguation logic = separate spec. Registry shape supports it now; consumers in `prepareIntent.ts` updated to handle array (currently length-1).

## Architecture

### File-level changes

```
packages/plugin-sdk/src/
  index.ts                  ← types extended (Manifest, PluginCtx, Call union, IntentField, Prepared, ServerEvent)
  caip.ts          [new]    ← parse/build CAIP-2/10/19, isEvm/isSvm guards, humanizeChain
  call.ts          [new]    ← EvmCall, SvmCall, SvmTxCall, SvmInstructionsCall types + guards
  ctx.ts           [new]    ← PluginCtx union (EvmCtx | SvmCtx)
  observation.ts   [new]    ← Observation union skeleton + Placeholder substitution types
  prepared.ts      [new]    ← Prepared<TExtras> return shape
  explorers.ts     [new]    ← extensible explorer URL registry
  routes.ts        [new]    ← per-plugin Next route helper (factory) + callPluginTool client helper
  svm/
    priorityFees.ts [new]   ← getPriorityFeeEstimate helper
    blockhash.ts    [new]   ← stale check helper
    react.ts        [new]   ← blessed @solana/react-hooks re-exports
    testing.ts      [new]   ← mockSolanaRpc() + fixtures
  evm/
    react.ts        [new]   ← blessed wagmi/viem re-exports for parity
  client/
    emit.ts         [new]   ← client-side emit bus (zustand) for plugin widgets

packages/wishd-tokens/src/
  index.ts                  ← entries re-keyed to CAIP-19; findByCaip19() helper; lock SOL = `slip44:501`

apps/web/lib/
  addressBook.ts            ← CAIP-10 keyed; family validators
  intentRegistry.client.ts  ← exports Map<string, RegisteredIntent[]>
  prepareIntent.ts          ← array-aware lookup + chain-family disambiguation min-rule

apps/web/app/api/wish/[plugin]/[tool]/route.ts  [new]
                            ← Next route handler factory; POST forwards JSON to plugin's exported server fn

plugins/{uniswap,compound-v3,demo-stubs}/
  manifest.ts               ← chains: number[] → string[] CAIP-2  (manual edit)
  intents.ts                ← chain.options: string[] CAIP-2  (manual edit)
  prepare.ts                ← return Prepared shape; calls plural; family/caip2 on Call literals
```

### Type changes (concrete)

```ts
// SDK index.ts
import type { EvmCall, SvmCall } from "./call";
export type Call = EvmCall | SvmCall;  // discriminated by `family`

export type Manifest = {
  name: string;              // slug, e.g. "uniswap", "jupiter", "lifi" — NOT pkg name
  version: string;
  chains: string[];          // CAIP-2 list, was number[]
  trust: TrustTier;          // existing union: "verified" | "community" | "unverified"
  /**
   * Optional. For plugins with multiple `chain`-typed IntentFields (cross-chain),
   * names the field whose CAIP-2 value drives ctx selection + disambiguation.
   * Defaults: single chain field → that one; multiple → field named "fromChain"
   * | "sourceChain" | "chain"; else first chain field encountered.
   */
  primaryChainField?: string;
  provides: {
    intents: string[];
    widgets: string[];
    mcps: string[];
  };
};

export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset";  required?: boolean; default?: string; options: string[] /* CAIP-19 ids */ }
  | { key: string; type: "chain";  required?: boolean; default: string;   options: string[] /* CAIP-2 ids */ }
  | { key: string; type: "select"; required?: boolean; default: string;   options: string[] };

export type PluginCtx =
  | { family: "evm"; publicClient: PublicClient; emit: Emit }
  | { family: "svm"; rpc: SolanaRpc;             emit: Emit; caip2: string };
// `multi` ctx for cross-chain plugins added in PR3 only if Li.Fi plugin actually needs it.
// Today Li.Fi plugin can declare family: "evm" (source-chain) since destination is observation-only.

// call.ts
export type EvmCall = {
  family: "evm";
  caip2: string;             // e.g. "eip155:1"
  to: Address;
  data: Hex;
  value: bigint;
};

export type SvmTxCall = {
  family: "svm";
  caip2: string;
  kind: "tx";
  base64: string;            // serialized VersionedTransaction
  /**
   * Slot height at which blockhash expires. Plugins MUST `BigInt(...)` REST
   * responses (Jupiter, etc.) at the boundary — type stays strict bigint.
   */
  lastValidBlockHeight: bigint;
  /** Epoch ms after which executor should call plugin.refresh() before signing. */
  staleAfter?: number;
};

export type SvmInstructionsCall = {
  family: "svm";
  caip2: string;
  kind: "instructions";
  instructions: Instruction[];   // @solana/instructions
  feePayer: Address;             // base58
  lifetime: BlockhashLifetime | DurableNonceLifetime;
};

export type SvmCall = SvmTxCall | SvmInstructionsCall;

// observation.ts — Pattern X cross-chain hosted in PR1 SDK.
// PR3 contributes `LifiStatusObservation` variant; future plugins can add more.
export type Placeholder =
  | { from: "callResult"; index: number; field: "hash" | "signature" };

export type LifiStatusObservation = {
  family: "lifi-status";
  endpoint: string;
  query: { txHash: string | Placeholder; fromChain: string | number; toChain: string | number; bridge?: string };
  successWhen: { path: string; equals: string };
  failureWhen: { path: string; equalsAny: string[] };
  pollMs?: { initial: number; maxBackoff: number; factor: number };
  timeoutMs?: number;
  display: { title: string; fromLabel: string; toLabel: string };
};

export type Observation = LifiStatusObservation;
//                        ^ union grows: EvmEventLogObservation, SvmAccountWatchObservation, etc.

// prepared.ts — formal return shape for every plugin's prepare()
export type Prepared<TExtras extends Record<string, unknown> = {}> = TExtras & {
  calls: Call[];                    // length >= 1; single-call plugins return [oneCall]
  observations?: Observation[];     // Pattern X: poll off-chain after calls submit
  staleAfter?: number;              // epoch ms; executor refreshes if exceeded
};

// ServerEvent (additive — `recovery` on result variant)
export type ServerEvent =
  | { type: "chat.delta"; delta: string }
  | { type: "tool.call"; name: string; input: unknown }
  | { type: "ui.render"; widget: { id: string; type: string; slot?: WidgetSlot; props: unknown } }
  | { type: "ui.patch"; id: string; props: Record<string, unknown> }
  | { type: "ui.dismiss"; id: string }
  | { type: "notification"; level: "info" | "warn" | "error"; text: string }
  | {
      type: "result";
      ok: boolean;
      cost?: number;
      summary?: string;
      artifacts?: Array<{ kind: "tx"; caip2: string; hash: string }>;
      /** Failure-path action user can take. Surfaced as a link/button in the result UI. */
      recovery?: { kind: "link"; url: string; label: string };
    }
  | { type: "error"; message: string };
```

### `prepare()` output

Every plugin returns `Prepared<TExtras>` from `@wishd/plugin-sdk`. `calls` is plural even for single-call plugins (uniformity simplifies executor). Plugin-specific data lives in `TExtras` (e.g. uniswap's `{ config, initialQuote, balance, insufficient, keeperOffers }`).

Migrated EVM plugins: rename their `approvalCall` + `swapCall` shape to `calls: [approvalCall, swapCall].filter(Boolean)`. Plugin-specific fields stay where they were under `TExtras`.

Cross-chain plugins (PR3) populate `observations[]`. Single-chain plugins omit it.

### CAIP helpers

```ts
// caip.ts
export const EIP155 = (id: number) => `eip155:${id}` as const;
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_DEVNET  = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

export function isEvmCaip2(caip2: string): boolean;
export function isSvmCaip2(caip2: string): boolean;
export function evmChainId(caip2: string): number;       // throws if not eip155
export function humanizeChain(caip2: string): string;    // "Ethereum" | "Solana" | ...
export function parseCaip10(s: string): { caip2: string; address: string };
export function buildCaip10(caip2: string, address: string): string;
export function parseCaip19(s: string): { caip2: string; assetNamespace: string; assetReference: string };
```

### Explorer registry

```ts
// explorers.ts
type ExplorerEntry = {
  caip2: string;
  txUrl: (sig: string) => string;     // param named `sig` — works for both EVM tx hash and Solana signature
  addressUrl: (addr: string) => string;
};
const registry = new Map<string, ExplorerEntry>();
registry.set(EIP155(1),       { caip2: EIP155(1), txUrl: s => `https://etherscan.io/tx/${s}`, addressUrl: a => `https://etherscan.io/address/${a}` });
registry.set(SOLANA_MAINNET,  { ..., txUrl: s => `https://solscan.io/tx/${s}`, addressUrl: a => `https://solscan.io/account/${a}` });
registry.set(SOLANA_DEVNET,   { ..., txUrl: s => `https://solscan.io/tx/${s}?cluster=devnet`, ... });
// + Base, Arb, Optimism, Unichain, Sepolia
export function explorerTxUrl(caip2: string, sig: string)      { return registry.get(caip2)?.txUrl(sig)      ?? ""; }
export function explorerAddressUrl(caip2: string, addr: string) { return registry.get(caip2)?.addressUrl(addr) ?? ""; }
export function registerExplorer(e: ExplorerEntry)             { registry.set(e.caip2, e); }
```

### Per-plugin Next route helper

Plugin widgets need to call plugin server functions (e.g. `refresh_swap`, `refresh_quote`) without round-tripping through the agent loop. SDK ships a generic factory; one Next route mount serves all plugins.

```ts
// apps/web/app/api/wish/[plugin]/[tool]/route.ts (single mount, generic)
import { handlePluginToolRoute } from "@wishd/plugin-sdk/routes";
export const POST = handlePluginToolRoute;   // resolves plugin → tool → server fn from registry

// @wishd/plugin-sdk/routes.ts
export type PluginToolRegistration = (plugin: string, tool: string, fn: (body: unknown) => Promise<unknown>) => void;
export const registerPluginTool: PluginToolRegistration;          // call from plugin's index
export const handlePluginToolRoute: (req: Request) => Promise<Response>;

// client helper
export async function callPluginTool<T>(plugin: string, tool: string, body: unknown): Promise<T>;
//   → POST /api/wish/<plugin>/<tool> body JSON, returns parsed JSON.
```

Each plugin registers its non-MCP tools at module load: `registerPluginTool("jupiter", "refresh_swap", refreshSwap)`. Widgets call `callPluginTool("jupiter", "refresh_swap", { config, summaryId })`.

### Client surface (hooks + emit)

Plugin widgets run client-side and need access to wallet state, RPC, and an `emit` channel for ServerEvents. SDK re-exports the canonical hooks (so plugins don't import `@solana/react-hooks` directly and risk version drift) and ships a tiny client emit bus.

```ts
// @wishd/plugin-sdk/svm/react
export {
  useSolanaClient,
  useWalletConnection,
  useWalletAccountTransactionSendingSigner,
  useStake, useSolTransfer, useWrapSol, useSplToken,
} from "@solana/react-hooks";

// @wishd/plugin-sdk/evm/react
export { useAccount, usePublicClient, useWalletClient, useSendTransaction } from "wagmi";

// @wishd/plugin-sdk/client/emit
export function useEmit(): (e: ServerEvent) => void;   // zustand-backed bus subscribed by agent UI shell
```

Plugin widgets import from `@wishd/plugin-sdk/{evm,svm}/react` and `@wishd/plugin-sdk/client/emit` exclusively. Direct imports of `@solana/react-hooks` / `wagmi` from plugin packages flagged in lint.

### Observation placeholder substitution

Observations may reference fields from prior `Call` results (e.g. Li.Fi `/status` needs the source-chain tx hash, only known after submission). PR1 formalizes the placeholder type:

```ts
type Placeholder = { from: "callResult"; index: number; field: "hash" | "signature" };
// usage in observation: query: { txHash: { from: "callResult", index: 0, field: "hash" }, ... }
```

Executor contract: after each `Call` in `prepared.calls` is submitted and produces a hash/signature, executor walks `prepared.observations` and substitutes any `Placeholder` whose `index` matches a submitted call. Substituted observations are then started by the poller. Static-string observation fields pass through untouched.

### Disambiguation min-rule

`apps/web/lib/intentRegistry.client.ts` exposes `Map<verb, RegisteredIntent[]>`. `prepareIntent.ts` resolves to a single plugin via this rule:

1. If only one claimant → use it.
2. Else: each claimant's `IntentSchema.fields` is scanned for `chain`-typed fields. The relevant chain field is selected by:
   - If `Manifest.primaryChainField` set → that field.
   - Else if exactly one chain field → that field.
   - Else field whose key matches `/^(from|source)?Chain$/i` → first match.
3. Pick the claimant whose chain field's CAIP-2 family matches the connected wallet (`eip155:*` if EVM connected; `solana:*` if SVM connected).
4. If still ambiguous (e.g. user has both wallets connected and the verb is claimed by both an EVM and an SVM plugin), surface an error to the agent loop. Full clarifying-question UX = separate spec.

Consumers don't need to know about disambiguation; `prepareIntent.ts` returns a single resolved plugin or throws.

### Tokens API

`@wishd/tokens` re-keyed to CAIP-19. New shape:

```ts
export type Token = {
  caip19: string;            // "eip155:1/erc20:0xA0b8..." | "solana:.../slip44:501"
  symbol: string;
  decimals: number;
  logoURI?: string;
  isNative: boolean;
};

export function findByCaip19(caip19: string): Token | undefined;
export function findBySymbol(caip2: string, symbol: string): Token | undefined;
export function listForChain(caip2: string): Token[];
```

Canonical native asset CAIP-19s locked here:
- Native ETH (and L2 native ETH variants): `eip155:<id>/slip44:60`
- Native MATIC on Polygon: `eip155:137/slip44:966`
- Native SOL: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501`

ERC-20 / SPL: `eip155:<id>/erc20:<address>` and `solana:<ref>/token:<mint>`. PR2 + PR3 must use these exact forms.

### Test scaffolding

`@wishd/plugin-sdk/svm/testing` ships `mockSolanaRpc()` returning a typed mock implementing the subset of `Rpc<SolanaRpcApi>` plugins use (`getBalance`, `getTokenAccountBalance`, `getSignatureStatuses`, `getBlockHeight`, `sendTransaction`, `getRecentPrioritizationFees`). Each method is a `vi.fn()` returning `{ send: () => Promise<...> }` matching kit's call shape. Plugins compose by overriding return values per test.

Symmetric `@wishd/plugin-sdk/evm/testing` already implicit via existing uniswap test patterns; not re-implemented.

### Migration

Manual edits, no codemod script. Three plugins + tokens pkg + address book = small enough for hand-edit. Same PR:
- `plugins/*/manifest.ts`: `chains: [1, 8453, ...]` → `chains: ["eip155:1", "eip155:8453", ...]`
- `plugins/*/intents.ts`: `chain.options` → CAIP-2 strings; UI labels via `humanizeChain()`
- `plugins/*/prepare.ts`: return `Prepared<TExtras>`; `calls: [...]` plural; add `family: "evm"` + `caip2` to every `Call` literal. Existing per-plugin extras (e.g. `initialQuote`, `balance`) stay where they were.
- `@wishd/tokens`: re-key entries to CAIP-19, add `findByCaip19()`. Hard-cut, no dual export. All consumers in workspace, atomic rename.
- `apps/web/lib/addressBook.ts`: CAIP-10 keys + family validators
- `apps/web/lib/intentRegistry.client.ts`: switch to `Map<verb, RegisteredIntent[]>`
- `apps/web/lib/prepareIntent.ts`: implement min-rule disambiguation
- `apps/web/app/api/wish/[plugin]/[tool]/route.ts`: mount generic plugin-tool route

Tests:
- Existing uniswap/compound/demo tests pass after codemod with zero logic edits.
- New unit tests for `caip.ts`, `call.ts` guards, `explorers.ts`, `priorityFees.ts`.
- Type-level tests asserting `Call` union narrows correctly.

## Resolved (was open)

- **CAIP-2 references**: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (mainnet), `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (devnet). Standard 32-char base58 genesis-hash prefix per CAIP-2 spec.
- **`humanizeChain` labels**: small inline table — `Ethereum`, `Base`, `Arbitrum`, `Optimism`, `Polygon`, `Unichain`, `Sepolia`, `Solana`, `Solana Devnet`. Unknown caip2 → return the caip2 string raw.
- **Token migration**: hard-cut. All consumers are workspace packages, atomic rename is trivial. No dual-export shim.
- **RPC envs**: named pair `SOLANA_RPC_URL_SERVER` + `SOLANA_RPC_URL_SERVER_DEVNET`. Generic JSON map deferred until 3rd cluster appears (won't, in practice).
- **Wallet capability**: trust kit's `WalletTransactionSigner` (`mode: "partial" | "send"`). No manual `wallet-standard` probing. Revisit only if PR2 surfaces a real gap.

## Acceptance criteria

- All existing plugin tests pass with no logic changes (only type/import edits from migration).
- Type-level tests prove `Call` union narrows to `EvmCall` inside `if (call.family === "evm")` and to `SvmCall` otherwise.
- `humanizeChain("eip155:1")` → `"Ethereum"`, `humanizeChain("solana:5eykt4...")` → `"Solana"`.
- `explorerTxUrl(SOLANA_DEVNET, sig)` includes `?cluster=devnet`.
- `registerExplorer({ caip2: "eip155:42220", ... })` adds Celo without SDK source edit.
- `findByCaip19("solana:5eykt4.../slip44:501")` returns native SOL token entry.
- `Prepared` shape: every migrated plugin returns `{ calls: Call[], ...extras }` with `calls` plural.
- Disambiguation min-rule: `prepareIntent.ts` resolves verb-collision case (uniswap.swap + jupiter.swap, planned PR2) by chain field's CAIP-2 family. Test with mocked dual-claim setup.
- `callPluginTool("uniswap", "any-tool", body)` POSTs to `/api/wish/uniswap/any-tool` and parses JSON. Single Next route mount serves all plugins.
- `mockSolanaRpc()` from `@wishd/plugin-sdk/svm/testing` produces a typed mock satisfying `Rpc<SolanaRpcApi>` subset used by plugins.
- `pnpm typecheck` clean across workspace.
- `pnpm test` green across workspace.
- No new runtime dependencies in `@wishd/plugin-sdk` (still react + viem + mcp-sdk types; `@solana/react-hooks` is a peer dep for SVM re-exports).

## Follow-up specs

- **PR2 spec**: `2026-05-06-svm-jupiter-plugin-design.md` — first SVM plugin against this SDK. Validates `SvmTxCall`, blockhash refresh path, Jupiter priority-fee strategy, plugin-tool route consumer.
- **PR3 spec**: `2026-05-06-lifi-cross-chain-plugin-design.md` — Pattern X bridge. Validates `observations[]`, multi-chain-field intents, `primaryChainField`, observation placeholder substitution, `recovery` UX.
- **Disambiguation spec** (parallel): full clarifying-question UX in agent mode beyond the chain-family min-rule shipped here.

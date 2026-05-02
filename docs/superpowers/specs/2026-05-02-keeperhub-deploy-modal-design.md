# KeeperHub deploy modal redesign — design spec (P1)

**Date:** 2026-05-02
**Status:** design (pre-implementation)
**Goal:** make the deploy-keeper modal understandable to a non-crypto-native user. Replace bigint inputs and opaque addresses with decimal inputs, human labels, and a plain-English summary of what they're signing.

---

## 1. Context

P1 of the broader KeeperHub UX overhaul. P0 (`2026-05-02-keeperhub-hotfix-design.md`) ships the bug fixes that make `wallet_grantPermissions` work. P1 redesigns the modal that drives that call.

Today's modal (`apps/web/components/wish/KeeperDeployFlow.tsx`):

- Lists raw addresses (`0x1c7D…`) for "this session may call".
- Spend-cap inputs accept bigint base-units (e.g. `100000000000000000000` for 100 COMP). User has to know token decimals.
- Expiry surface is fine (per `expiryPolicy.kind`).
- No protocol context: user doesn't know that *this address* is Compound, *that address* is Uniswap.
- No "what this lets us do" narrative.

Layout choice (validated in brainstorm): single column, narrative card at top, calls collapsed by default.

## 2. Goals + non-goals

**Goals:**

- Plain-English narrative card at top — generated from manifest, optionally augmented by agent rationale already passed via `payload.suggestedDelegation.rationale`.
- Decimal inputs for spend caps. Show user-facing units (e.g. "100 COMP"); convert to bigint base units on submit.
- Per-call rows show human labels + purpose (Compound · CometRewards · "claim accrued COMP"), with raw address available on demand.
- All copy lives in keeper manifest (option B from brainstorm) — no live agent calls during edit.
- Better error display in `phase === "error"` (parse Porto/viem error → display root cause inline, not the raw 400-char dump).

**Non-goals:**

- Live agent assistance during edit (Q5 option C — deferred to P2).
- Multi-keeper deploy / pick-from-catalog (P2).
- Pause/resume/revoke surfaces (P2).
- Restructuring `phase` state machine (still review → granting → deploying → confirmed → error).

## 3. Manifest additions

`packages/plugin-sdk/src/keeper.ts`:

```ts
type KeeperExplainer = {
  whatThisDoes: string;                                  // 1-2 sentences, plain English
  perCall: Record<Address, {
    label: string;                                       // "Compound · CometRewards"
    purpose: string;                                     // "claim accrued COMP rewards"
  }>;
  perToken: Record<Address, {
    label: string;                                       // "COMP"
    decimals: number;                                    // for input formatting
  }>;
  recommendedSpendRationale?: string;                    // shown under spend caps; null if absent
};

type KeeperManifest = {
  // …existing fields…
  explainer: KeeperExplainer;
};
```

`keepers/auto-compound-comp/manifest.ts` — fill in:

```ts
explainer: {
  whatThisDoes:
    "Every hour, an agent with your session key claims your COMP rewards, swaps them to USDC on Uniswap, and adds them to your Compound deposit. You don't sign each time.",
  perCall: {
    [COMET_REWARDS_SEPOLIA]: { label: "Compound · CometRewards", purpose: "claim accrued COMP" },
    [COMP_SEPOLIA]:          { label: "COMP",                    purpose: "approve Uniswap to swap" },
    [UNISWAP_ROUTER_SEPOLIA]:{ label: "Uniswap V3 Router",        purpose: "swap COMP → USDC" },
    [USDC_SEPOLIA]:          { label: "USDC",                    purpose: "approve Compound to supply" },
    [COMET_USDC_SEPOLIA]:    { label: "Compound · cUSDCv3",      purpose: "supply USDC into your position" },
  },
  perToken: {
    [COMP_SEPOLIA]: { label: "COMP", decimals: COMP_DECIMALS },
    [USDC_SEPOLIA]: { label: "USDC", decimals: USDC_DECIMALS },
  },
}
```

Address book (`apps/web/lib/addressBook` — to add if absent) provides `lookup(address) → { label, decimals? }` fallback for unknown addresses.

## 4. Modal layout (review phase)

Single column. Sections, top to bottom:

1. **Header.** `DEPLOY KEEPER` badge · `keeper.manifest.name` · 1-line `keeper.manifest.description`. Close button top-right.
2. **What this lets us do.** Dashed-border card. Renders `manifest.explainer.whatThisDoes`. If `payload.suggestedDelegation.rationale` is non-empty, append it as a second paragraph prefixed with "Agent note: ".
3. **Spend caps · per month** (or per period selected) block.
   - One row per token in `proposal.spend`:
     - Left: token label from `explainer.perToken[token].label` (fallback addressShort).
     - Middle: decimal text input + period dropdown.
     - Right: small "max {formatUnits(bound.maxLimit, decimals)}/{period}" hint.
   - Below all rows: italic `recommendedSpendRationale` if present.
4. **Expiry** block. Unchanged copy from today (varies by `expiryPolicy.kind`).
5. **Allowed contract calls (N)** — collapsible, closed by default.
   - Open: list rows showing `{label}` (bold) · `{purpose}` (regular) · `{addressShort}` (mono pill).
   - Each row pulls from `explainer.perCall[to]` keyed by call target. Fallback if missing: address book → addressShort.
6. **Continue →** CTA — submits to grant phase.

Other phases (`granting`, `deploying`, `confirmed`, `error`) — unchanged copy except:

- **`error`**: parse `err.message`; if it matches `Invalid parameters were provided to the RPC method` show "Wallet rejected the request — usually a config mismatch. Tap retry, or contact support." Otherwise show the raw message. `back` button keeps existing behavior.

## 5. Decimal input plumbing

Component-local state per spend row: `displayValue: string` (what user types) + derived `limit: bigint`.

- Initialize: `displayValue = formatUnits(initialLimit, decimals)`.
- On change:
  1. Strip non-decimal chars (`/[^0-9.]/g`).
  2. Try `parseUnits(newDisplay, decimals)`. If it throws (mid-typing, e.g. trailing dot), keep `displayValue` updated but skip `limit` update.
  3. On valid parse: clamp `limit = min(parsed, bound.maxLimit)`. If clamped, sync `displayValue = formatUnits(limit, decimals)`.
- On blur: re-format `displayValue` via `formatUnits(limit, decimals)` to canonicalize.

## 6. Files touched

- `packages/plugin-sdk/src/keeper.ts` — `KeeperExplainer` + `manifest.explainer` field.
- `keepers/auto-compound-comp/manifest.ts` — populate `explainer`.
- `apps/web/components/wish/KeeperDeployFlow.tsx` — full rewrite of the `review` section per layout above; decimal inputs; collapsible calls block.
- `apps/web/lib/addressBook.ts` (new, if absent) — small static map + `lookup()` helper.
- Tests:
  - `KeeperDeployFlow.test.tsx` — decimal input round-trip, clamp to bound, accordion toggle, narrative card renders.
  - `manifest` snapshot test for `explainer` keys covering every `delegation.fixed.calls[].to` and every `delegation.spend.bounds[].token` (catch missing labels at compile/test time).

## 7. Address book (lightweight)

`apps/web/lib/addressBook.ts`:

```ts
type AddressEntry = { label: string; decimals?: number };
const map: Record<Address, AddressEntry> = {
  [COMP_SEPOLIA]: { label: "COMP", decimals: 18 },
  [USDC_SEPOLIA]: { label: "USDC", decimals: 6 },
  // …
};
export function lookup(addr: Address): AddressEntry | null;
export function addressShort(addr: Address): string;  // "0x1c7D…d83B"
```

Used as fallback inside `KeeperDeployFlow` when `explainer.perCall` / `explainer.perToken` missing the entry. Keeper-supplied data wins.

## 8. Trust boundary

No change. Manifest copy is keeper-author content, baked at build time. Agent's rationale flows through `payload.suggestedDelegation.rationale` (already validated server-side in `propose_delegation`). No HTML rendering — all text.

## 9. Testing

- Unit: decimal input parse/format round-trip (handle trailing dot, leading zeros, more decimals than `decimals`, scientific notation rejected).
- Unit: clamp logic — typing above `maxLimit` snaps to max.
- Component: collapsible calls renders all entries; missing-explainer fallback to address book; missing-both fallback to addressShort.
- Manifest contract test: every `delegation.fixed.calls[].to` has `manifest.explainer.perCall[to]`; every `delegation.spend.bounds[].token` has `manifest.explainer.perToken[token]`.
- Manual E2E: full Sepolia flow with new modal, verify rendered copy + numbers match the chain.

## 10. Open questions / verify during impl

- Do we want a second "Customize" entry point (separate from `deploy ✦`) that opens the modal pre-expanded with calls visible? Today `SuccessCard` renders a `customize` button when state is `not_deployed`, but it isn't wired to anything. For this iteration leave it inert (no `onClick`). Revisit when P2 introduces the management surface — likely route it to "deploy w/ details panel open".
- Should we persist the user's adjusted caps locally (e.g. localStorage) so re-opening the modal pre-fills last edits? Not for v1 — skip.

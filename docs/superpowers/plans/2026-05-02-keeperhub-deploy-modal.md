# KeeperHub Deploy Modal Redesign Implementation Plan (P1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the deploy-keeper modal understandable to a non-crypto-native user. Replace bigint inputs and opaque addresses with decimal inputs, human labels, and a plain-English summary of what they're signing.

**Architecture:** add a `KeeperExplainer` field to `KeeperManifest` so each keeper ships its own copy. The modal renders that copy, with a small `addressBook` helper as fallback. Spend-cap inputs become decimal text inputs that round-trip via `formatUnits`/`parseUnits`. Per-call breakdown collapses behind an accordion.

**Tech Stack:** TypeScript, React, Next.js, viem (`formatUnits`/`parseUnits`), vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-05-02-keeperhub-deploy-modal-design.md`](../specs/2026-05-02-keeperhub-deploy-modal-design.md)

**Prereq:** P0 hotfix plan (`2026-05-02-keeperhub-hotfix.md`) is merged. The new SDK shapes (`feeToken` object + `calls` with signatures) are already in place; this plan builds on them.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/plugin-sdk/src/index.ts` | Add `KeeperExplainer` type; add `explainer: KeeperExplainer` to `KeeperManifest` | modify |
| `keepers/auto-compound-comp/manifest.ts` | Populate `explainer` for the only shipped keeper | modify |
| `keepers/auto-compound-comp/manifest.test.ts` | Contract test — every call address + every spend token has explainer entries | create |
| `apps/web/lib/addressBook.ts` | Tiny static address↔label/decimals map + `lookup` + `addressShort` helpers | create |
| `apps/web/lib/addressBook.test.ts` | Round-trip + truncation tests | create |
| `apps/web/components/wish/KeeperDeployFlow.tsx` | Layout-A redesign of the `review` phase | modify |
| `apps/web/components/wish/KeeperDeployFlow.test.tsx` | Decimal input round-trip + clamp + accordion + narrative card | modify |
| `apps/web/components/primitives/SuccessCard.tsx` | Make the unwired `customize` button inert (no `onClick`, `disabled`) | modify |

---

## Task 1: Add KeeperExplainer type to the SDK

**Files:**
- Modify: `packages/plugin-sdk/src/index.ts:115-124` (the `KeeperManifest` block)

- [ ] **Step 1: Edit packages/plugin-sdk/src/index.ts**

Above the existing `KeeperManifest` declaration, add:

```ts
export type KeeperExplainer = {
  /** 1-2 sentence plain-English summary of what the keeper does on the user's behalf. */
  whatThisDoes: string;
  /** Per-call address: the human label and the action's purpose. */
  perCall: Record<Address, { label: string; purpose: string }>;
  /** Per-token address: human symbol and decimals (so the modal can render decimal inputs). */
  perToken: Record<Address, { label: string; decimals: number }>;
  /** Optional rationale shown beneath spend caps; null/absent if not applicable. */
  recommendedSpendRationale?: string;
};
```

Add `explainer: KeeperExplainer;` to `KeeperManifest`:

```ts
export type KeeperManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  chains: number[];
  plugins: string[];
  trust: TrustTier;
  appliesTo: Array<{ intent: string }>;
  explainer: KeeperExplainer;
};
```

- [ ] **Step 2: Build SDK; expect dependant typecheck failures**

Run: `pnpm -F @wishd/plugin-sdk build && pnpm -F web tsc --noEmit`

Expected: SDK builds. The `web` typecheck fails because `keepers/auto-compound-comp/manifest.ts` is missing `explainer`. Fixed in Task 2.

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-sdk/src/index.ts
git commit -m "feat(plugin-sdk): require KeeperExplainer on KeeperManifest"
```

---

## Task 2: Populate explainer for auto-compound-comp + contract test

**Files:**
- Modify: `keepers/auto-compound-comp/manifest.ts`
- Create: `keepers/auto-compound-comp/manifest.test.ts`

- [ ] **Step 1: Add the contract test**

Create `keepers/auto-compound-comp/manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { manifest } from "./manifest";
import { delegation } from "./delegation";

describe("auto-compound-comp manifest.explainer", () => {
  it("provides whatThisDoes copy", () => {
    expect(manifest.explainer.whatThisDoes.length).toBeGreaterThan(20);
  });

  it("has perCall entries for every allowlisted call target", () => {
    if (delegation.kind !== "porto-permissions") throw new Error();
    for (const c of delegation.fixed.calls) {
      const entry = manifest.explainer.perCall[c.to];
      expect(entry, `missing perCall entry for ${c.to}`).toBeDefined();
      expect(entry!.label.length).toBeGreaterThan(0);
      expect(entry!.purpose.length).toBeGreaterThan(0);
    }
  });

  it("has perToken entries with decimals for every spend bound token", () => {
    if (delegation.kind !== "porto-permissions") throw new Error();
    for (const b of delegation.spend.bounds) {
      const entry = manifest.explainer.perToken[b.token];
      expect(entry, `missing perToken entry for ${b.token}`).toBeDefined();
      expect(entry!.decimals).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm -F @wishd/keeper-auto-compound-comp test -- --run`

Expected: failure — `manifest.explainer` is undefined.

- [ ] **Step 3: Update manifest.ts**

Open `keepers/auto-compound-comp/manifest.ts`. Add the imports for the addresses + decimals constants if not already present, and add the `explainer` field to the exported `manifest`:

```ts
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
  COMP_DECIMALS, USDC_DECIMALS,
} from "./addresses";

// …existing manifest body…
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
  recommendedSpendRationale:
    "Defaults are sized for typical retail positions. Lower if your deposit is smaller; the keeper will simply skip swaps that would exceed the cap.",
},
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm -F @wishd/keeper-auto-compound-comp test -- --run`

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add keepers/auto-compound-comp/manifest.ts keepers/auto-compound-comp/manifest.test.ts
git commit -m "feat(keeper/auto-compound-comp): ship explainer copy for the deploy modal"
```

---

## Task 3: addressBook fallback helper

**Files:**
- Create: `apps/web/lib/addressBook.ts`
- Create: `apps/web/lib/addressBook.test.ts`

- [ ] **Step 1: Add the failing test**

Create `apps/web/lib/addressBook.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lookup, addressShort } from "./addressBook";
import {
  COMP_SEPOLIA, USDC_SEPOLIA,
} from "@wishd/keeper-auto-compound-comp/addresses";

describe("addressBook", () => {
  it("returns label + decimals for a known token", () => {
    const e = lookup(COMP_SEPOLIA);
    expect(e?.label).toBe("COMP");
    expect(e?.decimals).toBe(18);
  });

  it("returns null for an unknown address", () => {
    expect(lookup("0x000000000000000000000000000000000000dEaD" as any)).toBeNull();
  });

  it("addressShort renders 0xfirst…last4", () => {
    expect(addressShort(USDC_SEPOLIA)).toMatch(/^0x[A-Fa-f0-9]{4,6}…[A-Fa-f0-9]{4}$/);
  });
});
```

If `@wishd/keeper-auto-compound-comp/addresses` isn't a valid subpath import, replace those imports with raw constants matching the values in `keepers/auto-compound-comp/addresses.ts`.

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm -F web test -- --run addressBook`

Expected: failure — file does not exist.

- [ ] **Step 3: Implement addressBook.ts**

Create `apps/web/lib/addressBook.ts`:

```ts
import type { Address } from "@wishd/plugin-sdk";
import {
  COMP_SEPOLIA, USDC_SEPOLIA, COMET_USDC_SEPOLIA,
  COMET_REWARDS_SEPOLIA, UNISWAP_ROUTER_SEPOLIA,
} from "@wishd/keeper-auto-compound-comp/addresses";

export type AddressEntry = { label: string; decimals?: number };

const map: Record<string, AddressEntry> = {
  [COMP_SEPOLIA.toLowerCase()]:           { label: "COMP", decimals: 18 },
  [USDC_SEPOLIA.toLowerCase()]:           { label: "USDC", decimals: 6 },
  [COMET_USDC_SEPOLIA.toLowerCase()]:     { label: "Compound · cUSDCv3" },
  [COMET_REWARDS_SEPOLIA.toLowerCase()]:  { label: "Compound · CometRewards" },
  [UNISWAP_ROUTER_SEPOLIA.toLowerCase()]: { label: "Uniswap V3 Router" },
};

export function lookup(addr: Address): AddressEntry | null {
  return map[addr.toLowerCase()] ?? null;
}

export function addressShort(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
```

If the address-package import path doesn't resolve, inline the constants from `keepers/auto-compound-comp/addresses.ts` instead of importing.

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm -F web test -- --run addressBook`

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/addressBook.ts apps/web/lib/addressBook.test.ts
git commit -m "feat(web/lib): addressBook fallback for deploy modal labels"
```

---

## Task 4: Make customize button inert

**Files:**
- Modify: `apps/web/components/primitives/SuccessCard.tsx:83-88`

- [ ] **Step 1: Edit SuccessCard.tsx**

Inside `SuccessCard.tsx`, replace the `customize` button (currently lines 83-88) with a disabled, no-op version:

```tsx
                      <button
                        type="button"
                        disabled
                        title="customize coming soon"
                        className="bg-transparent border-[1.5px] border-rule rounded-pill px-3 py-1 text-xs text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >customize</button>
```

- [ ] **Step 2: Manual smoke**

Run: `pnpm -F web dev`

Open the lend flow to a SuccessCard with the offer visible. Confirm the customize button is dimmed and the tooltip reads "customize coming soon". The deploy button still functions.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/primitives/SuccessCard.tsx
git commit -m "ui(success-card): mark customize disabled until P2 management surface lands"
```

---

## Task 5: Decimal inputs in deploy modal — failing tests first

**Files:**
- Modify: `apps/web/components/wish/KeeperDeployFlow.test.tsx`

- [ ] **Step 1: Add tests for new modal behavior**

Append three tests to `KeeperDeployFlow.test.tsx`. Use the existing render setup from the file (or copy from a sibling test file like `KeeperhubAuthCard.test.tsx`). Tests:

```tsx
  it("renders narrative card from manifest.explainer.whatThisDoes", () => {
    // open modal w/ auto-compound-comp keeper payload
    render(<KeeperDeployFlow />);
    expect(screen.getByText(/claims your COMP rewards/i)).toBeInTheDocument();
  });

  it("displays spend caps in decimal units (100, not 100000000000000000000)", () => {
    render(<KeeperDeployFlow />);
    const inputs = screen.getAllByRole("textbox");
    const compInput = inputs.find((i) => (i as HTMLInputElement).getAttribute("aria-label") === "spend cap COMP");
    expect((compInput as HTMLInputElement).value).toBe("100");
  });

  it("clamps spend cap to bound.maxLimit on input", async () => {
    const user = userEvent.setup();
    render(<KeeperDeployFlow />);
    const inputs = screen.getAllByRole("textbox");
    const compInput = inputs.find((i) => (i as HTMLInputElement).getAttribute("aria-label") === "spend cap COMP")!;
    await user.clear(compInput);
    await user.type(compInput, "99999");
    // bound is 1000 COMP/month
    expect((compInput as HTMLInputElement).value).toBe("1000");
  });

  it("collapses 'allowed contract calls' by default and toggles open", async () => {
    const user = userEvent.setup();
    render(<KeeperDeployFlow />);
    expect(screen.queryByText(/Compound · CometRewards/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /allowed contract calls/i }));
    expect(screen.getByText(/Compound · CometRewards/i)).toBeInTheDocument();
  });
```

If the existing test file's setup helper for opening the modal needs an exported util, add one (e.g. `renderModalWithCompKeeper()`) to keep DRY across the four tests.

- [ ] **Step 2: Run tests, expect 4 FAILS**

Run: `pnpm -F web test -- --run KeeperDeployFlow`

Expected: the four new tests fail.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/web/components/wish/KeeperDeployFlow.test.tsx
git commit -m "test(keeper/deploy-flow): pin new modal behavior — narrative card, decimal inputs, accordion"
```

---

## Task 6: Implement the redesigned review phase

**Files:**
- Modify: `apps/web/components/wish/KeeperDeployFlow.tsx`

- [ ] **Step 1: Add imports**

At the top of `apps/web/components/wish/KeeperDeployFlow.tsx`, add:

```tsx
import { formatUnits, parseUnits } from "viem";
import { lookup, addressShort } from "@/lib/addressBook";
```

- [ ] **Step 2: Replace the review phase JSX**

Replace the entire `phase === "review"` block (currently inside the modal section) with the layout-A design:

```tsx
        {phase === "review" && (
          <section className="space-y-3">
            <div className="border border-dashed border-ink rounded-md p-3 bg-surface-2 text-sm leading-relaxed">
              <strong className="block text-xs uppercase tracking-wider text-ink-3 mb-1">What this lets us do</strong>
              <p>{keeper.manifest.explainer.whatThisDoes}</p>
              {payload.suggestedDelegation?.rationale && (
                <p className="mt-2 text-ink-3"><em>Agent note:</em> {payload.suggestedDelegation.rationale}</p>
              )}
            </div>

            <Block label="Spend caps · per period">
              {proposal.spend.map((s) => {
                if (keeper.delegation.kind !== "porto-permissions") return null;
                const bound = keeper.delegation.spend.bounds.find((b) => b.token === s.token);
                const tokenLabel =
                  keeper.manifest.explainer.perToken[s.token]?.label
                  ?? lookup(s.token)?.label
                  ?? addressShort(s.token);
                const decimals =
                  keeper.manifest.explainer.perToken[s.token]?.decimals
                  ?? lookup(s.token)?.decimals
                  ?? 18;
                const display = formatUnits(s.limit, decimals);
                const maxDisplay = bound ? formatUnits(bound.maxLimit, decimals) : "—";
                return (
                  <div key={s.token} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
                    <span>{tokenLabel}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`spend cap ${tokenLabel}`}
                      className="bg-surface-2 border border-rule rounded px-2 py-1 w-28 font-mono text-right"
                      value={display}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                        if (!cleaned) return;
                        let parsed: bigint;
                        try { parsed = parseUnits(cleaned as `${number}`, decimals); }
                        catch { return; }
                        const max = bound?.maxLimit ?? parsed;
                        setSpendLimit(s.token, parsed > max ? max : parsed);
                      }}
                    />
                    <select
                      className="bg-surface-2 border border-rule rounded px-2 py-1 text-xs"
                      value={s.period}
                      onChange={(ev) => setSpendPeriod(s.token, ev.target.value as SpendPeriod)}
                    >
                      {(bound?.periods ?? ["month"]).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <span className="col-span-3 text-[10px] font-mono text-ink-3 text-right">max {maxDisplay}/{s.period}</span>
                  </div>
                );
              })}
              {keeper.manifest.explainer.recommendedSpendRationale && (
                <p className="text-[11px] italic text-ink-3 mt-1">{keeper.manifest.explainer.recommendedSpendRationale}</p>
              )}
            </Block>

            <Block label="Expiry">
              {keeper.delegation.kind === "porto-permissions" && keeper.delegation.expiryPolicy.kind === "unlimited" && (
                <span className="text-xs">no expiry · revoke anytime in your Porto wallet</span>
              )}
              {keeper.delegation.kind === "porto-permissions" && keeper.delegation.expiryPolicy.kind === "fixed" && (
                <span className="text-xs">{keeper.delegation.expiryPolicy.days} days (fixed)</span>
              )}
              {keeper.delegation.kind === "porto-permissions" && keeper.delegation.expiryPolicy.kind === "bounded" && (
                <span className="text-xs">up to {keeper.delegation.expiryPolicy.maxDays} days</span>
              )}
            </Block>

            <CallsAccordion keeper={keeper} />

            <button
              type="button"
              className="bg-accent border-[1.5px] border-ink rounded-pill px-4 py-1.5 text-sm font-semibold"
              onClick={handleContinue}
            >Continue →</button>
          </section>
        )}
```

- [ ] **Step 3: Add the CallsAccordion subcomponent**

Below the `Block` helper at the bottom of the file, append:

```tsx
function CallsAccordion(props: { keeper: Keeper }): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (props.keeper.delegation.kind !== "porto-permissions") return null;
  const calls = props.keeper.delegation.fixed.calls;
  return (
    <div className="border-t border-rule pt-2">
      <button
        type="button"
        className="w-full flex justify-between items-center font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Allowed contract calls ({calls.length})</span>
        <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 text-xs">
          {calls.map((c) => {
            const e = props.keeper.manifest.explainer.perCall[c.to] ?? {
              label: lookup(c.to)?.label ?? addressShort(c.to),
              purpose: c.signature,
            };
            return (
              <li key={c.to} className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <strong>{e.label}</strong>
                  <span className="text-ink-3"> — {e.purpose}</span>
                </div>
                <span className="font-mono text-[10px] text-ink-3">{addressShort(c.to)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

Also import `Keeper` from `@wishd/plugin-sdk` if not already imported.

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm -F web test -- --run KeeperDeployFlow`

Expected: all four new tests + any preexisting tests pass.

- [ ] **Step 5: Run the full web suite**

Run: `pnpm -F web test -- --run`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/wish/KeeperDeployFlow.tsx
git commit -m "feat(keeper/deploy-flow): redesigned review phase — narrative + decimal inputs + collapsible calls"
```

---

## Task 7: Improve the error phase copy

**Files:**
- Modify: `apps/web/components/wish/KeeperDeployFlow.tsx`

- [ ] **Step 1: Add a small error formatter**

Inside `KeeperDeployFlow.tsx`, just above the component, add:

```tsx
function humanizeGrantError(raw: string): string {
  if (/Invalid parameters were provided to the RPC method/i.test(raw)) {
    return "Wallet rejected the request — usually a config mismatch in the keeper. Try again, or reach out so we can fix it.";
  }
  if (/User rejected/i.test(raw)) {
    return "You declined the wallet request. Tap retry to try again.";
  }
  return raw;
}
```

- [ ] **Step 2: Use it in the error phase JSX**

Replace the `phase === "error"` JSX block:

```tsx
        {phase === "error" && (
          <section>
            <p className="text-sm text-warn mb-2">{humanizeGrantError(errorMsg ?? "unknown error")}</p>
            <details className="text-[11px] text-ink-3 mb-2">
              <summary>technical details</summary>
              <pre className="whitespace-pre-wrap break-words">{errorMsg ?? ""}</pre>
            </details>
            <button type="button" className="text-xs underline" onClick={() => setPhase("review")}>back</button>
          </section>
        )}
```

- [ ] **Step 3: Quick test**

Add to the test file:

```tsx
  it("humanizes Porto RPC validation error in error phase", () => {
    // dispatch an error via setPhase by simulating mutateAsync rejection
    // …existing test plumbing — assert the friendly copy renders + raw is in <details>
    expect(screen.getByText(/usually a config mismatch/i)).toBeInTheDocument();
  });
```

If the existing test setup makes simulating an error rejection awkward, skip the test and rely on manual verification.

- [ ] **Step 4: Manual verification**

Run: `pnpm -F web dev` → open modal → trigger any error path (disconnect wallet then click Continue). Confirm the friendly copy renders and the technical details are collapsed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/KeeperDeployFlow.tsx apps/web/components/wish/KeeperDeployFlow.test.tsx
git commit -m "ui(keeper/deploy-flow): humanize grant errors with collapsed technical details"
```

---

## Task 8: Final E2E smoke

- [ ] **Step 1: Start dev server + Sepolia wallet**

Run: `pnpm -F web dev`. Connect a Porto wallet on Sepolia.

- [ ] **Step 2: Run lend + deploy flow**

Trigger the lend example, execute, observe the SuccessCard's keeper offer. Click `deploy ✦`. Verify:

- Modal header reads `DEPLOY KEEPER` + keeper name + description.
- "What this lets us do" narrative card visible.
- Spend caps show "100" and "1000" (not bigint base units).
- Period dropdown shows allowed periods.
- "Allowed contract calls (5)" is collapsed; clicking opens it; rows show labels (Compound · CometRewards, COMP, Uniswap V3 Router, USDC, Compound · cUSDCv3) + purposes + addressShort.
- "Continue" advances. Porto dialog opens. Approve.
- Modal advances to `auto-compound active ✓`.

- [ ] **Step 3: Verify customize button is inert**

Click `customize`. Expected: nothing happens, button looks disabled.

- [ ] **Step 4: Optional commit if any post-E2E tweaks**

```bash
git add -p
git commit -m "ui(keeper/deploy-flow): post-E2E polish — <one line>"
```

If no tweaks needed, skip.

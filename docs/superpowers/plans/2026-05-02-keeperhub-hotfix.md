# KeeperHub Hotfix Implementation Plan (P0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** unblock the lend → keeper demo flow by fixing two regressions: the auth widget never dismisses after success, and the Porto `wallet_grantPermissions` call fails RPC validation with three errors.

**Architecture:** type-driven changes in `@wishd/plugin-sdk` ripple to the one keeper that uses them (`auto-compound-comp`), the payload builder, and the deploy modal. Switch the modal to Porto's `useGrantPermissions` hook so bigint→hex serialization is handled by the library instead of by us. Wire the existing `dismissWidget` action into the auth card.

**Tech Stack:** TypeScript, React, Next.js, Zustand, Porto + viem + wagmi, vitest.

**Spec:** [`docs/superpowers/specs/2026-05-02-keeperhub-hotfix-design.md`](../specs/2026-05-02-keeperhub-hotfix-design.md)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/plugin-sdk/src/index.ts` | SDK types: `PortoPermissionsBounds.fixed.{calls,feeToken}` shape change | modify |
| `keepers/auto-compound-comp/delegation.ts` | Concrete keeper config — populate new `calls` and `feeToken` shapes | modify |
| `keepers/auto-compound-comp/delegation.test.ts` | Update existing assertions for new shapes | modify |
| `apps/web/lib/keepers/buildPortoGrantPayload.ts` | Drop manual serialization, pass through new shapes, drop `signature: ""` placeholder | modify |
| `apps/web/lib/keepers/buildPortoGrantPayload.test.ts` | Update existing assertions; add reference-shape snapshot | modify |
| `apps/web/components/wish/KeeperhubAuthCard.tsx` | Accept `id` prop; on success flash 1.5s then call `dismissWidget(id)` | modify |
| `apps/web/components/wish/KeeperDeployFlow.tsx` | Switch from raw `walletClient.request` to `useGrantPermissions` hook | modify |

`workspace.ts` already has `dismissWidget(id)` (line 55-56). We reuse it — no store change needed.

---

## Task 1: SDK type updates — feeToken object + calls with signatures

**Files:**
- Modify: `packages/plugin-sdk/src/index.ts:51-61`

- [ ] **Step 1: Edit `PortoPermissionsBounds`**

Replace lines 51-61 in `packages/plugin-sdk/src/index.ts`:

```ts
export type PortoPermissionsBounds = {
  fixed: {
    calls: Array<{ to: Address; signature: string }>;
    feeToken: { symbol: string; limit: string };
  };
  expiryPolicy: ExpiryPolicy;
  spend: {
    bounds: Array<{ token: Address; maxLimit: bigint; periods: SpendPeriod[] }>;
    defaults: Array<{ token: Address; limit: bigint; period: SpendPeriod }>;
  };
};
```

- [ ] **Step 2: Run typecheck — expect failures in dependants**

Run from repo root: `pnpm -F @wishd/plugin-sdk build && pnpm -F web tsc --noEmit`

Expected: SDK build succeeds; the `web` typecheck fails inside `keepers/auto-compound-comp/delegation.ts` and possibly `apps/web/lib/keepers/buildPortoGrantPayload.ts` because they still feed the old shape. We fix those next.

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-sdk/src/index.ts
git commit -m "feat(plugin-sdk): tighten PortoPermissionsBounds — calls carry signatures, feeToken is an object"
```

---

## Task 2: Update auto-compound-comp delegation to new shape

**Files:**
- Modify: `keepers/auto-compound-comp/delegation.ts`
- Modify: `keepers/auto-compound-comp/delegation.test.ts`

- [ ] **Step 1: Update the existing assertion in delegation.test.ts**

Replace the "allowlist contains exactly the five keeper-touched contracts" test (lines 13-22) so it inspects `.to`:

```ts
  it("allowlist contains exactly the five keeper-touched contracts with signatures", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    expect(new Set(delegation.fixed.calls.map((c) => c.to))).toEqual(new Set([
      COMET_REWARDS_SEPOLIA,
      COMP_SEPOLIA,
      UNISWAP_ROUTER_SEPOLIA,
      USDC_SEPOLIA,
      COMET_USDC_SEPOLIA,
    ]));
    for (const c of delegation.fixed.calls) {
      expect(c.signature.length).toBeGreaterThan(0);
    }
  });
```

Add a new test below it:

```ts
  it("feeToken is an ETH object with a decimal-string limit", () => {
    if (delegation.kind !== "porto-permissions") throw new Error("expected porto-permissions");
    expect(delegation.fixed.feeToken).toEqual({ symbol: "ETH", limit: "0.05" });
  });
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `pnpm -F @wishd/keeper-auto-compound-comp test -- --run`

Expected: both new tests fail (current shape is `Address[]` and `Address`).

- [ ] **Step 3: Update delegation.ts**

Edit the `fixed` block in `keepers/auto-compound-comp/delegation.ts`:

```ts
  fixed: {
    calls: [
      { to: COMET_REWARDS_SEPOLIA, signature: "claim(address,address,bool)" },
      { to: COMP_SEPOLIA,          signature: "approve(address,uint256)" },
      { to: UNISWAP_ROUTER_SEPOLIA, signature:
          "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" },
      { to: USDC_SEPOLIA,          signature: "approve(address,uint256)" },
      { to: COMET_USDC_SEPOLIA,    signature: "supply(address,uint256)" },
    ],
    feeToken: { symbol: "ETH", limit: "0.05" },
  },
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm -F @wishd/keeper-auto-compound-comp test -- --run`

Expected: all delegation tests pass.

- [ ] **Step 5: Commit**

```bash
git add keepers/auto-compound-comp/delegation.ts keepers/auto-compound-comp/delegation.test.ts
git commit -m "fix(keeper/auto-compound-comp): populate call signatures + ETH feeToken object per Porto schema"
```

---

## Task 3: Update buildPortoGrantPayload + its tests

**Files:**
- Modify: `apps/web/lib/keepers/buildPortoGrantPayload.ts`
- Modify: `apps/web/lib/keepers/buildPortoGrantPayload.test.ts`

- [ ] **Step 1: Update existing tests to assert new mapping**

Replace lines 22-25 of `buildPortoGrantPayload.test.ts` so the assertion handles the new `calls: { to, signature }[]` shape:

```ts
    if (autoCompoundComp.delegation.kind !== "porto-permissions") throw new Error();
    expect(payload.permissions.calls.map((c) => c.to.toLowerCase()))
      .toEqual(autoCompoundComp.delegation.fixed.calls.map((c) => c.to.toLowerCase()));
    expect(payload.permissions.calls.map((c) => c.signature))
      .toEqual(autoCompoundComp.delegation.fixed.calls.map((c) => c.signature));
```

Append a new test asserting the `feeToken` object passes through:

```ts
  it("passes feeToken object through unchanged", () => {
    const payload = buildPortoGrantPayload({
      keeper: autoCompoundComp,
      proposal: { expiry: { kind: "unlimited" }, spend: [] },
      sessionPublicKey: "0x000000000000000000000000000000000000dEaD" as Address,
    });
    expect(payload.feeToken).toEqual({ symbol: "ETH", limit: "0.05" });
  });
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `pnpm -F web test -- --run buildPortoGrantPayload`

Expected: new and updated assertions fail; `payload.feeToken` is currently `undefined`.

- [ ] **Step 3: Update buildPortoGrantPayload.ts**

Replace the body of `buildPortoGrantPayload` (the function exported on line 8) with:

```ts
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
    feeToken: keeper.delegation.fixed.feeToken,
    key: { type: "secp256k1", publicKey: sessionPublicKey },
    permissions: {
      calls: keeper.delegation.fixed.calls.map((c) => ({ to: c.to, signature: c.signature })),
      spend: proposal.spend.map((s) => ({ token: s.token, limit: s.limit, period: s.period })),
    },
  };
}
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm -F web test -- --run buildPortoGrantPayload`

Expected: all three tests pass.

- [ ] **Step 5: Run full web typecheck — expect green**

Run: `pnpm -F web tsc --noEmit`

Expected: success. If failures elsewhere reference the old shape, fix them now.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/keepers/buildPortoGrantPayload.ts apps/web/lib/keepers/buildPortoGrantPayload.test.ts
git commit -m "fix(keepers/grant): pass feeToken object + signatures through to Porto payload"
```

---

## Task 4: Auto-dismiss the auth card after success

**Files:**
- Modify: `apps/web/components/wish/KeeperhubAuthCard.tsx`
- Modify: `apps/web/components/wish/KeeperhubAuthCard.test.tsx`

- [ ] **Step 1: Add the failing test**

Open `apps/web/components/wish/KeeperhubAuthCard.test.tsx` and append a test inside the existing `describe`:

```tsx
  it("calls dismissWidget(id) 1.5s after kh:authed postMessage", async () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    vi.mock("@/store/workspace", () => ({
      useWorkspace: (sel: any) => sel({ dismissWidget: dismiss }),
    }));
    const { rerender } = render(<KeeperhubAuthCard id="auth-1" intent="x" userPortoAddress="0xabc" />);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "wishd:kh:authed" } }));
    rerender(<KeeperhubAuthCard id="auth-1" intent="x" userPortoAddress="0xabc" />);
    expect(dismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(dismiss).toHaveBeenCalledWith("auth-1");
    vi.useRealTimers();
  });
```

If the existing test file mocks `useWorkspace` differently, follow that pattern instead — the assertion (`dismiss called with id after 1.5s`) is the contract.

- [ ] **Step 2: Run the test, expect FAIL**

Run: `pnpm -F web test -- --run KeeperhubAuthCard`

Expected: the new test fails because `KeeperhubAuthCard` doesn't accept `id` and doesn't call `dismissWidget`.

- [ ] **Step 3: Update KeeperhubAuthCard.tsx**

Replace `Props` type at the top of `apps/web/components/wish/KeeperhubAuthCard.tsx`:

```tsx
type Props = {
  id?: string;
  stepCardId?: string;
  intent?: string;
  userPortoAddress?: string;
};
```

Update the function signature and body. Inside `KeeperhubAuthCard`, import the store and add a dismiss timer:

```tsx
import { useWorkspace } from "@/store/workspace";
// …
export function KeeperhubAuthCard({ id, stepCardId, intent, userPortoAddress }: Props): ReactElement {
  const { address } = useAccount();
  const dismissWidget = useWorkspace((s) => s.dismissWidget);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
```

Add a dismiss-on-success effect just below the existing `useEffect` for the message listener:

```tsx
  useEffect(() => {
    if (phase !== "success" || !id) return;
    const t = setTimeout(() => dismissWidget(id), 1500);
    return () => clearTimeout(t);
  }, [phase, id, dismissWidget]);
```

Update the success copy to make the flash explicit:

```tsx
      {phase === "success" && (
        <p className="text-xs text-green-600 font-semibold">KeeperHub connected ✓</p>
      )}
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm -F web test -- --run KeeperhubAuthCard`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/KeeperhubAuthCard.tsx apps/web/components/wish/KeeperhubAuthCard.test.tsx
git commit -m "fix(keeper/auth-card): auto-dismiss 1.5s after successful KH connect"
```

---

## Task 5: Switch KeeperDeployFlow to useGrantPermissions hook

**Files:**
- Modify: `apps/web/components/wish/KeeperDeployFlow.tsx`
- Modify: `apps/web/components/wish/KeeperDeployFlow.test.tsx`

- [ ] **Step 1: Verify import path for useGrantPermissions**

Run: `grep -R "export .*GrantPermissions" /Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/apps/web/node_modules/porto/wagmi 2>/dev/null | head -5`

Expected: at least one match showing the export. Confirm the import path. The reference uses `porto/wagmi/Hooks`. If a different subpath is exported in the installed version, use that.

If nothing matches because porto isn't yet installed in the web app's node_modules:

```bash
pnpm -F web install
```

…then re-run the grep.

- [ ] **Step 2: Update the existing test to assert the hook is called**

In `apps/web/components/wish/KeeperDeployFlow.test.tsx`, replace any existing assertion that called `walletClient.request(...)` with an assertion that mocks `useGrantPermissions` and verifies `mutateAsync` is invoked with a payload that has `feeToken: { symbol, limit }` and bigint `spend[].limit`:

```tsx
  it("calls useGrantPermissions.mutateAsync with feeToken object + bigint spend limits on Continue", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "0xabc", key: { publicKey: "0xdEaD" } });
    vi.mock("porto/wagmi/Hooks", () => ({
      useGrantPermissions: () => ({ mutateAsync }),
    }));
    // …existing setup that opens the modal with a payload…
    render(<KeeperDeployFlow />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const arg = mutateAsync.mock.calls[0][0];
    expect(arg.feeToken).toMatchObject({ symbol: "ETH", limit: "0.05" });
    expect(typeof arg.permissions.spend[0].limit).toBe("bigint");
  });
```

If the file doesn't exist yet, create a minimal test file at `apps/web/components/wish/KeeperDeployFlow.test.tsx` covering this single scenario. Use the existing `KeeperhubAuthCard.test.tsx` as a setup template.

- [ ] **Step 3: Run the test, expect FAIL**

Run: `pnpm -F web test -- --run KeeperDeployFlow`

Expected: failure — current code calls raw `walletClient.request(...)`.

- [ ] **Step 4: Update KeeperDeployFlow.tsx**

In `apps/web/components/wish/KeeperDeployFlow.tsx`:

Replace the imports near the top:

```tsx
import { useGrantPermissions } from "porto/wagmi/Hooks";
import { useAccount } from "wagmi";
```

Drop the `useConnectorClient` import and the `walletClient` variable.

Inside the component, after the existing `useState` calls, add:

```tsx
  const grant = useGrantPermissions();
```

Replace the body of `handleContinue` (currently lines 44-83) with:

```tsx
  async function handleContinue(): Promise<void> {
    if (!address) {
      setErrorMsg("connect a Porto wallet first");
      setPhase("error");
      return;
    }
    setPhase("granting");
    try {
      const sessionKey = ("0x" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")).slice(0, 42) as Address;
      // TODO(P1+): replace placeholder with Porto-issued session key.
      const params = buildPortoGrantPayload({
        keeper: keeper!,
        proposal: proposal!,
        sessionPublicKey: sessionKey,
      });
      const result = await grant.mutateAsync({
        chainId: 11155111 as 11155111,
        ...params,
      });
      const permissionsId = result.id as `0x${string}`;

      setPhase("deploying");
      const res = await fetch("/api/keepers/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keeperId: keeper!.manifest.id,
          userPortoAddress: address,
          permissionsId,
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
```

- [ ] **Step 5: Run the test, expect PASS**

Run: `pnpm -F web test -- --run KeeperDeployFlow`

Expected: pass.

- [ ] **Step 6: Run the full web test suite**

Run: `pnpm -F web test -- --run`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/wish/KeeperDeployFlow.tsx apps/web/components/wish/KeeperDeployFlow.test.tsx
git commit -m "fix(keeper/deploy-flow): use Porto useGrantPermissions hook so RPC payload validates"
```

---

## Task 6: Manual end-to-end verification on Sepolia

- [ ] **Step 1: Start the dev server**

Run: `pnpm -F web dev`

Browse to https://localhost:3000.

- [ ] **Step 2: Connect a Porto wallet on Sepolia**

Use the wallet connector in the UI. Confirm the connected address shows in the header.

- [ ] **Step 3: Run the demo wish**

Click the example "deposit 10 USDC into Compound on Sepolia". Click `looks good →`, run `execute →`, sign the supply tx. Observe the SuccessCard appears with the keeper offer card visible (auto-compound COMP rewards).

- [ ] **Step 4: Trigger KH auth (if needed)**

If a `keeperhub-auth` widget appears below the success card, click `Connect KeeperHub`, complete OAuth in the popup. Expected: card flashes "KeeperHub connected ✓" and disappears within ~1.5s. The keeper offer card refreshes with current state.

- [ ] **Step 5: Deploy the keeper**

Click `deploy ✦`. The modal opens. Click `Continue →`. Approve the Porto session-key grant in the wallet. Expected: no RPC validation error. The modal advances to `deploying`, then `auto-compound active ✓`.

- [ ] **Step 6: Note any anomalies and fix or file**

If anything other than the above happens (e.g. session key error from the relay, modal stuck on `granting`), capture the error message, browser console output, and the network request body for `wallet_grantPermissions`. Address obvious bugs in this PR; file genuine open questions in `docs/superpowers/specs/2026-05-02-keeperhub-hotfix-design.md` §9 with the new findings.

- [ ] **Step 7: Final commit if any post-verification fixes**

```bash
git add -p
git commit -m "fix(keeper): post-E2E adjustments — <one line>"
```

If no fixes required, skip.

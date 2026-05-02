# KeeperHub hotfix — design spec (P0)

**Date:** 2026-05-02
**Status:** design (pre-implementation)
**Goal:** unblock the lend → keeper demo flow by fixing two regressions: the auth widget never dismisses after success, and the Porto `wallet_grantPermissions` call fails RPC validation with three errors.

---

## 1. Context

P0 of the broader KeeperHub UX overhaul (see companion specs `2026-05-02-keeperhub-deploy-modal-design.md` and `2026-05-02-keeperhub-mgmt-sketch.md`). This is the smallest, ship-today slice that gets the demo working end-to-end. UX polish lives in P1.

Live bugs observed in the running app (https://localhost:3000):

1. After OAuth success, `KeeperhubAuthCard` shows "KeeperHub connected. Retrying your request…" — but the card stays mounted forever. The retry fires; recommendation succeeds. The dangling card just clutters the page.
2. Clicking `deploy ✦` opens `KeeperDeployFlow`, user clicks **Continue**, Porto returns:
   ```
   Invalid parameters were provided to the RPC method.
   - at `params[0].feeToken`: Expected object.
   - at `params[0].permissions.spend[0].limit`: Expected string. Needs string in format ^0x[A-Fa-f0-9]+$.
   - at `params[0].permissions.spend[1].limit`: Expected string. Needs string in format ^0x[A-Fa-f0-9]+$.
   ```

The reference impl in `crypto-bro-calls/frontend/app/demo-workflow/page.tsx` works against the same Porto/Sepolia setup. Wishd already depends on `porto@^0.2.0` and `wagmi@^2.12.0`.

## 2. Goals + non-goals

**Goals:**

- Auth widget auto-dismisses 1.5s after `wishd:kh:authed` postMessage.
- `wallet_grantPermissions` succeeds with the same shape as the reference.
- Existing tests still green; new unit coverage for serialization.

**Non-goals (deferred to P1/P2):**

- Modal layout/copy redesign.
- Per-call human labels / decimal inputs.
- Keeper management UI (pause/resume/delete).
- Foreign-workflow handling.

## 3. Bug 1 — Auth widget never dismisses

### Cause

`apps/web/components/wish/KeeperhubAuthCard.tsx:20-46` sets `phase = "success"` and re-dispatches the wish event, but never removes itself from `workspace.widgets`. The `StepStack` keeps rendering it.

### Fix

1. Add `removeWidget(id: string)` action to `apps/web/store/workspace.ts`.
2. `KeeperhubAuthCard` accepts `id` (already passed by `StepStack` via `<W {...w.props} id={w.id} />` — see `components/workspace/StepStack.tsx:53`).
3. On `wishd:kh:authed`:
   1. `setPhase("success")` → flash "KeeperHub connected ✓" copy.
   2. Dispatch the existing `wishd:wish` retry event (unchanged).
   3. `setTimeout(() => removeWidget(id), 1500)`.
4. On `wishd:kh:auth-error`: keep card mounted (user retries from same card — unchanged).

`removeWidget` filters `widgets` array by id. No surprises with `confirmed`/`pending` slots — auth widget is in `slot: "flow"` only.

## 4. Bug 4 — Grant payload validation

### Causes

`apps/web/lib/keepers/buildPortoGrantPayload.ts` produces a payload that doesn't match Porto's expected shape:

| Field | Today | Required |
|---|---|---|
| `feeToken` | `undefined` | object — reference uses `{ symbol: "ETH", limit: "0.05" }` |
| `permissions.spend[].limit` | `bigint` | hex string OR bigint when going through `useGrantPermissions` hook (hook serializes) |
| `permissions.calls[].signature` | `""` | function selector signature, e.g. `"approve(address,uint256)"` |

`KeeperDeployFlow.tsx:59-62` calls `walletClient.request({ method: "wallet_grantPermissions", params: [grant] })` directly. Reference uses `useGrantPermissions().mutateAsync(params)` from `porto/wagmi/Hooks` — the hook handles bigint→hex serialization and shape adaptation.

### Fix 4a — feeToken shape

`packages/plugin-sdk/src/keeper.ts`: change `PortoPermissionsSpec.fixed.feeToken`:

```ts
// before
feeToken: Address

// after
feeToken: { symbol: string; limit: string }   // limit is decimal string, e.g. "0.05"
```

`keepers/auto-compound-comp/delegation.ts`: change `feeToken: "0x000…"` →
```ts
feeToken: { symbol: "ETH", limit: "0.05" }
```

`buildPortoGrantPayload`: pass through `keeper.delegation.fixed.feeToken` unchanged.

### Fix 4b — switch grant call to `useGrantPermissions` hook

`KeeperDeployFlow.tsx`:

- Import `useGrantPermissions` from `porto/wagmi/Hooks`.
- Replace the raw `walletClient.request(...)` call with `await grant.mutateAsync(grantParams)`.
- Keep `chainId: SEPOLIA as 11155111` (matches reference).
- `result` shape: `{ id: Hex, key: { publicKey: Hex } }`. Use `result.id` as `permissionsId`.

`buildPortoGrantPayload.ts`:

- Drop the assumption of pre-serialized hex. Return bigint limits as-is.
- Hook serializes internally.

Reference param shape we mirror exactly:
```ts
{
  chainId: 11155111,
  expiry: <unix seconds>,
  feeToken: { symbol: "ETH", limit: "0.05" },
  key: { type: "secp256k1", publicKey: <hex> },
  permissions: {
    calls: [{ to, signature }, …],
    spend: [{ token, limit: <bigint>, period: "month" }, …],
  },
}
```

### Fix 4c — call signatures

`packages/plugin-sdk/src/keeper.ts`: change `PortoPermissionsSpec.fixed.calls`:

```ts
// before
calls: Address[]

// after
calls: Array<{ to: Address; signature: string }>
```

`keepers/auto-compound-comp/delegation.ts`: provide signatures (copy from reference `crypto-bro-calls/frontend/app/demo-workflow/page.tsx:107-115`):

```ts
calls: [
  { to: COMET_REWARDS_SEPOLIA, signature: "claim(address,address,bool)" },
  { to: COMP_SEPOLIA,         signature: "approve(address,uint256)" },
  { to: UNISWAP_ROUTER_SEPOLIA, signature:
      "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" },
  { to: USDC_SEPOLIA,         signature: "approve(address,uint256)" },
  { to: COMET_USDC_SEPOLIA,   signature: "supply(address,uint256)" },
]
```

`buildPortoGrantPayload.ts`: pass through; remove `signature: ""` placeholder.

## 5. Session key

Today `KeeperDeployFlow.tsx:52` synthesizes a sessionKey from `crypto.randomUUID()` — wrong, that's not a secp256k1 public key.

Reference uses the relay-issued KH signer fetched separately. For hotfix scope: keep using a randomly generated address-shaped value to satisfy the type; document as TODO. Verify reference behavior — if the relay fills this in regardless, no functional issue. If it doesn't, file as P1 follow-up. (Note: this is *not* one of the three viem validation errors we're fixing — those errors hit before the relay sees the key.)

`useGrantPermissions` hook may also fill / require the key differently. During impl: try without explicit key first; if hook complains, generate a real secp256k1 keypair via Porto helper. Open question — confirm during build.

## 6. Trust boundary

Unchanged. `delegation.fixed.calls` and `delegation.bounds` stay immutable from agent's perspective. The signature change is structural — same allowlist, just with selectors attached.

## 7. Testing

- `keepers/auto-compound-comp/delegation.test.ts` — update expected shape assertions for `feeToken` object + calls-with-signature.
- New `apps/web/lib/keepers/buildPortoGrantPayload.test.ts` — snapshot the output for `auto-compound-comp` and assert it matches reference `params` shape.
- Manual E2E on Sepolia after merge: full lend → recommend → grant → deploy → confirmed loop.

## 8. Files touched

- `packages/plugin-sdk/src/keeper.ts` — `feeToken` shape, `calls` shape.
- `keepers/auto-compound-comp/delegation.ts` — populate new shapes.
- `keepers/auto-compound-comp/delegation.test.ts` — update.
- `apps/web/lib/keepers/buildPortoGrantPayload.ts` — drop manual serialization, pass-through new shapes.
- `apps/web/lib/keepers/buildPortoGrantPayload.test.ts` — new snapshot test.
- `apps/web/components/wish/KeeperDeployFlow.tsx` — switch to `useGrantPermissions`.
- `apps/web/components/wish/KeeperhubAuthCard.tsx` — call `removeWidget` after 1.5s success flash.
- `apps/web/store/workspace.ts` — add `removeWidget(id)` action.

## 9. Open questions / verify during impl

- `useGrantPermissions` exact import path (`porto/wagmi/Hooks` per reference). Confirm from installed `porto@^0.2.0` package.
- `feeToken.symbol` accepts `"ETH"` literal or needs registry lookup. Reference uses string literal — assume same.
- Whether session key needs to come from a Porto helper (`Porto.createSigner()`?) — handled by hook? Verify by attempting hook call with no key field first.

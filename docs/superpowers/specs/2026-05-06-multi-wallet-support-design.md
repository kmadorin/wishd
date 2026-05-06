# Multi-wallet support (EVM + Solana, connect-only)

**Status:** approved (brainstorm), pending implementation plan
**Scope:** connect-only. Solana intents and Solana keepers are out of scope and will be addressed in a follow-up spec.

## Goal

Let a user connect a Porto (EVM) wallet and a Phantom (Solana) wallet at the same time, sequentially, from the wishd header. All existing Porto flows (intents, KeeperHub session-key delegations, KeeperDeployFlow, WishComposer) continue to work unchanged.

Inspired by Jumper's wallet drawer pattern (one card per ecosystem, "Connect another wallet" CTA), but without the `@lifi/wallet-management` dependency. Wishd has only two ecosystems and a custom UI; the LiFi lib's cost (modal, i18n, opinionated UX, widget coupling) outweighs the benefit.

Portfolio / balance display is **out of scope** for this spec.

## Non-goals

- Solana intents (swap, transfer, etc.).
- Solana keepers / session-key equivalents.
- Multi-EVM connectors (MetaMask, WalletConnect, Coinbase). Porto stays the only EVM connector.
- Portfolio aggregation, balance fetching, USD totals.
- Solflare / Backpack support beyond what Wallet Standard auto-discovers (free side effect, not a goal).
- Mobile / Farcaster MiniApp / abstract-wallet connector parity.

## Architecture

### Library choice

- **EVM:** keep `wagmi` + `porto/wagmi` connector. Untouched.
- **SVM:** `@solana/react-hooks` with Wallet Standard discovery. Same approach Jumper uses (`SVMProvider.tsx`). No per-wallet adapter packages, no `@solana/wallet-adapter-react`.
- **No `@lifi/wallet-management`.** We replicate its multi-ecosystem account pattern manually with a small facade hook.

### Provider tree

In `apps/web/app/providers.tsx`:

```
<WagmiProvider>
  <QueryClientProvider>
    <SolanaProvider config autoConnect>      ← new
      <WalletMenuStoreProvider>              ← new (zustand)
        {children}
```

`SolanaProvider` sits inside `QueryClientProvider` so the Solana hooks share one React Query client.

`WalletMenuStoreProvider` is a tiny zustand store holding `{ drawerOpen: boolean; setDrawerOpen(b) }`. The picker is inline inside the drawer (decision: option A from brainstorm), so no separate `pickerOpen` state.

### State facade

New file: `apps/web/lib/wallets/useWishdAccounts.ts`.

```ts
type EvmAccount = {
  chainType: 'evm';
  address: `0x${string}`;
  chainId: number;
  connectorName: string;        // 'Porto'
};

type SvmAccount = {
  chainType: 'svm';
  address: string;              // base58 pubkey
  connectorName: string;        // wallet name from Wallet Standard, e.g. 'Phantom'
};

type WishdAccount = EvmAccount | SvmAccount;

export function useWishdAccounts(): {
  accounts: WishdAccount[];      // 0..2 entries today
  evm?: EvmAccount;
  svm?: SvmAccount;
};
```

Internally: read `useAccount()` (wagmi) for EVM, `useWallet()` (`@solana/react-hooks`) for SVM, return both.

**Existing call sites are not refactored.** WishComposer, KeeperDeployFlow, ConnectBadge consumers, plugin SDK helpers, server `proposeDelegation`, etc. continue to import `useAccount` from `wagmi`. They only ever cared about EVM. Refactoring them onto the new facade is a follow-up if and when Solana intents land.

### UI components

Three new components under `apps/web/components/wish/`:

1. **`ConnectBadge.tsx`** (rewrite of existing).
   - 0 connected → pill `"connect wallet"`. Click → open drawer (drawer auto-shows picker rows).
   - ≥1 connected → pill shows stacked truncated addresses (EVM first, then SVM). Click → open drawer.
   - Reads `useWishdAccounts()`.

2. **`WalletDrawer.tsx`** (new).
   - Right-anchored drawer.
   - Header row: close (×) on left, `"Connect another wallet"` button on right. The button scrolls / focuses the picker section below; it does not open a separate modal. Hidden when every ecosystem already has a connected account (today: both EVM and SVM connected).
   - Body, in order:
     - One `WalletCard` per connected account (ecosystem icon, truncated address, copy + explorer + disconnect icons).
     - Picker section: rows for ecosystems not yet connected (see below).

3. **`WalletPicker.tsx`** (new, rendered inline by `WalletDrawer`).
   - Iterates ecosystems: `evm`, `svm`.
   - For each, builds connector rows:
     - **EVM row:** always `Porto` (only connector wired).
     - **SVM row:** the Wallet-Standard wallet named `"Phantom"`, **only if discovered**. If Phantom is not installed, the SVM row is omitted entirely. (No "install Phantom" link in v1.)
   - If an ecosystem is already connected, its row(s) are hidden.
   - Click row → call connector's connect: `connect({ connector: portoConnector })` for EVM, `wallet.connect(walletName, { silent: false })` for SVM.

### Disconnect

Per-ecosystem, independent. Disconnecting Porto leaves Phantom connected and vice versa. Triggered from the per-card power-icon button. EVM uses wagmi `useDisconnect()`; SVM uses `useWallet().disconnect()` from `@solana/react-hooks`.

### SSR

`@solana/react-hooks` is client-only. The `SolanaProvider` subtree must be wrapped in `ClientOnly` (same pattern Jumper uses for `WalletTrackingClient`) or the provider itself must be guarded. Drawer + picker components are already `"use client"`.

### Persistence

`@solana/react-hooks` `SolanaProvider` is configured with `walletPersistence={{ autoConnect: true, storageKey: 'wishd-solana' }}`. Porto persistence is unchanged (cookie storage via wagmi).

## Risks and mitigations

1. **"No QueryClient set" recurrence (see `apps/web/CLAUDE.md`).**
   Adding `@solana/react-hooks` introduces a new package that may pull its own `wagmi` / `@tanstack/react-query` peer instance. Mitigation: when adding the package, add it (and any sibling Solana packages we adopt) to `apps/web/next.config.ts` `transpilePackages`. Verify the existing webpack alias for `@tanstack/react-query` still wins.

2. **Phantom not installed.**
   Wallet Standard discovery returns no Phantom entry → SVM row absent from picker. Acceptable for v1. Users who want Phantom will install it and refresh. Revisit if the demo needs a smoother nudge.

3. **Porto bigint serialization workaround in `providers.tsx`** must be preserved during the rewrite.

4. **Lockfile drift in worktrees** — `outputFileTracingRoot` pin must stay.

5. **Bundle weight.** `@solana/react-hooks` + `@solana/client` are heavier than the rest of the app combined per-file; the SolanaProvider subtree should be wrapped in `ClientOnly` so it doesn't ship in the SSR bundle.

## Acceptance

- User can connect Porto, then click "Connect another wallet", connect Phantom, see both addresses in a drawer with independent disconnect buttons.
- Refresh restores both connections (Porto via wagmi cookie storage, Phantom via Solana persistence key).
- All existing Porto flows pass: WishComposer intents, KeeperDeployFlow, KeeperhubAuthCard, server-side `proposeDelegation`.
- `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- No "No QueryClient set" regressions from `ConnectBadge` or any wagmi consumer.

## Open follow-ups (not in this spec)

- Solana intents and `chainType`-aware plugin SDK.
- Solana keepers / session-key equivalent.
- Portfolio / balance UI in the drawer.
- "Install Phantom" link row when not discovered.
- More EVM connectors (MetaMask / WalletConnect / Coinbase).

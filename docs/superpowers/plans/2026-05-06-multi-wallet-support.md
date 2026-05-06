# Multi-wallet support (Porto + Phantom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a wishd user connect a Porto (EVM) wallet and a Phantom (Solana) wallet at the same time, sequentially, from a header drawer. All existing Porto flows must keep working.

**Architecture:** Sibling-provider pattern (Wagmi → QueryClient → SolanaProvider → WalletMenuStoreProvider). New `useWishdAccounts` facade aggregates wagmi `useAccount()` + `@solana/react-hooks` `useWallet()`. New header components: `WalletDrawer` (right-anchored), inline `WalletPicker` (Phantom row appears only when Wallet-Standard discovery finds it), rewritten `ConnectBadge`. Per-ecosystem disconnect. Existing wagmi `useAccount()` callers untouched.

**Tech Stack:** Next.js 15, React 19, wagmi v2 + `porto/wagmi`, `@solana/react-hooks` + `@solana/client` (Wallet Standard discovery), zustand, tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-06-multi-wallet-support-design.md`

---

## File Structure

**New files:**
- `apps/web/lib/wallets/types.ts` — `WishdAccount` union + ecosystem types.
- `apps/web/lib/wallets/useWishdAccounts.ts` — facade hook reading wagmi + Solana hooks.
- `apps/web/lib/wallets/useWishdAccounts.test.ts` — facade tests.
- `apps/web/lib/wallets/solanaConfig.ts` — Solana client config helper (RPC URL resolution).
- `apps/web/store/walletMenu.ts` — zustand store for drawer open state.
- `apps/web/store/walletMenu.test.ts` — store test.
- `apps/web/components/wish/WalletDrawer.tsx` — right-anchored drawer with cards + inline picker.
- `apps/web/components/wish/WalletDrawer.test.tsx` — drawer tests.
- `apps/web/components/wish/WalletPicker.tsx` — inline connector list.
- `apps/web/components/wish/WalletPicker.test.tsx` — picker tests.
- `apps/web/components/wish/WalletCard.tsx` — single connected-account card (icon, address, disconnect).
- `apps/web/components/wish/WalletCard.test.tsx` — card test.

**Modified files:**
- `apps/web/package.json` — add `@solana/react-hooks`, `@solana/client`.
- `apps/web/next.config.ts` — extend `transpilePackages` with Solana pkgs.
- `apps/web/app/providers.tsx` — wrap children with `SolanaProvider` (ClientOnly) + `WalletMenuStoreProvider` placeholder (zustand store is hookless, no provider needed; just ensure SSR-safe).
- `apps/web/components/wish/ConnectBadge.tsx` — rewrite trigger to open drawer.
- `apps/web/components/wish/ConnectBadge.test.tsx` — new tests (file does not exist today).

**Untouched (verify after each task):**
- `apps/web/lib/wagmi.ts`, `app/layout.tsx` (initialState), `lib/keepers/*`, `server/keepers/*`, `components/wish/WishComposer.tsx`, `KeeperDeployFlow.tsx`, `KeeperhubAuthCard.tsx`, plugin SDK, plugins.

---

## Task 1: Add Solana dependencies + transpilePackages

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`

Reason this is task 1: failing to put new wagmi-adjacent packages into `transpilePackages` is the documented "No QueryClient set" recurrence (`apps/web/CLAUDE.md`). Doing it before any code that imports them avoids debugging that crash.

- [ ] **Step 1: Add deps to `apps/web/package.json`**

In the `dependencies` block, add:

```json
"@solana/client": "^3.0.0",
"@solana/react-hooks": "^3.0.0",
```

(Keep alphabetical order; place between `@modelcontextprotocol/sdk` and `@tanstack/react-query`.)

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: lockfile updates; no peer-dep errors. If `@solana/react-hooks` requires a different major than `@solana/client`, accept whatever pair pnpm resolves and pin to exact versions in `package.json`.

- [ ] **Step 3: Add Solana packages to `transpilePackages`**

Edit `apps/web/next.config.ts`. Replace the `transpilePackages` array with:

```ts
  transpilePackages: [
    "@wishd/plugin-sdk",
    "@wishd/plugin-compound-v3",
    "@wishd/plugin-uniswap",
    "@wishd/plugin-demo-stubs",
    "@wishd/tokens",
    "@solana/react-hooks",
    "@solana/client",
  ],
```

- [ ] **Step 4: Verify dev server boots**

```bash
pnpm --filter web dev
```

Expected: server starts, http://localhost:3000 renders the existing app, ConnectBadge still says "connect wallet" or shows the Porto address. No console error about QueryClient. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/next.config.ts pnpm-lock.yaml
git commit -m "chore(web): add @solana/react-hooks + @solana/client, transpile them"
```

---

## Task 2: Account types + Solana RPC config helper

**Files:**
- Create: `apps/web/lib/wallets/types.ts`
- Create: `apps/web/lib/wallets/solanaConfig.ts`

- [ ] **Step 1: Write the types file**

`apps/web/lib/wallets/types.ts`:

```ts
export type EvmAccount = {
  chainType: "evm";
  address: `0x${string}`;
  chainId: number;
  connectorName: string;
};

export type SvmAccount = {
  chainType: "svm";
  address: string;
  connectorName: string;
};

export type WishdAccount = EvmAccount | SvmAccount;
```

- [ ] **Step 2: Write the Solana config helper**

`apps/web/lib/wallets/solanaConfig.ts`:

```ts
import type { SolanaClientConfig } from "@solana/client";

const SOLANA_MAINNET_CHAIN_ID = "1151111081099710";

export function getSolanaClientConfig(): SolanaClientConfig {
  const rpc = readRpc();
  return {
    cluster: "mainnet",
    ...(rpc ? { endpoint: rpc as `https://${string}` } : {}),
  };
}

function readRpc(): string | undefined {
  const direct = process.env.NEXT_PUBLIC_SOLANA_RPC_URI;
  if (direct) return direct;
  const raw = process.env.NEXT_PUBLIC_CUSTOM_RPCS;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, string[] | undefined>;
    const list = parsed[SOLANA_MAINNET_CHAIN_ID];
    return Array.isArray(list) && list.length > 0 ? list[0] : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/wallets/types.ts apps/web/lib/wallets/solanaConfig.ts
git commit -m "feat(web): add WishdAccount types + Solana client config helper"
```

---

## Task 3: `useWishdAccounts` facade — failing test

**Files:**
- Test: `apps/web/lib/wallets/useWishdAccounts.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/lib/wallets/useWishdAccounts.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const wagmiState = {
  address: undefined as `0x${string}` | undefined,
  chainId: undefined as number | undefined,
  isConnected: false,
  connector: undefined as { name: string } | undefined,
};

const solanaState = {
  status: "disconnected" as "connected" | "disconnected",
  address: undefined as string | undefined,
  connectorName: undefined as string | undefined,
};

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: wagmiState.address,
    chainId: wagmiState.chainId,
    isConnected: wagmiState.isConnected,
    connector: wagmiState.connector,
  }),
}));

vi.mock("@solana/react-hooks", () => ({
  useWallet: () =>
    solanaState.status === "connected"
      ? {
          status: "connected",
          session: {
            address: solanaState.address!,
            connector: { name: solanaState.connectorName! },
          },
        }
      : { status: "disconnected" },
}));

import { useWishdAccounts } from "./useWishdAccounts";

describe("useWishdAccounts", () => {
  it("returns empty when nothing is connected", () => {
    Object.assign(wagmiState, { address: undefined, chainId: undefined, isConnected: false, connector: undefined });
    Object.assign(solanaState, { status: "disconnected", address: undefined, connectorName: undefined });
    const { result } = renderHook(() => useWishdAccounts());
    expect(result.current.accounts).toEqual([]);
    expect(result.current.evm).toBeUndefined();
    expect(result.current.svm).toBeUndefined();
  });

  it("returns EVM-only when only Porto is connected", () => {
    Object.assign(wagmiState, {
      address: "0x9e0f0000000000000000000000000000000bD92B" as `0x${string}`,
      chainId: 11155111,
      isConnected: true,
      connector: { name: "Porto" },
    });
    Object.assign(solanaState, { status: "disconnected", address: undefined, connectorName: undefined });
    const { result } = renderHook(() => useWishdAccounts());
    expect(result.current.evm).toEqual({
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    });
    expect(result.current.svm).toBeUndefined();
    expect(result.current.accounts).toHaveLength(1);
  });

  it("returns both when Porto and Phantom are connected, EVM first", () => {
    Object.assign(wagmiState, {
      address: "0x9e0f0000000000000000000000000000000bD92B" as `0x${string}`,
      chainId: 11155111,
      isConnected: true,
      connector: { name: "Porto" },
    });
    Object.assign(solanaState, {
      status: "connected",
      address: "FrXc3Ux0000000000000000000000000000D1HyJ",
      connectorName: "Phantom",
    });
    const { result } = renderHook(() => useWishdAccounts());
    expect(result.current.accounts).toHaveLength(2);
    expect(result.current.accounts[0].chainType).toBe("evm");
    expect(result.current.accounts[1].chainType).toBe("svm");
    expect(result.current.svm?.connectorName).toBe("Phantom");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter web test -- useWishdAccounts
```

Expected: FAIL — "Cannot find module './useWishdAccounts'".

---

## Task 4: `useWishdAccounts` facade — implementation

**Files:**
- Create: `apps/web/lib/wallets/useWishdAccounts.ts`

- [ ] **Step 1: Write the implementation**

`apps/web/lib/wallets/useWishdAccounts.ts`:

```ts
"use client";

import { useAccount } from "wagmi";
import { useWallet } from "@solana/react-hooks";
import type { EvmAccount, SvmAccount, WishdAccount } from "./types";

export function useWishdAccounts(): {
  accounts: WishdAccount[];
  evm?: EvmAccount;
  svm?: SvmAccount;
} {
  const wagmi = useAccount();
  const solana = useWallet();

  const evm: EvmAccount | undefined =
    wagmi.isConnected && wagmi.address && wagmi.chainId
      ? {
          chainType: "evm",
          address: wagmi.address,
          chainId: wagmi.chainId,
          connectorName: wagmi.connector?.name ?? "Unknown",
        }
      : undefined;

  const svm: SvmAccount | undefined =
    solana.status === "connected"
      ? {
          chainType: "svm",
          address: solana.session.address,
          connectorName: solana.session.connector.name,
        }
      : undefined;

  const accounts: WishdAccount[] = [];
  if (evm) accounts.push(evm);
  if (svm) accounts.push(svm);

  return { accounts, evm, svm };
}
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pnpm --filter web test -- useWishdAccounts
```

Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/wallets/useWishdAccounts.ts apps/web/lib/wallets/useWishdAccounts.test.ts
git commit -m "feat(web): add useWishdAccounts facade combining wagmi + solana"
```

---

## Task 5: Wallet menu zustand store

**Files:**
- Test: `apps/web/store/walletMenu.test.ts`
- Create: `apps/web/store/walletMenu.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/store/walletMenu.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useWalletMenu } from "./walletMenu";

describe("walletMenu store", () => {
  beforeEach(() => useWalletMenu.getState().close());

  it("starts closed", () => {
    expect(useWalletMenu.getState().drawerOpen).toBe(false);
  });

  it("open() flips drawerOpen to true", () => {
    useWalletMenu.getState().open();
    expect(useWalletMenu.getState().drawerOpen).toBe(true);
  });

  it("close() flips drawerOpen to false", () => {
    useWalletMenu.getState().open();
    useWalletMenu.getState().close();
    expect(useWalletMenu.getState().drawerOpen).toBe(false);
  });

  it("toggle() inverts drawerOpen", () => {
    useWalletMenu.getState().toggle();
    expect(useWalletMenu.getState().drawerOpen).toBe(true);
    useWalletMenu.getState().toggle();
    expect(useWalletMenu.getState().drawerOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter web test -- store/walletMenu
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the store**

`apps/web/store/walletMenu.ts`:

```ts
import { create } from "zustand";

type WalletMenuState = {
  drawerOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export const useWalletMenu = create<WalletMenuState>((set) => ({
  drawerOpen: false,
  open: () => set({ drawerOpen: true }),
  close: () => set({ drawerOpen: false }),
  toggle: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
}));
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter web test -- store/walletMenu
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/store/walletMenu.ts apps/web/store/walletMenu.test.ts
git commit -m "feat(web): add walletMenu zustand store"
```

---

## Task 6: `WalletCard` component (one connected account)

**Files:**
- Test: `apps/web/components/wish/WalletCard.test.tsx`
- Create: `apps/web/components/wish/WalletCard.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/components/wish/WalletCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletCard } from "./WalletCard";

describe("WalletCard", () => {
  it("renders ecosystem label, truncated address, disconnect button", () => {
    render(
      <WalletCard
        chainType="evm"
        address="0x9e0f0000000000000000000000000000000bD92B"
        connectorName="Porto"
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByText(/porto/i)).toBeInTheDocument();
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
  });

  it("calls onDisconnect when the disconnect button is clicked", async () => {
    const onDisconnect = vi.fn();
    render(
      <WalletCard
        chainType="svm"
        address="FrXc3Ux0000000000000000000000000000D1HyJ"
        connectorName="Phantom"
        onDisconnect={onDisconnect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("truncates SVM addresses to first6…last4", () => {
    render(
      <WalletCard
        chainType="svm"
        address="FrXc3Ux0000000000000000000000000000D1HyJ"
        connectorName="Phantom"
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByText(/FrXc3U…D1HyJ/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter web test -- WalletCard
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `WalletCard.tsx`**

`apps/web/components/wish/WalletCard.tsx`:

```tsx
"use client";

type Props = {
  chainType: "evm" | "svm";
  address: string;
  connectorName: string;
  onDisconnect: () => void;
};

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletCard({ chainType, address, connectorName, onDisconnect }: Props) {
  const ecosystem = chainType === "evm" ? "EVM" : "Solana";
  return (
    <div className="rounded-md border border-rule bg-bg-2 p-3 flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-xs text-ink-3 uppercase">
          {ecosystem} · {connectorName}
        </span>
        <span className="font-mono text-sm text-ink">{truncate(address)}</span>
      </div>
      <button
        type="button"
        aria-label={`disconnect ${connectorName}`}
        onClick={onDisconnect}
        className="rounded-pill border border-rule px-3 py-1 text-xs text-ink-2 hover:text-ink"
      >
        disconnect
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter web test -- WalletCard
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/WalletCard.tsx apps/web/components/wish/WalletCard.test.tsx
git commit -m "feat(web): add WalletCard for connected account display"
```

---

## Task 7: `WalletPicker` component (inline connector list)

**Files:**
- Test: `apps/web/components/wish/WalletPicker.test.tsx`
- Create: `apps/web/components/wish/WalletPicker.tsx`

The picker is a controlled component: parent passes the list of available rows. It does NOT call wagmi/Solana hooks itself. This keeps it testable without provider setup and decouples wallet-discovery from rendering.

- [ ] **Step 1: Write the failing test**

`apps/web/components/wish/WalletPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletPicker } from "./WalletPicker";

describe("WalletPicker", () => {
  it("renders one row per option with ecosystem label", () => {
    render(
      <WalletPicker
        rows={[
          { id: "porto", chainType: "evm", label: "Porto", onSelect: () => {} },
          { id: "phantom", chainType: "svm", label: "Phantom", onSelect: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /porto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /phantom/i })).toBeInTheDocument();
  });

  it("calls onSelect for the clicked row", async () => {
    const portoSelect = vi.fn();
    const phantomSelect = vi.fn();
    render(
      <WalletPicker
        rows={[
          { id: "porto", chainType: "evm", label: "Porto", onSelect: portoSelect },
          { id: "phantom", chainType: "svm", label: "Phantom", onSelect: phantomSelect },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /phantom/i }));
    expect(phantomSelect).toHaveBeenCalledOnce();
    expect(portoSelect).not.toHaveBeenCalled();
  });

  it("renders nothing when rows is empty", () => {
    const { container } = render(<WalletPicker rows={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter web test -- WalletPicker
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `WalletPicker.tsx`**

`apps/web/components/wish/WalletPicker.tsx`:

```tsx
"use client";

export type WalletPickerRow = {
  id: string;
  chainType: "evm" | "svm";
  label: string;
  onSelect: () => void;
};

type Props = {
  rows: WalletPickerRow[];
};

export function WalletPicker({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={row.onSelect}
            className="w-full text-left rounded-md border border-rule bg-bg-2 px-3 py-2 hover:border-accent"
          >
            <span className="text-xs text-ink-3 uppercase mr-2">
              {row.chainType === "evm" ? "EVM" : "Solana"}
            </span>
            <span className="text-sm text-ink">{row.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter web test -- WalletPicker
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/wish/WalletPicker.tsx apps/web/components/wish/WalletPicker.test.tsx
git commit -m "feat(web): add WalletPicker presentational component"
```

---

## Task 8: `WalletDrawer` — failing test

**Files:**
- Test: `apps/web/components/wish/WalletDrawer.test.tsx`

The drawer is the integration point: it reads the menu store, the facade hook, and the available SVM wallets from `@solana/react-hooks`, builds picker rows, and wires connect/disconnect actions. We mock the lower layers and assert the rendered tree.

- [ ] **Step 1: Write the failing test**

`apps/web/components/wish/WalletDrawer.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWalletMenu } from "@/store/walletMenu";

const accountsState = {
  evm: undefined as undefined | { chainType: "evm"; address: string; chainId: number; connectorName: string },
  svm: undefined as undefined | { chainType: "svm"; address: string; connectorName: string },
};

vi.mock("@/lib/wallets/useWishdAccounts", () => ({
  useWishdAccounts: () => ({
    evm: accountsState.evm,
    svm: accountsState.svm,
    accounts: [accountsState.evm, accountsState.svm].filter(Boolean),
  }),
}));

const wagmiConnectMock = vi.fn();
const wagmiDisconnectMock = vi.fn();

vi.mock("wagmi", () => ({
  useConnect: () => ({ connect: wagmiConnectMock, isPending: false }),
  useDisconnect: () => ({ disconnect: wagmiDisconnectMock }),
  useConnectors: () => [{ id: "porto", name: "Porto" }],
}));

const solanaConnectMock = vi.fn();
const solanaDisconnectMock = vi.fn();
const solanaWalletsState = {
  wallets: [{ name: "Phantom" }] as Array<{ name: string }>,
};

vi.mock("@solana/react-hooks", () => ({
  useWallets: () => solanaWalletsState.wallets,
  useWallet: () => ({ status: "disconnected" }),
  useWalletStandardConnect: () => ({ connect: solanaConnectMock }),
  useWalletStandardDisconnect: () => ({ disconnect: solanaDisconnectMock }),
}));

import { WalletDrawer } from "./WalletDrawer";

describe("WalletDrawer", () => {
  beforeEach(() => {
    accountsState.evm = undefined;
    accountsState.svm = undefined;
    solanaWalletsState.wallets = [{ name: "Phantom" }];
    wagmiConnectMock.mockReset();
    wagmiDisconnectMock.mockReset();
    solanaConnectMock.mockReset();
    solanaDisconnectMock.mockReset();
    useWalletMenu.getState().close();
  });

  it("does not render when drawer is closed", () => {
    render(<WalletDrawer />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders both picker rows when nothing is connected", () => {
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    expect(screen.getByRole("button", { name: /porto/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /phantom/i })).toBeInTheDocument();
  });

  it("hides Phantom row when not discovered", () => {
    solanaWalletsState.wallets = [];
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    expect(screen.getByRole("button", { name: /porto/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /phantom/i })).toBeNull();
  });

  it("shows EVM card and hides Porto row when EVM connected", () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^porto$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /phantom/i })).toBeInTheDocument();
  });

  it("hides 'Connect another wallet' button when both ecosystems are connected", () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    accountsState.svm = {
      chainType: "svm",
      address: "FrXc3Ux0000000000000000000000000000D1HyJ",
      connectorName: "Phantom",
    };
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    expect(screen.queryByRole("button", { name: /connect another wallet/i })).toBeNull();
  });

  it("calls wagmi connect when Porto row is clicked", async () => {
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    await userEvent.click(screen.getByRole("button", { name: /porto/i }));
    expect(wagmiConnectMock).toHaveBeenCalledOnce();
  });

  it("calls solana connect when Phantom row is clicked", async () => {
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    await userEvent.click(screen.getByRole("button", { name: /phantom/i }));
    expect(solanaConnectMock).toHaveBeenCalledOnce();
  });

  it("disconnects EVM when EVM card disconnect button is clicked", async () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    useWalletMenu.getState().open();
    render(<WalletDrawer />);
    await userEvent.click(screen.getByRole("button", { name: /disconnect porto/i }));
    expect(wagmiDisconnectMock).toHaveBeenCalledOnce();
    expect(solanaDisconnectMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter web test -- WalletDrawer
```

Expected: FAIL — module `./WalletDrawer` not found.

---

## Task 9: `WalletDrawer` — implementation

**Files:**
- Create: `apps/web/components/wish/WalletDrawer.tsx`

- [ ] **Step 1: Write the implementation**

`apps/web/components/wish/WalletDrawer.tsx`:

```tsx
"use client";

import { useConnect, useConnectors, useDisconnect } from "wagmi";
import {
  useWallets,
  useWalletStandardConnect,
  useWalletStandardDisconnect,
} from "@solana/react-hooks";
import { useWalletMenu } from "@/store/walletMenu";
import { useWishdAccounts } from "@/lib/wallets/useWishdAccounts";
import { WalletCard } from "./WalletCard";
import { WalletPicker, type WalletPickerRow } from "./WalletPicker";

const PHANTOM_NAME = "Phantom";

export function WalletDrawer() {
  const { drawerOpen, close } = useWalletMenu();
  const { evm, svm } = useWishdAccounts();

  const connectors = useConnectors();
  const portoConnector = connectors.find((c) => c.id === "porto") ?? connectors[0];
  const { connect: wagmiConnect } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const solanaWallets = useWallets();
  const phantomWallet = solanaWallets.find((w) => w.name === PHANTOM_NAME);
  const { connect: solanaConnect } = useWalletStandardConnect();
  const { disconnect: solanaDisconnect } = useWalletStandardDisconnect();

  if (!drawerOpen) return null;

  const rows: WalletPickerRow[] = [];
  if (!evm && portoConnector) {
    rows.push({
      id: "porto",
      chainType: "evm",
      label: "Porto",
      onSelect: () => wagmiConnect({ connector: portoConnector }),
    });
  }
  if (!svm && phantomWallet) {
    rows.push({
      id: "phantom",
      chainType: "svm",
      label: "Phantom",
      onSelect: () => solanaConnect(phantomWallet),
    });
  }

  const showConnectAnother = rows.length > 0;

  return (
    <div
      role="dialog"
      aria-label="wallets"
      className="fixed inset-y-0 right-0 z-50 w-[360px] bg-bg-1 border-l border-rule p-4 flex flex-col gap-4 overflow-y-auto"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="close wallet menu"
          onClick={close}
          className="rounded-pill border border-rule px-3 py-1 text-sm text-ink-2 hover:text-ink"
        >
          ×
        </button>
        {showConnectAnother && (
          <span className="text-xs uppercase text-ink-3">Connect another wallet</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {evm && (
          <WalletCard
            chainType="evm"
            address={evm.address}
            connectorName={evm.connectorName}
            onDisconnect={() => wagmiDisconnect()}
          />
        )}
        {svm && (
          <WalletCard
            chainType="svm"
            address={svm.address}
            connectorName={svm.connectorName}
            onDisconnect={() => solanaDisconnect()}
          />
        )}
      </div>

      {rows.length > 0 && <WalletPicker rows={rows} />}
    </div>
  );
}
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pnpm --filter web test -- WalletDrawer
```

Expected: 8 PASS.

NOTE on hook names: if `@solana/react-hooks` exports `useWalletStandardConnect` / `useWalletStandardDisconnect` under a different name in the installed version (the API surface evolved during Wallet-Standard adoption), update both this file AND the test mock to the actual export names. Confirm by running `node -e "console.log(Object.keys(require('@solana/react-hooks')))"`. The test must continue to pass after any rename — the names appear in the test mock above.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/wish/WalletDrawer.tsx apps/web/components/wish/WalletDrawer.test.tsx
git commit -m "feat(web): add WalletDrawer with multi-ecosystem picker + cards"
```

---

## Task 10: Rewrite `ConnectBadge` to open the drawer

**Files:**
- Test: `apps/web/components/wish/ConnectBadge.test.tsx`
- Modify: `apps/web/components/wish/ConnectBadge.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/components/wish/ConnectBadge.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWalletMenu } from "@/store/walletMenu";

const accountsState = {
  evm: undefined as undefined | { chainType: "evm"; address: string; chainId: number; connectorName: string },
  svm: undefined as undefined | { chainType: "svm"; address: string; connectorName: string },
};

vi.mock("@/lib/wallets/useWishdAccounts", () => ({
  useWishdAccounts: () => ({
    evm: accountsState.evm,
    svm: accountsState.svm,
    accounts: [accountsState.evm, accountsState.svm].filter(Boolean),
  }),
}));

import { ConnectBadge } from "./ConnectBadge";

describe("ConnectBadge", () => {
  beforeEach(() => {
    accountsState.evm = undefined;
    accountsState.svm = undefined;
    useWalletMenu.getState().close();
  });

  it("renders 'connect wallet' when nothing is connected", () => {
    render(<ConnectBadge />);
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("opens the drawer on click", async () => {
    render(<ConnectBadge />);
    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    expect(useWalletMenu.getState().drawerOpen).toBe(true);
  });

  it("shows the EVM truncated address when only EVM is connected", () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    render(<ConnectBadge />);
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
  });

  it("shows both truncated addresses when both ecosystems connected", () => {
    accountsState.evm = {
      chainType: "evm",
      address: "0x9e0f0000000000000000000000000000000bD92B",
      chainId: 11155111,
      connectorName: "Porto",
    };
    accountsState.svm = {
      chainType: "svm",
      address: "FrXc3Ux0000000000000000000000000000D1HyJ",
      connectorName: "Phantom",
    };
    render(<ConnectBadge />);
    expect(screen.getByText(/0x9e0f…D92B/)).toBeInTheDocument();
    expect(screen.getByText(/FrXc3U…D1HyJ/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter web test -- ConnectBadge
```

Expected: FAIL — current `ConnectBadge` reads wagmi directly and doesn't expose `connect wallet` text the same way / doesn't open the drawer.

- [ ] **Step 3: Replace the file**

Replace `apps/web/components/wish/ConnectBadge.tsx` with:

```tsx
"use client";

import { useWalletMenu } from "@/store/walletMenu";
import { useWishdAccounts } from "@/lib/wallets/useWishdAccounts";

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectBadge() {
  const { open } = useWalletMenu();
  const { evm, svm } = useWishdAccounts();
  const connectedCount = (evm ? 1 : 0) + (svm ? 1 : 0);

  if (connectedCount === 0) {
    return (
      <button
        type="button"
        onClick={open}
        className="ml-auto rounded-pill bg-accent text-ink px-4 py-1 text-sm font-semibold hover:bg-accent-2"
      >
        connect wallet
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title="manage wallets"
      className="ml-auto rounded-pill bg-bg-2 border border-rule px-3 py-1 text-xs font-mono text-ink-2 hover:text-ink flex items-center gap-2"
    >
      {evm && <span>{truncate(evm.address)}</span>}
      {evm && svm && <span className="text-ink-3">·</span>}
      {svm && <span>{truncate(svm.address)}</span>}
    </button>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter web test -- ConnectBadge
```

Expected: 4 PASS.

- [ ] **Step 5: Confirm no existing test that imports ConnectBadge regressed**

```bash
pnpm --filter web test
```

Expected: full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/wish/ConnectBadge.tsx apps/web/components/wish/ConnectBadge.test.tsx
git commit -m "feat(web): rewrite ConnectBadge to open multi-wallet drawer"
```

---

## Task 11: Mount `SolanaProvider` and render `WalletDrawer`

**Files:**
- Modify: `apps/web/app/providers.tsx`
- Modify: `apps/web/app/layout.tsx`

The drawer must render somewhere persistent. Easiest: render it from layout next to `KeeperDeployFlow`. The Solana provider must wrap the drawer; cleanest place is inside `Providers`.

- [ ] **Step 1: Add a `ClientOnly` helper if one does not exist**

Check first:

```bash
grep -rn "ClientOnly" apps/web/components apps/web/lib 2>/dev/null
```

If no result, create `apps/web/components/primitives/ClientOnly.tsx`:

```tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";

export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap providers tree with `SolanaProvider`**

Replace `apps/web/app/providers.tsx` body to:

```tsx
"use client";

import { type State, WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SolanaProvider } from "@solana/react-hooks";
import { getConfig } from "@/lib/wagmi";
import { getSolanaClientConfig } from "@/lib/wallets/solanaConfig";
import { ClientOnly } from "@/components/primitives/ClientOnly";

if (typeof window !== "undefined" && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

type Props = {
  children: ReactNode;
  initialState: State | undefined;
};

export function Providers({ children, initialState }: Props) {
  const [config] = useState(() => getConfig());
  const [qc] = useState(() => new QueryClient());
  const [solanaConfig] = useState(() => getSolanaClientConfig());

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={qc}>
        <ClientOnly>
          <SolanaProvider
            config={solanaConfig}
            walletPersistence={{ autoConnect: true, storageKey: "wishd-solana" }}
          >
            {children}
          </SolanaProvider>
        </ClientOnly>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

NOTE: SSR for the Solana subtree is skipped via `ClientOnly`. This means children inside the Solana tree do NOT render on the server. If a server-rendered child outside the Solana tree is required, lift it above `<ClientOnly>` (none needed today — `KeeperDeployFlow` only consumes wagmi, fine to remain inside Solana tree).

- [ ] **Step 3: Render `WalletDrawer` from layout**

Edit `apps/web/app/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Providers } from "./providers";
import { getConfig } from "@/lib/wagmi";
import { KeeperDeployFlow } from "@/components/wish/KeeperDeployFlow";
import { WalletDrawer } from "@/components/wish/WalletDrawer";
import "./globals.css";

export const metadata = {
  title: "wishd — defi by wishing it",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = cookieToInitialState(getConfig(), (await headers()).get("cookie"));
  return (
    <html lang="en">
      <body>
        <Providers initialState={initialState}>
          {children}
          <KeeperDeployFlow />
          <WalletDrawer />
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Typecheck + run all tests**

```bash
pnpm --filter web typecheck
pnpm --filter web test
```

Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/providers.tsx apps/web/app/layout.tsx apps/web/components/primitives/ClientOnly.tsx
git commit -m "feat(web): mount SolanaProvider + render WalletDrawer in root layout"
```

---

## Task 12: Manual smoke test + build

**Files:** none modified.

- [ ] **Step 1: Start dev server**

```bash
pnpm --filter web dev
```

Open http://localhost:3000.

- [ ] **Step 2: Verify ConnectBadge initial state**

Expected: pill says "connect wallet". No console errors. No "No QueryClient set" error.

- [ ] **Step 3: Connect Porto**

Click "connect wallet" → drawer opens → click "Porto" row. Approve in Porto. Drawer should now show one EVM card with truncated address. Phantom row still visible (assuming Phantom installed).

- [ ] **Step 4: Connect Phantom**

Click "Phantom" row in the drawer. Approve in Phantom. Drawer should now show TWO cards (EVM + Solana). The picker section should be empty (both connected).

- [ ] **Step 5: Disconnect Phantom only**

Click "disconnect" on the Solana card. Card disappears. Phantom row reappears in the picker. EVM card and Porto session still intact.

- [ ] **Step 6: Reconnect Phantom, then refresh page**

Reconnect Phantom. Hard-reload (Cmd+Shift+R). Both wallets should auto-reconnect (Porto via wagmi cookie storage, Phantom via Solana persistence).

- [ ] **Step 7: Smoke an existing Porto flow**

Use the wish composer to run an intent that previously worked (e.g. "swap 0.001 ETH for USDC" on Sepolia). Confirm the existing KeeperDeployFlow / WishComposer paths still trigger and reach Porto signing without regression.

- [ ] **Step 8: Stop dev server, run production build**

```bash
pnpm --filter web build
```

Expected: build success. No "No QueryClient set" warnings, no Solana SSR errors.

- [ ] **Step 9: Run full test suite**

```bash
pnpm test
pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 10: Final commit if anything changed**

If steps 1–9 surfaced fixes, commit them. Otherwise nothing to do here.

---

## Self-review notes

- Spec acceptance criteria:
  - Sequential connect of Porto + Phantom → Tasks 9, 11, 12 step 3–4.
  - Independent disconnect → Task 9 (mock test) + Task 12 step 5.
  - Refresh restores both → Task 11 (`autoConnect`) + Task 12 step 6.
  - Existing Porto flows pass → Task 12 step 7 + full test suite at Task 11 step 4.
  - `pnpm typecheck`, `pnpm test`, `pnpm build` pass → Task 12 steps 8–9.
  - No "No QueryClient" regression → Task 1 step 4 + Task 12 step 2.
- Risks from spec:
  - `transpilePackages` updated in Task 1.
  - Phantom-not-installed handled in Task 9 / Task 8 test "hides Phantom row when not discovered".
  - `BigInt.prototype.toJSON` patch preserved in Task 11 step 2.
  - `outputFileTracingRoot` not touched.
  - `ClientOnly` wrap in Task 11 step 2.
- Scope: connect-only. No intent / keeper / portfolio code added. Confirmed.
- Naming consistency: `useWishdAccounts` referenced identically across Tasks 3–11. `useWalletMenu` store API (`open`, `close`, `toggle`, `drawerOpen`) referenced identically across Tasks 5, 9, 10. `WalletPickerRow` shape consistent between Tasks 7 and 9.

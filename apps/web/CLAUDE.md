# apps/web — agent notes

## Recurring trap: "No QueryClient set" / wagmi context errors

**Symptom:** `ConnectBadge` (or any `useConnect`/`useQueryClient` consumer) throws `No QueryClient set, use QueryClientProvider to set one` at render — even though `<Providers>` clearly wraps `<children>` in `app/layout.tsx`.

**Cause:** Two copies of `@tanstack/react-query` (or `wagmi`) end up loaded as different module instances. `Providers` registers the QueryClient on context A; `useConnect` reads context B; React sees no provider in B's context.

**Two known triggers — fix BOTH:**

1. **New workspace plugin not in `transpilePackages`.** Any `@wishd/plugin-*` that imports `wagmi` MUST be listed in `apps/web/next.config.ts` `transpilePackages`. Otherwise Next treats it as an external CJS module and resolves its `wagmi` peer through a different path. Currently required entries: `@wishd/plugin-sdk`, `@wishd/plugin-compound-v3`, `@wishd/plugin-uniswap`, `@wishd/plugin-demo-stubs`, `@wishd/tokens`. **When adding a new plugin, add it to this list immediately.**

2. **Multiple lockfiles in sibling worktrees.** When working under `.worktrees/<branch>/`, Next's lockfile auto-detection can pick the main repo's `pnpm-lock.yaml` instead of the worktree's. This silently bridges two `node_modules` trees and produces duplicate module instances. `outputFileTracingRoot` in `next.config.ts` is pinned to `path.join(__dirname, "../..")` to prevent this. **Do not remove it.**

3. **Webpack alias.** `next.config.ts` has a hard alias `@tanstack/react-query$ → require.resolve(...)` to force a single instance. This is the last-line defense. **Do not remove it.**

When you see this error: don't refactor providers. Check (1) → (2) → (3) in this order. The third recurrence of this bug was caused by missing `@wishd/plugin-uniswap` from `transpilePackages` and a worktree lockfile bridge.

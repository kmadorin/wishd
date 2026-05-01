# wishd — defi by wishing it

Agentic DeFi assistant. v0 vertical slice: deposit USDC into Compound v3 on Sepolia, driven by a Claude Agent SDK loop that emits dynamic widgets over SSE.

## Run

```bash
pnpm install
cp .env.local.example .env.local
# edit .env.local: ANTHROPIC_API_KEY=sk-ant-...
pnpm dev
```

Open http://localhost:3000. Connect Porto. Fund with Sepolia ETH + Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`). Type or pick a wish.

## Layout

- `apps/web` — Next.js 15 App Router, agent route, UI
- `packages/plugin-sdk` — types (Plugin, Keeper, ServerEvent)
- `plugins/compound-v3` — only plugin v0
- `keepers/` — empty in v0; reserved
- `prototype/` — original visual reference

## Spec + plan

- Spec: `docs/superpowers/specs/2026-05-01-wishd-skeleton-design.md`
- Plan: `docs/superpowers/plans/2026-05-01-wishd-skeleton.md`

## Tests

```bash
pnpm test          # unit tests for pure functions
pnpm typecheck     # strict TS across workspaces
```

Integration is verified manually per the spec's verification section.

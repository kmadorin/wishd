# Demo Recording Runbook (2026-05-02)

## 0. Prereqs

- All tasks 1–13 from `docs/superpowers/plans/2026-05-02-demo-prerequisites.md` are merged.
- Porto delegation modal work (separate workstream) is merged.
- Porto wallet on Sepolia funded with: ≥0.05 ETH for gas, ≥100 USDC for Compound deposit + auto-compound headroom.
- KeeperHub account exists; auth dance completed at least once so token cache is warm.
- `KH_BASE_URL` and `KH_ACCESS_TOKEN` (or full OAuth token in cache) present in `.env.local`.
- Anthropic key present (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`).

## 1. Build + serve

```bash
pnpm install
pnpm -r build
pnpm --filter @wishd/web start
```

Verify `http://localhost:3000` loads. Use HTTP, not HTTPS — avoids cert warning.

## 2. Browser setup

- Fresh Chrome profile, no extensions.
- Window: 1920×1080.
- Cursor highlight extension installed (e.g. "Pointer Crosshair") and enabled.
- Notification banners disabled (system + browser).
- Tab 1: `http://localhost:3000`.
- Tab 2: `https://app.keeperhub.com` — logged in to the same account.

## 3. State reset

- Reload tab 1 to ensure composer is in empty initial state.
- KeeperHub dashboard: scroll to the workflows list so a freshly-deployed workflow will be visible without scrolling during the cmd-tab cut.

## 4. Rehearsal pass

Run the full 60-second script silently. Time each beat. If over 60s, trim VO; do not cut beats.

## 5. Take

- OBS or QuickTime recording at 1080p, 60fps.
- Multiple takes for beat 2 (Uniswap swap) and beat 3 (Compound deposit) — Sepolia confirm latency is variable. Keep the cleanest.

## 6. Post

- Voiceover recorded separately, timed to the script in `docs/superpowers/specs/2026-05-02-demo-script-design.md` §2.
- Render at 1080p.
- Upload to submission form.

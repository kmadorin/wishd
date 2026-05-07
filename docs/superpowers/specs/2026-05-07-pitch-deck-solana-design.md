# Pitch Deck — Solana Colosseum

Spec for adapting `experiments/pitch-deck` (ETHGlobal Open Agents) into `experiments/pitch-deck-solana` (Solana Colosseum hackathon submission).

## Goal

Reuse the existing 7-slide deck. Swap hackathon branding, swap the ETH-only narrative for a multi-chain (EVM + Solana) story that highlights Jupiter swaps and Li.Fi cross-chain bridging.

## Scope

- Copy `experiments/pitch-deck/` → `experiments/pitch-deck-solana/` verbatim, then mutate.
- Edit HTML slides + CSS only. Do **not** touch `SPEECH.md` or `RECORDING.md`.
- Capture 1 fresh app screenshot via Claude for Chrome.

Out of scope: deck infrastructure changes, new slides, redesigning layouts, content rewrites for slides 5–7.

## Slide-by-slide changes

### Slide 1 — title
- Footer: `Kirill Madorin · ETHGlobal Open Agents 2026` → `Kirill Madorin · Solana Colosseum 2026`
- `<title>` tag and any page-meta text referencing the old hackathon → Solana Colosseum.

### Slide 2 — problem
- Unchanged.

### Slide 3 — solution
- Hero image `assets/screenshot-hero.png` → replace with fresh capture: composer set to **bridge 10 USDC on Ethereum → USDC on Solana** + the rendered `lifi-bridge-summary` widget below (single screenshot covering both, as the live app already stacks them).
- Bullet 3 text:
  - Old: `Funds stay in your wallet. Porto session-keys, scoped per workflow.`
  - New: `Funds stay in your wallet. Session-keys, scoped per workflow.`
- All other bullets unchanged.

### Slide 4 — how it works
SVG diagram + callout edits in `slide-04-how.html`.

**Browser box (top-left):**
- Old: `Porto wallet (sign)`
- New: `Wallets (sign)`

**Server box (top-right) — MCP/plugins list:**
- Drop: `├─ MCP: uniswap.*`, `├─ plugins/uniswap`, `├─ plugins/compound-v3`, `└─ keepers/auto-compound-comp`
- Replace with:
  ```
  ├─ MCP: jupiter.*
  ├─ MCP: lifi.*
  ├─ plugins/jupiter
  ├─ plugins/lifi
  └─ automations/dca-weekly
  ```
- Keep `├─ MCP: keeperhub.*` line but rename → `├─ MCP: automationshub.*` (consistent with box rename below).

**KeeperHub box (bottom-left):**
- Title: `KeeperHub (off-app)` → `AutomationsHub (off-app)`
- Subtext unchanged (`deterministic DAG`, `cron-scheduled exec`).

**Onchain box (bottom-right):**
- Old: `Uniswap · Compound (Sepolia)`
- New: `Solana (Jupiter) · Ethereum (Li.Fi bridge)`

**Callout text (right column):**
- Callout 2: `Porto session-key per workflow — token / cap / expiry. Revocable.` → `Session-key per workflow — token / cap / expiry. Revocable.`
- Callout 3: `KH executes, not LLM.` → `AutomationsHub executes, not LLM.`
- SVG label `Porto session-key` (mid-arrow) → `Session-key`.

### Slide 5 — next
- Unchanged content. Footer/page meta updated only if it references ETHGlobal.

### Slide 6 — team
- Unchanged content. Footer/page meta updated only if it references ETHGlobal.

### Slide 7 — thanks
- Unchanged content. Footer/page meta updated only if it references ETHGlobal.

### `index.html`
- Update any deck-level title/meta references from ETHGlobal Open Agents → Solana Colosseum.

### `styles.css`
- No changes expected. If a class is renamed for clarity it stays scoped to this folder.

## Asset capture

Use Claude for Chrome against `https://localhost:3000/` (already verified working in this session).

Capture flow:
1. Open composer, pick `bridge`.
2. Set: amount `10`, source `USDC` on `Ethereum`, dest `USDC` on `Solana`.
3. Click `looks good →`. Wait for `render lifi-bridge-summary` event.
4. Take a single screenshot covering composer + summary widget.
5. Save to `experiments/pitch-deck-solana/assets/screenshot-hero.png` (overwrites the copied ETH version).

Other screenshots in `screenshots/` (slide-01.png … slide-07.png) are full-slide renders — regenerate by re-rendering each HTML page after edits using whatever capture tool the original deck used. If unclear, leave them stale; the live HTML is the source of truth.

## Acceptance

- `experiments/pitch-deck-solana/` exists with all 7 slides + `index.html` + `styles.css` + `assets/screenshot-hero.png` (fresh) + `screenshots/` (may be stale).
- No string `Porto`, `Uniswap`, `Compound`, `KeeperHub`, `auto-compound-comp`, or `ETHGlobal` remains in the new folder's HTML.
- Slide 4 SVG renders cleanly (no overflow from new label lengths).
- Hero image visibly shows Solana destination chain in the bridge widget.

## Non-goals / explicit punts

- Not updating `SPEECH.md` / `RECORDING.md`.
- Not regenerating per-slide PNGs in `screenshots/` automatically.
- No new slides, no Solana-specific content for slides 5–7.
- Not generalizing the deck to be a single source for both hackathons — two independent folders.

# Pitch Deck — Solana Startup Competition Belgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt `experiments/pitch-deck` (ETHGlobal) into `experiments/pitch-deck-solana` (Solana Startup Competition Belgrade) by copying the folder and editing slide content + capturing one fresh hero screenshot.

**Architecture:** Pure HTML/CSS deck with 7 standalone slide files driven by an `index.html` iframe controller. Each slide is self-contained — no shared JS state, no build step. Edits are surgical text/SVG swaps inside HTML files.

**Tech Stack:** Static HTML, inline CSS/SVG, Google Fonts. Screenshot capture via Claude for Chrome (already-running dev app at `https://localhost:3000/`).

**Spec:** `docs/superpowers/specs/2026-05-07-pitch-deck-solana-design.md`

**Note on slides 5 & 7:** Spec said "unchanged" but lint-grep for forbidden strings (`Porto`, `KeeperHub`) catches stale words there. Plan handles minimal touch-ups while preserving real repo URLs (which mention `keeperhub` factually).

---

## Task 1: Copy source folder

**Files:**
- Copy: `experiments/pitch-deck/` → `experiments/pitch-deck-solana/`

- [ ] **Step 1: Copy directory recursively**

```bash
cp -R experiments/pitch-deck experiments/pitch-deck-solana
```

- [ ] **Step 2: Verify copy**

```bash
ls experiments/pitch-deck-solana
```

Expected: `RECORDING.md SPEECH-v2.md SPEECH.md assets index.html screenshots slide-01-title.html ... slide-07-thanks.html styles.css`

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck-solana
git commit -m "deck(solana): copy pitch-deck as starting point"
```

---

## Task 2: Capture fresh hero screenshot (Li.Fi bridge)

Replace `assets/screenshot-hero.png` with a Solana-native shot. Dev server already up at `https://localhost:3000/` (verified during brainstorming).

**Files:**
- Replace: `experiments/pitch-deck-solana/assets/screenshot-hero.png`

- [ ] **Step 1: Open app via Claude for Chrome**

Use `mcp__claude-in-chrome__tabs_context_mcp` then `mcp__claude-in-chrome__navigate` to `https://localhost:3000/`. Wait 5 seconds for hot reload.

- [ ] **Step 2: Drive composer to bridge state**

Click `pick action` pill → click `bridge`. The composer auto-fills: `bridge 10 USDC on Ethereum to SOL on Solana`. Click the destination asset pill (`SOL`) and select `USDC`. Final composer state: `I want to bridge 10 USDC on Ethereum to USDC on Solana`.

- [ ] **Step 3: Fire agent**

Click `looks good →`. Wait ~10 seconds. Watch the activity sidebar — confirm events `prepare lifi.bridge-swap` then `render lifi-bridge-summary`.

- [ ] **Step 4: Capture screenshot with `save_to_disk`**

Use `mcp__claude-in-chrome__computer` action `screenshot` with `save_to_disk: true`. Capture must include:
- Composer card (top, with bridge filled in)
- `lifi-bridge-summary` widget (below composer, showing `you bridge 10 USDC ETHEREUM` + `you receive ~9.7 USDC SOLANA` + rate + route).
- Activity sidebar on right is OK to include.

If both don't fit in a single 812px viewport screenshot, scroll so the widget header (`bridge · LI.FI · 2 TX`) is just below the composer, then capture.

- [ ] **Step 5: Move captured file into deck assets**

The `save_to_disk` returns a path. Copy it over the existing hero:

```bash
cp <returned_path> experiments/pitch-deck-solana/assets/screenshot-hero.png
```

- [ ] **Step 6: Verify**

```bash
file experiments/pitch-deck-solana/assets/screenshot-hero.png
```

Expected: `PNG image data, ...`

- [ ] **Step 7: Commit**

```bash
git add experiments/pitch-deck-solana/assets/screenshot-hero.png
git commit -m "deck(solana): replace hero with Li.Fi bridge widget screenshot"
```

---

## Task 3: Slide 1 — title footer

**Files:**
- Modify: `experiments/pitch-deck-solana/slide-01-title.html:23`

- [ ] **Step 1: Replace footer text**

Find:
```html
      Kirill Madorin <span class="sep">·</span> ETHGlobal Open Agents 2026
```

Replace with:
```html
      Kirill Madorin <span class="sep">·</span> Solana Startup Competition Belgrade 2026
```

- [ ] **Step 2: Verify**

```bash
grep -n "Belgrade" experiments/pitch-deck-solana/slide-01-title.html
grep -n "ETHGlobal" experiments/pitch-deck-solana/slide-01-title.html
```

Expected: first prints line 23, second prints nothing.

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck-solana/slide-01-title.html
git commit -m "deck(solana): rename hackathon on title slide"
```

---

## Task 4: Slide 3 — solution bullets

**Files:**
- Modify: `experiments/pitch-deck-solana/slide-03-solution.html` (lines 35, 36)

- [ ] **Step 1: Genericize session-key bullet**

Find:
```html
          <li><span class="icon">🔐</span><span><strong>Funds stay in your wallet.</strong> Porto session-keys, scoped per workflow.</span></li>
```

Replace with:
```html
          <li><span class="icon">🔐</span><span><strong>Funds stay in your wallet.</strong> Session-keys, scoped per workflow.</span></li>
```

- [ ] **Step 2: Genericize automations bullet**

Find:
```html
          <li><span class="icon">⚙️</span><span><strong>Automations = KeeperHub workflows.</strong> Deterministic. No runtime LLM.</span></li>
```

Replace with:
```html
          <li><span class="icon">⚙️</span><span><strong>Automations = AutomationsHub workflows.</strong> Deterministic. No runtime LLM.</span></li>
```

- [ ] **Step 3: Verify no leftover terms**

```bash
grep -nE "Porto|KeeperHub" experiments/pitch-deck-solana/slide-03-solution.html
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add experiments/pitch-deck-solana/slide-03-solution.html
git commit -m "deck(solana): genericize session-key and automations bullets on solution slide"
```

---

## Task 5: Slide 4 — how it works (browser box)

**Files:**
- Modify: `experiments/pitch-deck-solana/slide-04-how.html:46`

- [ ] **Step 1: Generalize wallet label**

Find:
```html
          <text x="60" y="178" font-size="18" fill="#5A4F40">Porto wallet (sign)</text>
```

Replace with:
```html
          <text x="60" y="178" font-size="18" fill="#5A4F40">Wallets (sign)</text>
```

- [ ] **Step 2: Verify**

```bash
grep -n "Wallets (sign)" experiments/pitch-deck-solana/slide-04-how.html
```

Expected: line 46.

(Do not commit yet — bundle slide 4 edits into one commit at end of task 8.)

---

## Task 6: Slide 4 — server box plugin/MCP list

**Files:**
- Modify: `experiments/pitch-deck-solana/slide-04-how.html` (lines 57–61)

The spec calls for: drop `MCP: uniswap.*`, `plugins/uniswap`, `plugins/compound-v3`, `keepers/auto-compound-comp`. Keep `MCP: keeperhub.*` line but rename to `MCP: automationshub.*`. Add `MCP: jupiter.*`, `MCP: lifi.*`, `plugins/jupiter`, `plugins/lifi`, `automations/dca-weekly`.

The current 5 lines (`├─ MCP: keeperhub.*` … `└─ keepers/auto-compound-comp`) at lines 57–61 are replaced by 6 new lines. Y-coordinates step by 28px (matching original). Existing first y=150, original spans 150→262 (5 lines). Keep new lines starting at y=150 stepping by 28: 150, 178, 206, 234, 262, 290. Need to verify the server `<rect>` (line 54) height fits — original `height="320"` y=40. Final text y=290 fits inside (40+320=360, 290+font-size≈306 < 360). OK.

- [ ] **Step 1: Replace lines 57–61 with new 6-line plugin list**

Find:
```html
          <text x="650" y="150" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ MCP: keeperhub.*</text>
          <text x="650" y="178" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ MCP: uniswap.*</text>
          <text x="650" y="206" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ plugins/uniswap</text>
          <text x="650" y="234" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ plugins/compound-v3</text>
          <text x="650" y="262" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">└─ keepers/auto-compound-comp</text>
```

Replace with:
```html
          <text x="650" y="150" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ MCP: automationshub.*</text>
          <text x="650" y="178" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ MCP: jupiter.*</text>
          <text x="650" y="206" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ MCP: lifi.*</text>
          <text x="650" y="234" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ plugins/jupiter</text>
          <text x="650" y="262" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ plugins/lifi</text>
          <text x="650" y="290" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">└─ automations/dca-weekly</text>
```

- [ ] **Step 2: Verify**

```bash
grep -nE "uniswap|compound|keepers/auto" experiments/pitch-deck-solana/slide-04-how.html
grep -nE "jupiter|lifi|automationshub|dca-weekly" experiments/pitch-deck-solana/slide-04-how.html
```

Expected: first prints nothing; second prints 4+ lines.

(No commit yet.)

---

## Task 7: Slide 4 — session-key arrow + KH box + onchain box + callouts

**Files:**
- Modify: `experiments/pitch-deck-solana/slide-04-how.html` (lines 74, 76, 78, 81, 94, 102, 117, 121)

- [ ] **Step 1: Update arrow comment + label**

Find:
```html
        <!-- Porto session-key arrow Browser -> KH -->
        <line x1="230" y1="280" x2="230" y2="450" stroke="#5A4F40" stroke-width="2" marker-end="url(#arrow)"/>
        <text x="245" y="370" font-size="14" font-family="'JetBrains Mono', monospace" fill="#5A4F40">Porto session-key</text>
```

Replace with:
```html
        <!-- Session-key arrow Browser -> AutomationsHub -->
        <line x1="230" y1="280" x2="230" y2="450" stroke="#5A4F40" stroke-width="2" marker-end="url(#arrow)"/>
        <text x="245" y="370" font-size="14" font-family="'JetBrains Mono', monospace" fill="#5A4F40">Session-key</text>
```

- [ ] **Step 2: Rename KeeperHub box → AutomationsHub**

Find:
```html
        <!-- KeeperHub box (bottom-left) -->
        <g>
          <rect x="40" y="450" width="380" height="200" rx="12" fill="#FFFCF3" stroke="#1F1B16" stroke-width="2"/>
          <text x="60" y="488" font-size="22" font-weight="700" fill="#1F1B16">KeeperHub (off-app)</text>
```

Replace with:
```html
        <!-- AutomationsHub box (bottom-left) -->
        <g>
          <rect x="40" y="450" width="380" height="200" rx="12" fill="#FFFCF3" stroke="#1F1B16" stroke-width="2"/>
          <text x="60" y="488" font-size="22" font-weight="700" fill="#1F1B16">AutomationsHub (off-app)</text>
```

- [ ] **Step 3: Update onchain box subtitle**

Find:
```html
          <text x="620" y="568" font-size="18" fill="#5A4F40">Uniswap · Compound (Sepolia)</text>
```

Replace with:
```html
          <text x="620" y="568" font-size="18" fill="#5A4F40">Solana (Jupiter) · Ethereum (Li.Fi bridge)</text>
```

- [ ] **Step 4: Update callout-2 SVG comment**

Find:
```html
        <!-- 2: right of "Porto session-key" label, clear of arrow -->
```

Replace with:
```html
        <!-- 2: right of "Session-key" label, clear of arrow -->
```

- [ ] **Step 5: Update callout 2 text (right column)**

Find:
```html
          <div class="text"><strong>Your wallet, scoped.</strong> Porto session-key per workflow — token / cap / expiry. Revocable.</div>
```

Replace with:
```html
          <div class="text"><strong>Your wallet, scoped.</strong> Session-key per workflow — token / cap / expiry. Revocable.</div>
```

- [ ] **Step 6: Update callout 3 text**

Find:
```html
          <div class="text"><strong>KH executes, not LLM.</strong> Workflows = deterministic DAG. No prompt injection at runtime.</div>
```

Replace with:
```html
          <div class="text"><strong>AutomationsHub executes, not LLM.</strong> Workflows = deterministic DAG. No prompt injection at runtime.</div>
```

(No commit yet.)

---

## Task 8: Slide 4 — verify and commit

- [ ] **Step 1: Grep for forbidden strings on slide 4**

```bash
grep -nE "Porto|Uniswap|Compound|KeeperHub|keepers/auto|KH " experiments/pitch-deck-solana/slide-04-how.html
```

Expected: no output.

- [ ] **Step 2: Grep for required new strings**

```bash
grep -nE "AutomationsHub|automationshub|jupiter|lifi|Jupiter|Li.Fi|Session-key|Wallets \(sign\)" experiments/pitch-deck-solana/slide-04-how.html
```

Expected: ≥7 lines.

- [ ] **Step 3: Visual sanity check**

Open `experiments/pitch-deck-solana/slide-04-how.html` in a browser. Verify:
- Browser box reads `Wallets (sign)` (no overflow)
- Server box plugin list has 6 lines, last reads `└─ automations/dca-weekly`, all fit inside the box (which ends at y=360)
- Session-key arrow label is short and sits right of the down-arrow
- AutomationsHub box title not clipped
- Onchain box subtitle fits within `width=380`

If subtitle text overflows the onchain box (`Solana (Jupiter) · Ethereum (Li.Fi bridge)` is longer than the original), reduce `font-size` from `18` to `16` on that single text element only.

- [ ] **Step 4: Commit slide 4**

```bash
git add experiments/pitch-deck-solana/slide-04-how.html
git commit -m "deck(solana): rewire how-it-works diagram for Jupiter/Li.Fi + AutomationsHub"
```

---

## Task 9: Slide 5 — genericize "keepers" to "automations"

**Files:**
- Modify: `experiments/pitch-deck-solana/slide-05-next.html:18`

- [ ] **Step 1: Swap the word**

Find:
```html
      <li><span class="icon">🧠</span><span><strong>Learns from history.</strong> Proposes keepers from observed patterns.</span></li>
```

Replace with:
```html
      <li><span class="icon">🧠</span><span><strong>Learns from history.</strong> Proposes automations from observed patterns.</span></li>
```

- [ ] **Step 2: Verify**

```bash
grep -n "keepers" experiments/pitch-deck-solana/slide-05-next.html
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck-solana/slide-05-next.html
git commit -m "deck(solana): rename keepers→automations on next slide"
```

---

## Task 10: Slide 7 — drop Porto plugin reference

Spec keeps repo URLs factual (`github.com/kmadorin/keeperhub`, `kh.sumula.online`, `forked KeeperHub` label). Only the "Porto plugin" sublabel is wrong on Solana — Porto isn't used.

**Files:**
- Modify: `experiments/pitch-deck-solana/slide-07-thanks.html:32`

- [ ] **Step 1: Update the fork-purpose label**

Find:
```html
          <span class="label">(fork — Porto plugin for granting permissions)</span>
```

Replace with:
```html
          <span class="label">(fork — automations backend with session-key plugins)</span>
```

- [ ] **Step 2: Verify**

```bash
grep -n "Porto" experiments/pitch-deck-solana/slide-07-thanks.html
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck-solana/slide-07-thanks.html
git commit -m "deck(solana): drop Porto reference on thanks slide"
```

---

## Task 11: Index + final lint pass

**Files:**
- Modify (maybe): `experiments/pitch-deck-solana/index.html`

- [ ] **Step 1: Check index for hackathon strings**

```bash
grep -nE "ETHGlobal|Open Agents|Porto|Uniswap|Compound|KeeperHub" experiments/pitch-deck-solana/index.html
```

Expected: no output. If any hits exist, replace per spec convention (`ETHGlobal Open Agents` → `Solana Startup Competition Belgrade`; other terms → genericized equivalents already used in slides). The current `<title>wishd — pitch deck</title>` needs no change.

- [ ] **Step 2: Final repo-wide lint**

```bash
grep -rnE "Porto|Uniswap|Compound|KeeperHub|keepers/auto|ETHGlobal|Open Agents" experiments/pitch-deck-solana/*.html experiments/pitch-deck-solana/index.html 2>/dev/null
```

Expected: no output. (Repo URLs `keeperhub` and `kh.sumula.online` on slide 7 are deliberately preserved as factual artifacts; they don't match this regex because of the lowercase + path slash. If they did, leave them — they are real URLs.)

If anything else surfaces, fix it inline using spec mapping rules. Do not invent new substitutions.

- [ ] **Step 3: Open the deck**

Open `experiments/pitch-deck-solana/index.html` in browser. Arrow-key through all 7 slides. Confirm:
- Slide 1 footer says Belgrade.
- Slide 3 hero is the new Li.Fi screenshot, both bullets read genericized.
- Slide 4 diagram renders cleanly, all 6 plugin lines visible inside server box.
- Slide 5 reads "automations" not "keepers".
- Slide 7 fork label updated, no Porto.

- [ ] **Step 4: Commit any final fixes**

```bash
git add experiments/pitch-deck-solana
git commit -m "deck(solana): final lint pass — verify no stale ETH-only terms"
```

If nothing changed, skip this commit.

---

## Self-review notes

- **Spec coverage:** All slide-by-slide edits in spec map to tasks 3–10. Asset capture → task 2. Acceptance grep → task 11.
- **Slides 5 & 7 deviation from spec:** Spec said "unchanged" but acceptance grep for `Porto`/`KeeperHub` would fail. Plan resolves by minimal edits (one word on slide 5, one label on slide 7) while preserving real repo URLs. Surface this trade-off clearly above.
- **Type/name consistency:** `AutomationsHub` (TitleCase) used in slide 3 bullet, slide 4 box title, callout 3. `automationshub.*` (lowercase) used in MCP namespace line. `automations/dca-weekly` plugin path. Consistent.
- **No placeholders:** Every find-string and replace-string is concrete.

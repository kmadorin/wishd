# wishd hackathon pitch deck — content + speech + visual system

**Date:** 2026-05-03
**Scope:** 3-minute recorded video submission for ETHGlobal Open Agents 2026. Slides + voiceover, with a live (not pre-recorded) ~60s app demo inserted after slide 3. The deck itself is built as HTML/CSS using the in-repo design system prompt and skills.
**Companion spec:** the ~60s app-demo segment is fully specified in `docs/superpowers/specs/2026-05-02-demo-script-design.md`. This document does NOT respec the demo; it specifies the framing slides and how slide 3 hands off to the demo.
**Sponsors targeted:** Uniswap (Best API Integration, $5k pool) + KeeperHub (Best Use, $4.5k pool) + general Open Agents track.

---

## 1. Strategic frame

### 1.1 Hackathon test

The event is **Open Agents**. The deck must make the agent the visible protagonist and answer three judge questions head-on:

1. *Why does this need an agent? Couldn't this be hardcoded UI?*
2. *Why is this better than running KeeperHub MCP from Claude Code yourself?*
3. *Why should an agent be allowed near user funds?*

### 1.2 Three-pain framing

The problem slide carries three pillars; each maps to a specific differentiator in the solution:

| Pain | wishd's answer |
|------|----------------|
| DeFi UX fragmented — every protocol = own app, own mental model | Composer mode — one surface, agent picks the right widget per intent |
| Agents = CLI (dev-only) or generic chat (no DeFi UI) — non-devs locked out | Browser-native agent that streams DeFi-shaped widgets, not raw text |
| Agentic wallets = honeypot — hot wallet + runtime LLM ⇒ prompt injection drains funds | Funds in user's normal wallet (Porto), automations = deterministic KeeperHub workflows; no runtime LLM signing |

Pain 2 is the primary frame ("Open Agents"); pains 1 and 3 are co-equal pillars on the same slide.

### 1.3 Sponsor binding

Demo arc binds Uniswap and KeeperHub into one line: a one-shot Uniswap swap, then the agent recommends a KeeperHub keeper that itself uses Uniswap on a recurring basis. The closing voiceover makes the binding explicit.

---

## 2. Plot (180s budget)

| # | Slide | Time | Beat |
|---|---|---|---|
| 1 | Title | 5s | Project name, one-liner, author, hackathon |
| 2 | Problem | 25s | Three pains |
| 3 | Solution | 20s | Left: 4 bullets. Right: hero screenshot. Hand-off line cuts to demo. |
| – | **Live demo** | 60s | Full arc from `2026-05-02-demo-script-design.md` (option A: swap + lend + keeper deploy) |
| 4 | How it works | 35s | Single merged architecture diagram + 3 callouts (rebuts "just use Claude Code") |
| 5 | Next steps | 15s | Open intents · agent writes plugins · learns keepers · Soul file |
| 6 | Team | 5s | Kirill Madorin · Claude Code (superpowers plugin) |
| 7 | Thanks | 10s | Two repos · two live URLs · Sepolia faucet |

Total: 175s. 5s buffer for transitions.

---

## 3. Slide-by-slide content + speech

All speech budgets are voiceover; recording will use a single take per slide cut into the master timeline.

### Slide 1 — Title (5s)

**On slide:**
- **wishd** (display, large)
- *DeFi by wishing it.* (subtitle)
- Footer: *Kirill Madorin · ETHGlobal Open Agents 2026*

**Speech:**
> "wishd — DeFi by wishing it. Kirill Madorin. Open Agents 2026."

### Slide 2 — Problem (25s)

**On slide — title:** *"DeFi today: three broken pieces"*

Three rows, each one icon + one-liner:

1. 🧩 **Fragmented UX.** Every protocol = own app, own mental model.
2. 🤖 **Agents = CLI or generic chat.** Devs only, or no DeFi-shaped UI. Non-devs locked out.
3. 🔓 **Agentic wallets = honeypot.** Hot wallet + runtime LLM ⇒ prompt injection drains funds.

**Speech:**
> "Three problems. First — DeFi UX is fragmented. Five protocols, five apps, five mental models. Second — agents that could fix this are either CLI tools for engineers, or generic chat bots that throw away DeFi-shaped UI. Non-devs locked out either way. Third — giving an agent a hot wallet to act for you is a honeypot. One prompt injection and your funds are gone."

### Slide 3 — Solution (20s)

**Layout:** split. Left = bullets. Right = hero screenshot from `experiments/assets/screenshot-{1..4}.png` (pick the one that best shows composer + agent activity sidebar + a widget together; confirm at build time).

**Left bullets:**
- 🌐 **Browser-native agent.** No CLI, no skill-writing.
- ✍️ **Composer or free text.** Agent picks the right widget per intent.
- 🔐 **Funds stay in your wallet.** Porto session-keys, scoped per workflow.
- ⚙️ **Automations = KeeperHub workflows.** Deterministic. No runtime LLM.

**Speech:**
> "wishd is a browser-native agent for DeFi. You speak intent — free text or composer pills. The agent picks the right widget, prepares the transaction, you sign in your own wallet. For recurring jobs, it recommends a KeeperHub workflow and scopes a Porto session-key. Funds never leave you. No CLI, no hot agent wallet. Let me show you."

→ Cut to **live demo (60s)** per `2026-05-02-demo-script-design.md` beats 1–5 (option A: swap + lend + keeper deploy via KH MCP, ending on KH dashboard proof shot).

### Slide 4 — How it works (35s)

**Single merged diagram (center):**

```
┌─Browser──────────────┐         ┌─Server (Next.js + Claude Agent SDK)──┐
│ Composer / Activity  │ ◀──SSE──│ agent loop                            │
│ Widgets / Modal      │         │  ├─ MCP: keeperhub.*                  │
│ Porto wallet (sign)  │         │  ├─ MCP: uniswap.*                    │
└──────────────────────┘         │  ├─ plugins/uniswap                   │
       │                         │  ├─ plugins/compound-v3               │
       │ Porto session-key       │  └─ keepers/auto-compound-comp        │
       ▼                         └───────────────────────────────────────┘
┌─KeeperHub (off-app)──┐
│ deterministic DAG    │ ──────▶ Uniswap / Compound onchain
│ cron-scheduled exec  │
└──────────────────────┘
```

**Event-name labels on SSE arrow:** `tool.call · chat.delta · widget.render · widget.patch`

**Three callouts (the rebuttal, embedded in the diagram):**

1. **Agent runs server-side.** Browser displays, never holds keys.
2. **Your wallet, scoped.** Porto session-key per workflow — token / cap / expiry. Revocable.
3. **KH executes, not LLM.** Workflows = deterministic DAG. No prompt injection at runtime.

**Speech:**
> "Under the hood — agent loop runs server-side. Browser subscribes via SSE and renders whatever the agent emits: tool calls in the activity sidebar, widgets in the canvas. Two MCPs — Uniswap for trades, KeeperHub for automations. Plus a plugin host — drop a folder under `plugins/`, agent picks it up. Same for keepers. Three things you don't get from Claude Code with the KH MCP: the agent runs on a server, not your laptop. Your wallet stays yours, scoped through Porto session-keys. And automations run inside KeeperHub's deterministic engine — no LLM at runtime, so prompt injection can't steal funds."

### Slide 5 — Next steps (15s)

**Title:** *"Next: self-evolving agent"*

**Bullets:**
- 🌀 **Open-intents mode.** Today fixed plugin set; tomorrow any intent.
- 🔌 **Agent writes plugins.** Mention an unsupported protocol → agent scaffolds adapter + widget.
- 🧠 **Learns from history.** Proposes keepers from observed patterns.
- 📜 **Soul file.** User-editable agent memory (CLAUDE.md-style panel).

**Speech:**
> "Next — open intents. Today agent picks from a fixed plugin set. Tomorrow, mention a protocol it doesn't know and it writes the plugin: adapter plus widget. Learns keepers from your history. Soul file you edit directly. Self-evolving DeFi agent."

### Slide 6 — Team (5s)

**On slide:**
- **Kirill Madorin** (photo, role)
- **Claude Code** with the *superpowers* plugin (logo)

**Speech:**
> "Team — me, plus Claude Code with the superpowers plugin."

### Slide 7 — Thanks (10s)

**On slide:**
- **Thank you**
- **Code:**
  - `github.com/kmadorin/wishd`
  - `github.com/kmadorin/keeperhub` *(fork — Porto plugin for granting permissions)*
- **Live:**
  - `wishd.sumula.online` *(the app)*
  - `kh.sumula.online` *(forked KeeperHub)*
- **Sepolia USDC faucet:** `faucet.circle.com`
- QR codes for the two live URLs (optional, only if layout permits)

**Speech:**
> "Thanks. Two repos, two live instances, Circle faucet for Sepolia USDC. Try it."

---

## 4. Visual system

The deck must read as part of the wishd product, not a separate marketing object. UI parity is mandatory.

### 4.1 Tokens (lifted from `apps/web/app/globals.css`)

**Background palette (cream/parchment):**
- `--bg: #FBF4E8` (page)
- `--bg-2: #F4EAD5`
- `--surface: #FFFCF3` (card)
- `--surface-2: #FFFFFF`

**Ink (text):**
- `--ink: #1F1B16` (primary)
- `--ink-2: #5A4F40` (secondary)
- `--ink-3: #9A8E78` (tertiary / captions)

**Accent + semantic:**
- `--accent: #E89A6B` (primary peach)
- `--accent-2: #FFD9C2`
- `--mint: #B8E6C9` (good)
- `--pink: #F5C2C7`
- `--warn: #F5DC8A`
- `--bad: #E89999`
- `--rule: #E5DAC0` (dashed dividers)
- `--shadow: rgba(31,27,22,0.08)`

**Radii:** `--r-sm: 6px`, `--r: 12px`, `--r-lg: 20px`, `--r-pill: 999px`

**Background atmosphere:** the app body uses three layered radial gradients (peach top-left, mint bottom-right, warm yellow bottom-center) over `--bg`. Replicate exactly on every slide except slide 1, which can use a denser version as a hero.

### 4.2 Type

**Webfonts (already loaded by the app):**
- `Plus Jakarta Sans` (400/500/600/700) — primary UI, body, slide bullets
- `Caveat` (400/700) — accents, hand-written feel for the title wordmark and small annotations
- `JetBrains Mono` (400/500) — code, addresses, event names, file paths in slide 4 diagram

**Sizing scale (slide-specific, not app):**
- Display (slide 1 wordmark): Caveat 700, ~140px
- Slide titles: Plus Jakarta 700, ~56px
- Bullets: Plus Jakarta 500, ~28px
- Captions / footers: Plus Jakarta 400, ~18px
- Mono labels (event names, paths): JetBrains Mono 500, ~22px

### 4.3 Element vocabulary (carried over from app)

- **Dashed dividers** (`1.5px dashed var(--rule)`) — separator between header and slide body, between callouts and diagram
- **Pill chips** (`--r-pill`, mono font) — for protocol names, event names, addresses
- **Asset dots** (small circles with mono ticker) — for ETH / USDC mentions in problem and solution slides
- **Live-dot pulse** (1.2s blink, peach) — on slide 4 over the agent loop box, signals "active"
- **Soft shadows** (`0 4px 20px var(--shadow)`) for cards / hero screenshot frame

### 4.4 Slide chrome

- 1920×1080 canvas, 16:9
- 80px outer padding
- Header strip on slides 2–7: small wordmark left, slide N/7 right, dashed underline
- Slide 1 has no header strip (full bleed wordmark)
- Slide 7 mirrors slide 1's hero treatment

### 4.5 Diagram (slide 4) styling

- Boxes: `--surface` background, `--ink` 1.5px solid border (radius `--r`)
- Arrows: `--ink-2` 1.5px, with peach (`--accent`) animated dotted arrow for the SSE channel
- Event-name labels in JetBrains Mono pills riding the SSE arrow
- Callouts: numbered (1/2/3) peach circles connecting to diagram regions; callout text in `--ink`, max ~12 words each

---

## 5. Build approach

The deck is an HTML/CSS artifact, not Keynote/Figma. Build inside this repo so the design system tokens are colocated with the app source.

### 5.1 Toolchain

- **System prompt:** `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/claude-design-system-prompt/claude/system-prompt.md` — load before any deck-building session.
- **Skills:** `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/claude-design-system-prompt/claude/skills/` — primary skills for this work:
  - `make-a-deck.md` — slide deck construction
  - `design-system-extract.md` — pulling tokens from `globals.css`
  - `hierarchy-rhythm-review.md` — slide-level visual review
  - `polish-pass.md` — final pass before record
  - `ai-slop-check.md` — anti-generic-aesthetic verification
- **Assets:** `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/experiments/assets/` — `logo-512.png`, `logo.html`, `cover-1280x720.png`, `cover.html`, `screenshot-{1..4}.png`. Hero screenshot for slide 3 picked from this set.
- **Output location:** `experiments/pitch-deck/` (sibling to `experiments/assets`) — one HTML file per slide, plus a master `index.html` that scrolls or paginates.

### 5.2 Constraints

- No external CSS frameworks. Hand-rolled CSS using the tokens above.
- Webfonts loaded the same way the app loads them (`@import` from Google Fonts).
- Each slide must render at 1920×1080 cleanly for screen recording. No layout shift.
- Slide 4 diagram: hand-built SVG, not a screenshot of an external tool.

### 5.3 Acceptance check

Before recording, run:
1. `polish-pass` skill against the full deck
2. `ai-slop-check` skill — flag any slide that reads as generic AI-aesthetic
3. Side-by-side test: open `apps/web` and the deck in adjacent windows; the visual system should feel like the same product

---

## 6. Recording flow

Single take per slide cut in post.

1. Slide 1 — title voiceover
2. Slide 2 — problem voiceover
3. Slide 3 — solution voiceover ending with "Let me show you"
4. Live demo — operate the deployed app (`wishd.sumula.online`) per `2026-05-02-demo-script-design.md`. Single take preferred; allow up to 3 retakes.
5. Slide 4 — how-it-works voiceover
6. Slide 5 — next steps voiceover
7. Slide 6 — team
8. Slide 7 — thanks

Use `next start` build (no Next.js dev overlay) for the live demo segment. Clean Chrome profile. 1080p viewport. Cursor-highlight extension on for demo only, off for static deck slides.

---

## 7. Open items

- **Hero screenshot pick** for slide 3: choose between `screenshot-1`..`screenshot-4` after eyeballing. Criterion: composer + agent activity sidebar + a widget visible in the same frame.
- **Photo for slide 6**: confirm headshot to use, or default to a stylised mark.
- **QR codes on slide 7**: include only if layout permits without crowding.
- **Demo arc final pass**: option A (swap + lend + keeper) is locked; if rehearsals show repeat failures, fall back to option B (one wish + keeper) per the demo-script spec.

---

## 8. Out of scope

- The 60s in-app demo script (covered in `2026-05-02-demo-script-design.md`)
- FEEDBACK.md content for Uniswap prize (separate workstream)
- Sub-project B (minimal agentic tweaks beyond demo prereqs)
- Sub-project C (deployment infrastructure for judges)
- Live stage pitch variant — this spec covers the recorded video submission only

---

## 9. References

- Companion demo spec: `docs/superpowers/specs/2026-05-02-demo-script-design.md`
- App theme source: `apps/web/app/globals.css`
- Plugin host: `packages/plugin-sdk/`, `plugins/uniswap/`, `plugins/compound-v3/`, `keepers/auto-compound-comp/`
- KeeperHub fork: `github.com/kmadorin/keeperhub` (Porto plugin extension)
- Design toolchain: `claude-design-system-prompt/claude/{system-prompt.md,skills/}`
- Asset library: `experiments/assets/`

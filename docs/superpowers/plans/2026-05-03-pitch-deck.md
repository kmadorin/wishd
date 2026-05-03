# Pitch Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 7-slide HTML deck for the ETHGlobal Open Agents 2026 video submission, visually consistent with the wishd app, ready to screen-record at 1920×1080.

**Architecture:** One self-contained directory under `experiments/pitch-deck/` with shared `styles.css` (lifts tokens from `apps/web/app/globals.css`) and one HTML file per slide. A master `index.html` paginates with `←/→` keys for live navigation during recording. SVG used for the slide-4 architecture diagram (no PNG, no external tool).

**Tech Stack:** Plain HTML5, hand-rolled CSS (no Tailwind, no framework), inline SVG, Google Fonts (Plus Jakarta Sans / Caveat / JetBrains Mono — same imports as the app), vanilla JS keyboard navigation in `index.html`.

**Verification model (deck-specific):** This plan does NOT use TDD because the artifact is static visual content. Verification per slide = open in Chrome at 1920×1080, screenshot, eyeball against the app for parity. Each task ends with a commit after the visual check.

**Companion spec:** `docs/superpowers/specs/2026-05-03-pitch-deck-design.md`

---

## File Structure

Created in this plan:

| Path | Responsibility |
|------|----------------|
| `experiments/pitch-deck/styles.css` | Shared design tokens, slide chrome (header strip, page padding), typography scale, helper classes (`pill`, `asset-dot`, `live-dot`, `dashed-rule`) |
| `experiments/pitch-deck/index.html` | Master scroller + keyboard nav (←/→/space/home/end). Embeds each slide via `<iframe>` OR concatenates them inline (decided in Task 9). |
| `experiments/pitch-deck/slide-01-title.html` | Slide 1 — title |
| `experiments/pitch-deck/slide-02-problem.html` | Slide 2 — three pains |
| `experiments/pitch-deck/slide-03-solution.html` | Slide 3 — solution + hero screenshot |
| `experiments/pitch-deck/slide-04-how.html` | Slide 4 — architecture diagram (inline SVG) + 3 callouts |
| `experiments/pitch-deck/slide-05-next.html` | Slide 5 — next steps |
| `experiments/pitch-deck/slide-06-team.html` | Slide 6 — team |
| `experiments/pitch-deck/slide-07-thanks.html` | Slide 7 — thanks + repos + URLs |
| `experiments/pitch-deck/assets/screenshot-hero.png` | Copy of chosen hero screenshot from `experiments/assets/screenshot-N.png` |
| `experiments/pitch-deck/assets/logo.svg` | Wordmark SVG (extracted from `experiments/assets/logo.html` if present, else hand-rolled) |
| `experiments/pitch-deck/RECORDING.md` | Recording-day checklist (browser profile, viewport, demo cues) |
| `experiments/pitch-deck/SPEECH.md` | Voiceover script — single-take cue cards per slide |

Files referenced (read only):
- `apps/web/app/globals.css` — token source of truth
- `experiments/assets/screenshot-{1..4}.png` — pick one for hero
- `experiments/assets/logo-512.png`, `logo.html` — wordmark source
- `claude-design-system-prompt/claude/skills/{make-a-deck,polish-pass,ai-slop-check}.md` — design skill guidance

---

## Task 1: Scaffold deck directory + shared styles

**Files:**
- Create: `experiments/pitch-deck/styles.css`
- Create: `experiments/pitch-deck/assets/.gitkeep`

- [ ] **Step 1: Create directory tree**

```bash
mkdir -p /Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/experiments/pitch-deck/assets
touch /Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/experiments/pitch-deck/assets/.gitkeep
```

- [ ] **Step 2: Write shared styles.css**

Create `experiments/pitch-deck/styles.css` with this content:

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Caveat:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --bg: #FBF4E8;
  --bg-2: #F4EAD5;
  --surface: #FFFCF3;
  --surface-2: #FFFFFF;
  --ink: #1F1B16;
  --ink-2: #5A4F40;
  --ink-3: #9A8E78;
  --accent: #E89A6B;
  --accent-2: #FFD9C2;
  --mint: #B8E6C9;
  --mint-2: #DCF1E2;
  --pink: #F5C2C7;
  --warn: #F5DC8A;
  --warn-2: #FAEEBC;
  --good: #9FD9B0;
  --bad: #E89999;
  --rule: #E5DAC0;
  --shadow: rgba(31,27,22,0.08);
  --r-sm: 6px;
  --r: 12px;
  --r-lg: 20px;
  --r-pill: 999px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

.slide {
  width: 1920px;
  height: 1080px;
  position: relative;
  padding: 80px;
  background:
    radial-gradient(circle at 12% 18%, rgba(232,154,107,0.07) 0, rgba(232,154,107,0.07) 280px, transparent 281px),
    radial-gradient(circle at 88% 78%, rgba(184,230,201,0.10) 0, rgba(184,230,201,0.10) 320px, transparent 321px),
    radial-gradient(circle at 50% 110%, rgba(245,220,138,0.08) 0, rgba(245,220,138,0.08) 380px, transparent 381px),
    var(--bg);
  overflow: hidden;
}

.slide-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 18px;
  border-bottom: 1.5px dashed var(--rule);
  margin-bottom: 56px;
}

.slide-header .wordmark {
  font-family: 'Caveat', cursive;
  font-weight: 700;
  font-size: 36px;
  color: var(--ink);
}

.slide-header .pageno {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  color: var(--ink-3);
}

.slide-title {
  font-weight: 700;
  font-size: 56px;
  line-height: 1.1;
  letter-spacing: -0.01em;
  margin: 0 0 40px 0;
}

.slide-bullets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.slide-bullets li {
  font-size: 28px;
  font-weight: 500;
  color: var(--ink);
  line-height: 1.35;
  display: flex;
  gap: 16px;
}

.slide-bullets li .icon {
  font-size: 32px;
  flex: 0 0 auto;
}

.slide-bullets li strong {
  font-weight: 700;
  color: var(--ink);
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: var(--r-pill);
  background: var(--surface);
  border: 1.5px solid var(--ink);
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 500;
}

.asset-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1.5px solid var(--ink);
  display: inline-grid;
  place-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.7px;
  font-weight: 700;
}

@keyframes blink {
  0%, 80%, 100% { opacity: 0.2; }
  40% { opacity: 1; }
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  display: inline-block;
  animation: blink 1.2s ease-in-out infinite;
}

.dashed-rule {
  border: none;
  border-top: 1.5px dashed var(--rule);
  margin: 0;
}

.card {
  background: var(--surface);
  border: 1.5px solid var(--ink);
  border-radius: var(--r);
  box-shadow: 0 4px 20px var(--shadow);
}

.mono {
  font-family: 'JetBrains Mono', monospace;
}
```

- [ ] **Step 3: Verify CSS loads**

```bash
cd /Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd
ls -la experiments/pitch-deck/styles.css
```

Expected: file exists, ≈3KB.

- [ ] **Step 4: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd
git add experiments/pitch-deck/styles.css experiments/pitch-deck/assets/.gitkeep
git commit -m "feat(pitch-deck): scaffold dir + shared design tokens"
```

---

## Task 2: Slide 1 — Title

**Files:**
- Create: `experiments/pitch-deck/slide-01-title.html`

- [ ] **Step 1: Write slide 1**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — slide 1</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    .s1 { display: grid; place-items: center; height: 1080px; padding: 0; }
    .s1 .stack { display: flex; flex-direction: column; align-items: center; gap: 24px; }
    .s1 .wordmark { font-family: 'Caveat', cursive; font-weight: 700; font-size: 240px; line-height: 0.95; color: var(--ink); }
    .s1 .one-liner { font-size: 40px; font-weight: 500; color: var(--ink-2); }
    .s1 .footer { position: absolute; bottom: 60px; left: 0; right: 0; text-align: center; font-size: 22px; color: var(--ink-3); font-family: 'JetBrains Mono', monospace; }
    .s1 .footer .sep { color: var(--accent); margin: 0 14px; }
  </style>
</head>
<body>
  <section class="slide s1">
    <div class="stack">
      <div class="wordmark">wishd</div>
      <div class="one-liner">DeFi by wishing it.</div>
    </div>
    <div class="footer">
      Kirill Madorin <span class="sep">·</span> ETHGlobal Open Agents 2026
    </div>
  </section>
</body>
</html>
```

- [ ] **Step 2: Visual check**

Open `experiments/pitch-deck/slide-01-title.html` in Chrome at 1920×1080 viewport.

Verify:
- Wordmark renders in Caveat (handwritten), not fallback sans
- Cream background with subtle radial gradients
- Footer fits one line, dot separator in peach

If wordmark looks blocky/serif, fonts haven't loaded — check network tab.

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck/slide-01-title.html
git commit -m "feat(pitch-deck): slide 1 title"
```

---

## Task 3: Slide 2 — Problem

**Files:**
- Create: `experiments/pitch-deck/slide-02-problem.html`

- [ ] **Step 1: Write slide 2**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — slide 2</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    .s2 .pain { display: flex; gap: 28px; align-items: flex-start; padding: 24px 0; }
    .s2 .pain + .pain { border-top: 1.5px dashed var(--rule); }
    .s2 .pain .num {
      font-family: 'Caveat', cursive; font-weight: 700;
      font-size: 92px; line-height: 1; color: var(--accent);
      flex: 0 0 110px;
    }
    .s2 .pain .copy { display: flex; flex-direction: column; gap: 10px; }
    .s2 .pain h3 { font-size: 38px; font-weight: 700; margin: 0; }
    .s2 .pain p { font-size: 26px; font-weight: 500; color: var(--ink-2); margin: 0; line-height: 1.4; }
  </style>
</head>
<body>
  <section class="slide s2">
    <header class="slide-header">
      <span class="wordmark">wishd</span>
      <span class="pageno">2 / 7 — problem</span>
    </header>
    <h1 class="slide-title">DeFi today: three broken pieces.</h1>
    <div>
      <div class="pain">
        <div class="num">1</div>
        <div class="copy">
          <h3>Fragmented UX.</h3>
          <p>Every protocol = own app, own mental model. Five protocols, five UIs to learn.</p>
        </div>
      </div>
      <div class="pain">
        <div class="num">2</div>
        <div class="copy">
          <h3>Agents = CLI or generic chat.</h3>
          <p>Devs only, or no DeFi-shaped UI. Non-devs locked out either way.</p>
        </div>
      </div>
      <div class="pain">
        <div class="num">3</div>
        <div class="copy">
          <h3>Agentic wallets = honeypot.</h3>
          <p>Hot wallet + runtime LLM ⇒ prompt injection drains funds.</p>
        </div>
      </div>
    </div>
  </section>
</body>
</html>
```

- [ ] **Step 2: Visual check**

Open in Chrome at 1920×1080. Verify:
- Three pains stack vertically with dashed dividers
- Caveat numerals (1/2/3) in peach, oversized
- Page header strip aligned with dashed underline

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck/slide-02-problem.html
git commit -m "feat(pitch-deck): slide 2 problem"
```

---

## Task 4: Slide 3 — Solution

**Files:**
- Create: `experiments/pitch-deck/slide-03-solution.html`
- Create: `experiments/pitch-deck/assets/screenshot-hero.png` (copy)

- [ ] **Step 1: Pick + copy hero screenshot**

Eyeball `experiments/assets/screenshot-1.png` through `screenshot-4.png`. Pick the one showing composer + agent activity sidebar + a widget visible together. Copy:

```bash
cd /Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd
# replace N with chosen 1..4
cp ../experiments/assets/screenshot-N.png experiments/pitch-deck/assets/screenshot-hero.png
```

- [ ] **Step 2: Write slide 3**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — slide 3</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    .s3 .body { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
    .s3 .left h1 { font-size: 52px; font-weight: 700; margin: 0 0 32px 0; line-height: 1.1; }
    .s3 .left ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 22px; }
    .s3 .left li { font-size: 26px; font-weight: 500; line-height: 1.35; display: flex; gap: 14px; }
    .s3 .left li .icon { font-size: 30px; flex: 0 0 36px; }
    .s3 .left li strong { font-weight: 700; }
    .s3 .right { display: grid; place-items: center; }
    .s3 .right img {
      width: 100%; max-width: 820px; height: auto;
      border-radius: var(--r-lg);
      border: 1.5px solid var(--ink);
      box-shadow: 0 12px 40px var(--shadow);
    }
  </style>
</head>
<body>
  <section class="slide s3">
    <header class="slide-header">
      <span class="wordmark">wishd</span>
      <span class="pageno">3 / 7 — solution</span>
    </header>
    <div class="body">
      <div class="left">
        <h1>A browser-native agent for DeFi.</h1>
        <ul>
          <li><span class="icon">🌐</span><span><strong>Browser-native agent.</strong> No CLI, no skill-writing.</span></li>
          <li><span class="icon">✍️</span><span><strong>Composer or free text.</strong> Agent picks the right widget per intent.</span></li>
          <li><span class="icon">🔐</span><span><strong>Funds stay in your wallet.</strong> Porto session-keys, scoped per workflow.</span></li>
          <li><span class="icon">⚙️</span><span><strong>Automations = KeeperHub workflows.</strong> Deterministic. No runtime LLM.</span></li>
        </ul>
      </div>
      <div class="right">
        <img src="assets/screenshot-hero.png" alt="wishd app — composer + agent activity + widget">
      </div>
    </div>
  </section>
</body>
</html>
```

- [ ] **Step 3: Visual check**

Open in Chrome at 1920×1080. Verify:
- Left column: title + 4 bullets, no overflow
- Right column: hero screenshot, framed with cream border + soft shadow, doesn't overflow vertically
- Bullets and image share a baseline (vertical center)

- [ ] **Step 4: Commit**

```bash
git add experiments/pitch-deck/slide-03-solution.html experiments/pitch-deck/assets/screenshot-hero.png
git commit -m "feat(pitch-deck): slide 3 solution + hero screenshot"
```

---

## Task 5: Slide 4 — How it works (architecture diagram)

This is the most complex slide. Inline SVG, no images.

**Files:**
- Create: `experiments/pitch-deck/slide-04-how.html`

- [ ] **Step 1: Write slide 4 skeleton (text + boxes, no arrows yet)**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — slide 4</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    .s4 .body { display: grid; grid-template-columns: 1fr 360px; gap: 48px; align-items: start; }
    .s4 .diagram { width: 100%; height: 760px; }
    .s4 .callouts { display: flex; flex-direction: column; gap: 20px; }
    .s4 .callout { display: flex; gap: 16px; align-items: flex-start; }
    .s4 .callout .num {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--accent); color: white;
      font-weight: 700; font-size: 22px;
      display: grid; place-items: center; flex: 0 0 44px;
    }
    .s4 .callout .text { font-size: 20px; line-height: 1.35; }
    .s4 .callout .text strong { font-weight: 700; }
  </style>
</head>
<body>
  <section class="slide s4">
    <header class="slide-header">
      <span class="wordmark">wishd</span>
      <span class="pageno">4 / 7 — how it works</span>
    </header>
    <h1 class="slide-title" style="font-size: 44px; margin-bottom: 32px;">Server-side agent. Browser-rendered UI. Deterministic automation.</h1>
    <div class="body">
      <svg class="diagram" viewBox="0 0 1200 760" xmlns="http://www.w3.org/2000/svg">
        <!-- Filled in next step -->
      </svg>
      <div class="callouts">
        <div class="callout">
          <div class="num">1</div>
          <div class="text"><strong>Agent runs server-side.</strong> Browser displays. Never holds keys.</div>
        </div>
        <div class="callout">
          <div class="num">2</div>
          <div class="text"><strong>Your wallet, scoped.</strong> Porto session-key per workflow — token / cap / expiry. Revocable.</div>
        </div>
        <div class="callout">
          <div class="num">3</div>
          <div class="text"><strong>KH executes, not LLM.</strong> Workflows = deterministic DAG. No prompt injection at runtime.</div>
        </div>
      </div>
    </div>
  </section>
</body>
</html>
```

- [ ] **Step 2: Fill in the SVG diagram**

Replace the empty `<svg>` block with this:

```html
<svg class="diagram" viewBox="0 0 1200 760" xmlns="http://www.w3.org/2000/svg" font-family="'Plus Jakarta Sans', sans-serif">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
      <path d="M0,0 L10,6 L0,12 Z" fill="#5A4F40"/>
    </marker>
    <marker id="arrow-accent" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
      <path d="M0,0 L10,6 L0,12 Z" fill="#E89A6B"/>
    </marker>
  </defs>

  <!-- Browser box (top-left) -->
  <g>
    <rect x="40" y="40" width="380" height="240" rx="12" fill="#FFFCF3" stroke="#1F1B16" stroke-width="2"/>
    <text x="60" y="78" font-size="22" font-weight="700" fill="#1F1B16">Browser</text>
    <text x="60" y="118" font-size="18" fill="#5A4F40">Composer / Activity sidebar</text>
    <text x="60" y="148" font-size="18" fill="#5A4F40">Widgets / Modal</text>
    <text x="60" y="178" font-size="18" fill="#5A4F40">Porto wallet (sign)</text>
    <circle cx="385" cy="60" r="5" fill="#E89A6B">
      <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite"/>
    </circle>
  </g>

  <!-- Server box (top-right) -->
  <g>
    <rect x="600" y="40" width="560" height="320" rx="12" fill="#FFFCF3" stroke="#1F1B16" stroke-width="2"/>
    <text x="620" y="78" font-size="22" font-weight="700" fill="#1F1B16">Server (Next.js + Claude Agent SDK)</text>
    <text x="620" y="118" font-size="18" fill="#5A4F40">agent loop</text>
    <text x="650" y="150" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ MCP: keeperhub.*</text>
    <text x="650" y="178" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ MCP: uniswap.*</text>
    <text x="650" y="206" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ plugins/uniswap</text>
    <text x="650" y="234" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">├─ plugins/compound-v3</text>
    <text x="650" y="262" font-size="16" font-family="'JetBrains Mono', monospace" fill="#1F1B16">└─ keepers/auto-compound-comp</text>
  </g>

  <!-- SSE arrow from Server back to Browser (peach, animated dashes) -->
  <line x1="600" y1="160" x2="420" y2="160" stroke="#E89A6B" stroke-width="3" stroke-dasharray="8 6" marker-end="url(#arrow-accent)">
    <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="0.8s" repeatCount="indefinite"/>
  </line>
  <text x="430" y="148" font-size="14" font-family="'JetBrains Mono', monospace" fill="#5A4F40">SSE</text>
  <g font-family="'JetBrains Mono', monospace" font-size="12" fill="#5A4F40">
    <text x="430" y="184">tool.call · chat.delta</text>
    <text x="430" y="200">widget.render · widget.patch</text>
  </g>

  <!-- Porto session-key arrow Browser -> KH -->
  <line x1="230" y1="280" x2="230" y2="450" stroke="#5A4F40" stroke-width="2" marker-end="url(#arrow)"/>
  <text x="245" y="370" font-size="14" font-family="'JetBrains Mono', monospace" fill="#5A4F40">Porto session-key</text>

  <!-- KeeperHub box (bottom-left) -->
  <g>
    <rect x="40" y="450" width="380" height="200" rx="12" fill="#FFFCF3" stroke="#1F1B16" stroke-width="2"/>
    <text x="60" y="488" font-size="22" font-weight="700" fill="#1F1B16">KeeperHub (off-app)</text>
    <text x="60" y="528" font-size="18" fill="#5A4F40">deterministic DAG</text>
    <text x="60" y="558" font-size="18" fill="#5A4F40">cron-scheduled exec</text>
  </g>

  <!-- Onchain arrow KH -> Onchain -->
  <line x1="420" y1="550" x2="600" y2="550" stroke="#5A4F40" stroke-width="2" marker-end="url(#arrow)"/>
  <text x="450" y="540" font-size="14" font-family="'JetBrains Mono', monospace" fill="#5A4F40">tx</text>

  <!-- Onchain box -->
  <g>
    <rect x="600" y="490" width="380" height="120" rx="12" fill="#DCF1E2" stroke="#1F1B16" stroke-width="2"/>
    <text x="620" y="528" font-size="22" font-weight="700" fill="#1F1B16">Onchain</text>
    <text x="620" y="568" font-size="18" fill="#5A4F40">Uniswap · Compound (Sepolia)</text>
  </g>

  <!-- Callout marker dots (linked to right-column callouts by number) -->
  <circle cx="610" cy="100" r="14" fill="#E89A6B"/>
  <text x="610" y="105" text-anchor="middle" font-size="14" font-weight="700" fill="white">1</text>

  <circle cx="245" cy="350" r="14" fill="#E89A6B"/>
  <text x="245" y="355" text-anchor="middle" font-size="14" font-weight="700" fill="white">2</text>

  <circle cx="50" cy="468" r="14" fill="#E89A6B"/>
  <text x="50" y="473" text-anchor="middle" font-size="14" font-weight="700" fill="white">3</text>
</svg>
```

- [ ] **Step 3: Visual check**

Open at 1920×1080. Verify:
- Three boxes (Browser / Server / KeeperHub) + Onchain box visible
- Animated peach dashed line from Server → Browser (SSE)
- Three numbered peach circles on the diagram, matching the 3 callouts on the right
- Event-name labels readable in JetBrains Mono
- Live-dot animates on the Browser box

If arrows/markers misaligned, tweak the `x/y` coordinates in the SVG.

- [ ] **Step 4: Commit**

```bash
git add experiments/pitch-deck/slide-04-how.html
git commit -m "feat(pitch-deck): slide 4 architecture diagram"
```

---

## Task 6: Slide 5 — Next steps

**Files:**
- Create: `experiments/pitch-deck/slide-05-next.html`

- [ ] **Step 1: Write slide 5**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — slide 5</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <section class="slide">
    <header class="slide-header">
      <span class="wordmark">wishd</span>
      <span class="pageno">5 / 7 — next</span>
    </header>
    <h1 class="slide-title">Next: self-evolving agent.</h1>
    <ul class="slide-bullets" style="font-size: 30px;">
      <li><span class="icon">🌀</span><span><strong>Open-intents mode.</strong> Today fixed plugin set; tomorrow any intent.</span></li>
      <li><span class="icon">🔌</span><span><strong>Agent writes plugins.</strong> Mention an unsupported protocol → agent scaffolds adapter + widget.</span></li>
      <li><span class="icon">🧠</span><span><strong>Learns from history.</strong> Proposes keepers from observed patterns.</span></li>
      <li><span class="icon">📜</span><span><strong>Soul file.</strong> User-editable agent memory (CLAUDE.md-style panel).</span></li>
    </ul>
  </section>
</body>
</html>
```

- [ ] **Step 2: Visual check**

Open at 1920×1080. Verify:
- 4 bullets fit, generous spacing
- Page header consistent with slides 2/3/4

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck/slide-05-next.html
git commit -m "feat(pitch-deck): slide 5 next steps"
```

---

## Task 7: Slide 6 — Team

**Files:**
- Create: `experiments/pitch-deck/slide-06-team.html`

- [ ] **Step 1: Write slide 6**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — slide 6</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    .s6 .body { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; place-items: center; height: 760px; }
    .s6 .member { display: flex; flex-direction: column; align-items: center; gap: 20px; }
    .s6 .member .avatar {
      width: 220px; height: 220px; border-radius: 50%;
      background: var(--surface); border: 2px solid var(--ink);
      display: grid; place-items: center;
      font-family: 'Caveat', cursive; font-weight: 700; font-size: 96px; color: var(--accent);
      box-shadow: 0 8px 24px var(--shadow);
    }
    .s6 .member h2 { font-size: 36px; font-weight: 700; margin: 0; }
    .s6 .member .role { font-size: 22px; color: var(--ink-2); }
  </style>
</head>
<body>
  <section class="slide s6">
    <header class="slide-header">
      <span class="wordmark">wishd</span>
      <span class="pageno">6 / 7 — team</span>
    </header>
    <h1 class="slide-title">Team.</h1>
    <div class="body">
      <div class="member">
        <div class="avatar">KM</div>
        <h2>Kirill Madorin</h2>
        <div class="role">design · code · everything</div>
      </div>
      <div class="member">
        <div class="avatar">CC</div>
        <h2>Claude Code</h2>
        <div class="role">w/ superpowers plugin</div>
      </div>
    </div>
  </section>
</body>
</html>
```

- [ ] **Step 2: Optional — replace KM avatar with photo**

If a headshot is available at `experiments/assets/`, replace the `<div class="avatar">KM</div>` with `<img class="avatar" src="assets/headshot.png" alt="Kirill Madorin">` and copy the file. Otherwise keep the Caveat initials — fits the visual system.

- [ ] **Step 3: Visual check**

Open at 1920×1080. Verify two avatars centered, names + roles below.

- [ ] **Step 4: Commit**

```bash
git add experiments/pitch-deck/slide-06-team.html experiments/pitch-deck/assets/headshot.png 2>/dev/null || git add experiments/pitch-deck/slide-06-team.html
git commit -m "feat(pitch-deck): slide 6 team"
```

---

## Task 8: Slide 7 — Thanks

**Files:**
- Create: `experiments/pitch-deck/slide-07-thanks.html`

- [ ] **Step 1: Write slide 7**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — slide 7</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    .s7 .body { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
    .s7 h2 { font-size: 30px; font-weight: 700; margin: 0 0 20px 0; }
    .s7 .list { display: flex; flex-direction: column; gap: 14px; font-family: 'JetBrains Mono', monospace; font-size: 22px; }
    .s7 .list .label { color: var(--ink-3); font-size: 16px; margin-top: 8px; }
    .s7 .hero { text-align: center; margin-top: 40px; }
    .s7 .hero .thanks {
      font-family: 'Caveat', cursive; font-weight: 700;
      font-size: 180px; line-height: 1; color: var(--ink);
    }
  </style>
</head>
<body>
  <section class="slide s7">
    <header class="slide-header">
      <span class="wordmark">wishd</span>
      <span class="pageno">7 / 7 — thanks</span>
    </header>
    <div class="hero"><div class="thanks">thanks.</div></div>
    <div class="body" style="margin-top: 40px;">
      <div>
        <h2>📦 Code</h2>
        <div class="list">
          <span>github.com/kmadorin/wishd</span>
          <span>github.com/kmadorin/keeperhub</span>
          <span class="label">(fork — Porto plugin for granting permissions)</span>
        </div>
      </div>
      <div>
        <h2>🌐 Live</h2>
        <div class="list">
          <span>wishd.sumula.online</span>
          <span class="label">the app</span>
          <span>kh.sumula.online</span>
          <span class="label">forked KeeperHub</span>
          <span style="margin-top: 16px;">faucet.circle.com</span>
          <span class="label">Sepolia USDC</span>
        </div>
      </div>
    </div>
  </section>
</body>
</html>
```

- [ ] **Step 2: Visual check**

Open at 1920×1080. Verify:
- Big handwritten "thanks." centered
- Two columns: Code / Live, mono font, links and small labels
- All four URLs + faucet visible without scroll

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck/slide-07-thanks.html
git commit -m "feat(pitch-deck): slide 7 thanks + repos + URLs"
```

---

## Task 9: Master `index.html` with keyboard nav

**Files:**
- Create: `experiments/pitch-deck/index.html`

Approach: stack all 7 slides vertically scaled to viewport, navigate with arrow keys / space. Use `<iframe>` per slide so each slide file remains independently openable.

- [ ] **Step 1: Write index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>wishd — pitch deck</title>
  <link rel="stylesheet" href="styles.css">
  <style>
    html, body { height: 100%; margin: 0; background: #000; overflow: hidden; }
    .stage { position: fixed; inset: 0; display: grid; place-items: center; }
    .frame {
      width: 1920px; height: 1080px;
      transform-origin: center;
      transform: scale(var(--scale, 1));
      border: 0;
      background: var(--bg);
      box-shadow: 0 8px 60px rgba(0,0,0,0.4);
    }
    .nav {
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      font-family: 'JetBrains Mono', monospace;
      color: rgba(255,255,255,0.6); font-size: 12px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="stage">
    <iframe class="frame" id="frame" src="slide-01-title.html"></iframe>
  </div>
  <div class="nav" id="nav">1 / 7 — ←/→ to navigate</div>

  <script>
    const slides = [
      'slide-01-title.html',
      'slide-02-problem.html',
      'slide-03-solution.html',
      'slide-04-how.html',
      'slide-05-next.html',
      'slide-06-team.html',
      'slide-07-thanks.html',
    ];
    let i = 0;
    const frame = document.getElementById('frame');
    const nav = document.getElementById('nav');

    function go(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      frame.src = slides[i];
      nav.textContent = `${i + 1} / ${slides.length} — ←/→ to navigate`;
      history.replaceState(null, '', `#${i + 1}`);
    }

    function fit() {
      const sx = window.innerWidth / 1920;
      const sy = window.innerHeight / 1080;
      const s = Math.min(sx, sy);
      document.documentElement.style.setProperty('--scale', s);
    }
    window.addEventListener('resize', fit);
    fit();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(i + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(i - 1); }
      else if (e.key === 'Home') { go(0); }
      else if (e.key === 'End') { go(slides.length - 1); }
    });

    const initial = parseInt((location.hash || '#1').slice(1), 10);
    if (!isNaN(initial)) go(initial - 1);
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify nav**

Open `experiments/pitch-deck/index.html` in Chrome. Press → six times. Verify each slide loads at 1920×1080 scaled to fit viewport. Press ← / Home / End to confirm.

- [ ] **Step 3: Commit**

```bash
git add experiments/pitch-deck/index.html
git commit -m "feat(pitch-deck): master index with keyboard nav"
```

---

## Task 10: SPEECH.md — voiceover cue cards

**Files:**
- Create: `experiments/pitch-deck/SPEECH.md`

- [ ] **Step 1: Write speech file**

```markdown
# wishd pitch — voiceover cue cards

Total budget: 180s. Read at conversational pace. Pause 0.5s between slides.

## Slide 1 — Title (5s)

> "wishd — DeFi by wishing it. Kirill Madorin. Open Agents 2026."

## Slide 2 — Problem (25s)

> "Three problems. First — DeFi UX is fragmented. Five protocols, five apps, five mental models. Second — agents that could fix this are either CLI tools for engineers, or generic chat bots that throw away DeFi-shaped UI. Non-devs locked out either way. Third — giving an agent a hot wallet to act for you is a honeypot. One prompt injection and your funds are gone."

## Slide 3 — Solution (20s)

> "wishd is a browser-native agent for DeFi. You speak intent — free text or composer pills. The agent picks the right widget, prepares the transaction, you sign in your own wallet. For recurring jobs, it recommends a KeeperHub workflow and scopes a Porto session-key. Funds never leave you. No CLI, no hot agent wallet. Let me show you."

## Live demo (60s)

Per `docs/superpowers/specs/2026-05-02-demo-script-design.md` § 2 beats 1–5. Operate `wishd.sumula.online` live; second tab on `app.keeperhub.com` for beat 4 proof shot.

## Slide 4 — How it works (35s)

> "Under the hood — agent loop runs server-side. Browser subscribes via SSE and renders whatever the agent emits: tool calls in the activity sidebar, widgets in the canvas. Two MCPs — Uniswap for trades, KeeperHub for automations. Plus a plugin host — drop a folder under `plugins/`, agent picks it up. Same for keepers. Three things you don't get from Claude Code with the KH MCP: the agent runs on a server, not your laptop. Your wallet stays yours, scoped through Porto session-keys. And automations run inside KeeperHub's deterministic engine — no LLM at runtime, so prompt injection can't steal funds."

## Slide 5 — Next steps (15s)

> "Next — open intents. Today agent picks from a fixed plugin set. Tomorrow, mention a protocol it doesn't know and it writes the plugin: adapter plus widget. Learns keepers from your history. Soul file you edit directly. Self-evolving DeFi agent."

## Slide 6 — Team (5s)

> "Team — me, plus Claude Code with the superpowers plugin."

## Slide 7 — Thanks (10s)

> "Thanks. Two repos, two live instances, Circle faucet for Sepolia USDC. Try it."
```

- [ ] **Step 2: Commit**

```bash
git add experiments/pitch-deck/SPEECH.md
git commit -m "docs(pitch-deck): voiceover cue cards"
```

---

## Task 11: RECORDING.md — recording-day checklist

**Files:**
- Create: `experiments/pitch-deck/RECORDING.md`

- [ ] **Step 1: Write recording checklist**

```markdown
# wishd pitch — recording day checklist

## Environment

- [ ] Fresh Chrome profile, no extensions, no notifications
- [ ] 1920×1080 viewport (DevTools device toolbar OFF, window sized via window.resizeTo or browser native)
- [ ] Cursor highlight extension installed but **OFF for slides**, **ON for demo**
- [ ] Mic test (USB or Lavalier; not laptop built-in)
- [ ] DnD on, all chat apps quit
- [ ] Charger plugged in (no battery saver throttling)

## App build for live demo

- [ ] `cd apps/web && next build && next start` (no Next.js dev overlay)
- [ ] Demo runs against `wishd.sumula.online` (production deploy) — confirm latest commit deployed
- [ ] Porto wallet on Sepolia, prefunded: ETH for gas + USDC ≥ 50 (faucet from `faucet.circle.com`)
- [ ] Compound v3 USDC market on Sepolia reachable
- [ ] `auto-compound-comp` keeper renders with sensible cron + nodes after deploy
- [ ] Free-text parser tested for `swap 0.001 eth for usdc on sepolia` AND `lend 50 usdc on compound` — both produce all required pills

## Browser tabs

- [ ] Tab 1: `experiments/pitch-deck/index.html` (the deck)
- [ ] Tab 2: `wishd.sumula.online` (the app, logged in to Porto)
- [ ] Tab 3: `app.keeperhub.com` (logged in, same account demo deploys to — for beat 4 proof shot)

## Recording flow

1. Tab 1 — slide 1 voiceover, → after speech
2. Slide 2 voiceover, →
3. Slide 3 voiceover ending "Let me show you" → cmd-tab to Tab 2
4. **Live demo (60s)** per `docs/superpowers/specs/2026-05-02-demo-script-design.md` beats 1–5
5. cmd-tab back to Tab 1 → → for slide 4
6. Slide 4 voiceover, →
7. Slide 5 voiceover, →
8. Slide 6 voiceover, →
9. Slide 7 voiceover

## Retake budget

- Slides 1–7: unlimited (cheap)
- Live demo: max 3 retakes; if all 3 fail, drop to spec option B (one wish + keeper)

## Post

- [ ] Cut single takes into master timeline
- [ ] Add 0.5s silence between slide cuts
- [ ] Demo segment unedited unless retake; preserve real-time agent streaming
- [ ] Export H.264 1080p, ≤200MB if possible (ETHGlobal upload limits vary)
```

- [ ] **Step 2: Commit**

```bash
git add experiments/pitch-deck/RECORDING.md
git commit -m "docs(pitch-deck): recording day checklist"
```

---

## Task 12: Polish pass + AI-slop check

**Files:** none created; verification only.

- [ ] **Step 1: Run polish-pass skill**

Invoke the design skill at `claude-design-system-prompt/claude/skills/polish-pass.md` against `experiments/pitch-deck/index.html`. Apply any inline tweaks suggested (typography rhythm, spacing, color contrast).

- [ ] **Step 2: Run ai-slop-check skill**

Invoke `claude-design-system-prompt/claude/skills/ai-slop-check.md` against the deck. Flag any slide that reads as generic AI aesthetic. Fix inline.

- [ ] **Step 3: Side-by-side parity check**

Open `wishd.sumula.online` in one window and `experiments/pitch-deck/index.html` in another at the same size. The visual systems should feel like the same product:
- Same cream background, same radial gradients
- Same Caveat handwritten accents
- Same dashed dividers
- Same ink/peach color rhythm

If anything reads as foreign, fix in `styles.css` and the offending slide.

- [ ] **Step 4: Render-check at 1920×1080**

For each slide:
1. Open the slide file directly in Chrome
2. Press F12, set device toolbar to 1920×1080
3. Take screenshot (cmd+shift+p → "screenshot")
4. Verify: no overflow, no horizontal scroll, no missing fonts, all text readable

- [ ] **Step 5: Final commit (if any tweaks)**

```bash
git add experiments/pitch-deck/
git commit -m "chore(pitch-deck): polish + slop-check pass"
```

---

## Self-review

**Spec coverage:**
- §1 Strategic frame → reflected in slide 2 + slide 4 callouts (Tasks 3, 5)
- §2 Plot → all 7 slides + demo handoff (Tasks 2-9)
- §3 Slide content + speech → Tasks 2-8 + Task 10 (SPEECH.md)
- §4 Visual system → Task 1 (styles.css), enforced via Task 12 parity check
- §5 Build approach → directory layout in Task 1, design-skill use in Task 12
- §6 Recording flow → Task 11 (RECORDING.md)
- §7 Open items → flagged in Tasks 4 (hero pick), 7 (headshot), 8 (QR optional)
- §8 Out of scope → respected; demo script not respec'd

**Placeholders:** none. Each step has actual code or actual commands.

**Type consistency:** CSS variables defined once in Task 1, referenced unchanged in Tasks 2-8. Slide IDs (`s1`, `s2`, etc.) consistent across slide files and unique per slide so per-slide overrides don't leak.

**Open spec items still open in plan:**
- Hero screenshot N — picked at Task 4 Step 1 (manual eyeball); the plan can't decide for the engineer
- Headshot — Task 7 Step 2 marks it optional with a documented fallback (initials avatar)
- QR codes — slide 7 omits them per cleaner layout; if wanted, a follow-up task can add

These are correctly punted to the implementer because they require visual judgement / asset availability, not engineering.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-pitch-deck.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

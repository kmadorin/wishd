# wishd UI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Blocker — file write:** This planning agent runs in read-only mode (no Write/Edit tools loaded, redirect/heredoc writes prohibited). The full plan follows inline; please save it to `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/docs/superpowers/plans/2026-05-01-wishd-ui-parity.md` from the parent session.

**Goal:** Bring `apps/web` to visual + structural parity with `prototype/wishd-intent.html` by introducing seven prototype-shaped primitives and threading them through the existing Compound deposit/withdraw flow without regression.

**Architecture:** Extend Tailwind tokens + globals to expose the prototype's design system (hard shadows, Caveat headings, dashed pill borders, body gradient). Build seven presentational primitives in `apps/web/components/primitives/`. Refactor `WishComposer` and the three Compound widget files to consume them. Each step (1–8) lands as its own commit and keeps the Compound happy path green.

**Tech Stack:** Next.js 15 (App Router) + React 19, Tailwind 3.4, wagmi v2 / viem v2, Zustand workspace store, Vitest + jsdom for unit tests. No new deps.

**TDD pragmatics:** Pure helpers (intent → sentence renderer, balance-row math, exec-step phase mapper) get Vitest unit tests. Presentational React primitives are verified by rendering them in a temporary `/_visual` Next.js page and eyeballing against the prototype, then by running the full Compound deposit + withdraw flow on Sepolia. The plan flags which is which per task.

---

## Phase 0 — Context

**Spec:** `docs/superpowers/specs/2026-05-01-wishd-ui-parity-design.md` (read fully — it pins colors, radii, shadows, and the 8-step migration sequence).

**Visual ground truth:** `prototype/wishd-intent.html` — class names + DOM shapes are authoritative when the spec is silent.

**Files in scope (already exist):**
- `apps/web/components/primitives/StepCard.tsx`
- `apps/web/components/wish/WishComposer.tsx`
- `apps/web/components/wish/StructuredComposer.tsx` (deleted at end of Task 4)
- `apps/web/app/globals.css`
- `apps/web/tailwind.config.ts`
- `packages/plugin-sdk/src/index.ts`
- `plugins/compound-v3/intents.ts`
- `plugins/compound-v3/widgets/{CompoundSummary,CompoundWithdrawSummary,CompoundExecute}.tsx`

**Out of scope:** Swap plugin (separate spec). Primitives must stay swap-compatible (Pay/Receive/SwapDir sections on `WidgetCard`, two-column layout in `AICheckPanel`) but no swap files are touched here.

**Success criteria (verification at the end of Task 14):**
- Body gradient + header dashed rule + wallet pill match prototype.
- Step cards render with Caveat 32px titles, 2px ink borders, `4px 4px 0` hard shadows; locked cards show the `edit ✎` pill.
- Composer Step 01 renders the dashed sentence box with orange action pill, dashed amount pill, mint chain pill — sentence reads "I want to deposit 10 USDC on ethereum-sepolia".
- Compound deposit on Sepolia: composer → widget card → execute timeline (4 steps for deposit-with-approve, 3 without) → success card with "Auto-compound yield" keeper offer stub. Same for withdraw.
- `pnpm typecheck` and `pnpm test` pass at every commit.

---

## Phase 1 — Token + style scaffolding

### Task 1: Extend Tailwind config with shadows, radii, fonts

**Files:**
- Modify: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Read current config** — confirm no existing `boxShadow` extension; `fontFamily.hand`/`mono` already present.

- [ ] **Step 2: Add `boxShadow` and refine `borderRadius`**

Replace the `theme.extend` block with:

```ts
extend: {
  colors: {
    bg: "var(--bg)",
    "bg-2": "var(--bg-2)",
    surface: "var(--surface)",
    "surface-2": "var(--surface-2)",
    ink: "var(--ink)",
    "ink-2": "var(--ink-2)",
    "ink-3": "var(--ink-3)",
    accent: "var(--accent)",
    "accent-2": "var(--accent-2)",
    mint: "var(--mint)",
    "mint-2": "var(--mint-2)",
    pink: "var(--pink)",
    warn: "var(--warn)",
    "warn-2": "var(--warn-2)",
    good: "var(--good)",
    bad: "var(--bad)",
    rule: "var(--rule)",
  },
  fontFamily: {
    sans: ["'Plus Jakarta Sans'", "sans-serif"],
    hand: ["Caveat", "cursive"],
    mono: ["'JetBrains Mono'", "monospace"],
  },
  borderRadius: {
    sm: "var(--r-sm)",
    DEFAULT: "var(--r)",
    md: "14px",
    lg: "var(--r-lg)",   // 20
    xl: "18px",          // widget card
    "2xl": "22px",       // step card
    pill: "var(--r-pill)",
  },
  boxShadow: {
    card: "4px 4px 0 var(--ink)",
    cardSm: "3px 3px 0 var(--ink)",
    cardLg: "6px 6px 0 var(--ink)",
    pill: "2px 2px 0 var(--ink)",
  },
  keyframes: {
    fadeUp: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
    blink:  { "0%,80%,100%": { opacity: "0.2" }, "40%": { opacity: "1" } },
    pulse:  { "0%,100%": { boxShadow: "0 0 0 0 rgba(232,154,107,0.4)" }, "50%": { boxShadow: "0 0 0 5px rgba(232,154,107,0)" } },
    spin:   { to: { transform: "rotate(360deg)" } },
  },
  animation: {
    fadeUp: "fadeUp 0.25s ease forwards",
    blink:  "blink 1.2s ease-in-out infinite",
    pulse:  "pulse 1.4s ease infinite",
    spin:   "spin 1s linear infinite",
  },
},
```

- [ ] **Step 3: Verify** — `pnpm --filter web typecheck` passes.

- [ ] **Step 4: Commit** — `chore(web): extend tailwind tokens with prototype shadows, radii, animations`.

### Task 2: Body gradient + header rule + asset-dot styles in globals.css

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Verify gradient already present** — current `globals.css` already has the radial-gradient body. Keep it.

- [ ] **Step 2: Add header rule + asset-dot block at the bottom of `globals.css`**

```css
/* header */
.app-header {
  display: flex; align-items: center; gap: 14px;
  padding: 22px 0 18px;
  border-bottom: 1.5px dashed var(--rule);
  margin-bottom: 28px;
}

/* asset-dot — token icon pellet */
.asset-dot {
  width: 26px; height: 26px; border-radius: 50%;
  border: 1.5px solid var(--ink);
  display: inline-grid; place-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.7px; font-weight: 700; flex: 0 0 auto;
}
.asset-dot.eth  { background: #C9D4F5; }
.asset-dot.usdc { background: #C2D7F0; }
.asset-dot.dai  { background: #FAE5B0; }
.asset-dot.wbtc { background: #FAD4A8; }
.asset-dot.usdt { background: #B0DFCB; }
.asset-dot.arb  { background: #BAD9F7; }
.asset-dot.default { background: var(--bg-2); }

/* live-dot pulse for AICheckPanel */
.live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); display: inline-block;
  animation: blink 1.2s ease-in-out infinite;
}
```

- [ ] **Step 3: Verify visually** — `pnpm dev`, load `http://localhost:3000`. Background gradient visible, no regressions.

- [ ] **Step 4: Commit** — `style(web): header rule + asset-dot palette in globals`.

### Task 3: Token icon helper

**Files:**
- Create: `apps/web/lib/tokenIcons.tsx`
- Create: `apps/web/lib/tokenIcons.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect } from "vitest";
import { tokenIconClass, tokenSymbol } from "./tokenIcons";

describe("tokenIcons", () => {
  it("maps known tokens to color classes", () => {
    expect(tokenIconClass("USDC")).toBe("asset-dot usdc");
    expect(tokenIconClass("eth")).toBe("asset-dot eth");
    expect(tokenIconClass("XYZ")).toBe("asset-dot default");
  });
  it("returns glyph for known tokens, ticker fallback otherwise", () => {
    expect(tokenSymbol("ETH")).toBe("Ξ");
    expect(tokenSymbol("USDC")).toBe("$");
    expect(tokenSymbol("ZZZ")).toBe("Z");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** — `pnpm --filter web test tokenIcons`.

- [ ] **Step 3: Implement**

```tsx
// apps/web/lib/tokenIcons.tsx
import type { ReactNode } from "react";

const CLASS: Record<string, string> = {
  ETH: "eth", USDC: "usdc", DAI: "dai", WBTC: "wbtc",
  USDT: "usdt", ARB: "arb",
};
const SYM: Record<string, string> = {
  ETH: "Ξ", USDC: "$", DAI: "◈", WBTC: "₿", USDT: "₮",
  ARB: "◆", MATIC: "◎", OP: "●",
};

export function tokenIconClass(ticker: string): string {
  const k = ticker.toUpperCase();
  return `asset-dot ${CLASS[k] ?? "default"}`;
}
export function tokenSymbol(ticker: string): string {
  const k = ticker.toUpperCase();
  return SYM[k] ?? k.charAt(0);
}
export function TokenDot({ ticker }: { ticker: string }): ReactNode {
  return <span className={tokenIconClass(ticker)}>{tokenSymbol(ticker)}</span>;
}
```

- [ ] **Step 4: Run test, expect PASS**.

- [ ] **Step 5: Commit** — `feat(web): tokenIcons helper for asset-dot rendering`.

---

## Phase 2 — StepCard overhaul

### Task 4: StepCard hard-shadow + edit affordance

**Files:**
- Modify: `apps/web/components/primitives/StepCard.tsx`

- [ ] **Step 1: Replace component**

```tsx
import type { ReactNode } from "react";

export type StepPhase = "in-progress" | "locked" | "complete";

export type StepCardProps = {
  step: string;        // "STEP 02"
  title: string;       // Caveat 32px
  status?: string;     // italic right-aligned, when no onEdit
  onEdit?: () => void; // when present + locked → "edit ✎" pill
  sub?: string;
  phase?: StepPhase;
  children?: ReactNode;
};

export function StepCard({
  step, title, status, onEdit, sub, phase = "in-progress", children,
}: StepCardProps) {
  const locked = phase === "locked";
  return (
    <section
      className={[
        "relative animate-fadeUp",
        "bg-surface border-2 border-ink rounded-2xl shadow-card",
        "px-6 pt-5 pb-[22px]",
        locked ? "opacity-[0.92]" : "",
      ].join(" ")}
    >
      <header className="flex items-baseline gap-3 mb-1">
        <span className="font-mono text-[10.5px] tracking-[0.1em] font-medium bg-bg-2 text-ink border-[1.5px] border-ink rounded-[5px] px-[7px] py-[3px] flex-shrink-0">
          {step}
        </span>
        <h2 className="font-hand text-[32px] font-bold leading-[1.1] flex-1 text-ink">{title}</h2>
        {locked && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-ink-2 border-[1.5px] border-ink rounded-pill px-3 py-1 bg-bg hover:bg-accent-2"
          >
            edit ✎
          </button>
        ) : status ? (
          <span className="text-xs text-ink-3 italic flex-shrink-0">{status}</span>
        ) : null}
      </header>
      {sub && <p className="text-[13.5px] text-ink-2 mt-1 mb-[14px]">{sub}</p>}
      <div className={["step-body", locked ? "pointer-events-none" : ""].join(" ")}>
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update parent layout to gap-6 between cards** — open `apps/web/app/page.tsx` (or whichever file mounts WishComposer + workspace). Wrap step-card list with `<div className="flex flex-col gap-6">…</div>`. If a wrapper already exists with different gap, change to `gap-6` (24px). Verify visually after dev server reload.

- [ ] **Step 3: IMPORTANT — no `overflow-hidden`** — the new card must NOT wrap children with `overflow-hidden`; later pill dropdowns rely on overflow being visible. Confirm none was added.

- [ ] **Step 4: Manual verify** — `pnpm dev`. Load app. Card should now show 2px ink border, 4px hard shadow, monospace badge, Caveat title. Compound flow still works: submit a wish, watch the widget render.

- [ ] **Step 5: Commit** — `feat(web): hard-shadow StepCard with edit pill affordance`.

---

## Phase 3 — SentenceBox + ActionPill primitives

### Task 5: SentenceBox primitive

**Files:**
- Create: `apps/web/components/primitives/SentenceBox.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { ReactNode } from "react";

export type SentenceBoxProps = {
  children: ReactNode;
  className?: string;
};

export function SentenceBox({ children, className = "" }: SentenceBoxProps) {
  return (
    <div
      className={[
        "border-2 border-dashed border-ink rounded-[16px]",
        "bg-surface-2 p-[18px] mb-[14px]",
        "flex flex-wrap items-center gap-y-[14px] gap-x-3",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function SentencePrefix({ children }: { children: ReactNode }) {
  return <span className="font-hand text-[28px] text-ink whitespace-nowrap">{children}</span>;
}

export function SentenceConnector({ children }: { children: ReactNode }) {
  return <span className="text-sm text-ink-3">{children}</span>;
}
```

- [ ] **Step 2: Manual verify** — defer; checked end of Task 8 via temp visual page.

- [ ] **Step 3: Commit** — `feat(web): SentenceBox primitive`.

### Task 6: ActionPill primitive

**Files:**
- Create: `apps/web/components/primitives/ActionPill.tsx`

The pill renders one of six variants. `action`, `from`, `to`, `chain`, `protocol` are buttons that open dropdowns; `amount` is an inline text input. Outside-click closing is the consumer's responsibility (a single document listener mounted by `WishComposer` — see Task 8). The pill exposes `open`/`onOpenChange` so the parent can coordinate.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useId, type ReactNode } from "react";
import { TokenDot } from "@/lib/tokenIcons";

export type ActionPillOption = {
  id: string;
  label: string;       // primary line
  sub?: string;        // secondary line / description
  icon?: ReactNode;
  trailing?: ReactNode;
};

export type ActionPillVariant = "action" | "from" | "to" | "chain" | "protocol" | "amount";

export type ActionPillProps = {
  variant: ActionPillVariant;
  value?: string;                  // current label, or current input value for amount
  placeholder?: string;            // shown when value empty
  options?: ActionPillOption[];    // dropdown rows
  onChange?: (id: string) => void; // dropdown pick OR amount input change
  /** Render token-dot icon on the left when variant is from/to and value matches a token. */
  iconTicker?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  inputWidthCh?: number;           // for amount variant; default 6
};

const VARIANT_BG: Record<Exclude<ActionPillVariant, "amount">, string> = {
  action: "bg-accent",
  from: "bg-accent",
  to: "bg-mint",
  chain: "bg-mint",
  protocol: "bg-bg-2",
};

export function ActionPill(props: ActionPillProps) {
  const id = useId();
  if (props.variant === "amount") return <AmountPill {...props} />;

  const empty = !props.value;
  const label = props.value ?? props.placeholder ?? "";
  const bg = empty ? "bg-surface-2 text-ink-3" : `${VARIANT_BG[props.variant]} text-ink`;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={!!props.open}
        onClick={() => props.onOpenChange?.(!props.open)}
        className={[
          "inline-flex items-center gap-1.5",
          "border-2 border-ink rounded-pill",
          "px-[14px] py-[3px]",
          "font-hand text-[16px] font-semibold",
          "whitespace-nowrap select-none cursor-pointer",
          "transition-opacity hover:opacity-80",
          "disabled:cursor-not-allowed disabled:opacity-60",
          bg,
        ].join(" ")}
      >
        {props.iconTicker && <TokenDot ticker={props.iconTicker} />}
        <span>{label}</span>
        <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2 4l4 4 4-4" stroke="currentColor" fill="none" strokeWidth="1.5"/></svg>
      </button>
      {props.open && props.options && (
        <div
          role="listbox"
          aria-labelledby={id}
          className="absolute top-[calc(100%+6px)] left-0 z-[100] min-w-[260px] bg-surface-2 border-2 border-ink rounded-[14px] shadow-card animate-fadeUp p-1.5"
        >
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 px-2 pt-1 pb-1.5">
            {props.options.length} option{props.options.length === 1 ? "" : "s"}
          </div>
          {props.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              onClick={() => { props.onChange?.(o.id); props.onOpenChange?.(false); }}
              className="w-full flex items-center justify-between gap-2.5 p-2.5 rounded-lg cursor-pointer text-sm min-h-[44px] hover:bg-accent-2 text-left"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {o.icon}
                <span className="font-bold text-ink truncate">{o.label}</span>
                {o.sub && <span className="font-normal text-ink-3 ml-1.5 truncate">{o.sub}</span>}
              </span>
              {o.trailing && <span className="font-mono text-[12.5px] text-ink-2">{o.trailing}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function AmountPill(props: ActionPillProps) {
  return (
    <span className="inline-flex items-center border-2 border-dashed border-ink rounded-pill bg-transparent overflow-hidden px-[14px] py-[3px]">
      <input
        inputMode="decimal"
        value={props.value ?? ""}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange?.(e.target.value)}
        disabled={props.disabled}
        className="bg-transparent border-none outline-none font-hand text-[22px] font-bold text-ink p-0 text-center"
        style={{ width: `${(props.inputWidthCh ?? 6)}ch` }}
      />
    </span>
  );
}
```

- [ ] **Step 2: Manual verify** — deferred to Task 8.

- [ ] **Step 3: Commit** — `feat(web): ActionPill primitive with dropdown variants`.

### Task 7: Visual sandbox page

**Files:**
- Create: `apps/web/app/_visual/page.tsx`

Used to eyeball primitives against the prototype without touching production paths. Stays in tree until Task 14, then deleted.

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useState } from "react";
import { StepCard } from "@/components/primitives/StepCard";
import { SentenceBox, SentencePrefix, SentenceConnector } from "@/components/primitives/SentenceBox";
import { ActionPill } from "@/components/primitives/ActionPill";

export default function VisualPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [amount, setAmount] = useState("10");
  const [asset, setAsset] = useState("USDC");
  const [chain, setChain] = useState("ethereum-sepolia");

  return (
    <main className="page">
      <h1 className="font-hand text-4xl my-6">visual sandbox</h1>
      <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
        <SentenceBox>
          <SentencePrefix>I want to</SentencePrefix>
          <ActionPill
            variant="action" value={action} placeholder="pick action"
            options={[
              { id: "deposit", label: "deposit", sub: "supply tokens to earn yield" },
              { id: "withdraw", label: "withdraw", sub: "redeem tokens you previously supplied" },
            ]}
            open={openId === "a"} onOpenChange={(o) => setOpenId(o ? "a" : null)}
            onChange={setAction}
          />
          <ActionPill variant="amount" value={amount} onChange={setAmount} />
          <ActionPill
            variant="from" value={asset} iconTicker={asset}
            options={[{ id: "USDC", label: "USDC" }]}
            open={openId === "as"} onOpenChange={(o) => setOpenId(o ? "as" : null)}
            onChange={setAsset}
          />
          <SentenceConnector>on</SentenceConnector>
          <ActionPill
            variant="chain" value={chain}
            options={[{ id: "ethereum-sepolia", label: "Ethereum Sepolia" }]}
            open={openId === "c"} onOpenChange={(o) => setOpenId(o ? "c" : null)}
            onChange={setChain}
          />
        </SentenceBox>
      </StepCard>
    </main>
  );
}
```

- [ ] **Step 2: Verify** — `pnpm dev`, open `http://localhost:3000/_visual`. Compare side-by-side with `prototype/wishd-intent.html` (open the prototype HTML directly in a second tab; clear `localStorage.w_intent` first if state stuck). Confirm: dashed sentence box, orange action pill, dashed amount pill, mint chain pill, dropdown opens with hard shadow, picking a value closes the dropdown.

- [ ] **Step 3: Commit** — `chore(web): _visual sandbox page for primitive review`.

---

## Phase 4 — Schema-driven WishComposer

### Task 8: Schema additions in plugin-sdk

**Files:**
- Modify: `packages/plugin-sdk/src/index.ts`
- Create: `packages/plugin-sdk/src/sentence.ts`
- Create: `packages/plugin-sdk/src/sentence.test.ts`

- [ ] **Step 1: Add `connectors` and `balanceFor` to `IntentSchema`**

In `packages/plugin-sdk/src/index.ts`, replace the `IntentSchema` definition with:

```ts
export type IntentSchema = {
  intent: string;
  verb: string;
  description: string;
  fields: IntentField[];
  widget: string;
  slot?: WidgetSlot;
  /** Words inserted *before* the named field. Key = field key. */
  connectors?: Record<string, string>;
  /** Field key whose value drives the BalanceRow chips (for swap/bridge). */
  balanceFor?: string;
};
```

Keep all other types unchanged. Both `connectors` and `balanceFor` are optional, so existing intent definitions stay valid.

- [ ] **Step 2: Write the failing sentence-renderer test**

```ts
// packages/plugin-sdk/src/sentence.test.ts
import { describe, it, expect } from "vitest";
import { renderSentenceParts } from "./sentence";
import type { IntentSchema } from "./index";

const deposit: IntentSchema = {
  intent: "compound-v3.deposit",
  verb: "deposit",
  description: "supply tokens to earn yield",
  widget: "compound-summary",
  fields: [
    { key: "amount", type: "amount", required: true, default: "10" },
    { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
    { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
  ],
  connectors: { chain: "on" },
};

describe("renderSentenceParts", () => {
  it("interleaves connectors before fields", () => {
    const parts = renderSentenceParts(deposit);
    expect(parts).toEqual([
      { kind: "field", key: "amount" },
      { kind: "field", key: "asset" },
      { kind: "connector", text: "on" },
      { kind: "field", key: "chain" },
    ]);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL** (`pnpm --filter @wishd/plugin-sdk test`).

- [ ] **Step 4: Implement**

```ts
// packages/plugin-sdk/src/sentence.ts
import type { IntentSchema } from "./index";

export type SentencePart =
  | { kind: "field"; key: string }
  | { kind: "connector"; text: string };

export function renderSentenceParts(schema: IntentSchema): SentencePart[] {
  const out: SentencePart[] = [];
  for (const f of schema.fields) {
    const c = schema.connectors?.[f.key];
    if (c) out.push({ kind: "connector", text: c });
    out.push({ kind: "field", key: f.key });
  }
  return out;
}
```

Re-export from `index.ts`:

```ts
export { renderSentenceParts } from "./sentence";
export type { SentencePart } from "./sentence";
```

- [ ] **Step 5: Run test, expect PASS**.

- [ ] **Step 6: Commit** — `feat(plugin-sdk): IntentSchema connectors + sentence renderer`.

### Task 9: Compound intents add connector map

**Files:**
- Modify: `plugins/compound-v3/intents.ts`

- [ ] **Step 1: Add `connectors` to both intents**

```ts
import type { IntentSchema } from "@wishd/plugin-sdk";

const sharedFields: IntentSchema["fields"] = [
  { key: "amount", type: "amount", required: true, default: "10" },
  { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
  { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
];

const sharedConnectors: NonNullable<IntentSchema["connectors"]> = {
  chain: "on",
};

export const compoundIntents: IntentSchema[] = [
  {
    intent: "compound-v3.deposit",
    verb: "deposit",
    description: "supply tokens to earn yield",
    fields: sharedFields,
    connectors: sharedConnectors,
    widget: "compound-summary",
    slot: "flow",
  },
  {
    intent: "compound-v3.withdraw",
    verb: "withdraw",
    description: "redeem tokens you previously supplied",
    fields: sharedFields,
    connectors: sharedConnectors,
    widget: "compound-withdraw-summary",
    slot: "flow",
  },
];
```

- [ ] **Step 2: Verify typecheck** — `pnpm typecheck`.

- [ ] **Step 3: Commit** — `feat(compound-v3): connectors map for sentence rendering`.

### Task 10: WishComposer rebuild on SentenceBox + ActionPill

**Files:**
- Modify: `apps/web/components/wish/WishComposer.tsx`
- Delete: `apps/web/components/wish/StructuredComposer.tsx`

The composer drives one `IntentSchema` at a time. The action pill picks the schema; the remaining pills bind to `values[fieldKey]`. A single document `mousedown` listener closes whichever dropdown is open. Free-text mode is preserved via a "type instead" toggle below the submit button.

- [ ] **Step 1: Replace `WishComposer.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";
import { StepCard } from "@/components/primitives/StepCard";
import { SentenceBox, SentencePrefix, SentenceConnector } from "@/components/primitives/SentenceBox";
import { ActionPill, type ActionPillVariant } from "@/components/primitives/ActionPill";
import { CLIENT_INTENT_SCHEMAS } from "@/lib/intentRegistry.client";
import { prepareIntent, PrepareError } from "@/lib/prepareIntent";
import { renderSentenceParts, type IntentSchema, type IntentField } from "@wishd/plugin-sdk";

const EXAMPLES = [
  { label: "deposit 10 USDC into Compound on Sepolia", intent: "compound-v3.deposit",
    values: { amount: "10", asset: "USDC", chain: "ethereum-sepolia" } },
  { label: "withdraw 10 USDC from Compound on Sepolia", intent: "compound-v3.withdraw",
    values: { amount: "10", asset: "USDC", chain: "ethereum-sepolia" } },
];

const SKELETON_TIMEOUT_MS = 5000;
const newId = () => `s_${Math.random().toString(36).slice(2, 10)}`;

function defaultsFor(s: IntentSchema): Record<string, string> {
  const o: Record<string, string> = {};
  for (const f of s.fields) o[f.key] = ("default" in f && f.default) || "";
  return o;
}

function pillVariantFor(field: IntentField, schema: IntentSchema): ActionPillVariant {
  if (field.type === "amount") return "amount";
  if (field.type === "chain") return "chain";
  // single asset → "from" for deposit-style intents (orange).
  // future: schema can override per-field; for now all assets render "from".
  return "from";
}

export function WishComposer() {
  const [mode, setMode] = useState<"structured" | "freetext">("structured");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [openPillKey, setOpenPillKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { address, chainId, isConnected } = useAccount();
  const ws = useWorkspace();

  const [intentId, setIntentId] = useState(CLIENT_INTENT_SCHEMAS[0]?.intent ?? "");
  const schema = useMemo(
    () => CLIENT_INTENT_SCHEMAS.find((s) => s.intent === intentId),
    [intentId],
  );
  const [values, setValues] = useState<Record<string, string>>(() => (schema ? defaultsFor(schema) : {}));

  // Outside-click closes any open pill dropdown.
  useEffect(() => {
    if (!openPillKey) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenPillKey(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openPillKey]);

  function pickIntent(id: string) {
    setIntentId(id);
    const next = CLIENT_INTENT_SCHEMAS.find((s) => s.intent === id);
    setValues(next ? defaultsFor(next) : {});
    setOpenPillKey(null);
  }
  function setField(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  const account = {
    address: (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    chainId: chainId ?? 11155111,
  };
  const missingRequired = !schema || schema.fields.some((f) => f.required && !values[f.key]);

  async function submitStructured() {
    if (!schema || missingRequired) return;
    if (!isConnected || !address) {
      ws.reset();
      ws.appendNarration("connect a wallet first — top right.");
      return;
    }
    setBusy(true);
    ws.reset();
    const skeletonId = newId();
    ws.appendSkeleton({
      id: skeletonId, widgetType: schema.widget,
      amount: values.amount, asset: values.asset,
    });
    const t0 = performance.now();
    const timer = setTimeout(() => ws.failSkeleton(skeletonId, "preparation timed out — retry?"), SKELETON_TIMEOUT_MS);
    const fast = (async () => {
      try {
        const out = await prepareIntent(schema.intent, { ...values, address: account.address });
        clearTimeout(timer);
        ws.hydrateSkeleton(skeletonId, {
          id: out.widget.id, type: out.widget.type, slot: out.widget.slot,
          props: out.widget.props,
        });
        console.info(JSON.stringify({ tag: "wishd:perf", event: "skeleton-to-hydrate-ms",
          intent: schema.intent, ms: Math.round(performance.now() - t0) }));
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof PrepareError ? err.message
          : err instanceof Error ? err.message : "unknown error";
        ws.failSkeleton(skeletonId, msg);
      }
    })();
    const narr = (async () => {
      try {
        await startStream({
          wish: phrase(schema.intent, values), account,
          context: { mode: "narrate-only", intent: schema.intent, values },
          onEvent: (e) => {
            if (e.type === "chat.delta") ws.appendNarration(e.delta);
            if (e.type === "ui.patch") ws.patchWidget(e.id, e.props);
            if (e.type === "ui.dismiss") ws.dismissWidget(e.id);
          },
        });
      } catch { ws.appendNarration("\n[narration unavailable]"); }
    })();
    await Promise.allSettled([fast, narr]);
    setBusy(false);
  }

  async function submitFreeText(wish: string) {
    if (!wish.trim()) return;
    if (!isConnected || !address) {
      ws.reset(); ws.appendNarration("connect a wallet first — top right."); return;
    }
    setBusy(true);
    ws.reset();
    const skeletonId = newId();
    const guess = guessFromText(wish);
    ws.appendSkeleton({ id: skeletonId, widgetType: guess.widgetType, amount: guess.amount, asset: guess.asset });
    const t0 = performance.now();
    try {
      await startStream({
        wish, account,
        onEvent: (e) => {
          if (e.type === "chat.delta") ws.appendNarration(e.delta);
          if (e.type === "ui.render") {
            ws.hydrateSkeleton(skeletonId, {
              id: e.widget.id, type: e.widget.type,
              slot: e.widget.slot ?? "flow", props: e.widget.props as Record<string, unknown>,
            });
            console.info(JSON.stringify({ tag: "wishd:perf", event: "freetext-roundtrip-ms",
              ms: Math.round(performance.now() - t0) }));
          }
          if (e.type === "ui.patch") ws.patchWidget(e.id, e.props);
          if (e.type === "ui.dismiss") ws.dismissWidget(e.id);
          if (e.type === "error") ws.failSkeleton(skeletonId, e.message);
        },
      });
    } finally { setBusy(false); }
  }

  // --- render ---
  if (mode === "freetext") {
    return (
      <StepCard step="STEP 01" title="describe your wish" sub="type a wish in plain English">
        <form
          onSubmit={(e) => { e.preventDefault(); submitFreeText(text); }}
          className="flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="deposit 10 USDC into Compound on Sepolia"
            className="flex-1 rounded-sm bg-surface-2 border border-rule px-3 py-2 font-sans text-ink placeholder:text-ink-3"
            disabled={busy}
          />
          <button
            type="submit" disabled={busy}
            className="rounded-pill bg-accent border-2 border-ink text-ink px-4 py-2 font-semibold shadow-pill hover:bg-accent-2 disabled:opacity-50"
          >{busy ? "…" : "wish"}</button>
        </form>
        <button
          type="button"
          onClick={() => setMode("structured")}
          className="mt-3 text-xs text-ink-3 hover:text-ink underline"
        >use structured composer</button>
      </StepCard>
    );
  }

  const parts = schema ? renderSentenceParts(schema) : [];
  const actionOptions = CLIENT_INTENT_SCHEMAS.map((s) => ({
    id: s.intent, label: s.verb, sub: s.description,
  }));

  return (
    <div ref={rootRef}>
      <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
        <SentenceBox>
          <SentencePrefix>I want to</SentencePrefix>

          <ActionPill
            variant="action" value={schema?.verb} placeholder="pick action"
            options={actionOptions}
            open={openPillKey === "__action"}
            onOpenChange={(o) => setOpenPillKey(o ? "__action" : null)}
            onChange={pickIntent}
            disabled={busy}
          />

          {schema && parts.map((p, i) => {
            if (p.kind === "connector") return <SentenceConnector key={`c${i}`}>{p.text}</SentenceConnector>;
            const field = schema.fields.find((f) => f.key === p.key)!;
            const variant = pillVariantFor(field, schema);
            const value = values[field.key] ?? "";
            const opts =
              field.type !== "amount"
                ? field.options.map((o) => ({ id: o, label: o }))
                : undefined;
            return (
              <ActionPill
                key={field.key}
                variant={variant}
                value={value}
                placeholder={field.type === "amount" ? "" : field.key}
                iconTicker={field.type === "asset" ? value : undefined}
                options={opts}
                open={openPillKey === field.key}
                onOpenChange={(o) => setOpenPillKey(o ? field.key : null)}
                onChange={(v) => setField(field.key, v)}
                disabled={busy}
                inputWidthCh={field.type === "amount" ? 6 : undefined}
              />
            );
          })}
        </SentenceBox>

        <div className="flex flex-wrap gap-2 items-center mb-3">
          <span className="text-xs text-ink-3">or try:</span>
          {EXAMPLES.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={busy}
              onClick={() => {
                pickIntent(c.intent);
                setValues(c.values);
                setTimeout(submitStructured, 0); // pickIntent resets values; the inline set above wins
              }}
              className="border-[1.5px] border-rule rounded-pill text-xs bg-surface-2 text-ink-2 px-3 py-[5px] hover:border-ink hover:bg-accent-2 disabled:opacity-50"
            >{c.label}</button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submitStructured}
            disabled={busy || missingRequired}
            className="inline-flex items-center gap-1.5 rounded-pill bg-accent border-2 border-ink text-ink px-[22px] py-2.5 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none"
          >{busy ? "…" : "looks good →"}</button>
        </div>

        <button
          type="button"
          onClick={() => setMode("freetext")}
          className="mt-3 text-xs text-ink-3 hover:text-ink underline"
        >type instead</button>
      </StepCard>
    </div>
  );
}

function phrase(intent: string, v: Record<string, string>): string {
  const verb = intent === "compound-v3.withdraw" ? "withdraw" : "deposit";
  const prep = intent === "compound-v3.withdraw" ? "from" : "into";
  return `I want to ${verb} ${v.amount} ${v.asset} ${prep} Compound on Sepolia.`;
}

function guessFromText(t: string): { widgetType: string; amount?: string; asset?: string } {
  const lower = t.toLowerCase();
  const widgetType = /withdraw|redeem/.test(lower) ? "compound-withdraw-summary" : "compound-summary";
  const m = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|usd|eth)?/);
  return { widgetType, amount: m?.[1], asset: m?.[2]?.toUpperCase() };
}
```

- [ ] **Step 2: Delete `StructuredComposer.tsx`**

```bash
rm apps/web/components/wish/StructuredComposer.tsx
```

- [ ] **Step 3: Bug — example-pill submit race**

The example-pill button calls `pickIntent` (which resets values to defaults) then `setValues(c.values)` then `submitStructured`. Because `setState` is async, `submitStructured` reads stale `values`. Fix by branching submit into `submitStructuredWith(schema, values)` that takes args explicitly, and have the example handler call it directly:

```ts
async function submitStructuredWith(s: IntentSchema, vs: Record<string, string>) {
  // copy of submitStructured body, using s/vs instead of schema/values
  // ...
}
```

Then in the example handler:

```ts
onClick={() => {
  setIntentId(c.intent);
  setValues(c.values);
  setOpenPillKey(null);
  const s = CLIENT_INTENT_SCHEMAS.find((x) => x.intent === c.intent);
  if (s) submitStructuredWith(s, c.values);
}}
```

`submitStructured` (no-args) just calls `submitStructuredWith(schema!, values)`.

- [ ] **Step 4: Verify** — `pnpm --filter web typecheck` clean. `pnpm dev`, click both example pills end-to-end on Sepolia (deposit and withdraw). Confirm: pills show in dashed sentence box, wish prepares + executes, narration appears.

- [ ] **Step 5: Commit** — `feat(web): schema-driven WishComposer on SentenceBox + ActionPill`.

---

## Phase 5 — WidgetCard + Compound widget refactor

### Task 11: WidgetCard primitive

**Files:**
- Create: `apps/web/components/primitives/WidgetCard.tsx`

The primitive ships compound-component subsections (`Head`, `PaySection`, `SwapDir`, `ReceiveSection`, `AmountSection`, `Stats`, `Cta`). Compound v0 uses `Head + AmountSection + Stats + Cta`. Pay/Receive/SwapDir are present for forward-compat with swap.

- [ ] **Step 1: Implement**

```tsx
"use client";
import type { ReactNode } from "react";

export type StatItem = { k: string; v: ReactNode };

export function WidgetCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-2 border-2 border-ink rounded-xl shadow-cardSm overflow-hidden">
      {children}
    </div>
  );
}

WidgetCard.Head = function Head({ name, badge }: { name: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
      <div className="font-hand text-[20px] font-bold">{name}</div>
      {badge && (
        <div className="font-mono text-[10px] border border-rule rounded-sm px-[7px] py-[2px] text-ink-3">
          {badge}
        </div>
      )}
    </div>
  );
};

WidgetCard.PaySection = function PaySection({ children }: { children: ReactNode }) {
  return <div className="bg-accent-2 px-4 py-3.5">{children}</div>;
};
WidgetCard.ReceiveSection = function ReceiveSection({ children }: { children: ReactNode }) {
  return <div className="bg-mint-2 px-4 py-3.5">{children}</div>;
};
WidgetCard.SwapDir = function SwapDir({ onFlip }: { onFlip?: () => void }) {
  return (
    <div className="flex justify-center items-center p-2 bg-surface-2 border-y border-rule">
      <button
        type="button" onClick={onFlip}
        className="w-8 h-8 rounded-full border-[1.5px] border-ink bg-surface-2 flex items-center justify-center cursor-pointer text-base hover:bg-accent-2 hover:rotate-180 transition-transform"
      >↕</button>
    </div>
  );
};

WidgetCard.AmountSection = function AmountSection({
  label, amount, asset, sub, max,
}: {
  label: string;
  amount: ReactNode;     // big Caveat number
  asset?: ReactNode;     // pill on the right
  sub?: ReactNode;       // small mono row beneath
  max?: ReactNode;       // small mono row, right column
}) {
  return (
    <div className="px-4 py-3.5 border-b border-rule">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 mb-1.5 flex justify-between items-center">
        <span>{label}</span>
        {max && <span className="font-mono text-[11px] text-ink-3">{max}</span>}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="font-hand text-[38px] font-bold leading-none mb-1">{amount}</div>
          {sub && <div className="font-mono text-xs text-ink-3">{sub}</div>}
        </div>
        {asset && (
          <span className="inline-flex items-center gap-1.5 bg-surface-2 border-[1.5px] border-ink rounded-pill px-2.5 py-1 font-bold text-sm">
            {asset}
          </span>
        )}
      </div>
    </div>
  );
};

WidgetCard.Stats = function Stats({ items }: { items: StatItem[] }) {
  // 2-col grid; last row removes bottom border, even cells remove right border.
  return (
    <div className="grid grid-cols-2 border-t border-rule">
      {items.map((it, i) => {
        const lastTwo = i >= items.length - (items.length % 2 === 0 ? 2 : 1);
        const right = i % 2 === 1;
        return (
          <div
            key={`${it.k}-${i}`}
            className={[
              "px-3.5 py-2.5",
              right ? "" : "border-r border-rule",
              lastTwo ? "" : "border-b border-rule",
            ].join(" ")}
          >
            <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-3 mb-[3px]">{it.k}</div>
            <div className="font-hand text-[17px] font-bold">{it.v}</div>
          </div>
        );
      })}
    </div>
  );
};

WidgetCard.Cta = function Cta({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3.5 border-t border-rule">{children}</div>;
};
```

- [ ] **Step 2: Manual verify** — extend `_visual/page.tsx` with a sample card, check border, shadow, stats grid borders, CTA padding.

- [ ] **Step 3: Commit** — `feat(web): WidgetCard primitive with composable sections`.

### Task 12: Refactor `CompoundSummary` onto WidgetCard

**Files:**
- Modify: `plugins/compound-v3/widgets/CompoundSummary.tsx`

The widget keeps its current `wishd:wish` event-dispatch logic; only the render layer changes. `Kv` is deleted.

- [ ] **Step 1: Replace component body**

```tsx
"use client";

import { useState } from "react";
import { WidgetCard } from "../../../apps/web/components/primitives/WidgetCard";
import { TokenDot } from "../../../apps/web/lib/tokenIcons";

export type CompoundSummaryProps = {
  amount: string;
  asset: string;
  market: string;
  needsApprove: boolean;
  summaryId: string;
  amountWei: string;
  chainId: number;
  user: `0x${string}`;
  comet: `0x${string}`;
  usdc: `0x${string}`;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: `0x${string}` }>;
  balance?: string;
  insufficient?: boolean;
};

export function CompoundSummary(props: CompoundSummaryProps) {
  const [submitting, setSubmitting] = useState(false);
  const blocked = props.insufficient === true;

  function execute() {
    if (blocked) return;
    setSubmitting(true);
    window.dispatchEvent(new CustomEvent("wishd:wish", {
      detail: {
        wish: `execute deposit ${props.summaryId}`,
        account: { address: props.user, chainId: props.chainId },
        context: {
          summaryId: props.summaryId,
          prepared: { ...props },
        },
      },
    }));
    setTimeout(() => setSubmitting(false), 1000);
  }

  return (
    <WidgetCard>
      <WidgetCard.Head name="supply" badge={`COMPOUND V3 · ${props.needsApprove ? "2 TX" : "1 TX"}`} />
      <WidgetCard.AmountSection
        label="you supply"
        amount={props.amount}
        asset={<><TokenDot ticker={props.asset} />{props.asset}</>}
        sub={<>≈ <span className="font-mono">{props.amount}</span> USD</>}
        max={props.balance !== undefined ? `balance: ${props.balance} ${props.asset}` : undefined}
      />
      <WidgetCard.Stats items={[
        { k: "market", v: props.market },
        { k: "action", v: props.needsApprove ? "approve + supply" : "supply" },
      ]} />
      {blocked && (
        <div className="mx-4 my-3 rounded-sm bg-warn-2 border border-warn p-3 text-sm text-ink-2">
          insufficient {props.asset} balance. you have {props.balance} but need {props.amount}.
          fund the wallet on Sepolia and re-wish.
        </div>
      )}
      <WidgetCard.Cta>
        <button
          type="button"
          onClick={execute}
          disabled={submitting || blocked}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-accent border-2 border-ink text-ink py-3 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
        >
          {blocked ? "insufficient balance" : submitting ? "preparing…" : "execute →"}
        </button>
      </WidgetCard.Cta>
    </WidgetCard>
  );
}
```

- [ ] **Step 2: Verify import path** — relative path `../../../apps/web/components/primitives/WidgetCard` works because Tailwind's `content` already includes `../../plugins/**/widgets/**/*.{ts,tsx}` and the workspace ts paths will resolve. If TS complains, prefer the alias: check whether `@/components/...` is set up at workspace root for plugins. If not, keep relative.

  - Risk: monorepo `@/...` aliasing is per-tsconfig; `apps/web/tsconfig.json` defines `@/*` only for the web package. Plugins use relative paths today (see how `CompoundExecute` imports `wagmi`). Stick with relative.

- [ ] **Step 3: Manual verify** — full deposit flow on Sepolia. Card visual matches widget-card from prototype: 2px border, 3px shadow, border-rule between sections, Caveat amount, mono badge.

- [ ] **Step 4: Commit** — `refactor(compound-v3): CompoundSummary on WidgetCard primitive`.

### Task 13: Refactor `CompoundWithdrawSummary` onto WidgetCard

**Files:**
- Modify: `plugins/compound-v3/widgets/CompoundWithdrawSummary.tsx`

- [ ] **Step 1: Replace component**

Same shape as Task 12, but:
- `WidgetCard.Head` `name="withdraw"`, `badge="COMPOUND V3 · 1 TX"`.
- Stats: `[{k:"market", v: market}, {k:"action", v:"withdraw"}]`.
- AmountSection `label="you withdraw"`, `max={ supplied !== undefined ? "supplied: " + supplied + " " + asset : undefined }`.
- Insufficient banner: copy from existing component verbatim (uses `props.supplied`).
- CTA label: `"withdraw →"`, blocked → `"insufficient supply"`.

- [ ] **Step 2: Manual verify** — withdraw flow Sepolia.

- [ ] **Step 3: Commit** — `refactor(compound-v3): CompoundWithdrawSummary on WidgetCard primitive`.

---

## Phase 6 — AICheckPanel (single-column for Compound)

### Task 14: AICheckPanel primitive

**Files:**
- Create: `apps/web/components/primitives/AICheckPanel.tsx`

Compound v0 renders this as a slim safety panel below the widget card (single column). Two-column responsive layout is reserved for swap; the primitive supports both — Compound mounts it inside the same StepCard body, no two-col wrapper.

- [ ] **Step 1: Implement**

```tsx
"use client";
import type { ReactNode } from "react";

export type BalanceChange = { sign: "+" | "-"; token: string; amount: string };
export type SafetyItem = { ok: boolean; text: string };

export type AICheckPanelProps = {
  status?: "live" | "stale";
  title?: string;             // default "AI safety check"
  sub?: string;               // default "balance + allowance + sim"
  balanceChanges?: BalanceChange[];
  safety?: SafetyItem[];
  allowance?: ReactNode;      // optional CTA block
};

export function AICheckPanel({
  status = "live",
  title = "AI safety check",
  sub = "balance · allowance · simulation",
  balanceChanges = [],
  safety = [],
  allowance,
}: AICheckPanelProps) {
  return (
    <aside className="border-[1.5px] border-dashed border-ink rounded-2xl bg-bg p-4">
      <header className="flex items-baseline gap-2 mb-0.5">
        <h3 className="text-[15px] font-semibold flex-1">{title}</h3>
        <span className="text-xs italic text-accent flex items-center gap-1">
          <span className="live-dot" /> {status === "live" ? "live" : "stale"}
        </span>
      </header>
      <p className="text-xs text-ink-3 mb-3.5">{sub}</p>

      {balanceChanges.length > 0 && (
        <>
          <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-3 mb-2">balance changes</div>
          {balanceChanges.map((b, i) => (
            <div
              key={`${b.token}-${i}`}
              className={[
                "flex items-center gap-2 px-2.5 py-[7px] border-[1.5px] border-dashed rounded-sm mb-1.5 text-[13px]",
                b.sign === "+" ? "bg-mint-2 border-mint" : "bg-[#FDEAEA] border-bad",
              ].join(" ")}
            >
              <span className="font-mono font-bold">{b.sign}</span>
              <span className="flex-1 font-medium">{b.token}</span>
              <span className="font-mono font-medium text-xs">{b.amount}</span>
            </div>
          ))}
          <div className="h-px bg-rule my-3" />
        </>
      )}

      {safety.length > 0 && (
        <>
          <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-3 mb-2">checks</div>
          {safety.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[13px] mb-[7px] leading-snug">
              <span className={[
                "w-[18px] h-[18px] rounded flex-shrink-0 flex items-center justify-center text-[11px] font-bold",
                s.ok ? "bg-good" : "bg-bad",
                "text-ink",
              ].join(" ")}>{s.ok ? "✓" : "!"}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </>
      )}

      {allowance && <div className="mt-2.5 flex flex-col gap-1.5">{allowance}</div>}
    </aside>
  );
}
```

- [ ] **Step 2: Mount on `CompoundSummary` and `CompoundWithdrawSummary`** — add a panel below the WidgetCard inside each widget's render output.

For `CompoundSummary`:

```tsx
return (
  <div className="flex flex-col gap-3">
    <WidgetCard>...</WidgetCard>
    <AICheckPanel
      title="safety check"
      sub="reading wallet + allowance + sim"
      safety={[
        { ok: true, text: `${props.asset} contract verified · ${props.usdc.slice(0,10)}…` },
        { ok: true, text: `Compound Comet verified · ${props.comet.slice(0,10)}…` },
        props.needsApprove
          ? { ok: false, text: "needs ERC-20 approval before supply" }
          : { ok: true, text: "allowance sufficient — no approve needed" },
        props.balance !== undefined && !props.insufficient
          ? { ok: true, text: `balance covers amount (${props.balance} ${props.asset})` }
          : !props.insufficient
            ? { ok: true, text: "balance check pending" }
            : { ok: false, text: `balance ${props.balance} < ${props.amount}` },
      ]}
    />
  </div>
);
```

For `CompoundWithdrawSummary`: similar, but check `supplied` instead of `balance`, and drop the approval entry (withdraw doesn't approve).

- [ ] **Step 3: Manual verify** — both flows. Confirm dashed-border panel renders, live-dot blinks, safety items show correct ticks/crosses for each scenario (balance ok, balance too low, approval needed, no approval needed).

- [ ] **Step 4: Commit** — `feat(web): AICheckPanel primitive + Compound integration`.

---

## Phase 7 — ExecuteTimeline + CompoundExecute refactor

### Task 15: ExecuteTimeline primitive

**Files:**
- Create: `apps/web/components/primitives/ExecuteTimeline.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";
import type { ReactNode } from "react";

export type ExecPhase = "queued" | "active" | "done" | "error";

export type ExecStep = {
  id: string;
  title: string;
  sub?: string;
  phase: ExecPhase;
  detail?: ReactNode;
};

export type ExecuteTimelineProps = {
  steps: ExecStep[];
  cta?: { label: string; onClick: () => void; disabled?: boolean };
  back?: { onClick: () => void; label?: string };
};

const PHASE_ICON: Record<ExecPhase, ReactNode> = {
  queued: "•",
  active: <span className="inline-block animate-spin">◐</span>,
  done: "✓",
  error: "×",
};

const PHASE_STATUS: Record<ExecPhase, string> = {
  queued: "queued",
  active: "in progress",
  done: "done",
  error: "failed",
};

export function ExecuteTimeline({ steps, cta, back }: ExecuteTimelineProps) {
  return (
    <div>
      <div className="flex flex-col">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const dim = s.phase === "queued";
          return (
            <div
              key={s.id}
              className={[
                "grid grid-cols-[32px_1fr_auto] gap-3.5 items-center py-3",
                last ? "" : "border-b-[1.5px] border-rule",
                dim ? "opacity-40" : "opacity-100",
                "transition-opacity",
              ].join(" ")}
            >
              <span
                className={[
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center text-[13px] font-mono",
                  s.phase === "done" ? "bg-good border-ink" :
                  s.phase === "active" ? "bg-accent-2 border-accent animate-pulse" :
                  s.phase === "error" ? "bg-bad border-ink" :
                  "border-rule bg-surface-2",
                ].join(" ")}
              >{PHASE_ICON[s.phase]}</span>
              <div>
                <div className="font-hand text-[17px] font-bold">{s.title}</div>
                {s.sub && <div className="text-xs text-ink-3">{s.sub}</div>}
                {s.detail && <div className="mt-1">{s.detail}</div>}
              </div>
              <span
                className={[
                  "font-mono text-[11px]",
                  s.phase === "active" ? "text-accent italic" :
                  s.phase === "done" ? "text-ink-2" :
                  s.phase === "error" ? "text-bad" :
                  "text-ink-3",
                ].join(" ")}
              >{PHASE_STATUS[s.phase]}</span>
            </div>
          );
        })}
      </div>
      {(cta || back) && (
        <div className="flex justify-end gap-2 mt-4">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              className="rounded-pill border-[1.5px] border-rule px-3.5 py-1.5 text-[13px] text-ink-2 hover:border-ink hover:text-ink"
            >{back.label ?? "back"}</button>
          )}
          {cta && (
            <button
              type="button"
              onClick={cta.onClick}
              disabled={cta.disabled}
              className="rounded-pill bg-accent border-2 border-ink text-ink px-[22px] py-2.5 font-semibold shadow-cardSm hover:bg-[#d4885a] disabled:opacity-40 disabled:shadow-none"
            >{cta.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write phase-mapper helper + test**

Create `apps/web/lib/execPhase.ts`:

```ts
import type { ExecStep, ExecPhase } from "@/components/primitives/ExecuteTimeline";

export type CompoundPhase = "connect" | "switch-chain" | "ready" | "submitting" | "confirmed" | "error";

export function mapCompoundExec(opts: {
  phase: CompoundPhase;
  needsApprove: boolean;
  txHash?: string;
  errMsg?: string;
}): ExecStep[] {
  const { phase, needsApprove, txHash, errMsg } = opts;
  function p(steps: Array<Omit<ExecStep, "phase"> & { stage: number }>): ExecStep[] {
    // Stage cursor: 0 connect/switch, 1 preflight, 2 approve (if needed), 3 sign, 4 broadcast, 5 done
    const stage =
      phase === "connect" || phase === "switch-chain" ? 0 :
      phase === "ready" ? 1 :
      phase === "submitting" ? (needsApprove ? 4 : 4) :
      phase === "confirmed" ? 5 :
      phase === "error" ? -1 : 0;
    return steps.map((s) => ({
      id: s.id, title: s.title, sub: s.sub, detail: s.detail,
      phase:
        phase === "error" && s.stage === stage + 1 ? "error" :
        s.stage < stage ? "done" :
        s.stage === stage ? "active" : "queued",
    } as ExecStep));
  }
  const steps: Array<Omit<ExecStep, "phase"> & { stage: number }> = [
    { id: "preflight", title: "pre-flight checks", sub: "wallet, network, balance", stage: 1 },
  ];
  if (needsApprove) steps.push({ id: "approve", title: "approve token", sub: "ERC-20 allowance", stage: 2 });
  steps.push({ id: "sign", title: "sign transaction", sub: "wallet prompt", stage: 3 });
  steps.push({
    id: "broadcast", title: "broadcast", sub: "confirm on-chain",
    detail: txHash ? <a className="text-accent underline font-mono text-xs"
      href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
      {txHash.slice(0,10)}…{txHash.slice(-8)}</a> : undefined,
    stage: 4,
  });
  if (phase === "error" && errMsg) {
    return p(steps).map((s, i, arr) =>
      i === arr.findIndex((x) => x.phase === "active" || x.phase === "queued")
        ? { ...s, phase: "error", detail: <span className="text-bad text-xs">{errMsg}</span> }
        : s,
    );
  }
  return p(steps);
}
```

Note: the JSX in the helper requires the file to be `.tsx`. Rename to `execPhase.tsx`.

Create `apps/web/lib/execPhase.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { mapCompoundExec } from "./execPhase";

describe("mapCompoundExec", () => {
  it("ready + needsApprove → 4 steps, preflight active", () => {
    const r = mapCompoundExec({ phase: "ready", needsApprove: true });
    expect(r.map((s) => s.id)).toEqual(["preflight", "approve", "sign", "broadcast"]);
    expect(r[0].phase).toBe("active");
    expect(r[1].phase).toBe("queued");
  });
  it("ready without approve → 3 steps", () => {
    const r = mapCompoundExec({ phase: "ready", needsApprove: false });
    expect(r.map((s) => s.id)).toEqual(["preflight", "sign", "broadcast"]);
  });
  it("confirmed → all done", () => {
    const r = mapCompoundExec({ phase: "confirmed", needsApprove: false, txHash: "0xabc" });
    expect(r.every((s) => s.phase === "done")).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, expect PASS** (`pnpm --filter web test execPhase`).

- [ ] **Step 4: Commit** — `feat(web): ExecuteTimeline primitive + Compound phase mapper`.

### Task 16: Refactor `CompoundExecute` onto ExecuteTimeline

**Files:**
- Modify: `plugins/compound-v3/widgets/CompoundExecute.tsx`

The wagmi hook setup, `Phase` derivation in the `useEffect`, and `onClick` handler all stay. Only the JSX render branch changes: timeline replaces the single button when `phase !== "confirmed"`. The confirmed branch is moved out into Task 17 (SuccessCard); for this task, keep the existing inline mint banner as a stop-gap.

- [ ] **Step 1: Replace render branch (keep all hooks/state)**

```tsx
import { ExecuteTimeline } from "../../../apps/web/components/primitives/ExecuteTimeline";
import { mapCompoundExec } from "../../../apps/web/lib/execPhase";

// ... existing hook setup, useEffect computing `phase`, `onClick` handler ...

const txHash = callsStatus.data?.receipts?.[callsStatus.data.receipts.length - 1]?.transactionHash;
const kind = props.actionKind ?? "deposit";
const confirmedMsg = kind === "withdraw"
  ? `withdrew ${props.amount} ${props.asset} from ${props.market}`
  : `deposited ${props.amount} ${props.asset} into ${props.market}`;

if (phase === "confirmed" && txHash) {
  // unchanged inline banner — replaced in Task 17
  return (
    <div className="rounded-sm bg-mint-2 border border-mint p-4 text-sm">
      <div className="font-semibold text-ink">{confirmedMsg}</div>
      <a className="text-accent underline mt-2 inline-block font-mono text-xs"
         href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
        {txHash.slice(0, 10)}…{txHash.slice(-8)}
      </a>
    </div>
  );
}

const steps = mapCompoundExec({
  phase,
  needsApprove: props.needsApprove ?? false,
  txHash,
  errMsg: errMsg ?? undefined,
});

const ctaLabel = (() => {
  switch (phase) {
    case "connect": return "Connect Wallet";
    case "switch-chain": return "Switch Network";
    case "ready":
      if (kind === "withdraw") return "Withdraw";
      return (props.needsApprove ?? false) ? "Approve & Deposit" : "Deposit";
    case "submitting": return "Submitting…";
    case "error": return "Retry";
    default: return "Execute";
  }
})();

return (
  <div>
    <ExecuteTimeline
      steps={steps}
      cta={{ label: ctaLabel, onClick, disabled: phase === "submitting" }}
    />
    {phase === "error" && errMsg && (
      <p className="mt-2 text-xs text-bad break-all">{errMsg}</p>
    )}
  </div>
);
```

Drop the old `labelFor` helper (now inlined). Keep `friendlyError` and `logSendError` unchanged.

- [ ] **Step 2: Manual verify** — full deposit Sepolia. Watch: pre-flight active → sign active → broadcast active → all done. Approve case (small allowance): 4 steps render. Reject in wallet → step in error state with red message.

- [ ] **Step 3: Commit** — `refactor(compound-v3): CompoundExecute on ExecuteTimeline`.

---

## Phase 8 — SuccessCard

### Task 17: SuccessCard primitive + Compound success integration

**Files:**
- Create: `apps/web/components/primitives/SuccessCard.tsx`
- Modify: `plugins/compound-v3/widgets/CompoundExecute.tsx`

- [ ] **Step 1: Implement primitive**

```tsx
"use client";
import type { ReactNode } from "react";

export type SuccessSummaryRow = { k: string; v: ReactNode };

export type KeeperOffer = {
  id: string;
  badge?: string;
  title: string;
  desc: string;
  featured?: boolean;
  comingSoon?: boolean;
};

export type SuccessCardProps = {
  title: string;
  sub?: string;
  summary: SuccessSummaryRow[];
  keeperOffers?: KeeperOffer[];
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};

export function SuccessCard({
  title, sub, summary, keeperOffers = [], primaryAction, secondaryAction,
}: SuccessCardProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-5 items-start">
      <div>
        <h3 className="font-hand text-[26px] font-bold leading-tight">{title}</h3>
        {sub && <p className="text-xs text-ink-3 mt-1 mb-3.5">{sub}</p>}

        {keeperOffers.length > 0 && (
          <>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3 mb-3">workflows you can deploy</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              {keeperOffers.map((o) => (
                <div key={o.id} className={[
                  "bg-surface-2 border-[1.5px] rounded-sm p-3.5",
                  o.featured ? "border-ink" : "border-rule",
                ].join(" ")}>
                  {o.badge && (
                    <span className="inline-block font-mono text-[9px] border border-rule rounded px-1.5 py-px text-ink-3 mb-1.5">
                      {o.badge}
                    </span>
                  )}
                  <div className="font-bold text-sm mb-1">{o.title}</div>
                  <p className="text-xs text-ink-3 mb-2.5 leading-snug">{o.desc}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={o.comingSoon}
                      title={o.comingSoon ? "coming soon" : undefined}
                      className="bg-accent border-[1.5px] border-ink rounded-pill px-3 py-1 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >deploy ✦</button>
                    <button
                      type="button"
                      disabled={o.comingSoon}
                      title={o.comingSoon ? "coming soon" : undefined}
                      className="bg-transparent border-[1.5px] border-rule rounded-pill px-3 py-1 text-xs text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >customize</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {(primaryAction || secondaryAction) && (
          <div className="flex gap-2 flex-wrap">
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="rounded-pill bg-accent border-2 border-ink text-ink px-[22px] py-2.5 text-[15px] font-semibold shadow-cardSm hover:bg-[#d4885a]"
              >{primaryAction.label}</button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="rounded-pill border-[1.5px] border-rule px-3.5 py-1.5 text-[13px] text-ink-2 hover:border-ink hover:text-ink"
              >{secondaryAction.label}</button>
            )}
          </div>
        )}
      </div>

      <aside className="bg-surface-2 border-[1.5px] border-dashed border-rule rounded-md p-4">
        <div className="font-hand text-[22px] font-bold mb-0.5">summary</div>
        <p className="text-xs text-ink-3 mb-3.5">your wish, fulfilled</p>
        {summary.map((r, i) => (
          <div key={`${r.k}-${i}`} className={[
            "flex justify-between py-1.5 text-[13px]",
            i === summary.length - 1 ? "" : "border-b border-rule",
          ].join(" ")}>
            <span className="font-mono text-[10px] uppercase text-ink-3">{r.k}</span>
            <span className="font-mono text-xs font-semibold text-right">{r.v}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `CompoundExecute`**

Replace the inline mint banner branch:

```tsx
import { SuccessCard } from "../../../apps/web/components/primitives/SuccessCard";
import { useWorkspace } from "../../../apps/web/store/workspace"; // verify path

if (phase === "confirmed" && txHash) {
  const ws = useWorkspace.getState();
  const isWithdraw = kind === "withdraw";
  return (
    <SuccessCard
      title={isWithdraw ? "withdraw complete ✦" : "supply complete ✦"}
      sub={isWithdraw
        ? `withdrew ${props.amount} ${props.asset} from ${props.market}`
        : `earning yield on ${props.amount} ${props.asset} via ${props.market}`}
      summary={[
        { k: isWithdraw ? "withdrew" : "supplied", v: `${props.amount} ${props.asset}` },
        { k: "market", v: props.market },
        { k: "tx", v: <a className="underline" target="_blank" rel="noreferrer"
            href={`https://sepolia.etherscan.io/tx/${txHash}`}>
            {txHash.slice(0,10)}…{txHash.slice(-8)}
          </a> },
      ]}
      keeperOffers={isWithdraw ? [] : [
        { id: "auto-compound", badge: "KEEPERHUB", featured: true,
          title: "Auto-compound yield",
          desc: "claim and re-supply rewards weekly. uses session permissions.",
          comingSoon: true },
      ]}
      primaryAction={{
        label: "make another wish",
        onClick: () => ws.reset(),
      }}
      secondaryAction={{
        label: "view portfolio",
        onClick: () => alert("portfolio coming soon"),
      }}
    />
  );
}
```

Note: calling `useWorkspace.getState()` directly inside render is fine for read access but the reset must close over a stable handle. Prefer `const reset = useWorkspace((s) => s.reset);` at the top of the component (next to existing hooks). If `useWorkspace` already imported, just add the selector.

- [ ] **Step 3: Manual verify** — deposit Sepolia all the way through. Confirm: success card with summary panel + one keeper-offer card with disabled buttons. "make another wish" returns to Step 01 idle.

- [ ] **Step 4: Withdraw — verify no keeper offer renders** (empty array → grid hidden).

- [ ] **Step 5: Commit** — `feat(web): SuccessCard primitive + Compound confirmed integration`.

---

## Phase 9 — Cleanup + verification

### Task 18: Remove visual sandbox + final pass

**Files:**
- Delete: `apps/web/app/_visual/page.tsx`

- [ ] **Step 1: Remove sandbox** — `rm apps/web/app/_visual/page.tsx`.

- [ ] **Step 2: Side-by-side prototype check** — open `prototype/wishd-intent.html` (clear `localStorage.w_intent` first) in one tab and `localhost:3000` in another. Walk the deposit flow. For each step, screenshot both. Compare:
  - Header: dashed bottom rule, wallet pill style.
  - Step 01: dashed sentence box, pill colors and shadow on dropdowns.
  - Step 02: widget card border + shadow + section dividers.
  - Step 03: timeline icons, active step pulse, done step mint background.
  - Step 04: success card layout, keeper-offer card border emphasis on featured.

- [ ] **Step 3: Disconnect mid-flow** — disconnect wallet during widget render → composer's connect-badge pill flips to disconnected styling (existing behavior preserved).

- [ ] **Step 4: Refresh during `submitting`** — workspace store rehydrates; locked step cards stay locked, timeline picks up state.

- [ ] **Step 5: Run all tests** — `pnpm typecheck && pnpm test`. All green.

- [ ] **Step 6: Commit** — `chore(web): remove visual sandbox after prototype parity verified`.

---

## Open risks (carry through implementation)

1. **Caveat readability < 14px.** Pill body uses Caveat 16px, which is borderline. If the action-pill chevron + label looks messy on Windows Chrome, fall back to `font-sans font-semibold` for that pill only — keep the dashed amount pill in Caveat (22px is large enough). Decision belongs to whoever does Task 7 visual review.

2. **Two-column responsive collapse.** Compound v0 doesn't use the two-column layout, so this is dormant. When swap arrives it will need the `grid-template-columns: 1fr 280px` collapse at 680px — keep `AICheckPanel` styling free of horizontal width assumptions.

3. **Dropdown stacking context.** `StepCard` (Task 4) MUST NOT have `overflow-hidden`. The current implementation is fine because it omits overflow. If a future task adds rounded corner clipping, audit for this.

4. **Tailwind 3 vs 4 syntax.** Repo is on Tailwind 3.4 (`apps/web/package.json`). Arbitrary-value classes (`shadow-[4px_4px_0_var(--ink)]`) work but the plan prefers semantic `shadow-card` defined in `tailwind.config.ts` Task 1. Don't introduce v4 `@theme` syntax.

5. **Composer dropdown outside-click + input focus.** A single document `mousedown` listener (mounted in `WishComposer`, see Task 10) closes the open pill. Because the listener fires on `mousedown` (not `click`), an active text input that loses focus to a button click won't see its `change` event swallowed. The amount-pill input stays inside `rootRef`, so typing in it doesn't close anything. Verified manually in Task 7 sandbox first.

6. **Plugin → web import path coupling.** Compound widgets reach into `apps/web/components/primitives/` via relative paths (Tasks 12, 13, 16, 17). This creates a soft coupling: plugins must run in a tree where `apps/web` is at a fixed relative path. Acceptable for the hackathon monorepo. Long-term fix is to lift primitives into a shared `packages/ui` package, not in this plan.

7. **Example pill submit race.** Calling `pickIntent()` then `setValues()` then `submitStructured()` in the same handler reads stale state. Task 10 Step 3 fixes this by introducing `submitStructuredWith(schema, values)` taking explicit args.

---

### Critical Files for Implementation

- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/apps/web/components/wish/WishComposer.tsx`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/apps/web/components/primitives/StepCard.tsx`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/apps/web/tailwind.config.ts`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/plugins/compound-v3/widgets/CompoundExecute.tsx`
- `/Users/kirillmadorin/Projects/hackathons/open_agents_ethglobal/wishd/packages/plugin-sdk/src/index.ts`

---

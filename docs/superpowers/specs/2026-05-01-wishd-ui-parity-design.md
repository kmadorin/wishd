# wishd — UI Parity with Prototype Design

**Date:** 2026-05-01
**Status:** Draft (pending user review)
**Scope:** Bring the live `apps/web` UI in line with `prototype/wishd-intent.html` — visual language, primitives, and step-by-step layout — without regressing the working Compound deposit/withdraw flow. Establish reusable primitives that the upcoming swap plugin (separate spec) plugs into without further design work.

## Goal

The shipped app currently uses plain Tailwind defaults: a soft `<StepCard>`, a `<select>`-based composer, and a single-column summary widget with `Kv` cells. The prototype encodes a stronger, hand-drawn aesthetic (Caveat headings, hard-shadow cards, dashed pill borders) plus a richer step-by-step UX (sentence-box composer, two-column widget + AI-check panel, execute timeline, success card with keeper offers).

This spec brings the production UI to that bar in incremental, testable slices. Each slice keeps the existing Compound flow working at every commit.

## Non-goals (this spec)

- No new plugins — swap is its own spec, this is pure UI/primitives.
- No agent-prompt changes; narration still flows through `ChatBubble` unchanged.
- No bidirectional widget→agent events.
- No keeper deploy flow — Step 04 success card renders static keeper teasers as visual stubs only.
- No persistent panels / Mode B widgets.
- No mobile-specific layout work beyond the prototype's responsive `@media (max-width: 680px)` collapse.

## Architecture overview

Five new/overhauled primitives, all in `apps/web/components/primitives/`. Plugins import primitives only — never write raw HTML/CSS for step cards, AI panels, or timelines.

```
apps/web/components/primitives/
├── StepCard.tsx              # overhauled — hard-shadow, badge block, Caveat title, locked/edit affordance
├── SentenceBox.tsx           # NEW — dashed-bordered "I want to … " container w/ pill children
├── ActionPill.tsx            # NEW — Caveat-styled pill w/ optional dropdown (action / asset / chain / protocol)
├── WidgetCard.tsx            # NEW — 2px ink border + 3px shadow card; sections (head/pay/receive/stats/cta)
├── AICheckPanel.tsx          # NEW — right-column live panel (balance changes, allowance, safety)
├── ExecuteTimeline.tsx       # NEW — vertical numbered steps w/ phase-driven status
└── SuccessCard.tsx           # NEW — title + summary + keeper-offers grid
```

Plus `globals.css` is extended with the prototype's full stylesheet variables, body radial gradients, and font wiring (already imported but currently unused for body decoration).

## Visual language — pinned values

These are extracted from `prototype/wishd-intent.html` and become the source of truth. Tailwind config exposes them as utilities; raw CSS uses the variables directly.

```
colors:
  --bg          #FBF4E8   --bg-2    #F4EAD5
  --surface     #FFFCF3   --surface-2 #FFFFFF
  --ink         #1F1B16   --ink-2   #5A4F40   --ink-3   #9A8E78
  --accent      #E89A6B   --accent-2 #FFD9C2
  --mint        #B8E6C9   --mint-2  #DCF1E2
  --warn        #F5DC8A   --warn-2  #FAEEBC
  --good        #9FD9B0   --bad     #E89999
  --rule        #E5DAC0   --shadow  rgba(31,27,22,0.08)

radii:           --r-sm 6, --r 12, --r-lg 20, --r-pill 999
fonts:
  body          'Plus Jakarta Sans', sans-serif    (15px base)
  display       'Caveat', cursive                  (titles, pill labels)
  mono          'JetBrains Mono', monospace        (badges, numerics, addresses)

step card:       border 2px var(--ink); radius 22px; box-shadow 4px 4px 0 var(--ink); padding 20px 24px 22px
widget card:     border 2px var(--ink); radius 18px; box-shadow 3px 3px 0 var(--ink)
pill (asset):    border 2px var(--ink); radius var(--r-pill); padding 3px 14px; Caveat 16px
pill (amount):   border 2px dashed var(--ink); radius var(--r-pill); Caveat 22px
body:            radial gradient triplet (12% 18% accent / 88% 78% mint / 50% 110% warn) over --bg
```

Tailwind config exposes these as semantic classes (`bg-surface`, `text-ink`, `shadow-card`, `font-hand`, etc.) — already partly present, completed in this spec.

## Primitive specs

### `StepCard` (overhauled)

Replaces current soft-shadow card with the prototype's hard-shadow, dashed-rule, badge-block style.

```ts
export type StepPhase = "in-progress" | "locked" | "complete";

export type StepCardProps = {
  step: string;                 // "STEP 02"
  title: string;                // Caveat 32px
  status?: string;              // "in progress" italic right-aligned, OR
  onEdit?: () => void;          // when present → render "edit ✎" pill instead of status
  sub?: string;                 // 13.5px ink-2
  phase?: StepPhase;            // default "in-progress"
  children?: ReactNode;
};
```

DOM mirrors prototype `.step-card` exactly (badge / title / status row → sub → body). When `phase === "locked"` and `onEdit` provided, status slot renders the `edit ✎` pill; clicking it calls `onEdit`. Locked phase dims body via `opacity-92` + `pointer-events-none` on inner wrapper. Stack of step cards uses `gap: 24px`.

### `SentenceBox` + `ActionPill`

`SentenceBox` is the dashed-bordered flex-wrap container that holds the "I want to …" sentence. It owns no state — it's a presentation wrapper.

`ActionPill` renders a labeled pill with optional dropdown. Used for: action picker (orange), asset picker (orange "from" / mint "to"), chain picker (mint), protocol picker (bg-2). Variants:

```ts
type ActionPillProps = {
  variant: "action" | "from" | "to" | "chain" | "protocol" | "amount";
  value?: string;                            // current label
  placeholder?: string;                       // when value empty (e.g. "pick action")
  options?: Array<{ id: string; label: string; sub?: string; icon?: ReactNode }>;
  onChange?: (id: string) => void;
  disabled?: boolean;
};
```

When `options` is provided, clicking the pill opens a dropdown panel (`.action-dropdown` class set + flex-flow per prototype). When `variant === "amount"`, it renders an inline `<input>` instead of a button. Dropdown closes on outside click (single document listener mounted by `WishComposer` parent, not per-pill, to avoid leaks).

For tokens, `ActionPill variant="from|to"` accepts an `iconClass` per asset (`asset-dot eth | usdc | dai | ...`) keyed to a small token-icon registry (`apps/web/lib/tokenIcons.ts` — minimal, expandable when swap plugin lands).

### `WidgetCard`

Container for the materialized preview. Composable subsections:

```tsx
<WidgetCard>
  <WidgetCard.Head name="swap" badge="NATIVE · 1 TX" />
  <WidgetCard.PaySection>...</WidgetCard.PaySection>
  <WidgetCard.SwapDir onFlip={…} />
  <WidgetCard.ReceiveSection>...</WidgetCard.ReceiveSection>
  <WidgetCard.Stats items={[{k:"RATE", v:"1 ETH = 3,120 USDC"}, …]} />
  <WidgetCard.Cta>execute →</WidgetCard.Cta>
</WidgetCard>
```

Sections are optional; Compound's deposit/withdraw widget uses `Head + AmountSection + Stats + Cta` (no pay/receive split). The component is presentational only — interactivity (button onClick, input onChange) is wired by the consumer plugin.

### `AICheckPanel`

The right column of the Step 02 two-column layout. Displayed live during quote refreshes for action widgets that have meaningful pre-flight surface (swap, lend, borrow, bridge). For Compound deposit/withdraw v0 it can be omitted (single-column) or stubbed with the safety items only.

```tsx
<AICheckPanel
  status="live" | "stale"             // pulse animation when "live"
  balanceChanges={[                    // signed entries
    { sign: "-", token: "ETH", amount: "-0.1" },
    { sign: "-", token: "gas", amount: "~-$1.53" },
    { sign: "+", token: "USDC", amount: "+312.00" },
  ]}
  safety={[
    { ok: true,  text: "native token — no allowance required" },
    { ok: true,  text: "contract verified · Uniswap V3 Router" },
    { ok: true,  text: "simulates cleanly · output ≈ 312.00 USDC" },
  ]}
  allowance?: ReactNode                 // optional CTA block (Permit2 / Approve buttons)
/>
```

Layout: dashed rule between sections, JetBrains-Mono section labels, small dot icons (✓ / !). Pulse animation = `@keyframes blink` 1.2s on the "live" dot.

### `ExecuteTimeline`

Replaces the current single button-flips-through-phases pattern in `CompoundExecute.tsx`. Renders a vertical numbered list with prototype's `.exec-step` style.

```ts
export type ExecPhase = "queued" | "active" | "done" | "error";

export type ExecStep = {
  id: string;
  title: string;
  sub?: string;
  phase: ExecPhase;
  detail?: ReactNode;       // rendered below sub, e.g. tx hash link when "done"
};

export type ExecuteTimelineProps = {
  steps: ExecStep[];
  cta?: { label: string; onClick: () => void; disabled?: boolean };
  back?: { onClick: () => void };
};
```

Active step shows a spinner glyph; done shows ✓ in a mint pill; queued is dimmed; error shows × in red. Compound execute composes its phases into 4–5 entries (`pre-flight → approve? → sign → broadcasting → confirmed`). Swap will reuse the same primitive.

### `SuccessCard`

Final terminal step shown after `confirmed`. Replaces the inline mint banner inside `CompoundExecute`. Three regions:

```tsx
<SuccessCard
  title="supply complete ✦"
  sub="earning 4.2% APY on 100 USDC · want to compound?"
  summary={[                            // right column key-values
    { k: "supplied", v: "100 USDC" },
    { k: "received", v: "4.4643 cUSDC" },
    { k: "tx", v: <a href="…">0x12…ab34</a> },
  ]}
  keeperOffers?: KeeperOffer[]          // optional grid of "deploy ✦ / customize"
  primaryAction={{ label: "make another wish", onClick: … }}
  secondaryAction={{ label: "view portfolio", onClick: … }}
/>
```

Keeper-offers grid renders 2x2 cards with title / desc / two buttons. v0 ships visual stubs only — buttons disabled with "coming soon" tooltip. Compound passes one offer ("Auto-compound yield, featured"); swap will pass four.

## Composer rebuild — `WishComposer`

Replaces current `<select>`-driven `StructuredComposer`. New structure mirrors prototype Step 01:

```
┌─ <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
│   ┌─ <SentenceBox>
│   │     <span>I want to</span>
│   │     <ActionPill variant="action" value=… options={ACTIONS}/>
│   │     <ActionPill variant="amount" value=…/>
│   │     <ActionPill variant="from" value=… options={ASSETS}/>
│   │     <span>to</span> (or "into", "from", etc — connector word from intent.connectors)
│   │     <ActionPill variant="to" .../>
│   │     <span>on</span>
│   │     <ActionPill variant="chain" .../>
│   ├─ <BalanceRow asset=… balance=… onPercent={pct => setAmount(…)} />     # only for swap/bridge
│   ├─ <ExamplesRow>      # six pills, one per intent example, hidden after pick
│   ├─ <ChatBubble>        # AI echo — already exists; mounted *inside* the card now, not below
│   └─ <SubmitButton>looks good →</SubmitButton>
```

Schema-driven. Each `IntentSchema` is rendered by walking its fields and inserting connectors from a per-intent `connectors` map (e.g. `{amount → "", asset → "to", assetOut → "on", chain → ""}` for swap). Free-text mode is preserved as a "type instead" toggle below the submit button.

### Schema additions

`IntentSchema` (in `packages/plugin-sdk/src/index.ts`) gains:

```ts
export type IntentSchema = {
  intent: string;
  verb: string;
  description: string;
  fields: IntentField[];
  widget: string;
  slot?: WidgetSlot;
  /** Words inserted between fields, keyed by the *next* field's key. Renders before that field. */
  connectors?: Record<string, string>;
  /** Optional balance hint — when set, renders the BalanceRow with quick-percent chips for this field. */
  balanceFor?: string;
};
```

Compound's existing intents add `connectors: { asset: "", chain: "on" }`. Swap (separate spec) adds `connectors: { assetIn: "", assetOut: "to", chain: "on" }`.

### Examples row

`WishComposer` reads `examples` from a static client-side list (later: from each plugin's manifest). v0: only Compound deposit/withdraw examples appear, both already wired. Swap adds three more when its plugin lands. Pills are pre-canned wish strings that, on click, set the action + fields and submit.

## Globals.css updates

Append to `apps/web/app/globals.css`:

1. The full body radial-gradient triplet over `var(--bg)`.
2. `.page` confirmation already present; verify `position: relative; z-index: 1`.
3. Header rules: `border-bottom: 1.5px dashed var(--rule)` + 28px margin-bottom.
4. `@keyframes fadeUp` (existing in prototype) + `@keyframes blink` for live-dot pulse.
5. Asset-dot color classes (`.asset-dot.eth`, `.asset-dot.usdc`, etc.) — moved to a `tokens.css` module imported by `lib/tokenIcons.tsx`.

`tailwind.config.ts` extends:
- `boxShadow.card`: `4px 4px 0 var(--ink)`
- `boxShadow.cardSm`: `3px 3px 0 var(--ink)`
- `borderRadius.lg`: `22px`, `xl`: `18px`
- `fontFamily.hand`: `["Caveat", "cursive"]`
- `fontFamily.mono`: `["JetBrains Mono", "monospace"]`

## Migration sequence (ordered, each commit deployable)

1. **Token + style scaffolding.** Extend `globals.css` (gradients, keyframes), `tailwind.config.ts` (shadows, radii, fonts). No component changes. Visual diff: background gradient appears.
2. **`StepCard` overhaul.** Replace internals; add `onEdit` affordance. Header section gains dashed bottom rule. Compound flow renders unchanged but now in hard-shadow cards with Caveat titles.
3. **`SentenceBox` + `ActionPill`.** Build primitives in isolation with story file (`*.stories.tsx`) for visual review. No wire-up yet.
4. **Schema-driven `WishComposer` rewrite.** Swap `<select>`s for `ActionPill`s. Wire connectors map in Compound intents. Free-text mode preserved.
5. **`WidgetCard` + Compound widget refactor.** `CompoundSummary` and `CompoundWithdrawSummary` rebuilt on `WidgetCard` primitive. Stats grid replaces current `Kv` cells. CTA uses prototype pill style.
6. **`AICheckPanel` (single-column for Compound).** Compound widgets gain a slim safety panel below the CTA showing balance/allowance/sim items (no two-column yet — kept single-column since Compound v0 has no live-quote surface). The panel shape exists, ready for swap to consume in two-column form.
7. **`ExecuteTimeline` + `CompoundExecute` refactor.** Replace single-button state machine with timeline. State transitions feed `ExecStep[]`. Existing wagmi hooks unchanged — only render layer rewritten.
8. **`SuccessCard` integration.** Confirmed phase swaps the inline mint banner for `<SuccessCard>` with one keeper-offer stub ("Auto-compound yield"). Buttons "make another wish" / "view portfolio" — wish resets workspace; portfolio is a no-op toast in v0.

Each step ships behind nothing — no feature flags. The Compound flow is verified manually after each step (existing skeleton verification list still passes).

## Verification

After all 8 steps:

- Side-by-side load `prototype/wishd-intent.html` (note: clear `localStorage.w_intent` first) and `localhost:3000`. Visually compare:
  - Body gradient matches.
  - Header line/border/wallet-pill placement matches.
  - Step card border, shadow, badge, Caveat title font/size matches.
  - Sentence-box dashed border, pill colors (orange action, mint chain) match.
  - Examples row layout matches.
- Run the existing Compound deposit happy path end-to-end on Sepolia. Each step card transitions to `locked + edit ✎`. Execute timeline shows pre-flight → approve? → sign → broadcasting → confirmed. Success card renders.
- Run withdraw path end-to-end.
- Disconnect mid-flow → composer's connect-badge pill flips to disconnected styling (existing behavior preserved).
- Refresh during `submitting` → workspace store rehydrates; locked cards stay locked.

Visual regression: snapshot the two key states (Step 01 idle / Step 04 success) with Playwright and store under `apps/web/test/visual/` for future comparison. (No CI gate yet — manual review.)

## Open risks

1. **Caveat font readability.** The prototype leans heavily on Caveat for titles and pill labels. At small sizes (pill body 16px) it can read messy on Windows. Acceptable for hackathon; downscale to Plus Jakarta semibold for any pill < 14px.
2. **Two-column responsive collapse.** Prototype uses `grid-template-columns: 1fr 280px` collapsing to 1fr at 680px. Verify the AI-check panel below the widget reads OK on narrow viewports without crowding the CTA.
3. **`ActionPill` dropdown stacking context.** Each pill opens a dropdown above the rest of the page. The current `<StepCard>` uses `overflow-hidden` for the rounded corner — drop that, otherwise dropdowns clip. Verify shadow still renders cleanly without overflow clipping.
4. **Tailwind version.** Some prototype shadows use exact pixel offsets (`4px 4px 0 #1F1B16`) — Tailwind's arbitrary `shadow-[4px_4px_0_var(--ink)]` works but is verbose. Adding semantic class `shadow-card` keeps JSX clean.
5. **Composer dropdown outside-click.** Prototype attaches one `document.click` listener; in React this is a single mounted-at-composer effect. Make sure the listener is removed on unmount and doesn't fire while an input has focus (which would close the picker mid-type).
6. **Compound v0 doesn't need pay/receive.** `WidgetCard.PaySection` / `ReceiveSection` are swap-shaped. Make Compound use only `Head + AmountSection + Stats + Cta` so we don't end up with awkward empty sections.

## Appendix — file change map

```
NEW   apps/web/components/primitives/SentenceBox.tsx
NEW   apps/web/components/primitives/ActionPill.tsx
NEW   apps/web/components/primitives/WidgetCard.tsx
NEW   apps/web/components/primitives/AICheckPanel.tsx
NEW   apps/web/components/primitives/ExecuteTimeline.tsx
NEW   apps/web/components/primitives/SuccessCard.tsx
NEW   apps/web/lib/tokenIcons.tsx
NEW   apps/web/lib/tokenIcons.css
EDIT  apps/web/components/primitives/StepCard.tsx                    # overhaul
EDIT  apps/web/components/wish/WishComposer.tsx                      # sentence-box driven
EDIT  apps/web/components/wish/StructuredComposer.tsx                # delete; merged into WishComposer
EDIT  apps/web/app/globals.css                                       # gradients + keyframes + asset-dot
EDIT  apps/web/tailwind.config.ts                                    # shadow-card, font.hand, radii
EDIT  packages/plugin-sdk/src/index.ts                               # IntentSchema.connectors / balanceFor
EDIT  plugins/compound-v3/intents.ts                                 # connectors map
EDIT  plugins/compound-v3/widgets/CompoundSummary.tsx                # WidgetCard primitive
EDIT  plugins/compound-v3/widgets/CompoundWithdrawSummary.tsx        # WidgetCard primitive
EDIT  plugins/compound-v3/widgets/CompoundExecute.tsx                # ExecuteTimeline + SuccessCard
```

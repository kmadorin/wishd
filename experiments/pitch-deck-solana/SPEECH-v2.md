# wishd pitch — voiceover v2 (10-tabs cold-open)

Total budget: 180s. Conversational pace. Pause 0.5s between slides.

Reframe vs v1: open with concrete power-user pain (10 tabs by name), not abstract "fragmented UX". Position wishd as **DeFi power-user agent OS**, not "swap app with chat". MVP = proof of architecture; vision = collapse 10 tabs into one agent that knows your portfolio.

---

## Slide 1 — Title (5s)

> "wishd — DeFi by wishing it. Kirill Madorin. Open Agents 2026."

## Slide 2 — Problem (30s) — REWRITE

> "Open my browser right now. Ten tabs. Vaults dot xyz to scan yields. DeFi Llama for TVL. A Google Colab to model Pendle PT. DefiSaver to set anti-liquidation. Loris dot tools for funding rates. A Telegram channel where someone just posted a fourteen percent PT-reUSDe play. This is what active DeFi looks like — ten tabs, five mental models, one human keeping it all in their head. Agents that could fix this are CLI tools for engineers, or generic chatbots that throw away DeFi-shaped UI. And handing an agent your hot wallet is a honeypot — one prompt injection, funds gone."

(Slide deck note: replace slide-02-problem.html three-pain layout with a tab strip / logo wall of the named tools, then the three failure modes as a smaller row underneath. Cold-open hits visually.)

## Slide 3 — Solution (25s) — REWRITE

> "wishd collapses those ten tabs into one wish. You speak intent — swap, lend, auto-compound. Agent picks the right plugin, prepares the bundle, you sign in your own Porto wallet. For recurring jobs, KeeperHub runs the workflow off-app — deterministic, no LLM at runtime. Funds never leave you. Adding a new wish is dropping a folder. Let me show you."

## Live demo (60s)

Per `docs/superpowers/specs/2026-05-02-demo-script-design.md` § 2 beats 1–5. Run on `wishd.sumula.online`; second tab on `app.keeperhub.com` for beat 4 proof shot.

Demo narration tweak: while clicking, say once — "this is wish number one of ten." Plants the vision.

## Slide 4 — How it works (30s) — TIGHTEN

> "Server-side agent loop. Browser renders whatever the agent emits over SSE. Plugin host means a new protocol is one folder. Porto session-keys scope what KeeperHub can spend. Agent's job is dispatch — pick the right plugin, shape arguments. Plugin's job is the DeFi-shaped widget. That separation is why this scales — every protocol the agent learns is a permanent capability, not a prompt."

(Drop the "three things you don't get from Claude Code" comparison from v1 — too inside-baseball for 3 min. Save for Q&A.)

## Slide 5 — Next (15s) — REFRAME

> "Today the agent picks from a fixed plugin set. Tomorrow it writes them — mention a protocol it doesn't know, it generates the adapter and widget. Learns keepers from your transaction history. Ranks yields across your positions. Ten tabs collapse into one agent that knows your portfolio."

## Slide 6 — Team (5s)

> "Team — me, plus Claude Code with the superpowers plugin."

## Slide 7 — Thanks (10s)

> "Thanks. Two repos, two live instances, Sepolia faucet linked. Try it."

---

## Time check

5 + 30 + 25 + 60 + 30 + 15 + 5 + 10 = **180s** ✓

## Q&A prep — anticipated judge questions

**"Isn't this just an aggregator like vaults.xyz?"**
> Aggregators are static UIs over a fixed protocol set. wishd is an agent runtime — the dispatcher learns new protocols as plugins, the user's wallet stays sovereign, and recurring strategies execute deterministically off the LLM. Closest analogy isn't vaults, it's Claude Code with MCPs — but server-hosted, with DeFi-shaped widgets and Porto session-keys instead of CLI + hot wallet.

**"You only do swap and lend today. Where's the yield-comparison / anti-liquidation / funding monitor?"**
> Correct — today's plugins are swap (Uniswap), lend (Compound v3), bridge (Li.Fi), and one keeper (auto-compound). Each took roughly a folder. The bet is: the architecture is the moat, not the plugin count. Yield-rank and anti-liquidation are the next two folders.

**"Why server-side agent and not in-browser?"**
> Server runs the loop so the user gets the same agent across devices, MCP servers stay private, and KeeperHub workflows survive your laptop sleeping. Browser stays the signing surface only.

**"What stops a malicious plugin?"**
> Two layers. Plugins ship as code, reviewable in PR. Runtime layer: every transaction is rendered as a widget the user signs in their Porto wallet — agent can't move funds, only propose. Recurring keepers run under scoped Porto session-keys with token + spend cap + expiry.

**"How is this different from giving Claude Code an Ethereum MCP?"**
> Three things. Server-hosted not laptop-bound. DeFi-shaped widgets not chat dumps. Porto session-keys not hot-wallet exposure. The fourth is the keeper layer — deterministic execution off the LLM, which Claude Code can't give you.

## Delivery notes

- Slide 2: name the tools out loud, slowly. "Vaults dot xyz. DeFi Llama. Pendle calc. DefiSaver. Loris." Five concrete nouns = judges recognize the user.
- Don't say "users" anywhere. Say "active DeFi user" or "yield farmer" or "someone running 5x sUSDs lupping". Specificity beats category.
- Demo: narrate "wish one of ten" exactly once. Don't repeat — kills the vision tease.
- Slide 5: read the last sentence slowly. "Ten tabs collapse into one agent that knows your portfolio." That's the line you want judges to remember 24 hours later.

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

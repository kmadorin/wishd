# wishd — ETHGlobal Open Agents 2026 submission copy

**Date:** 2026-05-03
**Scope:** Form copy for the ETHGlobal submission page. Three fields: short description, description, "how you built it".

---

## Short description (≤100 chars)

r

(89 chars)

---

## Description (≥280 chars)

wishd is a browser agent for DeFi. Type "swap 0.001 ETH for USDC" or "lend 50 USDC on Compound" — free text or composer pills — and it picks the right widget, fetches the quote, prepares the bundle. You sign in your own Porto wallet. No CLI, no skills to write, no agent wallet holding your money.

When something should run on a schedule — auto-compound, DCA — the agent recommends a KeeperHub workflow and scopes a Porto session-key for it: which token, how much, until when. You grant it once. The workflow runs deterministically in KeeperHub, not in an LLM, so a bad prompt can't drain you.

The agent's tool calls stream into a sidebar as it works, so you actually see it think. Live on Sepolia: wishd.sumula.online.

---

## How you built it (≥280 chars)

The core is a Next.js 15 app with a Claude Agent SDK loop running on the server. Instead of the agent returning text that the frontend then has to interpret, it emits a typed event stream over SSE — `tool.call`, `chat.delta`, `widget.render`, `widget.patch` — and the browser is more or less a renderer for whatever the agent decides to show. There are no hardcoded routes for "swap" or "lend"; the page you see is whatever widget the agent rendered last. To make that work, every protocol lives in its own folder under `plugins/` exporting an intent schema, a `prepare()` function, and a widget component. The agent loads them at boot, and adding a new one is dropping in a folder. Keepers follow the same shape.

For swaps we use the Uniswap Trading API on mainnet and the L2s it covers. The Trading API doesn't reach Sepolia, though, and most of our demo runs there, so on testnet we fall back to the V3 contracts directly (QuoterV2 for pricing, SwapRouter02 for execution) and prepend the ERC-20 approval as an extra call inside the Porto bundle — so even with the workaround the user still only signs once. The friction we ran into building against the Trading API — no Permit2-bundled swap response, no batch-quote endpoint, no testnet coverage, no agent-discoverable intent format — is written up honestly in `FEEDBACK.md` at the repo root.

The wallet layer is Porto, which gave us account abstraction and session-keys for free. The interesting part there is automations: when the agent recommends a recurring workflow (auto-compound, DCA), it calls into KeeperHub over MCP, and KeeperHub asks the user to grant a scoped Porto session-key — token, spend cap, expiry — through a delegation modal. We actually forked KeeperHub for this and added a Porto plugin so workflows could request and consume those delegations cleanly; that fork is live at `kh.sumula.online`. The result is that the agent never holds funds and never signs at runtime: it prepares, the user signs once, KeeperHub executes deterministically from there.

The piece I'm most fond of is `widget.patch`. Because widgets are mounted from SSE events, the agent can patch a widget that's already on screen — a quote refreshes without unmount, the swap card visibly "fills in" as tool calls return, the activity sidebar tails the same stream and shows the agent's tool log live. That last part matters more than it sounds: the whole point of an Open Agents submission is that you can see the agent working, and here the UI literally is the agent's log.

---

## Per-prize answers

Repo: https://github.com/kmadorin/wishd · pinned commit `6c5042a`.

### KeeperHub — $5,000

**How are you using this Protocol / API?**

The agent calls KeeperHub over MCP from the server-side Claude Agent SDK loop. After a user confirms an onchain action, a custom `recommend_keeper` tool inspects the just-completed intent and asks KeeperHub which workflow templates apply; if there's a good match, the agent renders a keeper offer card. When the user accepts, the agent uses the KeeperHub MCP tools to deploy the template and wraps it with a `propose_delegation` step that opens a Porto session-key modal — token, spend cap, expiry — so KeeperHub can execute the workflow on a schedule without ever holding the user's funds. We also forked KeeperHub to add a first-class Porto plugin so workflows can request and consume those session-key delegations natively; the fork is live at https://kh.sumula.online.

**Link to the line of code where the tech is used:**

- KeeperHub MCP server registered into the agent loop: https://github.com/kmadorin/wishd/blob/6c5042a/apps/web/server/runAgent.ts#L59-L65
- `recommend_keeper` and `propose_delegation` agent tools that wrap KH: https://github.com/kmadorin/wishd/blob/6c5042a/apps/web/server/keepers/agentTools.ts
- KH OAuth + token store: https://github.com/kmadorin/wishd/blob/6c5042a/apps/web/server/keepers/khOAuth.ts
- KH RPC adapters used by the recommend tool: https://github.com/kmadorin/wishd/blob/6c5042a/apps/web/server/keepers/khRpc.ts
- Forked KeeperHub with Porto plugin: https://github.com/kmadorin/keeperhub

**How easy is it to use the API / Protocol?** 8/10

**Additional feedback for the Sponsor:**

The MCP surface was the cleanest part — `list_workflows` / `deploy_template` / `execute_workflow` were enough to drive the entire agent loop without reading much else. OAuth discovery via the Claude Agent SDK was painless. Two friction points worth flagging: (1) the default custodial-wallet model didn't fit our threat story — we want the user's own wallet to back the workflow, which is why we forked to add a Porto plugin; a first-party AA / session-key wallet adapter in core would let teams skip that fork. (2) Template DAGs are powerful but discovery is hard — the agent had to list workflows and pattern-match on names; a structured "applicable templates for intent X" endpoint would let recommendation work without hand-rolled heuristics. Overall, integrating took maybe an afternoon once OAuth was in place.

### Uniswap Foundation — $5,000

**How are you using this Protocol / API?**

Every swap in the app is routed through Uniswap. On mainnet and supported L2s the agent calls the Uniswap Trading API (`/quote`, `/check_approval`, `/swap`) to fetch a route and produce calldata that the user signs through a Porto bundle. Sepolia isn't covered by the Trading API and most of our demo runs there, so on testnet the same plugin falls back to the V3 contracts directly — `QuoterV2` for pricing and `SwapRouter02` for execution — and prepends the ERC-20 approval into the Porto bundle so the user still signs once. The whole flow is wrapped in a typed swap widget that the agent renders dynamically; the keeper we deploy at the end of the demo (`auto-compound-comp`) reuses the same swap path on a recurring basis.

**Link to the line of code where the tech is used:**

- Trading API client (BASE URL + `/quote` `/check_approval` `/swap`): https://github.com/kmadorin/wishd/blob/6c5042a/plugins/uniswap/strategies/tradingApi.ts#L8
- Direct V3 (QuoterV2 / SwapRouter02) Sepolia fallback: https://github.com/kmadorin/wishd/blob/6c5042a/plugins/uniswap/strategies/directV3.ts
- Quote route handler: https://github.com/kmadorin/wishd/blob/6c5042a/apps/web/app/api/uniswap/quote/route.ts
- Swap route handler: https://github.com/kmadorin/wishd/blob/6c5042a/apps/web/app/api/uniswap/swap/route.ts
- Plugin entry / `prepare()` building the Porto bundle: https://github.com/kmadorin/wishd/blob/6c5042a/plugins/uniswap/prepare.ts
- Swap widget rendered by the agent: https://github.com/kmadorin/wishd/blob/6c5042a/plugins/uniswap/widgets/SwapExecute.tsx

**How easy is it to use the API / Protocol?** 7/10

**Additional feedback for the Sponsor:**

Full DX writeup is committed at https://github.com/kmadorin/wishd/blob/6c5042a/FEEDBACK.md. Headlines: `/quote` and `/swap` were production-grade out of the box and dropped straight into `wagmi.useSendCalls()` for our AA wallet, but five gaps cost real time — (1) no Permit2-bundled swap response, so AA wallets either pay double signatures or hand-prepend approvals like we did; (2) no batch-quote endpoint to compare routes / fee tiers in one call; (3) no Sepolia or testnet coverage, so we maintain a parallel direct-V3 path; (4) Sepolia QuoterV2 / SwapRouter02 addresses aren't surfaced in the Trading API docs (we found them in `v3-deployments`); (5) no agent-discoverable intent format, which blocks agent-to-agent swap coordination. A Permit2-aware swap response and a settlement webhook would each be high-leverage adds for agentic flows.

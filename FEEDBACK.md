# Builder Feedback — Uniswap Trading API & Developer Platform

Project: wishd (ETHGlobal Open Agents).
Stack: Trading API v2 + direct V3 (QuoterV2 / SwapRouter02) on Sepolia + Porto AA wallet.

## What worked

- Trading API `/quote` and `/swap` returned production-grade responses out of the box on mainnet, Base, Arbitrum, Optimism, Polygon, Unichain.
- Approval-checking endpoint (`/check_approval`) saved a contract round-trip when wiring the swap widget.
- Documentation for the swap calldata response shape (encoded `to`/`data`/`value`) was clear enough to drop directly into `wagmi.useSendCalls()` for Porto AA.

## What didn't / DX friction

- **No Permit2-bundled swap path.** For an AA wallet we wanted a single bundle: permit2-sign → swap. Trading API forced separate `approve` + `swap` txs, doubling user signatures and gas overhead. We worked around it by prepending the approval call inside the Porto bundle, but a Permit2-aware swap response would eliminate that workaround entirely.
- **No batch-quote endpoint.** Comparing routes / fee tiers required N sequential `/quote` calls. A `/quotes` endpoint accepting an array of input/output pairs would help routing UIs.
- **No agent-discoverable intent format.** Other agents cannot easily respond to a swap intent ("I want to swap X→Y at price Z by time T") because there is no standard schema for posting intents. An intent broadcasting endpoint would unlock agent-to-agent coordination.
- **Sepolia coverage gap.** Trading API does not cover Sepolia, so we fell back to direct V3 contracts. The QuoterV2 / SwapRouter02 addresses for Sepolia are not surfaced in the Trading API docs; we had to discover them from the v3-deployments repo. A unified addresses index linked from the Trading API docs would have saved an hour of hunting.
- **Slippage model is implicit.** The default slippage tolerance applied by `/quote` is not stated in the docs; we had to inspect responses to back-derive it. Make this explicit (default + override).
- **No webhook for swap settlement.** For agentic flows that fire-and-forget a swap, polling the chain is the only confirmation path. A webhook on settlement would integrate cleanly with KeeperHub-style execution layers.

## Bugs hit

- The `/check_approval` response on Polygon occasionally returned `approval = null` for tokens that clearly required allowance; manually probing `allowance(owner, spender)` then matched the correct on-chain state. We did not fully reproduce; suspected race against indexing.

## Feature requests, in priority order

1. Permit2-bundled swap response.
2. Batch quote endpoint.
3. Sepolia + L2 testnet support in Trading API (or a documented direct-V3 fallback bundle).
4. Agent intent broadcast endpoint.
5. Settlement webhook.

## Contact

Team: wishd. Repo: this repository. Demo built during Open Agents (ETHGlobal).

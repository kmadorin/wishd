# KeeperHub management + sub-agent — sketch (P2)

**Date:** 2026-05-02
**Status:** sketch (not a spec yet — captures direction so we can return after demo)
**Goal:** capture the design direction agreed during 2026-05-02 brainstorming for keeper management UI + dedicated keeper sub-agent. Not implementation-ready. Pick this up after P0 + P1 ship and the demo is recorded.

---

## 1. Why a sketch and not a spec

P0 + P1 are scoped tightly for today's demo. P2 is genuinely large and depends on at least:

- KH MCP server having mutation endpoints we need (pause/resume/delete/regrant).
- Anthropic Agent SDK sub-agent pattern being available + configured in wishd's runtime.
- Decisions about wishd-managed vs foreign workflow classification.

We agreed to capture direction now so it isn't lost, and to commit to one sub-project per spec when we resume.

## 2. Direction agreed during brainstorming

- **Scope** (Q1): full UX overhaul. We acknowledged P2 captures the "manage existing + browse + multi-deploy" parts.
- **Multi-workflow** (Q2): option C — curated keepers + agent-authored ephemeral workflows + foreign-workflow management on the user's KH account.
- **Sub-agent** (Q3): option B — single `KeeperAgent` sub-agent owns CRUD + composing. Main agent delegates to it for "manage my keepers" / "stop the COMP keeper" / "what automations do I have running" wishes.

## 3. Open questions to resolve before writing spec

- **KH MCP capabilities.** Confirm which operations are exposed: `list_workflows`, `update_workflow` (we use this today for enable flag), is there `delete_workflow`? `revoke_permissions` would happen client-side via Porto, not KH. Does KH let us toggle `enabled` cleanly without a full update?
- **Wishd-managed vs foreign classification.** Today we filter by name prefix `wishd:{keeperId}:{userPortoAddress}`. Foreign workflows = anything else on the user's KH account. UI should display all but mark wishd-managed as "wishd can manage" and foreign as "external — view only" (or "open in KeeperHub" link).
- **Permission state reconciliation.** A workflow exists on KH but its `permissionsId` may be expired/revoked on Porto. Need `wallet_getPermissions({ permissionsId })` polled client-side. State table from the original `2026-05-01-keeperhub-keepers-design.md` §3 already describes this — adopt.
- **Sub-agent isolation.** Anthropic Agent SDK sub-agent patterns: dispatch via Task tool with subagent_type, or in-process delegation? Confirm what's supported in `@anthropic-ai/claude-agent-sdk` at the wishd target version. Affects whether sub-agent has its own MCP client or shares parent's.
- **Composing new workflows.** When the agent composes a workflow ad-hoc (not from `keepers/<id>/`), how do we name it? Proposed: `wishd:agent:{userPortoAddress}:{slug}`. Slug = sub-agent picks a stable handle. Need to decide: do ephemeral workflows still need a "manifest" object so the deploy modal can render copy, or do we render generic copy?

## 4. Probable system shape

```
apps/web/server/keepers/
  agentTools.ts              # existing — keep recommend_keeper, propose_delegation, inject_keeper_offer
  managerAgent.ts            # NEW — defines KeeperAgent sub-agent: prompt, tool list, delegation surface
  managerTools.ts            # NEW — list_user_workflows, pause_workflow, resume_workflow,
                             #         delete_workflow, regrant_permissions, compose_workflow
  composeWorkflow.ts         # NEW — sub-agent helper to translate "auto-compound my AAVE rewards"
                             #         → KhWorkflowJson via KH MCP primitives, validating against
                             #         Porto delegation bounds for that keeper-class.

apps/web/app/keepers/page.tsx           # NEW — dashboard route. Lists all KH workflows for the
                                        #         connected Porto address. Sections: wishd-managed,
                                        #         foreign. Per-row actions: pause, resume, delete,
                                        #         re-grant, view on KH.
apps/web/components/keepers/
  KeeperRow.tsx
  KeeperDetailDrawer.tsx     # opens on row click — shows workflow JSON, last runs, permission state.

apps/web/components/wish/
  WishComposer.tsx           # main agent prompt routing: detect manage-style wishes,
                             #   delegate to KeeperAgent via SDK sub-agent dispatch.
```

## 5. UX sketch

- **Header link** in main page: "your keepers" → `/keepers`.
- **Dashboard** (`/keepers`):
  - Section "managed by wishd" — cards per workflow w/ status pill (active / paused / broken / regrant-needed). Quick actions inline: Pause, Resume, Delete, Re-grant.
  - Section "from elsewhere" — cards for foreign workflows. Read-only here; "open on KeeperHub" link.
  - "Deploy another" button → opens a wish-style composer scoped to keeper authoring ("what should the keeper do? e.g. claim AAVE rewards weekly"). Routes to KeeperAgent.
- **Wish entry points**:
  - "stop the COMP keeper" / "pause auto-compounding" → KeeperAgent finds workflow by intent → calls `pause_workflow`.
  - "show me my automations" → KeeperAgent calls `list_user_workflows` → renders inline summary widget.
  - "auto-compound my AAVE COMP rewards" → KeeperAgent uses `compose_workflow` (when no curated keeper exists for that intent).

## 6. Sub-agent behavior (rough)

- **System prompt** scoped to keeper management. Hard rules: never widen `delegation.fixed.calls`, never bypass server clamps, never delete a workflow without explicit confirmation in the user's last message.
- **Tools available**: full keeper management tool set + KH MCP read tools. *No* main-flow widgets — sub-agent shouldn't render success cards for lend intents, etc.
- **Output contract**: returns a structured summary the parent agent can show or narrate. E.g.:
  ```json
  { "action": "paused", "workflowId": "…", "userMessage": "Auto-compound paused. Re-enable from /keepers." }
  ```

## 7. Acceptance hints (what "done" looks like)

- A user can ask "show me my automations" and get a list with statuses.
- A user can pause / resume / delete a wishd-managed workflow from the dashboard.
- A user can ask "auto-compound my COMP" and end up with a deployed workflow even if no curated `keepers/<id>/` exists for that asset (sub-agent composes it).
- Foreign workflows on the same KH account are visible but marked as external.
- Re-grant flow handles expired/revoked Porto permissions and writes the new `permissionsId` back to the existing KH workflow without re-creating it.

## 8. Non-goals (for whenever P2 is taken on)

- Multi-user wishd. Still single-tenant.
- Cross-protocol composability beyond what KH MCP exposes.
- Selector-level Porto permissions (still contract-level).
- Promotion path (ephemeral → committed `keepers/<id>/` PR).

## 9. Re-entry checklist

When picking this up:

1. Re-read this sketch + the original `2026-05-01-keeperhub-keepers-design.md` §3 state-reconciliation table.
2. Verify KH MCP available endpoints (open question §3 above) — block design until confirmed.
3. Check Anthropic Agent SDK sub-agent dispatch pattern at the version wishd uses.
4. Promote this file to a real design spec via the brainstorming skill, going through clarifying → approaches → design sections → spec.

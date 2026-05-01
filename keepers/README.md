# Keepers

Top-level multi-protocol artifacts. Each keeper:

- Lives at `keepers/<id>/`
- Declares `manifest.plugins: string[]` (which protocol plugins it composes)
- Ships `workflow.ts` (returns a `KhWorkflowJson` for hosted KeeperHub deploys)
- Ships `delegation.ts` (`comet-allow` or `porto-permissions`)
- Optionally ships setup widgets

v0 ships zero keepers. The `Keeper` type is exported from `@wishd/plugin-sdk` so adding `keepers/auto-compound-comp/` later is a drop-in.

Reference graph for the planned `auto-compound-comp` keeper lives at `crypto-bro-calls/project-docs/keeperhub-workflow.md` (sibling project).

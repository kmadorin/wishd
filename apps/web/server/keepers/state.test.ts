import { describe, it, expect, vi, beforeEach } from "vitest";
import { getKeeperState, _testing } from "./state";
import type { Keeper, KhWorkflowNode } from "@wishd/plugin-sdk";

const dummyKeeper = {
  manifest: { id: "auto-compound-comp" },
} as unknown as Keeper;

const USER = "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3" as const;
const PERMS = "0x8aa4cc3b82173c5ed03597dbf6cbd1e7ab2ff7ce" as const;

function fakeWorkflow({ name, enabled, perms }: { name: string; enabled: boolean; perms?: string }) {
  return {
    id: "wf-1",
    name,
    enabled,
    nodes: [
      perms
        ? ({
            id: "claim",
            type: "action",
            position: { x: 0, y: 0 },
            data: { type: "action", label: "x", config: { permissionsId: perms } },
          } satisfies KhWorkflowNode)
        : ({ id: "x", type: "action", position: { x: 0, y: 0 }, data: { type: "action", label: "x", config: {} } } satisfies KhWorkflowNode),
    ],
    edges: [],
  };
}

describe("getKeeperState", () => {
  beforeEach(() => _testing.clearCache());

  it("returns not_deployed when no matching workflow", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s).toEqual({ kind: "not_deployed" });
  });

  it("returns deployed_enabled when workflow.enabled=true", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([
      fakeWorkflow({ name: `wishd:auto-compound-comp:${USER}`, enabled: true, perms: PERMS }),
    ]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s).toEqual({ kind: "deployed_enabled", workflowId: "wf-1", permissionsId: PERMS });
  });

  it("returns deployed_disabled when workflow.enabled=false", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([
      fakeWorkflow({ name: `wishd:auto-compound-comp:${USER}`, enabled: false, perms: PERMS }),
    ]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s.kind).toBe("deployed_disabled");
  });

  it("ignores workflows with non-matching name", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([
      fakeWorkflow({ name: `wishd:other-keeper:${USER}`, enabled: true, perms: PERMS }),
    ]);
    const s = await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(s).toEqual({ kind: "not_deployed" });
  });

  it("caches result for ~30s by (userPortoAddress, keeperId)", async () => {
    const listWorkflows = vi.fn().mockResolvedValue([]);
    await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    await getKeeperState({ keeper: dummyKeeper, userPortoAddress: USER, listWorkflows });
    expect(listWorkflows).toHaveBeenCalledTimes(1);
  });
});

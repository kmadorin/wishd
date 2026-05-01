import { describe, it, expect } from "vitest";
import { buildWorkflow } from "./workflow";

const USER = "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3" as const;
const PERMS = "0x8aa4cc3b82173c5ed03597dbf6cbd1e7ab2ff7ce" as const;

describe("buildWorkflow", () => {
  const wf = buildWorkflow({ userPortoAddress: USER, permissionsId: PERMS });

  it("uses the wishd:<keeperId>:<userPortoAddress> name convention", () => {
    expect(wf.name).toBe(`wishd:auto-compound-comp:${USER}`);
  });

  it("trigger node carries an hourly cron, disabled by default", () => {
    const trigger = wf.nodes.find((n) => n.id === "trigger");
    if (!trigger) throw new Error("missing trigger");
    expect(trigger.data.config).toMatchObject({ cron: "0 * * * *", enabled: false, actionType: "schedule" });
  });

  it("substitutes userPortoAddress into porto/execute-call nodes", () => {
    const portoNodes = wf.nodes.filter((n) => (n.data.config as { actionType?: string }).actionType === "porto/execute-call");
    expect(portoNodes.length).toBeGreaterThan(0);
    for (const n of portoNodes) {
      expect((n.data.config as { userPortoAddress?: string }).userPortoAddress).toBe(USER);
      expect((n.data.config as { permissionsId?: string }).permissionsId).toBe(PERMS);
    }
  });

  it("includes the five-step DAG: trigger → baseToken → batchReads → cond → claim → compBal → swap → usdcBal → supply", () => {
    const ids = wf.nodes.map((n) => n.id);
    for (const id of ["trigger", "baseToken", "batchReads", "cond", "claim", "compBal", "swap", "usdcBal", "supply"]) {
      expect(ids).toContain(id);
    }
    const sources = new Set(wf.edges.map((e) => e.source));
    expect(sources).toContain("cond");
  });

  it("never embeds the placeholder default address 0x...0001", () => {
    const json = JSON.stringify(wf);
    expect(json).not.toMatch(/0x0+1\b/i);
  });
});

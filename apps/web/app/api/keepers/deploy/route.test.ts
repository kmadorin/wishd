import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as khRpc from "@/server/keepers/khRpc";

describe("POST /api/keepers/deploy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns 400 on invalid body", async () => {
    const req = new Request("http://x/api/keepers/deploy", { method: "POST", body: "{}" });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 404 on unknown keeperId", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ keeperId: "nope", userPortoAddress: "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3", permissionsId: "0xabc" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(404);
  });

  it("calls create_workflow then update_workflow to enable, returns workflowId", async () => {
    const create = vi.spyOn(khRpc, "khCreateWorkflow").mockResolvedValue({ workflowId: "wf-1" });
    const update = vi.spyOn(khRpc, "khUpdateWorkflow").mockResolvedValue();

    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        keeperId: "auto-compound-comp",
        userPortoAddress: "0x9dd0F386a080470E1803E681F9fcD1bbb6A3D5F3",
        permissionsId: "0x8aa4cc3b82173c5ed03597dbf6cbd1e7ab2ff7ce",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ workflowId: "wf-1" });
    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ workflowId: "wf-1" }));
  });
});

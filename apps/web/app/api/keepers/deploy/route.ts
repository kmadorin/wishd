import { NextResponse } from "next/server";
import type { Address } from "@wishd/plugin-sdk";
import { getKeeperById } from "@/server/keepers/registry";
import { khCreateWorkflow, khUpdateWorkflow, KhUnauthorizedError } from "@/server/keepers/khRpc";

type Body = {
  keeperId: string;
  userPortoAddress: Address;
  permissionsId: `0x${string}`;
};

function isAddress(s: unknown): s is Address {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
}
function isHex(s: unknown): s is `0x${string}` {
  return typeof s === "string" && /^0x[0-9a-fA-F]+$/.test(s);
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.keeperId !== "string" || !isAddress(body.userPortoAddress) || !isHex(body.permissionsId)) {
    return NextResponse.json({ error: "missing or invalid keeperId/userPortoAddress/permissionsId" }, { status: 400 });
  }

  const keeper = getKeeperById(body.keeperId);
  if (!keeper) return NextResponse.json({ error: `unknown keeper ${body.keeperId}` }, { status: 404 });

  const workflow = keeper.buildWorkflow({
    userPortoAddress: body.userPortoAddress,
    permissionsId: body.permissionsId,
  });

  try {
    const { workflowId } = await khCreateWorkflow({
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      edges: workflow.edges,
    });

    // Enable: patch trigger node config.enabled=true and resend nodes.
    const enabledNodes = workflow.nodes.map((n) =>
      n.id === "trigger"
        ? { ...n, data: { ...n.data, config: { ...n.data.config, enabled: true } } }
        : n,
    );
    await khUpdateWorkflow({ workflowId, nodes: enabledNodes, edges: workflow.edges });

    return NextResponse.json({ workflowId });
  } catch (err) {
    if (err instanceof KhUnauthorizedError) {
      return NextResponse.json({ error: err.message, code: "kh_unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

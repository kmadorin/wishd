import type { Address, Keeper, KeeperState, KhWorkflowJson, KhWorkflowNode } from "@wishd/plugin-sdk";

type RemoteWorkflow = KhWorkflowJson & { id: string; enabled: boolean };
type ListWorkflowsFn = () => Promise<RemoteWorkflow[]>;

const TTL_MS = 30_000;
const cache = new Map<string, { state: KeeperState; fetchedAt: number }>();

function key(userPortoAddress: Address, keeperId: string): string {
  return `${userPortoAddress.toLowerCase()}::${keeperId}`;
}

function extractPermissionsId(nodes: KhWorkflowNode[]): `0x${string}` | null {
  for (const n of nodes) {
    const v = (n.data?.config as { permissionsId?: unknown } | undefined)?.permissionsId;
    if (typeof v === "string" && v.startsWith("0x")) return v as `0x${string}`;
  }
  return null;
}

export async function getKeeperState(args: {
  keeper: Keeper;
  userPortoAddress: Address;
  listWorkflows: ListWorkflowsFn;
}): Promise<KeeperState> {
  const k = key(args.userPortoAddress, args.keeper.manifest.id);
  const cached = cache.get(k);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.state;

  const wfs = await args.listWorkflows();
  const expectedName = `wishd:${args.keeper.manifest.id}:${args.userPortoAddress}`;
  const wf = wfs.find((w) => w.name === expectedName);
  if (!wf) {
    const state: KeeperState = { kind: "not_deployed" };
    cache.set(k, { state, fetchedAt: Date.now() });
    return state;
  }
  const permissionsId = extractPermissionsId(wf.nodes);
  if (!permissionsId) {
    const state: KeeperState = { kind: "not_deployed" };
    cache.set(k, { state, fetchedAt: Date.now() });
    return state;
  }
  const state: KeeperState = wf.enabled
    ? { kind: "deployed_enabled", workflowId: wf.id, permissionsId }
    : { kind: "deployed_disabled", workflowId: wf.id, permissionsId };
  cache.set(k, { state, fetchedAt: Date.now() });
  return state;
}

export const _testing = {
  clearCache: () => cache.clear(),
};

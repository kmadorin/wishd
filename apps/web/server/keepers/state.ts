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

function nodeMatchesKeeper(node: KhWorkflowNode, keeper: Keeper, userPortoAddress: Address): boolean {
  const cfg = node.data?.config as { userPortoAddress?: string; contractAddress?: string } | undefined;
  if (!cfg) return false;
  if (cfg.userPortoAddress?.toLowerCase() !== userPortoAddress.toLowerCase()) return false;
  if (keeper.delegation.kind !== "porto-permissions") return false;
  const allowlist = new Set(keeper.delegation.fixed.calls.map((a) => a.toLowerCase()));
  return typeof cfg.contractAddress === "string" && allowlist.has(cfg.contractAddress.toLowerCase());
}

function findWorkflow(wfs: RemoteWorkflow[], keeper: Keeper, userPortoAddress: Address): RemoteWorkflow | null {
  // 1. Exact name match — wishd-deployed.
  const expectedName = `wishd:${keeper.manifest.id}:${userPortoAddress}`;
  const exact = wfs.find((w) => w.name === expectedName);
  if (exact) return exact;
  // 2. Semantic match — workflow whose porto/execute-call nodes target this user + contracts in keeper's allowlist.
  // Catches manually-created or differently-named workflows (e.g. KH demo seed).
  for (const wf of wfs) {
    if (wf.nodes.some((n) => nodeMatchesKeeper(n, keeper, userPortoAddress))) return wf;
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
  const wf = findWorkflow(wfs, args.keeper, args.userPortoAddress);
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

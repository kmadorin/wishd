import type { ComponentType } from "react";
import type { Address, PublicClient } from "viem";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export { renderSentenceParts } from "./sentence";
export type { SentencePart } from "./sentence";

export type TrustTier = "verified" | "community" | "unverified";

export type WidgetSlot = "flow" | "results" | "pinned" | "panel";

export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset"; required?: boolean; default?: string; options: string[] }
  | { key: string; type: "chain"; required?: boolean; default: string; options: string[] }
  | { key: string; type: "select"; required?: boolean; default: string; options: string[] };

export type IntentSchema = {
  intent: string;
  verb: string;
  description: string;
  fields: IntentField[];
  widget: string;
  slot?: WidgetSlot;
  /** Words inserted *before* the named field. Key = field key. */
  connectors?: Record<string, string>;
  /** Field key whose value drives the BalanceRow chips (for swap/bridge). */
  balanceFor?: string;
};

export type Manifest = {
  name: string;
  version: string;
  chains: number[];
  trust: TrustTier;
  provides: {
    intents: string[];
    widgets: string[];
    mcps: string[];
  };
};

// ---------- keeper-related types ----------

export type ExpiryPolicy =
  | { kind: "unlimited" }
  | { kind: "bounded"; maxDays: number }
  | { kind: "fixed"; days: number };

export type SpendPeriod = "day" | "week" | "month";

export type PortoPermissionsBounds = {
  fixed: {
    calls: Array<{ to: Address; signature: string }>;
    feeToken: { symbol: string; limit: `${number}` | `${number}.${number}` };
  };
  expiryPolicy: ExpiryPolicy;
  spend: {
    bounds: Array<{ token: Address; maxLimit: bigint; periods: SpendPeriod[] }>;
    defaults: Array<{ token: Address; limit: bigint; period: SpendPeriod }>;
  };
};

export type CometAllowSpec = {
  kind: "comet-allow";
  comet: Address;
  manager: Address;
};

export type PortoPermissionsSpec = PortoPermissionsBounds & { kind: "porto-permissions" };

export type DelegationSpec = PortoPermissionsSpec | CometAllowSpec;

/** Runtime payload sent into Porto's wallet_grantPermissions. */
export type PortoPermissionsGrant = {
  expiry: number;
  feeToken: { limit: `${number}` | `${number}.${number}`; symbol: string } | null;
  key: { type: "secp256k1"; publicKey: Address };
  permissions: {
    calls: Array<{ to: Address; signature: string }>;
    spend?: Array<{ token: Address; limit: bigint; period: "hour" | SpendPeriod }>;
  };
};

export type KhWorkflowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    type: string;
    label: string;
    config: Record<string, unknown>;
    status?: string;
  };
};

export type KhWorkflowEdge = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
};

export type KhWorkflowJson = {
  name: string;
  description?: string;
  nodes: KhWorkflowNode[];
  edges: KhWorkflowEdge[];
};

export type WorkflowParams = {
  userPortoAddress: Address;
  permissionsId: `0x${string}`;
};

export type KeeperManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  chains: number[];
  plugins: string[];
  trust: TrustTier;
  appliesTo: Array<{ intent: string }>;
};

export type ServerEvent =
  | { type: "chat.delta"; delta: string }
  | { type: "tool.call"; name: string; input: unknown }
  | { type: "ui.render"; widget: { id: string; type: string; slot?: WidgetSlot; props: unknown } }
  | { type: "ui.patch"; id: string; props: Record<string, unknown> }
  | { type: "ui.dismiss"; id: string }
  | { type: "notification"; level: "info" | "warn" | "error"; text: string }
  | { type: "result"; ok: boolean; cost?: number }
  | { type: "error"; message: string };

export type PluginCtx = {
  publicClient: PublicClient;
  emit: (e: ServerEvent) => void;
};

export type Plugin = {
  manifest: Manifest;
  mcp(ctx: PluginCtx): { server: Server; serverName: string };
  widgets: Record<string, ComponentType<any>>;
  skills?: Record<string, string>;
  intents?: IntentSchema[];
};

export function definePlugin(p: Plugin): Plugin {
  return p;
}

export type Keeper = {
  manifest: KeeperManifest;
  delegation: DelegationSpec;
  buildWorkflow: (params: WorkflowParams) => KhWorkflowJson;
  setupWidget?: string;
};

export function defineKeeper(k: Keeper): Keeper {
  return k;
}

export type KeeperState =
  | { kind: "not_deployed" }
  | { kind: "deployed_enabled"; workflowId: string; permissionsId: `0x${string}` }
  | { kind: "deployed_disabled"; workflowId: string; permissionsId: `0x${string}` };

export type KeeperOffer = {
  keeperId: string;
  title: string;
  desc: string;
  badge?: string;
  featured?: boolean;
  state: KeeperState;
  rationale?: string;
};

// re-export Address for downstream packages that don't depend on viem directly
export type { Address };

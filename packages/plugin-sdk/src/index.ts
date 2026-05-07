import type { ComponentType } from "react";
import type { Address } from "viem";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { PluginCtx } from "./ctx";

export { renderSentenceParts } from "./sentence";
export type { SentencePart } from "./sentence";

export type TrustTier = "verified" | "community" | "unverified";

export type WidgetSlot = "flow" | "results" | "pinned" | "panel";

export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset"; required?: boolean; default?: string; options: string[] /* CAIP-19 ids */ }
  | { key: string; type: "chain"; required?: boolean; default: string; options: string[] /* CAIP-2 ids */ }
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
  chains: string[];          // CAIP-2 list (was number[])
  trust: TrustTier;
  /**
   * Optional. For plugins with multiple `chain`-typed IntentFields,
   * names the field whose CAIP-2 value drives ctx selection + disambiguation.
   * Default fallbacks (in order): single chain field → that one;
   * field named "fromChain" | "sourceChain" | "chain"; first chain field.
   */
  primaryChainField?: string;
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

export type KeeperExplainer = {
  /** 1-2 sentence plain-English summary of what the keeper does on the user's behalf. */
  whatThisDoes: string;
  /** Per-call address: the human label and the action's purpose. */
  perCall: Record<Address, { label: string; purpose: string }>;
  /** Per-token address: human symbol and decimals (so the modal can render decimal inputs). */
  perToken: Record<Address, { label: string; decimals: number }>;
  /** Optional rationale shown beneath spend caps; null/absent if not applicable. */
  recommendedSpendRationale?: string;
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
  explainer: KeeperExplainer;
};

export type ServerEvent =
  | { type: "chat.delta"; delta: string }
  | { type: "tool.call"; name: string; input: unknown }
  | { type: "ui.render"; widget: { id: string; type: string; slot?: WidgetSlot; props: unknown } }
  | { type: "ui.patch"; id: string; props: Record<string, unknown> }
  | { type: "ui.dismiss"; id: string }
  | { type: "notification"; level: "info" | "warn" | "error"; text: string }
  | {
    type: "result";
    ok: boolean;
    cost?: number;
    summary?: string;
    artifacts?: Array<{ kind: "tx"; caip2: string; hash: string }>;
    recovery?: { kind: "link"; url: string; label: string };
  }
  | { type: "error"; message: string };

export type { Call, EvmCall, SvmCall, SvmTxCall, SvmInstructionsCall } from "./call";
export {
  isEvmCall, isSvmCall, isSvmTxCall, isSvmInstructionsCall,
} from "./call";

export type { PluginCtx, EvmCtx, SvmCtx, Emit, SolanaRpcLike } from "./ctx";
export { isEvmCtx, isSvmCtx } from "./ctx";

export type { Prepared } from "./prepared";
export type { Observation, LifiStatusObservation, Placeholder } from "./observation";
export { isPlaceholder } from "./observation";

export * from "./caip";
export { explorerTxUrl, explorerAddressUrl, registerExplorer } from "./explorers";
export type { ExplorerEntry } from "./explorers";
export { useEmit, useEmitStore } from "./client/emit";

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

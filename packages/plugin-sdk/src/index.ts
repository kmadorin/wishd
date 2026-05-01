import type { ComponentType } from "react";
import type { Address, PublicClient } from "viem";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export type TrustTier = "verified" | "community" | "unverified";

export type WidgetSlot = "flow" | "results" | "pinned" | "panel";

export type IntentField =
  | { key: string; type: "amount"; required?: boolean; default?: string }
  | { key: string; type: "asset"; required?: boolean; default?: string; options: string[] }
  | { key: string; type: "chain"; required?: boolean; default: string; options: string[] };

export type IntentSchema = {
  /** Plugin-namespaced id, e.g. "compound-v3.deposit". */
  intent: string;
  /** Composer label / verb, e.g. "deposit", "withdraw". */
  verb: string;
  /** Sentence-case description shown in the action dropdown row. */
  description: string;
  /** Ordered list of fields rendered after the verb. */
  fields: IntentField[];
  /** Widget name passed to ui.render / mounted by the registry. */
  widget: string;
  /** Slot for forward-compat. v0.1 always "flow". */
  slot?: WidgetSlot;
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

export type KhWorkflowJson = {
  name: string;
  schedule?: { cron: string };
  nodes: Array<{
    id: string;
    label: string;
    actionType: string;
    config: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    sourceHandle?: "true" | "false" | "loop" | "done";
  }>;
  enabled?: boolean;
};

export type DelegationSpec =
  | { kind: "comet-allow"; comet: Address; manager: Address }
  | {
      kind: "porto-permissions";
      payload: {
        expiry: number;
        feeToken?: { limit: string; symbol: string };
        key: { type: "secp256k1"; publicKey: Address };
        permissions: {
          calls: Array<{ to: Address; signature: string }>;
          spend?: Array<{ token: Address; limit: bigint; period: "hour" | "day" | "week" | "month" }>;
        };
      };
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

export type Keeper<TParams = Record<string, unknown>> = {
  manifest: {
    name: string;
    version: string;
    plugins: string[];
    chains: number[];
    trust: TrustTier;
    description: string;
  };
  paramsSchema: unknown;
  buildWorkflow(params: TParams & { userAddress: Address; chainId: number }): KhWorkflowJson;
  delegation(params: TParams & { userAddress: Address; chainId: number }): DelegationSpec;
  widgets?: Record<string, ComponentType<any>>;
};

export function defineKeeper<TParams>(k: Keeper<TParams>): Keeper<TParams> {
  return k;
}

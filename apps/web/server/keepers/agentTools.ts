/**
 * Custom Agent SDK tools for the Keeper recommendation flow.
 *
 * SDK API chosen: `createSdkMcpServer` + `tool` from `@anthropic-ai/claude-agent-sdk`.
 *
 * Rationale:
 *  - `tool(name, description, zodSchema, handler)` — positional-arg factory that accepts a Zod
 *    schema (NOT a raw JSON Schema object). Returns `SdkMcpToolDefinition`.
 *  - `createSdkMcpServer({ name, tools })` — wraps tool definitions into a live McpServer
 *    instance (type `McpSdkServerConfigWithInstance`). This fits into the `mcpServers` Record
 *    that `query({ options: { mcpServers } })` already accepts.
 *  - No `options.tools` field exists on the SDK's Options type; mcpServers is the only channel.
 *  - Handler must return `Promise<CallToolResult>` where the result has
 *    `{ content: [{ type: "text", text: string }] }`.
 *  - Tools are exposed as `mcp__wishd_keepers__<name>`; pluginLoader.ts allowedTools already
 *    includes `mcp__wishd_keepers__*` (added in Phase 5 wiring).
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerEvent, KeeperOffer, Address } from "@wishd/plugin-sdk";
import { keepersForIntent, getKeeperById } from "./registry";
import { getKeeperState } from "./state";
import { khListWorkflows } from "./khRpc";
import { proposeDelegation, type DelegationProposal, type AgentSuggestion } from "./proposeDelegation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const recommendKeeperTool = tool(
  "recommend_keeper",
  "After a user's intent confirms, look up applicable keepers and return a single offer if one is appropriate. Read-only. Returns { offer: null } if no useful recommendation.",
  {
    intentId: z.string(),
    userPortoAddress: z.string(),
  },
  async (input: { intentId: string; userPortoAddress: Address }): Promise<CallToolResult> => {
    const candidates = keepersForIntent(input.intentId);
    if (candidates.length === 0) return ok({ offer: null });
    const keeper = candidates[0];
    const state = await getKeeperState({
      keeper,
      userPortoAddress: input.userPortoAddress,
      listWorkflows: khListWorkflows,
    });
    const offer: KeeperOffer = {
      keeperId: keeper.manifest.id,
      title: keeper.manifest.name,
      desc: keeper.manifest.description,
      badge: "KEEPERHUB",
      featured: true,
      state,
    };
    return ok({ offer });
  },
);

const spendItemSchema = z.object({
  token: z.string(),
  limit: z.string(), // bigint as string over the wire
  period: z.string(),
});

const expirySchema = z.object({
  kind: z.string(),
  maxDays: z.number().optional(),
});

const suggestionSchema = z
  .object({
    expiry: expirySchema.optional(),
    spend: z.array(spendItemSchema).optional(),
    rationale: z.string().optional(),
  })
  .optional();

const proposeDelegationTool = tool(
  "propose_delegation",
  "Propose Porto delegation values (expiry + spend caps) within the keeper's bounds. Server clamps any out-of-range suggestions.",
  {
    keeperId: z.string(),
    suggestion: suggestionSchema,
  },
  async (input: { keeperId: string; suggestion?: z.infer<typeof suggestionSchema> }): Promise<CallToolResult> => {
    const keeper = getKeeperById(input.keeperId);
    if (!keeper) throw new Error(`unknown keeper ${input.keeperId}`);

    // Convert wire suggestion (spend limits as strings) to AgentSuggestion (bigint limits).
    const agentSuggestion: AgentSuggestion = input.suggestion
      ? {
          expiry: input.suggestion.expiry as AgentSuggestion extends null ? never : NonNullable<AgentSuggestion>["expiry"],
          spend: input.suggestion.spend?.map((s) => ({
            token: s.token as Address,
            limit: BigInt(s.limit),
            period: s.period as "hour" | "day" | "week" | "month",
          })),
          rationale: input.suggestion.rationale,
        }
      : null;

    const proposal: DelegationProposal = proposeDelegation({
      keeper,
      agentSuggestion,
    });

    // Serialize bigint -> string for JSON safety
    return ok({
      expiry: proposal.expiry,
      spend: proposal.spend.map((s) => ({ token: s.token, limit: s.limit.toString(), period: s.period })),
      rationale: proposal.rationale ?? null,
    });
  },
);

const offerSchema = z.object({
  keeperId: z.string(),
  title: z.string(),
  desc: z.string(),
  badge: z.string().optional(),
  featured: z.boolean().optional(),
}).passthrough();

const suggestedDelegationSchema = z
  .object({
    expiry: expirySchema,
    spend: z.array(spendItemSchema),
    rationale: z.string().nullable().optional(),
  })
  .optional();

const injectKeeperOfferTool = tool(
  "inject_keeper_offer",
  "Push a keeper offer into the success card identified by stepCardId. Replaces the empty keeperOffers slot. Must be called after recommend_keeper returned a non-null offer.",
  {
    stepCardId: z.string(),
    offer: offerSchema,
    suggestedDelegation: suggestedDelegationSchema,
  },
  async (input: {
    stepCardId: string;
    offer: z.infer<typeof offerSchema>;
    suggestedDelegation?: z.infer<typeof suggestedDelegationSchema>;
    _emit: (e: ServerEvent) => void;
  }): Promise<CallToolResult> => {
    // Defence-in-depth: keeper must exist in the registry.
    if (!getKeeperById(input.offer.keeperId)) {
      throw new Error(`unknown keeper ${input.offer.keeperId}`);
    }
    input._emit({
      type: "ui.patch",
      id: input.stepCardId,
      props: {
        keeperOffers: [{ ...input.offer, suggestedDelegation: input.suggestedDelegation ?? null }],
      },
    });
    return ok({ ok: true });
  },
);

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build an inline MCP server that exposes the three keeper tools.
 * Returns a `McpSdkServerConfigWithInstance` suitable for `mcpServers["wishd_keepers"]`.
 *
 * Note: `inject_keeper_offer` needs the `emit` callback at call time. Because the MCP
 * tool handler receives only parsed Zod input + extra, we close over `emit` here and
 * do NOT expose it in the schema — the agent never sees it.
 */
export function buildKeeperMcpServer(args: { emit: (e: ServerEvent) => void }) {
  const { emit } = args;

  // Wrap inject_keeper_offer to close over emit.
  const injectWrapped = tool(
    "inject_keeper_offer",
    "Push a keeper offer into the success card identified by stepCardId. Replaces the empty keeperOffers slot. Must be called after recommend_keeper returned a non-null offer.",
    {
      stepCardId: z.string(),
      offer: offerSchema,
      suggestedDelegation: suggestedDelegationSchema,
    },
    async (input: {
      stepCardId: string;
      offer: z.infer<typeof offerSchema>;
      suggestedDelegation?: z.infer<typeof suggestedDelegationSchema>;
    }): Promise<CallToolResult> => {
      if (!getKeeperById(input.offer.keeperId)) {
        throw new Error(`unknown keeper ${input.offer.keeperId}`);
      }
      emit({
        type: "ui.patch",
        id: input.stepCardId,
        props: {
          keeperOffers: [{ ...input.offer, suggestedDelegation: input.suggestedDelegation ?? null }],
        },
      });
      return ok({ ok: true });
    },
  );

  return createSdkMcpServer({
    name: "wishd_keepers",
    tools: [recommendKeeperTool, proposeDelegationTool, injectWrapped],
    alwaysLoad: true,
  });
}

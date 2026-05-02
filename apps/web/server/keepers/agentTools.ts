/**
 * Custom Agent SDK tools for the Keeper recommendation flow.
 *
 * Uses `createSdkMcpServer` + `tool` from @anthropic-ai/claude-agent-sdk.
 * Tools are exposed as `mcp__wishd_keepers__<name>`. allowedTools entry added in pluginLoader.
 */

import { randomUUID } from "node:crypto";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerEvent, KeeperOffer, Address, KhWorkflowNode, KhWorkflowEdge, SpendPeriod, ExpiryPolicy } from "@wishd/plugin-sdk";
import { keepersForIntent, getKeeperById } from "./registry";
import { getKeeperState } from "./state";
import { khListWorkflows, KhUnauthorizedError } from "./khRpc";
import { proposeDelegation, type DelegationProposal, type AgentSuggestion } from "./proposeDelegation";

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

const spendItemSchema = z.object({
  token: z.string(),
  limit: z.string(),
  period: z.string(),
});

const expirySchema = z.object({
  kind: z.string(),
  maxDays: z.number().optional(),
  days: z.number().optional(),
});

const offerSchema = z
  .object({
    keeperId: z.string(),
    title: z.string(),
    desc: z.string(),
    badge: z.string().optional(),
    featured: z.boolean().optional(),
  })
  .passthrough();

const suggestedDelegationSchema = z
  .object({
    expiry: expirySchema,
    spend: z.array(spendItemSchema),
    rationale: z.string().nullable().optional(),
  })
  .optional();

export function buildKeeperMcpServer(args: { emit: (e: ServerEvent) => void }) {
  const { emit } = args;

  const adaptedListWorkflows = async () => {
    const wfs = await khListWorkflows();
    return wfs.map((w) => ({
      id: w.id,
      name: w.name,
      enabled: w.enabled,
      nodes: w.nodes as KhWorkflowNode[],
      edges: w.edges as KhWorkflowEdge[],
    }));
  };

  const recommendKeeperTool = tool(
    "recommend_keeper",
    "After a user's intent confirms, look up applicable keepers and return a single offer if one is appropriate. Read-only. Returns { offer: null } if no useful recommendation.",
    {
      intentId: z.string(),
      userPortoAddress: z.string(),
      stepCardId: z.string().optional(),
    },
    async (input): Promise<CallToolResult> => {
      const candidates = keepersForIntent(input.intentId);
      const keeper = candidates[0];
      if (!keeper) return ok({ offer: null });
      try {
        const state = await getKeeperState({
          keeper,
          userPortoAddress: input.userPortoAddress as Address,
          listWorkflows: adaptedListWorkflows,
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
      } catch (err) {
        if (err instanceof KhUnauthorizedError) {
          emit({
            type: "ui.render",
            widget: {
              id: randomUUID(),
              type: "keeperhub-auth",
              slot: "flow",
              props: {
                intent: input.intentId,
                userPortoAddress: input.userPortoAddress,
                stepCardId: input.stepCardId,
              },
            },
          });
          return ok({ offer: null, pendingAuth: true });
        }
        throw err;
      }
    },
  );

  const proposeDelegationTool = tool(
    "propose_delegation",
    "Propose Porto delegation values (expiry + spend caps) within the keeper's bounds. Server clamps any out-of-range suggestions.",
    {
      keeperId: z.string(),
      suggestion: z
        .object({
          expiry: expirySchema.optional(),
          spend: z.array(spendItemSchema).optional(),
          rationale: z.string().optional(),
        })
        .optional(),
    },
    async (input): Promise<CallToolResult> => {
      const keeper = getKeeperById(input.keeperId);
      if (!keeper) throw new Error(`unknown keeper ${input.keeperId}`);

      const agentSuggestion: AgentSuggestion = input.suggestion
        ? {
            expiry: input.suggestion.expiry as ExpiryPolicy | undefined,
            spend: input.suggestion.spend?.map((s) => ({
              token: s.token as Address,
              limit: BigInt(s.limit),
              period: s.period as SpendPeriod,
            })),
            rationale: input.suggestion.rationale,
          }
        : null;

      const proposal: DelegationProposal = proposeDelegation({ keeper, agentSuggestion });

      return ok({
        expiry: proposal.expiry,
        spend: proposal.spend.map((s) => ({ token: s.token, limit: s.limit.toString(), period: s.period })),
        rationale: proposal.rationale ?? null,
      });
    },
  );

  const injectWrapped = tool(
    "inject_keeper_offer",
    "Push a keeper offer into the success card identified by stepCardId. Replaces the empty keeperOffers slot. Must be called after recommend_keeper returned a non-null offer.",
    {
      stepCardId: z.string(),
      offer: offerSchema,
      suggestedDelegation: suggestedDelegationSchema,
    },
    async (input): Promise<CallToolResult> => {
      const offerInput = input.offer as { keeperId: string; [k: string]: unknown };
      if (!getKeeperById(offerInput.keeperId)) {
        throw new Error(`unknown keeper ${offerInput.keeperId}`);
      }
      emit({
        type: "ui.patch",
        id: input.stepCardId,
        props: {
          keeperOffers: [{ ...offerInput, suggestedDelegation: input.suggestedDelegation ?? null }],
        },
      });
      return ok({ ok: true });
    },
  );

  return createSdkMcpServer({
    name: "wishd_keepers",
    tools: [recommendKeeperTool, proposeDelegationTool, injectWrapped],
  });
}

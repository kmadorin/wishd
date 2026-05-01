import { z } from "zod";
import type { PluginCtx } from "@wishd/plugin-sdk";
import { prepareDeposit } from "../prepare";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

export function createCompoundMcp(ctx: PluginCtx) {
  return createSdkMcpServer({
    name: "compound",
    version: "0.0.0",
    tools: [
      tool(
        "prepare_deposit",
        "Prepare a Compound v3 USDC deposit. Reads allowance via viem and returns prepared calls (approve + supply, or supply only).",
        {
          amount: z.string().describe("USDC amount, decimal string e.g. '10'"),
          user: z
            .string()
            .regex(/^0x[a-fA-F0-9]{40}$/)
            .describe("User EOA / smart-account address"),
          chainId: z.coerce.number().int().describe("Chain id, e.g. 11155111 for Sepolia"),
        },
        async (args) => {
          const prepared = await prepareDeposit({
            amount: args.amount,
            user: args.user as `0x${string}`,
            chainId: args.chainId,
            publicClient: ctx.publicClient,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(prepared) }],
          };
        },
      ),
    ],
  });
}

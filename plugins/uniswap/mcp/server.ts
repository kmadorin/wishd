import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { PluginCtx } from "@wishd/plugin-sdk";
import { prepareSwap } from "../prepare";
import { uniswapStrategies, publicClientFor } from "../../../apps/web/server/uniswapClients";
import { CHAIN_ID_BY_SLUG } from "../intents";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

const inputSchema = {
  amount:      z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/).describe("Decimal amount, e.g. '0.1'"),
  assetIn:     z.string().describe("Source token symbol (e.g. ETH, USDC)"),
  assetOut:    z.string().describe("Destination token symbol"),
  chain:       z.string().describe("Chain slug (ethereum-sepolia, base, ...)"),
  user:        z.string().regex(ADDR).describe("Swapper EOA / smart-account address"),
  chainId:     z.coerce.number().int().describe("Chain id (e.g. 8453 for Base)"),
  slippageBps: z.number().optional().default(50),
};

export function createUniswapMcp(_ctx: PluginCtx) {
  return createSdkMcpServer({
    name: "uniswap",
    version: "0.0.0",
    tools: [
      tool(
        "prepare_swap",
        "Prepare a Uniswap swap. Returns SwapPrepared (config, initialQuote, approvalCall, balance, insufficient, keeperOffers).",
        inputSchema,
        async (args) => {
          const chainId = args.chainId ?? CHAIN_ID_BY_SLUG[args.chain]!;
          const prepared = await prepareSwap({
            values: { amount: args.amount, assetIn: args.assetIn, assetOut: args.assetOut, chain: args.chain },
            address: args.user as `0x${string}`,
            slippageBps: args.slippageBps,
            strategies: uniswapStrategies(chainId),
            publicClient: publicClientFor(chainId),
          });
          return { content: [{ type: "text", text: JSON.stringify(prepared) }] };
        },
      ),
    ],
  });
}

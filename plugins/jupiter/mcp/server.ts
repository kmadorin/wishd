import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { isSvmCtx, type PluginCtx } from "@wishd/plugin-sdk";
import { prepareSwap } from "../prepare";

const inputSchema = {
  amount: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/).describe("Decimal amount, e.g. '0.1'"),
  assetIn: z.string().describe("Source token symbol (e.g. SOL, USDC)"),
  assetOut: z.string().describe("Destination token symbol"),
  chain: z.string().describe("CAIP-2 chain id (Solana mainnet only)"),
  slippage: z.string().optional().default("0.5%").describe("Slippage: '0.1%', '0.5%', '1%', or 'auto'"),
  swapper: z.string().describe("Swapper Solana wallet address (base58)"),
};

function serialize(prepared: unknown): string {
  return JSON.stringify(prepared, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function createJupiterMcp(ctx: PluginCtx) {
  if (!isSvmCtx(ctx)) throw new Error("jupiter requires an SVM ctx");
  return createSdkMcpServer({
    name: "jupiter",
    version: "0.0.0",
    tools: [
      tool(
        "prepare_swap",
        "Prepare a Jupiter swap. Returns Prepared<JupiterSwapExtras>: { config, initialQuote, calls (one SvmTxCall), balance, insufficient, decimalsIn, decimalsOut, keeperOffers, staleAfter }.",
        inputSchema,
        async (args) => {
          const prepared = await prepareSwap({
            values: {
              amount: args.amount,
              assetIn: args.assetIn,
              assetOut: args.assetOut,
              chain: args.chain,
              slippage: args.slippage ?? "0.5%",
            },
            swapper: args.swapper,
            rpc: ctx.rpc,
          });
          return { content: [{ type: "text", text: serialize(prepared) }] };
        },
      ),
    ],
  });
}

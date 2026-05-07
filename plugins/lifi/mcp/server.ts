// plugins/lifi/mcp/server.ts
// MCP server exposing prepare_bridge_swap + get_bridge_status tools.
// Mirror of plugins/uniswap/mcp/server.ts — uses deps injection instead of PluginCtx
// to avoid coupling the plugin package to apps/web.

import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { prepareBridgeSwap } from "../prepare";
import type { ServerDeps } from "../_serverClients";

const prepareInputSchema = {
  amount: z.string().describe("Decimal amount, e.g. '10'"),
  assetIn: z.string().describe("Source token symbol (e.g. ETH, USDC)"),
  fromChain: z.string().describe("Source chain CAIP-2 (e.g. eip155:1, eip155:8453)"),
  assetOut: z.string().describe("Destination token symbol (e.g. SOL, USDC)"),
  toChain: z.string().describe("Destination chain CAIP-2 (e.g. solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp)"),
  slippage: z.string().optional().describe("Slippage tolerance e.g. '0.5%'"),
  fromAddress: z.string().describe("Source EVM wallet address (0x...)"),
  toAddress: z.string().describe("Destination wallet address"),
};

const statusInputSchema = {
  txHash: z.string().describe("Source transaction hash"),
  fromChain: z.union([z.string(), z.number()]).describe("Source chain ID or CAIP-2"),
  toChain: z.union([z.string(), z.number()]).describe("Destination chain ID or CAIP-2"),
};

/**
 * Create the Li.Fi MCP server.
 *
 * Accepts `deps` (lifiFetch + evmPublicClientFor) instead of a PluginCtx so
 * the plugin package stays decoupled from apps/web. The MCP server wires real
 * implementations from apps/web/server/lifiClients when mounted.
 */
export function createLifiMcp(deps: ServerDeps) {
  return createSdkMcpServer({
    name: "lifi",
    version: "0.0.0",
    tools: [
      tool(
        "prepare_bridge_swap",
        "Prepare a Li.Fi bridge-swap. Validates input, resolves assets, fetches a Li.Fi /quote, and returns LifiBridgePrepared with calls (+ optional approval call), observations, and quote metadata.",
        prepareInputSchema,
        async (args) => {
          const prepared = await prepareBridgeSwap(
            {
              amount: args.amount,
              assetIn: args.assetIn,
              fromChain: args.fromChain,
              assetOut: args.assetOut,
              toChain: args.toChain,
              slippage: args.slippage,
              fromAddress: args.fromAddress,
              toAddress: args.toAddress,
            },
            deps,
          );
          return { content: [{ type: "text", text: JSON.stringify(prepared, (_k, v) => typeof v === "bigint" ? v.toString() : v) }] };
        },
      ),
      tool(
        "get_bridge_status",
        "Read-only proxy to Li.Fi /status. Returns the current status of a bridge transaction by source txHash. Used for ad-hoc agent inspection of in-flight bridges.",
        statusInputSchema,
        async ({ txHash, fromChain, toChain }) => {
          // Local stub: calls lifiFetch("/status", ...). Task 11 will rewire to
          // import fetchLifiStatus from ../observe.ts after that module ships.
          const status = await deps.lifiFetch("/status", {
            search: { txHash, fromChain: String(fromChain), toChain: String(toChain) },
          });
          return { content: [{ type: "text", text: JSON.stringify(status) }] };
        },
      ),
    ],
  });
}

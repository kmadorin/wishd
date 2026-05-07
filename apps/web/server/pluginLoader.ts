import { compoundV3 } from "@wishd/plugin-compound-v3";
import { uniswap }    from "@wishd/plugin-uniswap";
import { demoStubs }  from "@wishd/plugin-demo-stubs";
import { jupiter, buildRefreshHandler as buildJupiterRefreshHandler } from "@wishd/plugin-jupiter";
import { lifi, buildRefreshHandler as buildLifiRefreshHandler, setServerDeps as setLifiServerDeps } from "@wishd/plugin-lifi";
import type { Plugin } from "@wishd/plugin-sdk";
import { registerPluginTool } from "@wishd/plugin-sdk/routes";
import { solanaRpcFor } from "./jupiterClients";
import { lifiFetch, evmPublicClientFor } from "./lifiClients";

let registered = false;
function registerPluginRoutes(): void {
  if (registered) return;
  registered = true;

  // Jupiter refresh handler (uses Jupiter REST directly, no extra deps needed)
  const jupiterHandler = buildJupiterRefreshHandler();
  registerPluginTool("jupiter", "refresh_swap", async (body) => {
    void solanaRpcFor; // server has access if needed; refresh runs Jupiter REST only
    const prepared = await jupiterHandler(body);
    // Coerce bigints (lastValidBlockHeight) to strings for JSON.stringify route response.
    return JSON.parse(JSON.stringify(prepared, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  });

  // Li.Fi: inject real server deps so the MCP server (createLifiMcp) and the
  // refresh handler both resolve real impls at call time.
  setLifiServerDeps({ lifiFetch, evmPublicClientFor });
  const lifiHandler = buildLifiRefreshHandler({ lifiFetch, evmPublicClientFor });
  registerPluginTool("lifi", "refresh_quote", async (body) => {
    return lifiHandler(body);
  });
}

export type LoadedPlugins = {
  plugins: Plugin[];
  widgetTypes: string[];
  allowedTools: string[];
  mcpNames: string[];
};

export async function loadPlugins(): Promise<LoadedPlugins> {
  registerPluginRoutes();
  const plugins: Plugin[] = [compoundV3, uniswap, demoStubs, jupiter, lifi];
  const widgetTypes = plugins.flatMap((p) => Object.keys(p.widgets));
  const mcpNames = plugins.flatMap((p) => p.manifest.provides.mcps);
  const allowedTools = ["mcp__widget__*", "mcp__keeperhub__*", "mcp__wishd_keepers__*", ...mcpNames.map((n) => `mcp__${n}__*`)];
  return { plugins, widgetTypes, allowedTools, mcpNames };
}

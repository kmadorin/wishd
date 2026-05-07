import { compoundV3 } from "@wishd/plugin-compound-v3";
import { uniswap }    from "@wishd/plugin-uniswap";
import { demoStubs }  from "@wishd/plugin-demo-stubs";
import { jupiter, buildRefreshHandler } from "@wishd/plugin-jupiter";
import type { Plugin } from "@wishd/plugin-sdk";
import { registerPluginTool } from "@wishd/plugin-sdk/routes";
import { solanaRpcFor } from "./jupiterClients";

let registered = false;
function registerJupiterRoutes(): void {
  if (registered) return;
  registered = true;
  const handler = buildRefreshHandler();
  registerPluginTool("jupiter", "refresh_swap", async (body) => {
    void solanaRpcFor; // server has access if needed; refresh runs Jupiter REST only
    const prepared = await handler(body);
    // Coerce bigints (lastValidBlockHeight) to strings for JSON.stringify route response.
    return JSON.parse(JSON.stringify(prepared, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  });
}

export type LoadedPlugins = {
  plugins: Plugin[];
  widgetTypes: string[];
  allowedTools: string[];
  mcpNames: string[];
};

export async function loadPlugins(): Promise<LoadedPlugins> {
  registerJupiterRoutes();
  const plugins: Plugin[] = [compoundV3, uniswap, demoStubs, jupiter];
  const widgetTypes = plugins.flatMap((p) => Object.keys(p.widgets));
  const mcpNames = plugins.flatMap((p) => p.manifest.provides.mcps);
  const allowedTools = ["mcp__widget__*", "mcp__keeperhub__*", "mcp__wishd_keepers__*", ...mcpNames.map((n) => `mcp__${n}__*`)];
  return { plugins, widgetTypes, allowedTools, mcpNames };
}

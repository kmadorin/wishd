import { compoundV3 } from "@wishd/plugin-compound-v3";
import type { Plugin } from "@wishd/plugin-sdk";

export type LoadedPlugins = {
  plugins: Plugin[];
  widgetTypes: string[];
  allowedTools: string[];
  mcpNames: string[];
};

export async function loadPlugins(): Promise<LoadedPlugins> {
  const plugins: Plugin[] = [compoundV3];
  const widgetTypes = plugins.flatMap((p) => Object.keys(p.widgets));
  const mcpNames = plugins.flatMap((p) => p.manifest.provides.mcps);
  const allowedTools = ["mcp__widget__*", ...mcpNames.map((n) => `mcp__${n}__*`)];
  return { plugins, widgetTypes, allowedTools, mcpNames };
}

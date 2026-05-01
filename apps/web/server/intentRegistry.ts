import type { IntentSchema, Plugin } from "@wishd/plugin-sdk";
import { loadPlugins } from "./pluginLoader";

export function buildIntentRegistry(plugins: Plugin[]): Map<string, IntentSchema> {
  const reg = new Map<string, IntentSchema>();
  for (const p of plugins) {
    for (const s of p.intents ?? []) {
      if (reg.has(s.intent)) {
        throw new Error(`duplicate intent id: ${s.intent}`);
      }
      reg.set(s.intent, s);
    }
  }
  return reg;
}

let cached: Promise<Map<string, IntentSchema>> | null = null;

async function registry(): Promise<Map<string, IntentSchema>> {
  if (!cached) {
    cached = loadPlugins().then(({ plugins }) => buildIntentRegistry(plugins));
  }
  return cached;
}

export async function getIntentSchema(id: string): Promise<IntentSchema | undefined> {
  return (await registry()).get(id);
}

export async function listIntents(): Promise<IntentSchema[]> {
  return [...(await registry()).values()];
}

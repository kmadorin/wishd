import type { IntentSchema } from "@wishd/plugin-sdk";
import { compoundIntents } from "@plugins/compound-v3/intents";
import { uniswapIntents }  from "@plugins/uniswap/intents";
import { jupiterIntents }  from "@plugins/jupiter/intents";
import { lifiIntents }     from "@plugins/lifi/intents";

export type RegisteredIntent = {
  schema: IntentSchema;
  pluginName: string;
};

const sources: Array<{ pluginName: string; schemas: IntentSchema[] }> = [
  { pluginName: "compound-v3", schemas: compoundIntents },
  { pluginName: "uniswap",     schemas: uniswapIntents },
  { pluginName: "jupiter",     schemas: jupiterIntents },
  { pluginName: "lifi",        schemas: lifiIntents },
];

export const CLIENT_INTENT_REGISTRY: Map<string, RegisteredIntent[]> = (() => {
  const m = new Map<string, RegisteredIntent[]>();
  for (const { pluginName, schemas } of sources) {
    for (const schema of schemas) {
      const arr = m.get(schema.verb) ?? [];
      arr.push({ schema, pluginName });
      m.set(schema.verb, arr);
    }
  }
  return m;
})();

// Back-compat flat array — used by anything that currently iterates schemas.
export const CLIENT_INTENT_SCHEMAS: IntentSchema[] =
  [...CLIENT_INTENT_REGISTRY.values()].flat().map((r) => r.schema);

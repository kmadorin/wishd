import type { IntentSchema } from "@wishd/plugin-sdk";
import { compoundIntents } from "@plugins/compound-v3/intents";
import { uniswapIntents }  from "@plugins/uniswap/intents";

export const CLIENT_INTENT_SCHEMAS: IntentSchema[] = [...compoundIntents, ...uniswapIntents];

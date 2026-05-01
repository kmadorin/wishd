import type { IntentSchema } from "@wishd/plugin-sdk";
import { compoundIntents } from "@plugins/compound-v3/intents";

export const CLIENT_INTENT_SCHEMAS: IntentSchema[] = [...compoundIntents];

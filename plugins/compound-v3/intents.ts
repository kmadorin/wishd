import type { IntentSchema } from "@wishd/plugin-sdk";

const sharedFields: IntentSchema["fields"] = [
  { key: "amount", type: "amount", required: true, default: "10" },
  { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
  { key: "chain", type: "chain", required: true, default: "ethereum-sepolia", options: ["ethereum-sepolia"] },
];

const sharedConnectors: NonNullable<IntentSchema["connectors"]> = {
  chain: "on",
};

export const compoundIntents: IntentSchema[] = [
  {
    intent: "compound-v3.deposit",
    verb: "deposit",
    description: "supply tokens to earn yield",
    fields: sharedFields,
    connectors: sharedConnectors,
    widget: "compound-summary",
    slot: "flow",
  },
  {
    intent: "compound-v3.withdraw",
    verb: "withdraw",
    description: "redeem tokens you previously supplied",
    fields: sharedFields,
    connectors: sharedConnectors,
    widget: "compound-withdraw-summary",
    slot: "flow",
  },
];

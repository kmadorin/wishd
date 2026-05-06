import { type IntentSchema, EIP155 } from "@wishd/plugin-sdk";

const CAIP2_SEPOLIA = EIP155(11155111);

const sharedFields: IntentSchema["fields"] = [
  { key: "amount", type: "amount", required: true, default: "10" },
  { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC"] },
  { key: "chain", type: "chain", required: true, default: CAIP2_SEPOLIA, options: [CAIP2_SEPOLIA] },
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
  {
    intent: "compound-v3.lend",
    verb: "lend",
    description: "supply tokens to earn yield",
    fields: [
      { key: "amount",   type: "amount",  required: true,  default: "10" },
      { key: "asset",    type: "asset",   required: true,  default: "USDC", options: ["USDC"] },
      { key: "protocol", type: "select",  required: true,  default: "compound-v3", options: ["compound-v3", "aave-v3", "morpho", "spark"] },
      { key: "chain",    type: "chain",   required: true,  default: CAIP2_SEPOLIA, options: [CAIP2_SEPOLIA] },
    ],
    connectors: { protocol: "on", chain: "·" },
    widget: "compound-summary", // overridden by dispatcher when protocol != compound-v3
    slot: "flow",
  },
];

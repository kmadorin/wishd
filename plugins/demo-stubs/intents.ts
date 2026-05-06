import { type IntentSchema, EIP155 } from "@wishd/plugin-sdk";

const chainOptions = [
  EIP155(11155111), // ethereum-sepolia
  EIP155(1),        // ethereum
  EIP155(8453),     // base
  EIP155(42161),    // arbitrum
  EIP155(10),       // optimism
  EIP155(137),      // polygon
];

export const demoIntents: IntentSchema[] = [
  {
    intent: "demo.borrow",
    verb: "borrow",
    description: "against collateral",
    fields: [
      { key: "amount", type: "amount", required: true, default: "0.05" },
      { key: "asset", type: "asset", required: true, default: "ETH", options: ["ETH", "USDC", "WBTC"] },
      { key: "collateral", type: "asset", required: true, default: "USDC", options: ["USDC", "ETH", "DAI"] },
      { key: "protocol", type: "select", required: true, default: "aave-v3", options: ["aave-v3", "compound-v3", "euler", "morpho"] },
      { key: "chain", type: "chain", required: true, default: EIP155(11155111), options: chainOptions },
    ],
    connectors: { collateral: "against", protocol: "on", chain: "·" },
    widget: "borrow-demo",
    slot: "flow",
  },
  {
    intent: "demo.earn",
    verb: "earn yield on",
    description: "auto-route best APY",
    fields: [
      { key: "amount", type: "amount", required: true, default: "100" },
      { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC", "DAI", "ETH"] },
      { key: "chain", type: "chain", required: true, default: EIP155(11155111), options: chainOptions },
    ],
    connectors: { chain: "on" },
    widget: "earn-demo",
    slot: "flow",
  },
  {
    intent: "demo.bridge",
    verb: "bridge",
    description: "cross-chain transfer",
    fields: [
      { key: "amount", type: "amount", required: true, default: "0.05" },
      { key: "asset", type: "asset", required: true, default: "ETH", options: ["ETH", "USDC", "WBTC"] },
      { key: "fromChain", type: "chain", required: true, default: EIP155(1), options: chainOptions },
      { key: "toChain", type: "chain", required: true, default: EIP155(8453), options: chainOptions },
    ],
    connectors: { fromChain: "from", toChain: "to" },
    widget: "bridge-demo",
    slot: "flow",
  },
  {
    intent: "demo.find-vault",
    verb: "find vault for",
    description: "best risk-adjusted yield",
    fields: [
      { key: "asset", type: "asset", required: true, default: "USDC", options: ["USDC", "DAI", "ETH"] },
      { key: "chain", type: "chain", required: true, default: EIP155(11155111), options: chainOptions },
    ],
    connectors: { chain: "on" },
    widget: "earn-demo",
    slot: "flow",
  },
];

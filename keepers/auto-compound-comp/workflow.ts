import type { KhWorkflowJson, WorkflowParams } from "@wishd/plugin-sdk";
import {
  COMET_REWARDS_SEPOLIA, COMP_SEPOLIA, USDC_SEPOLIA,
  COMET_USDC_SEPOLIA, UNISWAP_ROUTER_SEPOLIA, SEPOLIA_CHAIN_ID,
} from "./addresses";

const NETWORK = String(SEPOLIA_CHAIN_ID);

// Verbatim ABI snippets used by the workflow nodes — must match the demo workflow.
const ABI_BASE_TOKEN =
  '[{"inputs":[],"name":"baseToken","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"}]';

const ABI_TOTALS_BASIC =
  '[{"inputs":[],"name":"totalsBasic","outputs":[{"name":"baseSupplyIndex","type":"uint64"},{"name":"baseBorrowIndex","type":"uint64"},{"name":"trackingSupplyIndex","type":"uint64"},{"name":"trackingBorrowIndex","type":"uint64"},{"name":"totalSupplyBase","type":"uint104"},{"name":"totalBorrowBase","type":"uint104"},{"name":"lastAccrualTime","type":"uint40"},{"name":"pauseFlags","type":"uint8"}],"stateMutability":"view","type":"function"}]';

const ABI_USER_BASIC =
  '[{"inputs":[{"name":"account","type":"address"}],"name":"userBasic","outputs":[{"name":"principal","type":"int104"},{"name":"baseTrackingIndex","type":"uint64"},{"name":"baseTrackingAccrued","type":"uint64"},{"name":"assetsIn","type":"uint16"},{"name":"_reserved","type":"uint8"}],"stateMutability":"view","type":"function"}]';

const ABI_BASE_TRACKING_SUPPLY_SPEED =
  '[{"inputs":[],"name":"baseTrackingSupplySpeed","outputs":[{"name":"","type":"uint64"}],"stateMutability":"view","type":"function"}]';

const ABI_CLAIM =
  '[{"inputs":[{"name":"comet","type":"address"},{"name":"src","type":"address"},{"name":"shouldAccrue","type":"bool"}],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"}]';

const ABI_EXACT_INPUT_SINGLE =
  '[{"inputs":[{"components":[{"name":"tokenIn","type":"address"},{"name":"tokenOut","type":"address"},{"name":"fee","type":"uint24"},{"name":"recipient","type":"address"},{"name":"amountIn","type":"uint256"},{"name":"amountOutMinimum","type":"uint256"},{"name":"sqrtPriceLimitX96","type":"uint160"}],"name":"params","type":"tuple"}],"name":"exactInputSingle","outputs":[{"name":"amountOut","type":"uint256"}],"stateMutability":"payable","type":"function"}]';

const ABI_SUPPLY =
  '[{"inputs":[{"name":"asset","type":"address"},{"name":"amount","type":"uint256"}],"name":"supply","outputs":[],"stateMutability":"nonpayable","type":"function"}]';

const ABI_APPROVE =
  '[{"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]';

export function buildWorkflow({ userPortoAddress, permissionsId }: WorkflowParams): KhWorkflowJson {
  return {
    name: `wishd:auto-compound-comp:${userPortoAddress}`,
    description: "wishd-managed auto-compound for Compound V3 Sepolia",
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          type: "trigger",
          label: "Schedule",
          config: { cron: "0 * * * *", enabled: false, actionType: "schedule" },
          status: "idle",
        },
      },
      {
        id: "baseToken",
        type: "action",
        position: { x: 252, y: 0 },
        data: {
          type: "action",
          label: "Get Base Token",
          config: {
            abi: ABI_BASE_TOKEN,
            network: NETWORK,
            actionType: "web3/read-contract",
            abiFunction: "baseToken",
            functionArgs: "[]",
            contractAddress: COMET_USDC_SEPOLIA,
          },
          status: "idle",
        },
      },
      {
        id: "batchReads",
        type: "action",
        position: { x: 504, y: 0 },
        data: {
          type: "action",
          label: "Read Comet State",
          config: {
            calls: JSON.stringify([
              {
                network: NETWORK,
                contractAddress: COMET_USDC_SEPOLIA,
                abiFunction: "totalsBasic",
                abi: ABI_TOTALS_BASIC,
                args: [],
              },
              {
                network: NETWORK,
                contractAddress: COMET_USDC_SEPOLIA,
                abiFunction: "userBasic",
                abi: ABI_USER_BASIC,
                args: [userPortoAddress],
              },
              {
                network: NETWORK,
                contractAddress: COMET_USDC_SEPOLIA,
                abiFunction: "baseTrackingSupplySpeed",
                abi: ABI_BASE_TRACKING_SUPPLY_SPEED,
                args: [],
              },
            ]),
            inputMode: "mixed",
            actionType: "web3/batch-read-contract",
          },
          status: "idle",
        },
      },
      {
        id: "cond",
        type: "action",
        position: { x: 756, y: 0 },
        data: {
          type: "action",
          label: "Owed > 0.0001 COMP",
          config: {
            condition:
              "({{@batchReads:Read Comet State.results[1].result.baseTrackingAccrued}} + {{@batchReads:Read Comet State.results[1].result.principal}} * {{@batchReads:Read Comet State.results[0].result.baseSupplyIndex}} * ({{@batchReads:Read Comet State.results[0].result.trackingSupplyIndex}} + {{@batchReads:Read Comet State.results[2].result}} * ({{@__system:System.unixTimestamp}} - {{@batchReads:Read Comet State.results[0].result.lastAccrualTime}}) * 1000000 / {{@batchReads:Read Comet State.results[0].result.totalSupplyBase}} - {{@batchReads:Read Comet State.results[1].result.baseTrackingIndex}}) / 1000000000000000 / 1000000000000000) * 1000000000000 > 100000000000000",
            actionType: "Condition",
          },
          status: "idle",
        },
      },
      {
        id: "claim",
        type: "action",
        position: { x: 1008, y: 0 },
        data: {
          type: "action",
          label: "Claim COMP (Porto)",
          config: {
            abi: ABI_CLAIM,
            network: NETWORK,
            feeToken: "ETH",
            actionType: "porto/execute-call",
            abiFunction: "claim",
            functionArgs: JSON.stringify([COMET_USDC_SEPOLIA, userPortoAddress, true]),
            permissionsId,
            contractAddress: COMET_REWARDS_SEPOLIA,
            userPortoAddress,
            waitForInclusion: "true",
          },
          status: "idle",
        },
      },
      {
        id: "compBal",
        type: "action",
        position: { x: 1260, y: 0 },
        data: {
          type: "action",
          label: "COMP Balance (user)",
          config: {
            address: userPortoAddress,
            network: NETWORK,
            actionType: "web3/check-token-balance",
            tokenConfig: JSON.stringify({ mode: "custom", customToken: { address: COMP_SEPOLIA, symbol: "COMP" } }),
          },
          status: "idle",
        },
      },
      {
        id: "swap",
        type: "action",
        position: { x: 1512, y: 0 },
        data: {
          type: "action",
          label: "Approve+Swap COMP -> USDC (Porto atomic)",
          config: {
            abi: ABI_EXACT_INPUT_SINGLE,
            network: NETWORK,
            feeToken: "ETH",
            actionType: "porto/execute-call",
            abiFunction: "exactInputSingle",
            functionArgs: JSON.stringify([
              [
                COMP_SEPOLIA,
                USDC_SEPOLIA,
                3000,
                userPortoAddress,
                "{{@compBal:COMP Balance (user).balance.balanceRaw}}",
                "0",
                "0",
              ],
            ]),
            prependCalls: JSON.stringify([
              {
                to: COMP_SEPOLIA,
                abi: ABI_APPROVE,
                abiFunction: "approve",
                functionArgs: JSON.stringify([
                  UNISWAP_ROUTER_SEPOLIA,
                  "{{@compBal:COMP Balance (user).balance.balanceRaw}}",
                ]),
              },
            ]),
            permissionsId,
            contractAddress: UNISWAP_ROUTER_SEPOLIA,
            userPortoAddress,
            waitForInclusion: "true",
          },
          status: "idle",
        },
      },
      {
        id: "usdcBal",
        type: "action",
        position: { x: 1764, y: 0 },
        data: {
          type: "action",
          label: "USDC Balance (user)",
          config: {
            address: userPortoAddress,
            network: NETWORK,
            actionType: "web3/check-token-balance",
            tokenConfig: JSON.stringify({ mode: "custom", customToken: { address: USDC_SEPOLIA, symbol: "USDC" } }),
          },
          status: "idle",
        },
      },
      {
        id: "supply",
        type: "action",
        position: { x: 2016, y: 0 },
        data: {
          type: "action",
          label: "Approve+Supply USDC (Porto atomic)",
          config: {
            abi: ABI_SUPPLY,
            network: NETWORK,
            feeToken: "ETH",
            actionType: "porto/execute-call",
            abiFunction: "supply",
            functionArgs: JSON.stringify([USDC_SEPOLIA, "{{@usdcBal:USDC Balance (user).balance.balanceRaw}}"]),
            prependCalls: JSON.stringify([
              {
                to: USDC_SEPOLIA,
                abi: ABI_APPROVE,
                abiFunction: "approve",
                functionArgs: JSON.stringify([
                  COMET_USDC_SEPOLIA,
                  "{{@usdcBal:USDC Balance (user).balance.balanceRaw}}",
                ]),
              },
            ]),
            permissionsId,
            contractAddress: COMET_USDC_SEPOLIA,
            userPortoAddress,
            waitForInclusion: "true",
          },
          status: "idle",
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "baseToken" },
      { id: "e2", source: "baseToken", target: "batchReads" },
      { id: "e3", source: "batchReads", target: "cond" },
      { id: "e4", source: "cond", target: "claim", sourceHandle: "true" },
      { id: "e5", source: "claim", target: "compBal" },
      { id: "e6", source: "compBal", target: "swap" },
      { id: "e7", source: "swap", target: "usdcBal" },
      { id: "e8", source: "usdcBal", target: "supply" },
    ],
  };
}

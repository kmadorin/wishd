import type { Address, PublicClient } from "viem";
import { COMPOUND_ADDRESSES } from "@plugins/compound-v3/addresses";
import {
  prepareDeposit,
  prepareWithdraw,
  type PreparedDeposit,
  type PreparedWithdraw,
} from "@plugins/compound-v3/prepare";
import { getIntentSchema } from "./intentRegistry";

export type DispatchInput = {
  body: Record<string, unknown>;
  publicClient: Pick<PublicClient, "readContract">;
};

export type DispatchOutput = {
  prepared: PreparedDeposit | PreparedWithdraw;
  widget: { id: string; type: string; slot: "flow"; props: Record<string, unknown> };
};

const CHAIN_TO_ID: Record<string, number> = { "ethereum-sepolia": 11155111 };

function newWidgetId(): string {
  return `w_${Math.random().toString(36).slice(2, 10)}`;
}

function requireAmount(body: Record<string, unknown>): string {
  const a = body.amount;
  if (typeof a !== "string" || a.trim() === "") throw new Error("amount required (string)");
  return a;
}

function requireAddress(body: Record<string, unknown>): Address {
  const a = body.address;
  if (typeof a !== "string" || !a.startsWith("0x")) throw new Error("address required (0x...)");
  return a as Address;
}

function requireChainId(body: Record<string, unknown>): number {
  const c = body.chain;
  if (typeof c !== "string" || !(c in CHAIN_TO_ID)) throw new Error(`unsupported chain: ${String(c)}`);
  return CHAIN_TO_ID[c]!;
}

export async function dispatchIntent(
  intent: string,
  input: DispatchInput,
): Promise<DispatchOutput> {
  const schema = await getIntentSchema(intent);
  if (!schema) throw new Error(`unknown intent: ${intent}`);

  const amount = requireAmount(input.body);
  const user = requireAddress(input.body);
  const chainId = requireChainId(input.body);

  if (intent === "compound-v3.deposit") {
    const prepared = await prepareDeposit({
      amount,
      user,
      chainId,
      publicClient: input.publicClient,
    });
    const addrs = COMPOUND_ADDRESSES[chainId]!;
    return {
      prepared,
      widget: {
        id: newWidgetId(),
        type: schema.widget,
        slot: "flow",
        props: {
          amount,
          asset: "USDC",
          market: "cUSDCv3",
          needsApprove: prepared.meta.needsApprove,
          summaryId: newWidgetId(),
          amountWei: prepared.meta.amountWei,
          chainId,
          user,
          comet: addrs.Comet,
          usdc: addrs.USDC,
          calls: prepared.calls,
          balance: prepared.meta.balance,
          insufficient: prepared.meta.insufficient,
        },
      },
    };
  }

  if (intent === "compound-v3.withdraw") {
    const prepared = await prepareWithdraw({
      amount,
      user,
      chainId,
      publicClient: input.publicClient,
    });
    const addrs = COMPOUND_ADDRESSES[chainId]!;
    return {
      prepared,
      widget: {
        id: newWidgetId(),
        type: schema.widget,
        slot: "flow",
        props: {
          amount,
          asset: "USDC",
          market: "cUSDCv3",
          summaryId: newWidgetId(),
          amountWei: prepared.meta.amountWei,
          chainId,
          user,
          comet: addrs.Comet,
          usdc: addrs.USDC,
          calls: prepared.calls,
          supplied: prepared.meta.supplied,
          insufficient: prepared.meta.insufficient,
        },
      },
    };
  }

  throw new Error(`unknown intent: ${intent}`);
}

import { encodeFunctionData, formatUnits, maxUint256, toHex, type Address, type PublicClient } from "viem";
import { parseUnits } from "viem";
import { EIP155 } from "@wishd/plugin-sdk";
import type { EvmCall, Prepared } from "@wishd/plugin-sdk";
import { COMPOUND_ADDRESSES, SUPPORTED_CHAINS } from "./addresses";
import { erc20Abi } from "./abis/erc20";
import { cometAbi } from "./abis/comet";

const USDC_DECIMALS = 6;
const COMPOUND_CHAIN_ID = 11155111 as const;

/** Tagged EVM call for Compound — value is bigint per EvmCall spec. */
function evmCall(to: Address, data: `0x${string}`): EvmCall {
  return {
    family: "evm",
    caip2: EIP155(COMPOUND_CHAIN_ID),
    to,
    data,
    value: 0n,
  };
}

export type DepositMeta = {
  needsApprove: boolean;
  amountWei: `0x${string}`;
  asset: "USDC";
  market: "cUSDCv3";
  chainId: number;
  user: Address;
  balanceWei: `0x${string}`;
  balance: string;
  insufficient: boolean;
};

export type CompoundDepositExtras = {
  meta: DepositMeta;
};

export type PreparedDeposit = Prepared<CompoundDepositExtras>;

export type WithdrawMeta = {
  amountWei: `0x${string}`;
  asset: "USDC";
  market: "cUSDCv3";
  chainId: number;
  user: Address;
  suppliedWei: `0x${string}`;
  supplied: string;
  insufficient: boolean;
};

export type CompoundWithdrawExtras = {
  meta: WithdrawMeta;
};

export type PreparedWithdraw = Prepared<CompoundWithdrawExtras>;

export type PrepareDepositInput = {
  amount: string;
  user: Address;
  chainId: number;
  publicClient: Pick<PublicClient, "readContract">;
};

export async function prepareDeposit(input: PrepareDepositInput): Promise<PreparedDeposit> {
  const { amount, user, chainId, publicClient } = input;

  if (!SUPPORTED_CHAINS.includes(chainId as 11155111)) {
    throw new Error(`unsupported chain: ${chainId}`);
  }

  const addrs = COMPOUND_ADDRESSES[chainId]!;
  const amountWei = parseUnits(amount, USDC_DECIMALS);

  const [allowance, balance] = (await Promise.all([
    publicClient.readContract({
      address: addrs.USDC,
      abi: erc20Abi,
      functionName: "allowance",
      args: [user, addrs.Comet],
    }),
    publicClient.readContract({
      address: addrs.USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [user],
    }),
  ])) as [bigint, bigint];

  const needsApprove = allowance < amountWei;
  const insufficient = balance < amountWei;

  const calls: EvmCall[] = [];

  if (needsApprove) {
    calls.push(evmCall(
      addrs.USDC,
      encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [addrs.Comet, maxUint256] }),
    ));
  }

  calls.push(evmCall(
    addrs.Comet,
    encodeFunctionData({ abi: cometAbi, functionName: "supply", args: [addrs.USDC, amountWei] }),
  ));

  return {
    calls,
    meta: {
      needsApprove,
      amountWei: toHex(amountWei),
      asset: "USDC",
      market: "cUSDCv3",
      chainId,
      user,
      balanceWei: toHex(balance),
      balance: formatUnits(balance, USDC_DECIMALS),
      insufficient,
    },
  } satisfies PreparedDeposit;
}

export type PrepareWithdrawInput = PrepareDepositInput;

export async function prepareWithdraw(input: PrepareWithdrawInput): Promise<PreparedWithdraw> {
  const { amount, user, chainId, publicClient } = input;

  if (!SUPPORTED_CHAINS.includes(chainId as 11155111)) {
    throw new Error(`unsupported chain: ${chainId}`);
  }

  const addrs = COMPOUND_ADDRESSES[chainId]!;
  const amountWei = parseUnits(amount, USDC_DECIMALS);

  const supplied = (await publicClient.readContract({
    address: addrs.Comet,
    abi: cometAbi,
    functionName: "balanceOf",
    args: [user],
  })) as bigint;

  const insufficient = supplied < amountWei;

  const calls: EvmCall[] = [
    evmCall(
      addrs.Comet,
      encodeFunctionData({ abi: cometAbi, functionName: "withdraw", args: [addrs.USDC, amountWei] }),
    ),
  ];

  return {
    calls,
    meta: {
      amountWei: toHex(amountWei),
      asset: "USDC",
      market: "cUSDCv3",
      chainId,
      user,
      suppliedWei: toHex(supplied),
      supplied: formatUnits(supplied, USDC_DECIMALS),
      insufficient,
    },
  } satisfies PreparedWithdraw;
}

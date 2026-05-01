import { encodeFunctionData, formatUnits, maxUint256, toHex, type Address, type PublicClient } from "viem";
import { parseUnits } from "viem";
import { COMPOUND_ADDRESSES, SUPPORTED_CHAINS } from "./addresses";
import { erc20Abi } from "./abis/erc20";
import { cometAbi } from "./abis/comet";

const USDC_DECIMALS = 6;

export type PreparedCall = {
  to: Address;
  data: `0x${string}`;
  value: `0x${string}`;
};

export type PreparedDeposit = {
  calls: PreparedCall[];
  meta: {
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
};

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

  const calls: PreparedCall[] = [];

  if (needsApprove) {
    calls.push({
      to: addrs.USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [addrs.Comet, maxUint256],
      }),
      value: "0x0",
    });
  }

  calls.push({
    to: addrs.Comet,
    data: encodeFunctionData({
      abi: cometAbi,
      functionName: "supply",
      args: [addrs.USDC, amountWei],
    }),
    value: "0x0",
  });

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
  };
}

export type PreparedWithdraw = {
  calls: PreparedCall[];
  meta: {
    amountWei: `0x${string}`;
    asset: "USDC";
    market: "cUSDCv3";
    chainId: number;
    user: Address;
    suppliedWei: `0x${string}`;
    supplied: string;
    insufficient: boolean;
  };
};

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

  const calls: PreparedCall[] = [
    {
      to: addrs.Comet,
      data: encodeFunctionData({
        abi: cometAbi,
        functionName: "withdraw",
        args: [addrs.USDC, amountWei],
      }),
      value: "0x0",
    },
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
  };
}

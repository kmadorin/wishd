"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useSendCalls,
  useWaitForCallsStatus,
  useReadContract,
} from "wagmi";
import type { Address } from "viem";

type Phase =
  | "connect"
  | "switch-chain"
  | "approve"
  | "approving"
  | "deposit"
  | "depositing"
  | "confirmed"
  | "error";

export type CompoundExecuteProps = {
  asset: string;
  market: string;
  amount: string;
  amountWei: string;
  chainId: number;
  user: Address;
  comet: Address;
  usdc: Address;
  calls: Array<{ to: Address; data: `0x${string}`; value: `0x${string}` }>;
  needsApprove: boolean;
};

const erc20AllowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function CompoundExecute(props: CompoundExecuteProps) {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const { sendCalls, data: sendData, error: sendError, isPending: sendPending } = useSendCalls();
  const { data: status } = useWaitForCallsStatus({ id: sendData?.id });
  const { data: liveAllowance, refetch: refetchAllowance } = useReadContract({
    address: props.usdc,
    abi: erc20AllowanceAbi,
    functionName: "allowance",
    args: address ? [address, props.comet] : undefined,
    query: { enabled: !!address },
  });

  const amountWei = BigInt(props.amountWei);
  const hasAllowance = (liveAllowance as bigint | undefined ?? 0n) >= amountWei;

  const [phase, setPhase] = useState<Phase>(() => initialPhase(isConnected, chainId === props.chainId, !!hasAllowance));
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) return setPhase("connect");
    if (chainId !== props.chainId) return setPhase("switch-chain");
    if (sendPending) return setPhase((p) => (p === "approve" ? "approving" : "depositing"));
    if (sendError) {
      setErrMsg(sendError.message);
      return setPhase("error");
    }
    if (status?.status === "success") {
      if (phase === "approving") {
        refetchAllowance();
        setPhase("deposit");
      } else if (phase === "depositing") {
        setPhase("confirmed");
      }
    }
  }, [isConnected, chainId, sendPending, sendError, status, phase, props.chainId, refetchAllowance]);

  const approveCall = useMemo(() => props.calls.find((c) => c.to === props.usdc), [props.calls, props.usdc]);
  const supplyCall = useMemo(() => props.calls.find((c) => c.to === props.comet), [props.calls, props.comet]);

  function onClick() {
    if (phase === "connect") {
      const c = connectors[0];
      if (c) connect({ connector: c });
      return;
    }
    if (phase === "switch-chain") {
      switchChain({ chainId: props.chainId });
      return;
    }
    if (phase === "approve" && approveCall) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendCalls({ calls: [approveCall] } as any);
      setPhase("approving");
      return;
    }
    if (phase === "deposit" && supplyCall) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendCalls({ calls: [supplyCall] } as any);
      setPhase("depositing");
      return;
    }
  }

  const label = labelFor(phase);
  const txHash = status?.receipts?.[0]?.transactionHash;

  return (
    <div>
      {phase === "confirmed" && txHash ? (
        <div className="rounded-sm bg-mint-2 border border-mint p-4 text-sm">
          <div className="font-semibold text-ink">deposited {props.amount} {props.asset} into {props.market}</div>
          <a
            className="text-accent underline mt-2 inline-block font-mono text-xs"
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={phase === "approving" || phase === "depositing"}
          className="w-full rounded-pill bg-accent text-ink py-3 font-semibold hover:bg-accent-2 disabled:opacity-50"
        >
          {label}
        </button>
      )}
      {phase === "error" && errMsg && <p className="mt-2 text-xs text-bad">{errMsg}</p>}
    </div>
  );
}

function initialPhase(connected: boolean, rightChain: boolean, hasAllowance: boolean): Phase {
  if (!connected) return "connect";
  if (!rightChain) return "switch-chain";
  return hasAllowance ? "deposit" : "approve";
}

function labelFor(p: Phase): string {
  switch (p) {
    case "connect": return "Connect Wallet";
    case "switch-chain": return "Switch Network";
    case "approve": return "Approve";
    case "approving": return "Approving…";
    case "deposit": return "Deposit";
    case "depositing": return "Depositing…";
    case "confirmed": return "Confirmed";
    case "error": return "Retry";
  }
}

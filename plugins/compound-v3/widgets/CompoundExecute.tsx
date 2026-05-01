"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useSendCalls,
  useWaitForCallsStatus,
  useConnectors,
} from "wagmi";
import type { Address } from "viem";

type Phase =
  | "connect"
  | "switch-chain"
  | "ready"
  | "submitting"
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

export function CompoundExecute(props: CompoundExecuteProps) {
  const { isConnected, chainId } = useAccount();
  const connectors = useConnectors();
  const portoConnector = connectors[0];
  const { connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const sendCalls = useSendCalls();
  const [bundleId, setBundleId] = useState<`0x${string}` | undefined>();
  const callsStatus = useWaitForCallsStatus({ id: bundleId });

  const [phase, setPhase] = useState<Phase>("ready");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setPhase("connect");
      return;
    }
    if (chainId !== props.chainId) {
      setPhase("switch-chain");
      return;
    }
    if (callsStatus.data?.status === "success") {
      setPhase("confirmed");
      return;
    }
    if (callsStatus.data?.status === "failure") {
      setPhase("error");
      setErrMsg("transaction failed");
      return;
    }
    if (sendCalls.isPending || (bundleId && callsStatus.isLoading)) {
      setPhase("submitting");
      return;
    }
    if (sendCalls.error) {
      setPhase("error");
      setErrMsg(sendCalls.error.message);
      return;
    }
    setPhase("ready");
  }, [
    isConnected,
    chainId,
    sendCalls.isPending,
    sendCalls.error,
    bundleId,
    callsStatus.data?.status,
    callsStatus.isLoading,
    props.chainId,
  ]);

  async function onClick() {
    setErrMsg(null);
    if (phase === "connect" && portoConnector) {
      connect({ connector: portoConnector });
      return;
    }
    if (phase === "switch-chain") {
      switchChain({ chainId: props.chainId as 11155111 });
      return;
    }
    if (phase === "ready" || phase === "error") {
      try {
        const res = await sendCalls.mutateAsync({ calls: props.calls as any });
        setBundleId(res.id as `0x${string}`);
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
  }

  const txHash = callsStatus.data?.receipts?.[callsStatus.data.receipts.length - 1]?.transactionHash;

  return (
    <div>
      {phase === "confirmed" && txHash ? (
        <div className="rounded-sm bg-mint-2 border border-mint p-4 text-sm">
          <div className="font-semibold text-ink">
            deposited {props.amount} {props.asset} into {props.market}
          </div>
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
          disabled={phase === "submitting"}
          className="w-full rounded-pill bg-accent text-ink py-3 font-semibold hover:bg-accent-2 disabled:opacity-50"
        >
          {labelFor(phase, props.needsApprove)}
        </button>
      )}
      {phase === "error" && errMsg && (
        <p className="mt-2 text-xs text-bad break-all">{errMsg}</p>
      )}
    </div>
  );
}

function labelFor(p: Phase, needsApprove: boolean): string {
  switch (p) {
    case "connect":
      return "Connect Wallet";
    case "switch-chain":
      return "Switch Network";
    case "ready":
      return needsApprove ? "Approve & Deposit" : "Deposit";
    case "submitting":
      return "Submitting…";
    case "confirmed":
      return "Confirmed";
    case "error":
      return "Retry";
  }
}

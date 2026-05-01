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
  needsApprove?: boolean;
  /** "deposit" (default) or "withdraw" — drives button label and confirmed message. */
  actionKind?: "deposit" | "withdraw";
};

export function CompoundExecute(props: CompoundExecuteProps) {
  const { isConnected, chainId } = useAccount();
  const connectors = useConnectors();
  const portoConnector = connectors[0];
  const { connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const { sendCalls, data: sendData, error: sendError, isPending: sendPending } = useSendCalls();
  const callsStatus = useWaitForCallsStatus({ id: sendData?.id });

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
    if (sendPending || (sendData?.id && callsStatus.isLoading)) {
      setPhase("submitting");
      return;
    }
    if (sendError) {
      setPhase("error");
      setErrMsg(sendError.message);
      return;
    }
    setPhase("ready");
  }, [
    isConnected,
    chainId,
    sendPending,
    sendError,
    sendData?.id,
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
      sendCalls({ calls: props.calls as any });
    }
  }

  const txHash = callsStatus.data?.receipts?.[callsStatus.data.receipts.length - 1]?.transactionHash;
  const kind = props.actionKind ?? "deposit";
  const confirmedMsg =
    kind === "withdraw"
      ? `withdrew ${props.amount} ${props.asset} from ${props.market}`
      : `deposited ${props.amount} ${props.asset} into ${props.market}`;

  return (
    <div>
      {phase === "confirmed" && txHash ? (
        <div className="rounded-sm bg-mint-2 border border-mint p-4 text-sm">
          <div className="font-semibold text-ink">{confirmedMsg}</div>
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
          {labelFor(phase, kind, props.needsApprove ?? false)}
        </button>
      )}
      {phase === "error" && errMsg && (
        <p className="mt-2 text-xs text-bad break-all">{errMsg}</p>
      )}
    </div>
  );
}

function labelFor(p: Phase, kind: "deposit" | "withdraw", needsApprove: boolean): string {
  switch (p) {
    case "connect":
      return "Connect Wallet";
    case "switch-chain":
      return "Switch Network";
    case "ready":
      if (kind === "withdraw") return "Withdraw";
      return needsApprove ? "Approve & Deposit" : "Deposit";
    case "submitting":
      return "Submitting…";
    case "confirmed":
      return "Confirmed";
    case "error":
      return "Retry";
  }
}

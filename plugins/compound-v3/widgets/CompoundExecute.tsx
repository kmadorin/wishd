"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useSendCalls,
  useWaitForCallsStatus,
  useConnectors,
} from "wagmi";
import type { Address } from "viem";
import { ExecuteTimeline } from "../../../apps/web/components/primitives/ExecuteTimeline";
import { mapCompoundExec } from "../../../apps/web/lib/execPhase";
import { SuccessCard } from "../../../apps/web/components/primitives/SuccessCard";
import { useWorkspace } from "../../../apps/web/store/workspace";

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
  /** Widget id assigned by widgetRenderer (uuid). Used as stepCardId in wishd:wish event. */
  id?: string;
  /** Agent-injected keeper offers; SuccessCard renders them when present. */
  keeperOffers?: Array<{
    id?: string;
    keeperId?: string;
    badge?: string;
    title: string;
    desc: string;
    featured?: boolean;
    comingSoon?: boolean;
    state?: { kind: "not_deployed" } | { kind: "deployed_enabled"; workflowId: string; permissionsId: `0x${string}` } | { kind: "deployed_disabled"; workflowId: string; permissionsId: `0x${string}` };
    suggestedDelegation?: unknown;
  }>;
};

export function CompoundExecute(props: CompoundExecuteProps) {
  const { isConnected, chainId } = useAccount();
  const connectors = useConnectors();
  const portoConnector = connectors[0];
  const { connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const {
    sendCalls,
    data: sendData,
    error: sendError,
    isPending: sendPending,
    reset: resetSend,
  } = useSendCalls();
  const callsStatus = useWaitForCallsStatus({ id: sendData?.id });
  const reset = useWorkspace((s) => s.reset);

  const [phase, setPhase] = useState<Phase>("ready");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const wishFiredRef = useRef(false);

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
      logSendError(sendError, props);
      setPhase("error");
      setErrMsg(friendlyError(sendError));
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

  // Dispatch follow-up wish exactly once when the transaction is confirmed.
  useEffect(() => {
    if (callsStatus.data?.status !== "success") return;
    if (wishFiredRef.current) return;
    wishFiredRef.current = true;
    const confirmedKind = props.actionKind ?? "deposit";
    const account = { address: props.user, chainId: props.chainId };
    const latestTxHash = callsStatus.data?.receipts?.[callsStatus.data.receipts.length - 1]?.transactionHash;
    window.dispatchEvent(
      new CustomEvent("wishd:wish", {
        detail: {
          wish: `intent confirmed: ${confirmedKind} ${props.amount} ${props.asset}`,
          account,
          context: {
            intent: confirmedKind === "deposit" ? "compound-v3.deposit" : "compound-v3.withdraw",
            confirmed: true,
            userPortoAddress: account.address,
            stepCardId: props.id ?? "",
            txHash: latestTxHash,
          },
        },
      }),
    );
  }, [callsStatus.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
      resetSend();
      console.info(
        JSON.stringify({
          tag: "wishd:exec",
          event: "sendCalls-attempt",
          kind,
          chainId: props.chainId,
          user: props.user,
          callCount: props.calls.length,
          calls: props.calls.map((c) => ({ to: c.to, value: c.value, dataLen: c.data.length, selector: c.data.slice(0, 10) })),
          amount: props.amount,
          asset: props.asset,
          needsApprove: props.needsApprove ?? false,
          t: Date.now(),
        }),
      );
      sendCalls({ calls: props.calls as any });
    }
  }

  const txHash = callsStatus.data?.receipts?.[callsStatus.data.receipts.length - 1]?.transactionHash;
  const kind = props.actionKind ?? "deposit";
  const confirmedMsg =
    kind === "withdraw"
      ? `withdrew ${props.amount} ${props.asset} from ${props.market}`
      : `deposited ${props.amount} ${props.asset} into ${props.market}`;

  if (phase === "confirmed" && txHash) {
    const isWithdraw = kind === "withdraw";
    return (
      <SuccessCard
        title={isWithdraw ? "withdraw complete ✦" : "supply complete ✦"}
        sub={isWithdraw
          ? `withdrew ${props.amount} ${props.asset} from ${props.market}`
          : `earning yield on ${props.amount} ${props.asset} via ${props.market}`}
        summary={[
          { k: isWithdraw ? "withdrew" : "supplied", v: `${props.amount} ${props.asset}` },
          { k: "market", v: props.market },
          { k: "tx", v: <a className="underline" target="_blank" rel="noreferrer"
              href={`https://sepolia.etherscan.io/tx/${txHash}`}>
              {txHash.slice(0,10)}…{txHash.slice(-8)}
            </a> },
        ]}
        keeperOffers={isWithdraw ? [] : (props.keeperOffers ?? [])}
        primaryAction={{
          label: "make another wish",
          onClick: () => reset(),
        }}
        secondaryAction={{
          label: "view portfolio",
          onClick: () => alert("portfolio coming soon"),
        }}
      />
    );
  }

  const steps = mapCompoundExec({
    phase,
    needsApprove: props.needsApprove ?? false,
    txHash,
    errMsg: errMsg ?? undefined,
  });

  const ctaLabel = (() => {
    switch (phase) {
      case "connect": return "Connect Wallet";
      case "switch-chain": return "Switch Network";
      case "ready":
        if (kind === "withdraw") return "Withdraw";
        return (props.needsApprove ?? false) ? "Approve & Deposit" : "Deposit";
      case "submitting": return "Submitting…";
      case "error": return "Retry";
      default: return "Execute";
    }
  })();

  return (
    <div>
      <ExecuteTimeline
        steps={steps}
        cta={{ label: ctaLabel, onClick, disabled: phase === "submitting" }}
      />
      {phase === "error" && errMsg && (
        <p className="mt-2 text-xs text-bad break-all">{errMsg}</p>
      )}
    </div>
  );
}

function logSendError(err: unknown, props: CompoundExecuteProps): void {
  const e = err as Record<string, unknown> & Error;
  const cause = e.cause as (Record<string, unknown> & Error) | undefined;
  const causeCause = cause?.cause as (Record<string, unknown> & Error) | undefined;
  const summary = {
    tag: "wishd:exec",
    event: "sendCalls-error",
    kind: props.actionKind ?? "deposit",
    chainId: props.chainId,
    user: props.user,
    name: e?.name,
    code: (e as { code?: number | string })?.code,
    shortMessage: (e as { shortMessage?: string })?.shortMessage,
    message: e?.message,
    details: (e as { details?: string })?.details,
    metaMessages: (e as { metaMessages?: unknown })?.metaMessages,
    docsPath: (e as { docsPath?: string })?.docsPath,
    cause: cause
      ? {
          name: cause.name,
          code: (cause as { code?: number | string }).code,
          shortMessage: (cause as { shortMessage?: string }).shortMessage,
          message: cause.message,
          details: (cause as { details?: string }).details,
        }
      : null,
    causeCause: causeCause
      ? { name: causeCause.name, code: (causeCause as { code?: number | string }).code, message: causeCause.message }
      : null,
    keys: Object.keys(e ?? {}),
    callCount: props.calls.length,
    t: Date.now(),
  };
  console.error("wishd:exec sendCalls-error", summary, err);
  try {
    console.error("wishd:exec sendCalls-error JSON", JSON.stringify(summary));
  } catch {
    /* circular */
  }
}

function friendlyError(err: Error): string {
  const msg = err.message ?? String(err);
  const code = (err as { code?: number }).code;
  const name = err.name ?? "";
  if (code === 4001 || /user rejected|user denied|rejected the request/i.test(msg) || /UserRejected/.test(name)) {
    return "you cancelled the wallet prompt — click retry to try again";
  }
  if (/insufficient funds|insufficient balance/i.test(msg)) {
    return "insufficient ETH for gas — fund this wallet on Sepolia and retry";
  }
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
}

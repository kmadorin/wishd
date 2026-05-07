"use client";

import { useState } from "react";
import {
  useAccount,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { callPluginTool } from "@wishd/plugin-sdk/routes";
import { isEvmCall } from "@wishd/plugin-sdk";
import type { EvmCall } from "@wishd/plugin-sdk";
import type { LifiBridgePrepared } from "../types";
import { useBridgeProgressStore } from "../store/bridgeProgressStore";
import { BridgeProgress } from "./BridgeProgress";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "switch-chain"
  | "idle"
  | "preflight-stale"
  | "approve"
  | "submitting"
  | "submitted"
  | "error";

export type BridgeExecuteProps = {
  prepared: LifiBridgePrepared;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function caip2ToChainId(caip2: string): number {
  const parts = caip2.split(":");
  return parseInt(parts[1] ?? "0", 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BridgeExecute({ prepared: initialPrepared }: BridgeExecuteProps) {
  const [prepared, setPrepared] = useState(initialPrepared);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);
  const [approvalDone, setApprovalDone] = useState(false);

  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const requiredChainId = caip2ToChainId(prepared.config.fromCaip2);
  const isWrongChain = isConnected && chainId !== requiredChainId;
  const hasTwoCalls = prepared.calls.length === 2;
  const isStale = prepared.staleAfter !== undefined && Date.now() > prepared.staleAfter;

  // If already submitted, render progress
  if (phase === "submitted" && submittedTxHash) {
    return <BridgeProgress id={submittedTxHash} />;
  }

  // Handle switch-chain button
  if (isWrongChain || phase === "switch-chain") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">
          Switch to the source network to continue
        </p>
        <button
          type="button"
          className="rounded-pill bg-accent border-2 border-ink text-ink py-2 font-semibold"
          onClick={() => switchChain({ chainId: requiredChainId })}
        >
          Switch network
        </button>
      </div>
    );
  }

  async function handleRefreshAndBridge() {
    try {
      const fresh = await callPluginTool<LifiBridgePrepared>("lifi", "refresh_quote", {
        config: prepared.config,
      });
      setPrepared(fresh);
      setPhase("idle");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "refresh failed");
      setPhase("error");
    }
  }

  async function handleApprove() {
    setErrMsg(null);
    const rawCall = prepared.calls[0];
    if (!rawCall || !isEvmCall(rawCall)) return;
    const approvalCall = rawCall as EvmCall;

    try {
      setPhase("approve");
      await writeContractAsync({
        address: approvalCall.to as `0x${string}`,
        abi: [
          {
            name: "approve",
            type: "function",
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [{ type: "bool" }],
          },
        ],
        functionName: "approve",
        args: [],
        data: approvalCall.data as `0x${string}`,
      } as any);
      setApprovalDone(true);
      setPhase("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrMsg(msg);
      setPhase("error");
    }
  }

  async function handleBridge() {
    const rawBridgeCall = hasTwoCalls ? prepared.calls[1] : prepared.calls[0];
    if (!rawBridgeCall || !isEvmCall(rawBridgeCall)) return;
    const bridgeCall = rawBridgeCall as EvmCall;

    setErrMsg(null);
    setPhase("submitting");

    try {
      const txHash = await sendTransactionAsync({
        to: bridgeCall.to as `0x${string}`,
        data: bridgeCall.data as `0x${string}`,
        value: bridgeCall.value,
        chainId: requiredChainId,
      });

      // Persist bridge record
      const store = useBridgeProgressStore.getState();
      const obs = (prepared.observations ?? [])[0];
      if (obs) {
        store.upsert({
          id: txHash,
          config: prepared.config,
          observation: {
            ...obs,
            query: {
              ...obs.query,
              txHash,
            },
          } as any,
          startedAt: Date.now(),
          lastStatus: "PENDING",
        });
      }

      setSubmittedTxHash(txHash);
      setPhase("submitted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrMsg(/user rejected|user denied|rejected the request/i.test(msg) ? "user rejected" : msg);
      setPhase("error");
    }
  }

  // Stale quote flow — show refresh button
  if (isStale && phase === "idle") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">Quote has expired. Refresh to get a new price.</p>
        <button
          type="button"
          className="rounded-pill bg-accent border-2 border-ink text-ink py-2 font-semibold"
          onClick={handleRefreshAndBridge}
        >
          Refresh quote
        </button>
        {errMsg && <p className="text-xs text-bad">{errMsg}</p>}
      </div>
    );
  }

  // Two-call flow: approval first
  if (hasTwoCalls && !approvalDone && phase !== "error") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">Step 1 of 2: Approve token spending</p>
        <button
          type="button"
          disabled={phase === "approve"}
          className="rounded-pill bg-accent border-2 border-ink text-ink py-2 font-semibold disabled:opacity-40"
          onClick={handleApprove}
        >
          {phase === "approve" ? "Approving…" : "Approve USDC"}
        </button>
        {errMsg && <p className="text-xs text-bad">{errMsg}</p>}
      </div>
    );
  }

  // Bridge sign button
  return (
    <div className="flex flex-col gap-3">
      {hasTwoCalls && approvalDone && (
        <p className="text-sm text-ink-2">Step 2 of 2: Sign bridge transaction</p>
      )}
      <button
        type="button"
        disabled={phase === "submitting"}
        className="rounded-pill bg-accent border-2 border-ink text-ink py-2 font-semibold disabled:opacity-40"
        onClick={handleBridge}
      >
        {phase === "submitting" ? "Submitting…" : "Sign & bridge"}
      </button>
      {errMsg && <p className="text-xs text-bad">{errMsg}</p>}
    </div>
  );
}

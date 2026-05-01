import type { ExecStep } from "../components/primitives/ExecuteTimeline";

export type CompoundPhase = "connect" | "switch-chain" | "ready" | "submitting" | "confirmed" | "error";

export function mapCompoundExec(opts: {
  phase: CompoundPhase;
  needsApprove: boolean;
  txHash?: string;
  errMsg?: string;
}): ExecStep[] {
  const { phase, needsApprove, txHash, errMsg } = opts;
  function p(steps: Array<Omit<ExecStep, "phase"> & { stage: number }>): ExecStep[] {
    // Stage cursor: 0 connect/switch, 1 preflight, 2 approve (if needed), 3 sign, 4 broadcast, 5 done
    const stage =
      phase === "connect" || phase === "switch-chain" ? 0 :
      phase === "ready" ? 1 :
      phase === "submitting" ? (needsApprove ? 4 : 4) :
      phase === "confirmed" ? 5 :
      phase === "error" ? -1 : 0;
    return steps.map((s) => ({
      id: s.id, title: s.title, sub: s.sub, detail: s.detail,
      phase:
        phase === "error" && s.stage === stage + 1 ? "error" :
        s.stage < stage ? "done" :
        s.stage === stage ? "active" : "queued",
    } as ExecStep));
  }
  const steps: Array<Omit<ExecStep, "phase"> & { stage: number }> = [
    { id: "preflight", title: "pre-flight checks", sub: "wallet, network, balance", stage: 1 },
  ];
  if (needsApprove) steps.push({ id: "approve", title: "approve token", sub: "ERC-20 allowance", stage: 2 });
  steps.push({ id: "sign", title: "sign transaction", sub: "wallet prompt", stage: 3 });
  steps.push({
    id: "broadcast", title: "broadcast", sub: "confirm on-chain",
    detail: txHash ? <a className="text-accent underline font-mono text-xs"
      href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
      {txHash.slice(0,10)}…{txHash.slice(-8)}</a> : undefined,
    stage: 4,
  });
  if (phase === "error" && errMsg) {
    return p(steps).map((s, i, arr) =>
      i === arr.findIndex((x) => x.phase === "active" || x.phase === "queued")
        ? { ...s, phase: "error", detail: <span className="text-bad text-xs">{errMsg}</span> }
        : s,
    );
  }
  return p(steps);
}

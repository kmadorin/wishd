"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactElement } from "react";
import { useAccount } from "wagmi";
import { useWorkspace } from "@/store/workspace";

type Props = {
  id?: string;
  stepCardId?: string;
  intent?: string;
  userPortoAddress?: string;
};

type Phase = "idle" | "pending" | "success" | "error";

export function KeeperhubAuthCard({ id, stepCardId, intent, userPortoAddress }: Props): ReactElement {
  const { address } = useAccount();
  const dismissWidget = useWorkspace((s) => s.dismissWidget);
  const appendAgentEvent = useWorkspace((s) => s.appendAgentEvent);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === "wishd:kh:authed") {
        setPhase("success");
        // Re-trigger agent flow E with confirmation context
        const account = address ?? userPortoAddress;
        window.dispatchEvent(
          new CustomEvent("wishd:wish", {
            detail: {
              wish: "intent confirmed: keeper auth complete",
              account,
              context: {
                intent,
                confirmed: true,
                userPortoAddress: userPortoAddress ?? account,
                stepCardId,
              },
            },
          }),
        );
      } else if (event.data?.type === "wishd:kh:auth-error") {
        setPhase("error");
        setErrorMsg(event.data.error ?? "authorization failed");
      }
    },
    [address, intent, userPortoAddress, stepCardId],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (phase !== "success" || !id) return;
    const t = setTimeout(() => dismissWidget(id), 1500);
    return () => clearTimeout(t);
  }, [phase, id, dismissWidget]);

  async function handleConnect(): Promise<void> {
    setPhase("pending");
    setErrorMsg(null);
    appendAgentEvent({ kind: "step", label: "kh.auth.start", status: "start" });
    const t0 = performance.now();
    try {
      const res = await fetch("/api/keepers/kh-auth/start", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `request failed ${res.status}`);
      }
      const { authUrl } = (await res.json()) as { authUrl: string; state: string };
      setAuthUrl(authUrl);
      appendAgentEvent({ kind: "step", label: "kh.auth.start", status: "ok", ms: Math.round(performance.now() - t0) });
      window.open(authUrl, "wishd:kh:auth", "width=600,height=720");
      // Phase stays "pending" until postMessage arrives
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendAgentEvent({ kind: "step", label: "kh.auth.start", status: "fail", ms: Math.round(performance.now() - t0) });
      appendAgentEvent({ kind: "error", message: msg });
      setErrorMsg(msg);
      setPhase("error");
    }
  }

  return (
    <div className="bg-surface rounded-md border border-rule p-4 space-y-3 max-w-sm">
      <header>
        <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3">keeper hub</div>
        <h2 className="font-hand text-xl font-bold leading-tight">Connect KeeperHub</h2>
      </header>

      <p className="text-xs text-ink-3">
        KeeperHub will be granted <strong>mcp:write</strong> access to create and manage automated keeper
        workflows on your behalf. You can revoke access at any time from your KeeperHub settings.
      </p>

      {phase === "idle" && (
        <button
          type="button"
          className="bg-accent border-[1.5px] border-ink rounded-pill px-4 py-1.5 text-sm font-semibold"
          onClick={handleConnect}
        >
          Connect KeeperHub
        </button>
      )}

      {phase === "pending" && (
        <div className="space-y-2">
          <p className="text-xs text-ink-3">Waiting for authorization in the pop-up window…</p>
          <button
            type="button"
            className="text-xs underline disabled:opacity-50"
            disabled={!authUrl}
            onClick={() => authUrl && window.open(authUrl, "wishd:kh:auth", "width=600,height=720")}
          >
            reopen pop-up
          </button>
        </div>
      )}

      {phase === "success" && (
        <p className="text-xs text-green-600 font-semibold">KeeperHub connected ✓</p>
      )}

      {phase === "error" && (
        <div className="space-y-2">
          <p className="text-xs text-warn">{errorMsg ?? "unknown error"}</p>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => { setPhase("idle"); setErrorMsg(null); }}
          >
            try again
          </button>
        </div>
      )}
    </div>
  );
}

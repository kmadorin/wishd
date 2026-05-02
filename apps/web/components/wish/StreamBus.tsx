"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";
import { clientHasKeeperForIntent } from "@/lib/keepers/clientRegistry";

type WishDetail = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  reset?: boolean;
};

export function StreamBus() {
  const ws = useWorkspace();
  const { appendWidget, patchWidget, dismissWidget, appendNarration, appendAgentEvent, reset, setExecuting, appendSkeleton, hydrateSkeleton, failSkeleton } = ws;
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WishDetail>).detail;
      if (!detail?.wish) return;
      const intentId = typeof detail.context?.intent === "string" ? detail.context.intent : null;
      const isPostExec = detail.context?.confirmed === true && intentId !== null && clientHasKeeperForIntent(intentId);
      // Post-exec wishes must run even if a prior stream is still open; they're additive.
      if (!isPostExec && useWorkspace.getState().executing) return;
      if (detail.reset) reset();
      setExecuting(true);
      const skeletonId = isPostExec ? `kh-skeleton-${Date.now()}` : null;
      let hydrated = false;
      if (skeletonId) {
        appendSkeleton({ id: skeletonId, widgetType: "keeperhub-auth" });
      }

      startStream({
        wish: detail.wish,
        account: detail.account,
        context: detail.context,
        onEvent: (ev) => {
          if (ev.type === "tool.call") appendAgentEvent({ kind: "tool.call", name: ev.name, input: ev.input });
          if (ev.type === "chat.delta") {
            appendNarration(ev.delta);
            appendAgentEvent({ kind: "delta", text: ev.delta });
          }
          if (ev.type === "ui.render") {
            appendAgentEvent({ kind: "ui.render", widgetType: ev.widget.type, widgetId: ev.widget.id });
            if (skeletonId && !hydrated) {
              hydrated = true;
              hydrateSkeleton(skeletonId, {
                id: ev.widget.id,
                type: ev.widget.type,
                slot: ev.widget.slot ?? "flow",
                props: ev.widget.props as Record<string, unknown>,
              });
            } else {
              appendWidget({
                id: ev.widget.id,
                type: ev.widget.type,
                slot: ev.widget.slot ?? "flow",
                props: ev.widget.props as Record<string, unknown>,
              });
            }
          }
          if (ev.type === "ui.patch") {
            appendAgentEvent({ kind: "ui.patch", widgetId: ev.id });
            patchWidget(ev.id, ev.props);
          }
          if (ev.type === "ui.dismiss") {
            appendAgentEvent({ kind: "ui.dismiss", widgetId: ev.id });
            dismissWidget(ev.id);
          }
          if (ev.type === "notification") appendAgentEvent({ kind: "notification", level: ev.level, text: ev.text });
          if (ev.type === "result") appendAgentEvent({ kind: "result", ok: ev.ok, cost: ev.cost });
          if (ev.type === "error") appendAgentEvent({ kind: "error", message: ev.message });
        },
      })
        .catch((err) => {
          if (skeletonId && !hydrated) failSkeleton(skeletonId, err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (skeletonId && !hydrated) dismissWidget(skeletonId);
          setExecuting(false);
        });
    };
    window.addEventListener("wishd:wish", handler);
    return () => window.removeEventListener("wishd:wish", handler);
  }, [appendWidget, patchWidget, dismissWidget, appendNarration, appendAgentEvent, reset, setExecuting, appendSkeleton, hydrateSkeleton, failSkeleton]);
  return null;
}

"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";

type WishDetail = {
  wish: string;
  account: { address: `0x${string}`; chainId: number };
  context?: Record<string, unknown>;
  reset?: boolean;
};

export function StreamBus() {
  const ws = useWorkspace();
  const { appendWidget, patchWidget, dismissWidget, appendNarration, reset, setExecuting, appendSkeleton, hydrateSkeleton, failSkeleton } = ws;
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WishDetail>).detail;
      if (!detail?.wish) return;
      if (useWorkspace.getState().executing) return;
      if (detail.reset) reset();
      setExecuting(true);

      const isPostExec = detail.context?.confirmed === true && typeof detail.context?.intent === "string";
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
          if (ev.type === "chat.delta") appendNarration(ev.delta);
          if (ev.type === "ui.render") {
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
          if (ev.type === "ui.patch") patchWidget(ev.id, ev.props);
          if (ev.type === "ui.dismiss") dismissWidget(ev.id);
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
  }, [appendWidget, patchWidget, dismissWidget, appendNarration, reset, setExecuting, appendSkeleton, hydrateSkeleton, failSkeleton]);
  return null;
}

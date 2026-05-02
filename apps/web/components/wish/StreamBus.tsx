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
  const { appendWidget, patchWidget, dismissWidget, appendNarration, appendAgentEvent, reset, setExecuting } = useWorkspace();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WishDetail>).detail;
      if (!detail?.wish) return;
      if (useWorkspace.getState().executing) return;
      if (detail.reset) reset();
      setExecuting(true);
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
            appendWidget({
              id: ev.widget.id,
              type: ev.widget.type,
              slot: ev.widget.slot ?? "flow",
              props: ev.widget.props as Record<string, unknown>,
            });
          }
          if (ev.type === "ui.patch") patchWidget(ev.id, ev.props);
          if (ev.type === "ui.dismiss") dismissWidget(ev.id);
        },
      }).finally(() => setExecuting(false));
    };
    window.addEventListener("wishd:wish", handler);
    return () => window.removeEventListener("wishd:wish", handler);
  }, [appendWidget, patchWidget, dismissWidget, appendNarration, appendAgentEvent, reset, setExecuting]);
  return null;
}

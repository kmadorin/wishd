"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWorkspace } from "@/store/workspace";
import { startStream } from "./EventStream";
import { StepCard } from "@/components/primitives/StepCard";

const ACTIONS: Array<{ id: string; label: string; enabled: boolean; prompt: string }> = [
  { id: "lend", label: "lend", enabled: true, prompt: "I want to lend 10 USDC into Compound on Sepolia." },
  { id: "withdraw", label: "withdraw", enabled: true, prompt: "I want to withdraw 5 USDC from Compound on Sepolia." },
  { id: "swap", label: "swap", enabled: false, prompt: "" },
  { id: "borrow", label: "borrow", enabled: false, prompt: "" },
  { id: "earn", label: "earn", enabled: false, prompt: "" },
  { id: "bridge", label: "bridge", enabled: false, prompt: "" },
  { id: "find-vault", label: "find vault", enabled: false, prompt: "" },
];

export function WishComposer() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { address, chainId } = useAccount();
  const { appendWidget, patchWidget, dismissWidget, appendNarration, reset } = useWorkspace();

  async function submit(wish: string) {
    if (!wish.trim()) return;
    setBusy(true);
    reset();
    try {
      await startStream({
        wish,
        account: {
          address: (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
          chainId: chainId ?? 11155111,
        },
        onEvent: (e) => {
          if (e.type === "chat.delta") appendNarration(e.delta);
          if (e.type === "ui.render") {
            appendWidget({
              id: e.widget.id,
              type: e.widget.type,
              slot: e.widget.slot ?? "flow",
              props: e.widget.props as Record<string, unknown>,
            });
          }
          if (e.type === "ui.patch") patchWidget(e.id, e.props);
          if (e.type === "ui.dismiss") dismissWidget(e.id);
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step="STEP 01" title="describe your wish" sub="pick an action — we pre-fill the rest">
      <div className="flex flex-wrap gap-2 mb-3">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={!a.enabled || busy}
            onClick={() => submit(a.prompt)}
            title={a.enabled ? "" : "coming soon"}
            className={`px-3 py-1 rounded-pill text-sm font-medium border ${
              a.enabled
                ? "bg-accent-2 border-accent text-ink hover:bg-accent"
                : "bg-bg-2 border-rule text-ink-3 cursor-not-allowed"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="deposit 10 USDC into Compound on Sepolia"
          className="flex-1 rounded-sm bg-surface-2 border border-rule px-3 py-2 font-sans text-ink placeholder:text-ink-3"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2 disabled:opacity-50"
        >
          {busy ? "…" : "wish"}
        </button>
      </form>
    </StepCard>
  );
}

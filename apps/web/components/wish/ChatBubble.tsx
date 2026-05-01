"use client";

import { useWorkspace } from "@/store/workspace";

export function ChatBubble() {
  const narration = useWorkspace((s) => s.narration);
  if (!narration.trim()) return null;
  return (
    <div className="my-4 rounded-lg bg-surface border border-rule px-4 py-3 text-sm leading-relaxed text-ink-2 font-sans whitespace-pre-wrap">
      {narration}
    </div>
  );
}

import { WishComposer } from "@/components/wish/WishComposer";
import { StepStack } from "@/components/workspace/StepStack";
import { StreamBus } from "@/components/wish/StreamBus";
import { ChatBubble } from "@/components/wish/ChatBubble";
import { ConnectBadge } from "@/components/wish/ConnectBadge";
import { AgentActivityPanel } from "@/components/wish/AgentActivityPanel";

export default function Page() {
  return (
    <main className="page mx-auto max-w-[1100px] grid grid-cols-1 md:grid-cols-[minmax(0,760px)_280px] gap-6">
      <StreamBus />
      <div className="min-w-0">
        <header className="pt-10 pb-4 flex items-baseline gap-3">
          <h1 className="font-hand text-4xl">wishd</h1>
          <span className="text-sm text-ink-2">defi by wishing it</span>
          <ConnectBadge />
        </header>
        <div className="flex flex-col gap-6">
          <WishComposer />
          <StepStack />
        </div>
        <ChatBubble />
      </div>
      <AgentActivityPanel />
    </main>
  );
}

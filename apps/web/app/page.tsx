import { WishComposer } from "@/components/wish/WishComposer";
import { StepStack } from "@/components/workspace/StepStack";
import { StreamBus } from "@/components/wish/StreamBus";
import { ChatBubble } from "@/components/wish/ChatBubble";

export default function Page() {
  return (
    <main className="page">
      <StreamBus />
      <header className="pt-10 pb-4 flex items-baseline gap-3">
        <h1 className="font-hand text-4xl">wishd</h1>
        <span className="text-sm text-ink-2">defi by wishing it</span>
      </header>
      <WishComposer />
      <ChatBubble />
      <StepStack />
    </main>
  );
}

"use client";

import { useState } from "react";
import { ActionPill } from "@/components/primitives/ActionPill";
import {
  SentenceBox,
  SentenceConnector,
  SentencePrefix,
} from "@/components/primitives/SentenceBox";
import { StepCard } from "@/components/primitives/StepCard";

export default function VisualPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [amount, setAmount] = useState("10");
  const [asset, setAsset] = useState("USDC");
  const [chain, setChain] = useState("ethereum-sepolia");

  return (
    <main className="page">
      <h1 className="font-hand text-4xl my-6">visual sandbox</h1>
      <StepCard
        step="STEP 01"
        title="describe your wish"
        sub="pick an action — we pre-fill the rest"
      >
        <SentenceBox>
          <SentencePrefix>I want to</SentencePrefix>
          <ActionPill
            variant="action"
            value={action}
            placeholder="pick action"
            ariaLabel="Pick action"
            options={[
              { id: "deposit", label: "deposit", sub: "supply tokens to earn yield" },
              {
                id: "withdraw",
                label: "withdraw",
                sub: "redeem tokens you previously supplied",
              },
            ]}
            open={openId === "a"}
            onOpenChange={(o) => setOpenId(o ? "a" : null)}
            onChange={setAction}
          />
          <ActionPill
            variant="amount"
            value={amount}
            ariaLabel="Amount"
            onChange={setAmount}
          />
          <ActionPill
            variant="from"
            value={asset}
            iconTicker={asset}
            ariaLabel="Pick asset"
            options={[{ id: "USDC", label: "USDC" }]}
            open={openId === "as"}
            onOpenChange={(o) => setOpenId(o ? "as" : null)}
            onChange={setAsset}
          />
          <SentenceConnector>on</SentenceConnector>
          <ActionPill
            variant="chain"
            value={chain}
            ariaLabel="Pick chain"
            options={[{ id: "ethereum-sepolia", label: "Ethereum Sepolia" }]}
            open={openId === "c"}
            onOpenChange={(o) => setOpenId(o ? "c" : null)}
            onChange={setChain}
          />
        </SentenceBox>
      </StepCard>
    </main>
  );
}

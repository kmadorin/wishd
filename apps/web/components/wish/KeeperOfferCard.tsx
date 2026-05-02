"use client";

import type { ReactElement } from "react";
import { useKeeperDeploy } from "@/store/keeperDeploy";
import type { KeeperOffer as SdkKeeperOffer } from "@wishd/plugin-sdk";

type Props = {
  id?: string;
  keeperId: string;
  title: string;
  desc: string;
  badge?: string;
  featured?: boolean;
  comingSoon?: boolean;
  state?: SdkKeeperOffer["state"];
  suggestedDelegation?: unknown;
};

export function KeeperOfferCard(props: Props): ReactElement {
  const { keeperId, title, desc, badge, featured, comingSoon, state, suggestedDelegation } = props;
  const openDeploy = useKeeperDeploy((s) => s.openDeploy);

  const active = state?.kind === "deployed_enabled";
  const paused = state?.kind === "deployed_disabled";
  const canDeploy = !comingSoon && (!state || state.kind === "not_deployed") && Boolean(keeperId);

  return (
    <div className={[
      "bg-surface-2 border-[1.5px] rounded-sm p-3.5 max-w-sm",
      featured ? "border-ink" : "border-rule",
    ].join(" ")}>
      {badge && (
        <span className="inline-block font-mono text-[9px] border border-rule rounded px-1.5 py-px text-ink-3 mb-1.5">
          {badge}
        </span>
      )}
      <div className="font-bold text-sm mb-1">{title}</div>
      <p className="text-xs text-ink-3 mb-2.5 leading-snug">{desc}</p>
      {active && <p className="text-xs text-ink-2">auto-compound active ✓</p>}
      {paused && <p className="text-xs text-ink-3">paused — re-enable in your KeeperHub dashboard</p>}
      {!active && !paused && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={!canDeploy}
            onClick={() => {
              if (!canDeploy || !keeperId) return;
              openDeploy({
                offer: {
                  keeperId,
                  title,
                  desc,
                  badge,
                  featured,
                  state: state ?? { kind: "not_deployed" },
                },
                suggestedDelegation: suggestedDelegation as never,
              });
            }}
            title={comingSoon ? "coming soon" : undefined}
            className="bg-accent border-[1.5px] border-ink rounded-pill px-3 py-1 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >deploy ✦</button>
          <button
            type="button"
            disabled
            title="customize coming soon"
            className="bg-transparent border-[1.5px] border-rule rounded-pill px-3 py-1 text-xs text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >customize</button>
        </div>
      )}
    </div>
  );
}

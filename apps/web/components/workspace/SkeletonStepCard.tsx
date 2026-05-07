"use client";

import { StepCard } from "@/components/primitives/StepCard";

export type SkeletonStepCardProps = {
  step: string;
  title: string;
  sub?: string;
  amount?: string;
  asset?: string;
  state?: "pending" | "error";
  errorMessage?: string;
  onRetry?: () => void;
};

export function SkeletonStepCard(props: SkeletonStepCardProps) {
  const { step, title, sub, amount, asset, state = "pending", errorMessage, onRetry } = props;
  const shimmer = "animate-pulse bg-bg-2 rounded-sm";
  const isError = state === "error";
  const displayTitle = isError ? "couldn't prepare" : title;
  const displaySub = isError ? "see details below — adjust inputs and try again" : sub;
  return (
    <StepCard step={step} title={displayTitle} sub={displaySub}>
      <div className="space-y-3">
        {isError ? (
          <div className="rounded-sm bg-warn-2 border border-bad p-3">
            <p className="text-sm text-ink font-semibold">{errorMessage ?? "something went wrong"}</p>
          </div>
        ) : (
          <>
            <div className="text-sm text-ink-2">
              {amount && asset ? (
                <span>
                  <span className="font-mono">{amount}</span> <span>{asset}</span>
                </span>
              ) : (
                <span className={`inline-block h-4 w-32 ${shimmer}`} />
              )}
            </div>
            <div className={`h-12 w-full ${shimmer}`} />
          </>
        )}
        <div className="flex gap-2">
          {!isError && (
            <button type="button" disabled className="rounded-pill bg-bg-2 text-ink-3 px-4 py-2 cursor-not-allowed">
              preparing…
            </button>
          )}
          {isError && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-pill bg-accent text-ink px-4 py-2 font-semibold hover:bg-accent-2"
            >
              retry
            </button>
          )}
        </div>
      </div>
    </StepCard>
  );
}

import type { ComponentType } from "react";
import {
  CompoundSummary,
  CompoundExecute,
  CompoundWithdrawSummary,
} from "@wishd/plugin-compound-v3/widgets";
import { SwapSummary, SwapExecute } from "@wishd/plugin-uniswap/widgets";
import { KeeperhubAuthCard } from "@/components/wish/KeeperhubAuthCard";

export const widgetRegistry: Record<string, ComponentType<any>> = {
  "compound-summary": CompoundSummary,
  "compound-execute": CompoundExecute,
  "compound-withdraw-summary": CompoundWithdrawSummary,
  "swap-summary": SwapSummary,
  "swap-execute": SwapExecute,
  "keeperhub-auth": KeeperhubAuthCard,
};

export function getWidget(type: string): ComponentType<any> | undefined {
  return widgetRegistry[type];
}

import type { ComponentType } from "react";
import {
  CompoundSummary,
  CompoundExecute,
  CompoundWithdrawSummary,
} from "@wishd/plugin-compound-v3/widgets";
import { SwapSummary, SwapExecute } from "@wishd/plugin-uniswap/widgets";

export const widgetRegistry: Record<string, ComponentType<any>> = {
  "compound-summary": CompoundSummary,
  "compound-execute": CompoundExecute,
  "compound-withdraw-summary": CompoundWithdrawSummary,
  "swap-summary": SwapSummary,
  "swap-execute": SwapExecute,
};

export function getWidget(type: string): ComponentType<any> | undefined {
  return widgetRegistry[type];
}

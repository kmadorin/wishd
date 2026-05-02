import type { ComponentType } from "react";
import {
  CompoundSummary,
  CompoundExecute,
  CompoundWithdrawSummary,
} from "@wishd/plugin-compound-v3/widgets";
import { SwapSummary, SwapExecute } from "@wishd/plugin-uniswap/widgets";
import { BorrowWidget, EarnVaultWidget, BridgeWidget } from "@wishd/plugin-demo-stubs/widgets";
import { KeeperhubAuthCard } from "@/components/wish/KeeperhubAuthCard";
import { KeeperOfferCard } from "@/components/wish/KeeperOfferCard";

export const widgetRegistry: Record<string, ComponentType<any>> = {
  "compound-summary": CompoundSummary,
  "compound-execute": CompoundExecute,
  "compound-withdraw-summary": CompoundWithdrawSummary,
  "swap-summary": SwapSummary,
  "swap-execute": SwapExecute,
  "keeperhub-auth": KeeperhubAuthCard,
  "borrow-demo": BorrowWidget,
  "earn-demo": EarnVaultWidget,
  "bridge-demo": BridgeWidget,
  "keeperhub-offer": KeeperOfferCard,
};

export function getWidget(type: string): ComponentType<any> | undefined {
  return widgetRegistry[type];
}

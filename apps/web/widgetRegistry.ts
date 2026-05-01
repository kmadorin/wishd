import type { ComponentType } from "react";
import { CompoundSummary, CompoundExecute } from "@wishd/plugin-compound-v3/widgets";

export const widgetRegistry: Record<string, ComponentType<any>> = {
  "compound-summary": CompoundSummary,
  "compound-execute": CompoundExecute,
};

export function getWidget(type: string): ComponentType<any> | undefined {
  return widgetRegistry[type];
}

import type { ComponentType } from "react";
import { compoundV3 } from "@wishd/plugin-compound-v3";

export const widgetRegistry: Record<string, ComponentType<any>> = {
  ...compoundV3.widgets,
};

export function getWidget(type: string): ComponentType<any> | undefined {
  return widgetRegistry[type];
}

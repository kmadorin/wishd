import autoCompoundComp from "@wishd/keeper-auto-compound-comp";
import type { Keeper } from "@wishd/plugin-sdk";

const KEEPERS: Keeper[] = [autoCompoundComp];

export function clientGetKeeper(id: string): Keeper | null {
  return KEEPERS.find((k) => k.manifest.id === id) ?? null;
}

import type { Keeper } from "@wishd/plugin-sdk";
import autoCompoundComp from "@wishd/keeper-auto-compound-comp";

const KEEPERS: Keeper[] = [autoCompoundComp];

export function allKeepers(): Keeper[] {
  return KEEPERS;
}

export function keepersForIntent(intentId: string): Keeper[] {
  return KEEPERS.filter((k) => k.manifest.appliesTo.some((a) => a.intent === intentId));
}

export function getKeeperById(id: string): Keeper | null {
  return KEEPERS.find((k) => k.manifest.id === id) ?? null;
}

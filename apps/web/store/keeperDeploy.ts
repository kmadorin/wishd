import { create } from "zustand";
import type { KeeperOffer } from "@wishd/plugin-sdk";
import type { DelegationProposal } from "@/server/keepers/proposeDelegation";

type State = {
  open: boolean;
  payload: { offer: KeeperOffer; suggestedDelegation?: DelegationProposal } | null;
  openDeploy: (p: { offer: KeeperOffer; suggestedDelegation?: DelegationProposal }) => void;
  close: () => void;
};

export const useKeeperDeploy = create<State>((set) => ({
  open: false,
  payload: null,
  openDeploy: (p) => set({ open: true, payload: p }),
  close: () => set({ open: false, payload: null }),
}));

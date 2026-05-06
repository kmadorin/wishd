import { create } from "zustand";

type WalletMenuState = {
  drawerOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export const useWalletMenu = create<WalletMenuState>((set) => ({
  drawerOpen: false,
  open: () => set({ drawerOpen: true }),
  close: () => set({ drawerOpen: false }),
  toggle: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
}));

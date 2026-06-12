import { create } from "zustand";

/**
 * UI store — ephemeral, cross-component view state that doesn't belong in the
 * URL or the server cache (sheet/dialog visibility, transient online flag,
 * scoring-pad mode). Deliberately tiny; anything persistent lives in the DB or
 * TanStack Query.
 */

/** Which secondary scoring control is currently expanded on the pad. */
export type ScoringPanel = "none" | "extras" | "wicket" | "commentary";

interface UiState {
  /** Mobile nav / scorecard drawer. */
  isSidebarOpen: boolean;
  /** Active scoring sub-panel on the live scoring screen. */
  scoringPanel: ScoringPanel;
  /** Reflects navigator.onLine; drives the offline banner + queue UI. */
  isOnline: boolean;
  /** Id of a globally-active modal, or null. */
  activeModal: string | null;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setScoringPanel: (panel: ScoringPanel) => void;
  setOnline: (online: boolean) => void;
  openModal: (id: string) => void;
  closeModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: false,
  scoringPanel: "none",
  isOnline: true,
  activeModal: null,

  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setScoringPanel: (panel) => set({ scoringPanel: panel }),
  setOnline: (online) => set({ isOnline: online }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}));

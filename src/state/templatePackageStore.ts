import { create } from 'zustand'

/**
 * UI-Zustand des Schablonen-Pakets (Anzeige in HeaderTools/Diagnose).
 * Geschrieben wird er ausschließlich von `lib/templates/registry.ts` —
 * dieser Store existiert, damit React auf Import/Entfernen reagiert,
 * ohne dass Komponenten die Registry pollen müssen.
 */
export interface TemplatePackageInfo {
  name: string
  imageCount: number
  loadedAt: string
}

interface TemplatePackageState {
  info: TemplatePackageInfo | null
  setInfo: (info: TemplatePackageInfo | null) => void
}

export const useTemplatePackageStore = create<TemplatePackageState>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}))

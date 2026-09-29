import type { BeamPreferences } from './shared/beamTypes'

export interface ApplicationEventHandlers {
  preferences: (value: BeamPreferences) => void
  scheme: (scheme: 'light' | 'dark') => void
  action: (action: string | undefined) => void
  shortcut: (id: string | undefined) => void
}
export interface GeometryEventHandlers {
  schedule: () => void
  observe: () => void
}

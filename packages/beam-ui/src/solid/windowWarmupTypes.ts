import type { AuxiliaryWindow } from './shared/beamTypes'

export interface WindowWarmupApi {
  windowInfo(): Promise<{ capabilities: { windowLevel: boolean } }>
  ensureWindow(window: AuxiliaryWindow): Promise<void>
}

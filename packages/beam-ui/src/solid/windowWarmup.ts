import type { AuxiliaryWindow } from './shared/beamTypes'
import type { WindowWarmupApi } from './windowWarmupTypes'

/** Warms Settings first; unsupported capture tools must not block other scenes. */
export async function warmAuxiliaryWindows(api: WindowWarmupApi, disposed: () => boolean,
  reportError: (cause: unknown) => void): Promise<void> {
  if (disposed()) return
  const info = await api.windowInfo()
  const windows: AuxiliaryWindow[] = info.capabilities.windowLevel
    ? ['settings', 'countdown', 'recorder'] : ['settings']
  for (const window of windows) {
    if (disposed()) return
    try { await api.ensureWindow(window) }
    catch (cause) { if (!disposed()) reportError(cause) }
  }
}

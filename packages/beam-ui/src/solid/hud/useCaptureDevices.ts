import { createSignal, onCleanup, onMount } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import type { BeamPreferences, CaptureDevice, CaptureMode, CaptureQuickSettings, SourceCatalog } from '../shared/beamTypes'

/** All preparation modes share persisted devices and serialized quick-setting writes. */
export function useCaptureDevices(api: BeamApi) {
  const [devices, setDevices] = createSignal<BeamPreferences['devices']>({})
  const [catalog, setCatalog] = createSignal<SourceCatalog>({ screens: [], cameras: [], microphones: [], systemOutputs: [], errors: [] })
  const [mode, setMode] = createSignal<CaptureMode>('recorder')
  const [quickSettings, setQuickSettings] = createSignal<CaptureQuickSettings>({ countdownSeconds: 3, hideTaskbar: false, hideDesktopIcons: false })
  const [ready, setReady] = createSignal(false), [saving, setSaving] = createSignal(false), [error, setError] = createSignal('')
  let disposed = false, preferenceRevision = 0, pending = 0
  let writes: Promise<unknown> = Promise.resolve()
  let refreshing: Promise<SourceCatalog> | undefined
  const apply = (preferences: BeamPreferences) => {
    setDevices(preferences.devices); setMode(preferences.captureMode)
    setQuickSettings({ countdownSeconds: preferences.countdownSeconds, hideTaskbar: !!preferences.hideTaskbar, hideDesktopIcons: !!preferences.hideDesktopIcons })
  }
  function refreshSources(): Promise<SourceCatalog> {
    refreshing ??= api.sources().then(sources => {
      if (!disposed) {
        setCatalog(sources)
        if (sources.errors.length) setError(sources.errors.join('; '))
      }
      return sources
    }).finally(() => { refreshing = undefined })
    return refreshing
  }
  onMount(() => {
    void Promise.all([api.preferences(), refreshSources()]).then(([preferences]) => {
      if (disposed) return
      if (preferenceRevision === 0) apply(preferences)
      setReady(true)
    }).catch(cause => { if (!disposed) setError(String(cause)) })
    onCleanup(api.onEvent(event => {
      if (event.type === 'windowVisibility' && event.visible) {
        void refreshSources().catch(cause => { if (!disposed) setError(String(cause)) })
      }
      if (event.type !== 'preferencesChanged' || !event.preferences) return
      preferenceRevision++
      if (pending === 0) apply(event.preferences)
    }))
  })
  onCleanup(() => { disposed = true })
  async function change(key: CaptureDevice, value: string): Promise<void> {
    setDevices(current => ({ ...current, [key]: value }))
    await save({ devices: { [key]: value } })
  }
  async function changeQuick(patch: Partial<CaptureQuickSettings>): Promise<void> {
    setQuickSettings(current => ({ ...current, ...patch }))
    await save(patch)
  }
  async function save(patch: Record<string, unknown>): Promise<void> {
    pending++; setSaving(true); setError('')
    const write = writes.catch(() => {}).then(() => api.savePreferences(patch))
    writes = write
    try {
      const preferences = await write
      if (!disposed && pending === 1) apply(preferences)
    } catch (cause) {
      if (!disposed) {
        setError(String(cause))
        if (pending === 1) await api.preferences().then(apply).catch(console.error)
      }
    } finally { pending--; if (!disposed) setSaving(pending !== 0) }
  }
  return { devices, catalog, mode, quickSettings, ready, saving, error, change, changeQuick }
}

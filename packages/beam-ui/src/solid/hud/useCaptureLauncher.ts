import { useTR } from '../shared/i18n'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import type { BeamPreferences, CaptureRequest, SourceCatalog, SourceMode } from '../shared/beamTypes'

const emptyCatalog: SourceCatalog = { screens: [], cameras: [], microphones: [], systemOutputs: [], errors: [] }

/** Routes each source card directly to selection, countdown, or still capture. */
export function useCaptureLauncher(props: {
  api: BeamApi; preferences: BeamPreferences; startCommand?: number;
  captureBusy?: boolean; onRecord: (request: CaptureRequest) => Promise<void>; onScreenshot: (projectId: string) => void;
}) {
  const TR = useTR('Native')
  const [mode, setMode] = createSignal(props.preferences.captureMode)
  const [catalog, setCatalog] = createSignal<SourceCatalog>(emptyCatalog)
  const [sourceMode, setSourceMode] = createSignal<SourceMode>('display')
  const [devices, setDevices] = createSignal(props.preferences.devices)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  let handledCommand = props.startCommand ?? 0
  let refreshing: Promise<SourceCatalog> | undefined
  let selection: SourceMode | null = null
  createEffect(() => { setMode(props.preferences.captureMode); setDevices(props.preferences.devices) })

  async function refreshSources(): Promise<SourceCatalog> {
    refreshing ??= props.api.sources().then(async value => {
      setCatalog(value)
      if (!value.errors.length) {
        const patch: Record<string, string> = {}
        for (const [key, choices] of [['camera', value.cameras], ['microphone', value.microphones]] as const) {
          const id = devices()[key]
          if (id && !choices.some(choice => choice.id === id)) patch[key] = ''
        }
        if (Object.keys(patch).length) {
          setDevices(current => ({ ...current, ...patch }))
          await props.api.savePreferences({ devices: patch })
        }
      }
      return value
    }).finally(() => { refreshing = undefined })
    return refreshing
  }
  onMount(() => {
    void refreshSources().catch(cause => setError(String(cause)))
    onCleanup(props.api.onEvent(event => {
      if (event.type === 'windowVisibility' && event.visible) void refreshSources().catch(cause => setError(String(cause)))
      if (event.type !== 'beamUi' || !selection) return
      if (event.action === 'regionSelected' && event.region && selection === 'region') {
        selection = null
        void props.api.hideWindow('region').then(() => begin('region', undefined, event.region))
      } else if (event.action === 'windowSelected' && event.sourceId && selection === 'window') {
        selection = null
        void begin('window', event.sourceId)
      } else if (event.action === 'regionCanceled' || event.action === 'windowCanceled') {
        selection = null
        void props.api.hideWindow('region').then(() => props.api.showWindow())
      }
    }))
    const watcher = setInterval(() => {
      if (busy() || selection) return
      void props.api.windowInfo().then(info => {
        if (info.visible) return refreshSources()
      }).catch(cause => setError(String(cause)))
    }, 10000)
    onCleanup(() => clearInterval(watcher))
  })
  createEffect(() => {
    const command = props.startCommand ?? 0
    if (command > handledCommand) { handledCommand = command; void choose(sourceMode()) }
  })

  async function begin(source: SourceMode, sourceId?: string, region?: CaptureRequest['region']): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const sources = catalog().screens.length ? catalog() : await refreshSources()
      const display = sources.screens.find(item => item.kind === 'display' && item.isDefault)
        ?? sources.screens.find(item => item.kind === 'display')
      const id = source === 'window' ? sourceId : display?.id
      if (!id) throw new Error('The capture source is no longer available.')
      for (const [key, choices] of [['camera', sources.cameras], ['microphone', sources.microphones]] as const) {
        const selected = devices()[key]
        if (mode() !== 'screenshot' && selected && !choices.some(choice => choice.id === selected)) {
          throw new Error(TR('unavailableDevice', { name: selected }))
        }
      }
      const request: CaptureRequest = { mode: mode(), sourceMode: source, sourceId: id, region,
        cameraId: mode() === 'screenshot' ? null : devices().camera || null,
        microphoneId: mode() === 'screenshot' ? null : devices().microphone || null,
        systemAudioId: mode() === 'screenshot' ? null : devices().systemAudio || null }
      await props.api.hideWindow()
      if (mode() === 'screenshot') {
        await new Promise(resolve => setTimeout(resolve, 120))
        const result = await props.api.screenshot(request)
        props.onScreenshot(result.projectId)
        await props.api.showWindow()
      } else await props.onRecord(request)
    } catch (cause) { setError(String(cause)); await props.api.showWindow() }
    finally { setBusy(false) }
  }

  async function choose(source: SourceMode): Promise<void> {
    if (busy() || selection || props.captureBusy) return
    setSourceMode(source)
    setError('')
    if (source === 'display') { await begin('display'); return }
    setBusy(true)
    try {
      if (source === 'window') {
        const sources = await refreshSources()
        const portal = sources.screens.find(item => item.kind === 'window' && item.id.startsWith('portal:'))
        if (portal) { await begin('window', portal.id); return }
      }
      const info = await props.api.windowInfo()
      if (!info.capabilities.absolutePosition || !info.capabilities.windowLevel || !info.capabilities.transparentCompositing)
        throw new Error('Selection overlays require a desktop with transparent, positioned windows.')
      const monitors = await props.api.monitors()
      const monitor = monitors.find(item => item.primary) ?? monitors[0]
      if (!monitor) throw new Error('No display is available.')
      selection = source
      await props.api.hideWindow()
      if (source === 'region') {
        await Promise.all([props.api.ensureWindow('regionControls'), props.api.ensureWindow('regionActions')])
        await props.api.openRegion()
      } else {
        await props.api.ensureWindow('windowPicker')
        await props.api.ensureWindow('windowHighlight')
        await props.api.openWindowPicker(monitor)
      }
    } catch (cause) {
      selection = null; setError(String(cause))
      await props.api.cancelRegion().catch(console.error)
      await props.api.cancelWindowPicker().catch(console.error)
      await props.api.showWindow()
    }
    finally { setBusy(false) }
  }
  async function changeMode(next: BeamPreferences['captureMode']): Promise<void> {
    if (busy() || selection) return
    setMode(next)
    try { await props.api.savePreferences({ captureMode: next }) }
    catch (cause) { setError(String(cause)) }
  }
  async function saveDevice(key: 'camera' | 'microphone' | 'systemAudio', value: string): Promise<void> {
    setDevices(current => ({ ...current, [key]: value }))
    try { await props.api.savePreferences({ devices: { [key]: value } }) }
    catch (cause) { setError(String(cause)) }
  }
  return { mode, catalog, sourceMode, devices, busy: () => busy() || !!props.captureBusy, error, choose, changeMode, saveDevice }
}

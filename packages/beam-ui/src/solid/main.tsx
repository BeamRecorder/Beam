import { BeamHost } from './shared/beamHost'
import { initializeBeamI18n, observeBeamI18n } from './shared/i18n'
import { createSignal, onCleanup, onMount } from 'solid-js'
import { ApplicationServices, createThemeRuntime, type NativeBridge, type NativeNode } from '@argui/host'
import { ThemeProvider, render, useNativeHost } from '@argui/solid'
import { type WidgetTheme } from '@argui/widgets/solid'
import { beamThemeDefinition } from './shared/beamTheme'
import { BeamApi } from './shared/beamApi'
import type { BeamPreferences } from './shared/beamTypes'
import { Hud } from './hud/Hud'
import { useCaptureSession } from './hud/useCaptureSession'
import { activeShortcuts } from './shared/shortcuts'
import { routeApplicationEvent, routeGeometryEvent } from './appEvents'
import { warmAuxiliaryWindows } from './windowWarmup'
export { mountRegionControls, mountRegionActions, mountCountdown, mountRecorder, mountSettings, mountWindowPicker, mountWindowHighlight, mountTeleprompter } from './auxiliaryScenes'

const initialPreferences: BeamPreferences = {
  theme: 'system', locale: 'en', captureMode: 'recorder', hudWindow: { width: 680, height: 252 },
  shortcuts: {}, devices: {}, countdownSeconds: 3,
}

/** Coordinates native scenes while Rust owns acquisition and session files. */
function BeamApp(props: { api: BeamApi; runtime: ReturnType<typeof createThemeRuntime<WidgetTheme>> }) {
  const [preferences, setPreferences] = createSignal(initialPreferences)
  const [error, setError] = createSignal('')
  const [startCommand, setStartCommand] = createSignal(0)
  const capture = useCaptureSession(props.api, preferences)
  let lastGeometry = ''
  let lastShortcuts = ''
  let polling = false
  let pendingObservation = false
  async function observePreferences(): Promise<void> {
    if (polling) { pendingObservation = true; return }
    polling = true
    pendingObservation = false
    try {
      const latest = preferences()
      const shortcuts = activeShortcuts(latest)
      const keys = JSON.stringify(shortcuts)
      if (keys !== lastShortcuts) { await props.api.shortcuts(shortcuts); lastShortcuts = keys }
      if (capture.stage() === 'hud') await observeGeometry()
    } catch (cause) { setError(String(cause)) }
    finally { polling = false; if (pendingObservation) void observePreferences() }
  }
  async function observeGeometry(): Promise<void> {
    const info = await props.api.windowInfo()
    const geometry = { width: Math.round(info.width), height: Math.round(info.height), x: info.x, y: info.y }
    const serialized = JSON.stringify(geometry)
    if (geometry.width >= 440 && geometry.width <= 680 && geometry.height >= 208 && geometry.height <= 252) {
      if (lastGeometry && serialized !== lastGeometry) await props.api.savePreferences({
        hudWindow: { width: geometry.width, height: geometry.height }, hudPosition: { x: geometry.x, y: geometry.y },
      })
      lastGeometry = serialized
    }
  }
  function receivePreferences(value: BeamPreferences): void {
    preferenceRevision++; setPreferences(value)
    void props.api.updateUiState({ shortcut: value.shortcuts['hud.startStopRecording'],
      pauseShortcut: value.shortcuts['hud.playPause'] }).catch(console.error)
    props.runtime.update({ variant: value.theme })
    const shortcuts = activeShortcuts(value)
    const keys = JSON.stringify(shortcuts)
    if (keys !== lastShortcuts) { lastShortcuts = keys; void props.api.shortcuts(shortcuts).catch(console.error) }
  }
  function receiveCaptureAction(action: string | undefined): void {
    switch (action) {
      case 'countdownCanceled': void capture.cancelCountdown(); break
      case 'pause': void capture.togglePause(); break
      case 'stop': void capture.stop(); break
      case 'delete': void capture.discard(); break
    }
  }
  function receiveShortcut(id: string | undefined): void {
    switch (id) {
      case 'hud.startStopRecording':
        if (capture.stage() === 'hud') setStartCommand(value => value + 1)
        else if (capture.stage() === 'countdown') void capture.cancelCountdown()
        else void capture.stop()
        break
      case 'hud.playPause': void capture.togglePause(); break
      case 'teleprompter.toggleVisibility': void props.api.toggleTeleprompter().catch(console.error); break
    }
  }
  let preferenceRevision = 0
  onMount(() => {
    let disposed = false
    let geometryTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleGeometry = () => {
      clearTimeout(geometryTimer)
      geometryTimer = setTimeout(() => { geometryTimer = undefined; void observePreferences() }, 200)
    }
    const warm = setTimeout(() => {
      void warmAuxiliaryWindows(props.api, () => disposed, console.error).catch(console.error)
    }, 1000)
    onCleanup(() => { disposed = true; clearTimeout(warm); clearTimeout(geometryTimer) })
    void props.api.preferences().then(async value => {
      if (disposed || preferenceRevision !== 0) return
      setPreferences(value); lastShortcuts = JSON.stringify(activeShortcuts(value))
      props.runtime.update({ variant: value.theme })
      if (!value.hudPosition) {
        const info = await props.api.windowInfo()
        if (!info.capabilities.absolutePosition) return
        const monitors = await props.api.monitors()
        const monitor = monitors.find(item => item.primary) ?? monitors[0]
        if (monitor) await props.api.windowPosition(monitor.x + (monitor.width - info.width * monitor.scaleFactor) / 2,
          monitor.y + (monitor.height - info.height * monitor.scaleFactor) / 2)
      }
      await observePreferences()
    }).catch(cause => setError(String(cause)))
    const applicationHandlers = {
      preferences: receivePreferences,
      scheme: (scheme: 'light' | 'dark') => props.runtime.update({ systemScheme: scheme }),
      action: receiveCaptureAction,
      shortcut: receiveShortcut,
    }
    const geometryHandlers = {
      schedule: scheduleGeometry,
      observe: () => { clearTimeout(geometryTimer); geometryTimer = undefined; void observePreferences() },
    }
    onCleanup(props.api.onEvent(event => {
      routeApplicationEvent(event, applicationHandlers)
      routeGeometryEvent(event, geometryHandlers)
    }))
  })
  return <column width="100%" height="100%">
    <Hud api={props.api} preferences={preferences()} externalError={capture.error() || error()}
      startCommand={startCommand()} captureBusy={capture.busy()} onRecord={capture.record}
      onScreenshot={id => void props.api.openEditor(id, 'screenshot').catch(cause => setError(String(cause)))} />
  </column>
}

/** Mounts Beam's Solid scene into the native ARGUI host. */
export function mountGallery(bridge: NativeBridge, expectedAbiHash: string): () => void {
  const host = new BeamHost(bridge, expectedAbiHash)
  const runtime = createThemeRuntime<WidgetTheme>(bridge, beamThemeDefinition)
  runtime.update({ variant: 'dark' })
  const services = new ApplicationServices(bridge)
  const api = new BeamApi(services)
  initializeBeamI18n()
  useNativeHost(host)
  const root = host.createElement('column')
  host.setProperty(root, 'width', '100%')
  host.setProperty(root, 'height', '100%')
  const dispose = render(() => <ThemeProvider runtime={runtime}><BeamApp api={api} runtime={runtime} /></ThemeProvider> as unknown as NativeNode, root)
  host.setRoot(root)
  const offI18n = observeBeamI18n(api)
  return () => { offI18n(); dispose(); services.dispose(); runtime.dispose(); host.dispose() }
}

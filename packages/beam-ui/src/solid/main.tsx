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
  async function observePreferences(): Promise<void> {
    if (polling) return
    polling = true
    try {
      const latest = preferences()
      const shortcuts = activeShortcuts(latest)
      const keys = JSON.stringify(shortcuts)
      if (keys !== lastShortcuts) { await props.api.shortcuts(shortcuts); lastShortcuts = keys }
      if (capture.stage() === 'hud') {
        const info = await props.api.windowInfo()
        if (info.visible) {
          const geometry = { width: Math.round(info.width), height: Math.round(info.height), x: info.x, y: info.y }
          const serialized = JSON.stringify(geometry)
          if (geometry.width >= 440 && geometry.width <= 680 && geometry.height >= 208 && geometry.height <= 252) {
            if (lastGeometry && serialized !== lastGeometry) await props.api.savePreferences({
              hudWindow: { width: geometry.width, height: geometry.height }, hudPosition: { x: geometry.x, y: geometry.y },
            })
            lastGeometry = serialized
          }
        }
      }
    } catch (cause) { setError(String(cause)) }
    finally { polling = false }
  }
  let preferenceRevision = 0
  onMount(() => {
    let disposed = false
    const warm = setTimeout(() => {
      void (async () => {
        for (const window of ['countdown', 'recorder', 'settings'] as const) {
          if (disposed) return
          await props.api.ensureWindow(window)
        }
      })().catch(console.error)
    }, 1000)
    onCleanup(() => { disposed = true; clearTimeout(warm) })
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
    onCleanup(props.api.onEvent(event => {
      if (event.type === 'preferencesChanged' && event.preferences) {
        preferenceRevision++; setPreferences(event.preferences)
        props.runtime.update({ variant: event.preferences.theme })
        const shortcuts = activeShortcuts(event.preferences)
        const keys = JSON.stringify(shortcuts)
        if (keys !== lastShortcuts) { lastShortcuts = keys; void props.api.shortcuts(shortcuts).catch(console.error) }
      } else if (event.type === 'systemScheme' && (event.scheme === 'light' || event.scheme === 'dark')) {
        props.runtime.update({ systemScheme: event.scheme })
      } else if (event.type === 'beamUi') {
        if (event.action === 'countdownCanceled') void capture.cancelCountdown()
        else if (event.action === 'pause') void capture.togglePause()
        else if (event.action === 'stop') void capture.stop()
        else if (event.action === 'delete') void capture.discard()
      } else if (event.type === 'shortcut' && event.state === 'pressed') {
        if (event.id === 'hud.startStopRecording') {
          if (capture.stage() === 'hud') setStartCommand(value => value + 1)
          else if (capture.stage() === 'countdown') void capture.cancelCountdown()
          else void capture.stop()
        } else if (event.id === 'hud.playPause') void capture.togglePause()
        else if (event.id === 'teleprompter.toggleVisibility') void props.api.toggleTeleprompter().catch(console.error)
      }
      if (event.type === 'windowResized' || (event.type === 'windowVisibility' && event.visible)) void observePreferences()
    }))
    const watcher = setInterval(() => void observePreferences(), 2000)
    onCleanup(() => clearInterval(watcher))
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

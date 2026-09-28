import { BeamHost } from './shared/beamHost'
import { initializeBeamI18n, observeBeamI18n } from './shared/i18n'
import { onCleanup, onMount } from 'solid-js'
import { ApplicationServices, createThemeRuntime, type NativeBridge, type NativeNode } from '@argui/host'
import { ThemeProvider, render, useNativeHost } from '@argui/solid'
import { type WidgetTheme } from '@argui/widgets/solid'
import { beamThemeDefinition, observeBeamTheme } from './shared/beamTheme'
import { BeamApi } from './shared/beamApi'
import { RegionActions, RegionControls } from './hud/RegionControls'
import { Countdown } from './hud/Countdown'
import { RecorderBar } from './hud/RecorderBar'
import { Settings } from './shared/settings/Settings'
import { WindowPicker, WindowHighlight } from './hud/WindowPicker'
import { Teleprompter } from './teleprompter/Teleprompter'
import { useUiState } from './shared/useUiState'
import { useWindowMetrics } from './shared/useWindowMetrics'
import type { AuxiliaryWindow } from './shared/beamTypes'

function CountdownScene(props: { api: BeamApi }) {
  const state = useUiState(props.api)
  return <Countdown remaining={state().remaining}
    onCancel={() => void props.api.emitUiAction('countdownCanceled').catch(console.error)} />
}
function RecorderScene(props: { api: BeamApi }) {
  const state = useUiState(props.api)
  const metrics = useWindowMetrics(props.api, { width: 210, height: 54 })
  return <RecorderBar api={props.api} paused={state().paused} busy={state().busy} visible={metrics().visible}
    onPause={() => void props.api.emitUiAction('pause').catch(console.error)}
    onStop={() => void props.api.emitUiAction('stop').catch(console.error)}
    onDelete={() => void props.api.emitUiAction('delete').catch(console.error)} />
}

function mountScene(bridge: NativeBridge, expectedAbiHash: string,
  window: AuxiliaryWindow): () => void {
  const host = new BeamHost(bridge, expectedAbiHash)
  const runtime = createThemeRuntime<WidgetTheme>(bridge, beamThemeDefinition)
  runtime.update({ variant: 'dark' })
  const services = new ApplicationServices(bridge, window)
  const api = new BeamApi(services, window)
  initializeBeamI18n()
  useNativeHost(host)
  const root = host.createElement('column')
  host.setProperty(root, 'width', '100%')
  host.setProperty(root, 'height', '100%')
  const dispose = render(() => <ThemeProvider runtime={runtime}>
    {window === 'regionControls' ? <RegionControls api={api} /> : window === 'regionActions'
      ? <RegionActions api={api} /> : window === 'countdown'
      ? <CountdownScene api={api} /> : window === 'recorder' ? <RecorderScene api={api} />
        : window === 'windowPicker' ? <WindowPicker api={api} /> : window === 'windowHighlight'
        ? <WindowHighlight /> : window === 'teleprompter' ? <Teleprompter api={api} />
        : <Settings api={api} onClose={() => void api.hideWindow()} onTheme={variant => runtime.update({ variant })} />}
  </ThemeProvider> as unknown as NativeNode, root)
  host.setRoot(root)
  const offI18n = observeBeamI18n(api)
  const off = observeBeamTheme(api, runtime)
  return () => { offI18n(); off(); dispose(); services.dispose(); runtime.dispose(); host.dispose() }
}

export const mountRegionControls = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'regionControls')
export const mountRegionActions = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'regionActions')
export const mountCountdown = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'countdown')
export const mountRecorder = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'recorder')
export const mountSettings = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'settings')

export const mountWindowPicker = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'windowPicker')
export const mountWindowHighlight = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'windowHighlight')
export const mountTeleprompter = (bridge: NativeBridge, expectedAbiHash: string) => mountScene(bridge, expectedAbiHash, 'teleprompter')

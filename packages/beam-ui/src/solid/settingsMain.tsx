import { BeamHost } from './shared/beamHost'
import { initializeBeamI18n, observeBeamI18n } from './shared/i18n'
import { ApplicationServices, createThemeRuntime, type NativeBridge, type NativeNode } from '@argui/host'
import { ThemeProvider, render, useNativeHost } from '@argui/solid'
import { type WidgetTheme } from '@argui/widgets/solid'
import { beamThemeDefinition, observeBeamTheme } from './shared/beamTheme'
import { BeamApi } from './shared/beamApi'
import { Settings } from './shared/settings/Settings'


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
  const dispose = render(() => <ThemeProvider runtime={runtime}>
    <Settings api={api} onTheme={variant => runtime.update({ variant })} />
  </ThemeProvider> as unknown as NativeNode, root)
  host.setRoot(root)
  const offI18n = observeBeamI18n(api)
  const off = observeBeamTheme(api, runtime)
  return () => { offI18n(); off(); dispose(); services.dispose(); runtime.dispose(); host.dispose() }
}

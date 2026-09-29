import { useTR } from '../shared/i18n'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useTheme } from '@argui/solid'
import { Select } from '../shared/base-ui/select'
import { CapturePreparationBar } from './CapturePreparationBar'
import type { BeamApi } from '../shared/beamApi'
import type { RegionSnapshot } from '../shared/beamTypes'
import type { BeamTheme } from '../shared/beamThemeTypes'
import { useUiState } from '../shared/useUiState'

const presets = [
  { value: 'free', label: 'Freeform' },
  ...['16:9', '16:10', '4:3', '3:2', '5:4', '1:1', '21:9', '32:9', '9:16', '2:3', '3:4', '4:5'].map(value => ({ value, label: value })),
  ...['3840×2160', '2560×1440', '2560×1080', '1920×1080', '1920×1200', '1600×900', '1440×900',
    '1366×768', '1280×720', '1024×768', '1080×1920', '1080×1350', '1080×1080', '720×1280'].map(value => ({ value, label: value })),
]

/** Subscribes only to settled crops; native motion stays in the Rust spotlight. */
function useRegionState(api: BeamApi, present = false) {
  const [state, setState] = createSignal<RegionSnapshot | null>(null)
  let revision = 0
  let presented = -1
  let disposed = false
  const apply = (value: RegionSnapshot) => {
    if (disposed || value.revision < revision) return
    revision = value.revision; setState(value)
    if (present && value.revision !== presented && (value.open ?? value.selected) && !value.dragging) {
      presented = value.revision
      void api.presentRegion(value.revision).catch(console.error)
    }
  }
  onMount(() => {
    void api.regionState().then(apply).catch(console.error)
    onCleanup(api.onEvent(event => { if (event.type === 'regionChanged' && event.snapshot) apply(event.snapshot) }))
  })
  onCleanup(() => { disposed = true })
  return state
}

/** Read-only dimensions followed by presets, anchored to the crop's top left. */
export function RegionControls(props: { api: BeamApi }) {
  const TR = useTR('ScreenRegionOverlay'), N = useTR('Native')
  const theme = useTheme<BeamTheme>()
  const state = useRegionState(props.api, true)
  createEffect(() => { void props.api.regionColors({
    border: theme().outlineBorder, accent: theme().primary,
    surface: theme().captureLabelSurface, foreground: theme().captureLabelForeground, dim: theme().overlayTint, instruction: TR('instruction'),
  }).catch(console.error) })
  return <container width="100%" height="100%">
    <keyBinding shortcut="Escape" onActivated={() => void props.api.cancelRegion().catch(console.error)} />
    <keyBinding shortcut="Enter" onActivated={() => void props.api.confirmRegion().catch(console.error)} />
    <row width="100%" height="100%" gap={6} alignItems="center">
      <row id="region-dimensions-pill" maxWidth={104} height={22} shrink={0} padding={{ start: 6, end: 6 }} radii={11}
        background={theme().captureLabelSurface} border={{ width: 1, color: theme().outlineBorder }} alignItems="center" justifyContent="center">
        <text id="region-dimensions" color={theme().captureLabelForeground} fontSize={11} lineHeight={16} weight={600} noWrap
          text={`${state()?.width ?? 0} × ${state()?.height ?? 0}`} />
      </row>
      <Select id="region-preset" width={0} grow={1} minWidth={0} label={TR('preset')} value={state()?.preset ?? 'free'}
        options={presets.map(item => ({ ...item, label: item.value === 'free' ? N('freeform') : item.label }))} onValueChange={value => void props.api.regionPreset(value).catch(console.error)} allowOutsideWindow />
    </row>
  </container>
}

/** The three capture modes share this retained preparation surface. */
export function RegionActions(props: { api: BeamApi }) {
  const state = useRegionState(props.api)
  const ui = useUiState(props.api)
  const source = () => ui().preparationSource ?? 'region'
  return <CapturePreparationBar api={props.api} source={source()} canRecord={source() !== 'region' || (state()?.canRecord ?? false)} />
}

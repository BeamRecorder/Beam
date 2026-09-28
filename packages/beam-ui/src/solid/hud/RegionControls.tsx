import { useTR } from '../shared/i18n'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useTheme } from '@argui/solid'
import { Button } from '../shared/base-ui/button'
import { Select } from '../shared/base-ui/select'
import { Icon } from '../shared/base-ui/icon'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import type { BeamApi } from '../shared/beamApi'
import type { RegionSnapshot } from '../shared/beamTypes'
import type { BeamTheme } from '../shared/beamThemeTypes'

const presets = [
  { value: 'free', label: 'Freeform' },
  ...['16:9', '16:10', '4:3', '1:1', '9:16'].map(value => ({ value, label: value })),
  ...['1920×1080', '1280×720', '1080×1920'].map(value => ({ value, label: value })),
]

/** Subscribes only to settled crops; native motion stays in the Rust spotlight. */
function useRegionState(api: BeamApi, present: boolean) {
  const [state, setState] = createSignal<RegionSnapshot | null>(null)
  let revision = 0
  let disposed = false
  const apply = (value: RegionSnapshot) => {
    if (disposed || value.revision < revision) return
    revision = value.revision; setState(value)
    if (present && value.selected) void api.presentRegion(value.revision).catch(console.error)
  }
  onMount(() => {
    void api.regionState().then(apply).catch(console.error)
    onCleanup(api.onEvent(event => { if (event.type === 'regionChanged' && event.snapshot) apply(event.snapshot) }))
  })
  onCleanup(() => { disposed = true })
  return state
}

/** Small native window above the crop with its dimensions and shared Select. */
export function RegionControls(props: { api: BeamApi }) {
  const TR = useTR('ScreenRegionOverlay'), N = useTR('Native')
  const theme = useTheme<BeamTheme>()
  const state = useRegionState(props.api, true)
  createEffect(() => { void props.api.regionColors({
    border: theme().outlineBorder, accent: theme().primary,
    surface: theme().popover, foreground: theme().foreground, dim: theme().overlayTint, instruction: TR('instruction'),
  }).catch(console.error) })
  return <WindowSurface resizable={false}>
    <keyBinding shortcut="Escape" onActivated={() => void props.api.cancelRegion().catch(console.error)} />
    <row width="100%" height="100%" padding={5} gap={5} alignItems="center">
      <row width={87} shrink={0} alignItems="center" justifyContent="center">
        <text color={theme().foreground} fontSize={11} weight={500}>{`${state()?.width ?? 0} × ${state()?.height ?? 0}`}</text>
      </row>
      <Select width={0} grow={1} minWidth={0} label={TR('preset')} value={state()?.preset ?? 'free'}
        options={presets.map(item => ({ ...item, label: item.value === 'free' ? N('freeform') : item.label }))} onValueChange={value => void props.api.regionPreset(value).catch(console.error)} allowOutsideWindow />
      <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR('cancel')} onClick={() => void props.api.cancelRegion().catch(console.error)}>
        <Icon name="x" size={14} color={theme().foreground} />
      </Button>
    </row>
  </WindowSurface>
}

/** Independent native Record control below the crop, outside its input hole. */
export function RegionActions(props: { api: BeamApi }) {
  const TR = useTR('VoiceoverRecorder')
  const state = useRegionState(props.api, false)
  return <WindowSurface resizable={false}>
    <keyBinding shortcut="Escape" onActivated={() => void props.api.cancelRegion().catch(console.error)} />
    <keyBinding shortcut="Enter" onActivated={() => void props.api.confirmRegion().catch(console.error)} />
    <container width="100%" height="100%" padding={5}>
      <Button width="100%" size="sm" disabled={!state()?.canRecord}
        onClick={() => void props.api.confirmRegion().catch(console.error)}>{TR('record')}</Button>
    </container>
  </WindowSurface>
}

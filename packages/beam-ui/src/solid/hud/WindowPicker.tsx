import { useTR } from '../shared/i18n'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { AssetRef } from '@argui/host'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme, VirtualList } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { MarqueeText } from '../shared/base-ui/marqueeText'
import type { BeamApi } from '../shared/beamApi'
import type { WindowChoice } from '../shared/beamTypes'
import { WindowSurface, WindowOutline } from '../shared/base-ui/windowSurface'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'

function WindowTile(props: { api: BeamApi; choice: WindowChoice; active: boolean; disabled: boolean;
  onHover: () => void; onSelect: () => void }): JSX.Element {
  const TR = useTR('Native')
  const theme = useTheme<WidgetTheme>()
  const [thumbnail, setThumbnail] = createSignal<AssetRef>()
  const [unavailable, setUnavailable] = createSignal(false)
  let disposed = false
  onCleanup(() => { disposed = true })
  onMount(() => {
    void props.api.windowThumbnail(props.choice.id, props.choice.generation).then(image => { if (!disposed) setThumbnail(image) })
      .catch(() => { if (!disposed) setUnavailable(true) })
  })
  return <container width={216} height={172} padding={{ right: 8 }}>
    <focusScope width="100%" height="100%" role="option" accessibleName={props.choice.label}
      tooltip={unavailable() ? TR('previewUnavailable') : undefined} selected={props.active} enabled={!props.disabled} keyboardActivation="enterOrSpace" onClick={props.onSelect}>
      <touchArea width="100%" height="100%" mouseCursor="pointer" onPointerEnter={props.onHover}>
        <rectangle width="100%" height="100%" radii={8} padding={7} clip background={theme().card}
          border={{ width: 2, color: props.active ? theme().primary : theme().border }}
          transitionMs={120}>
          <column width="100%" height="100%" gap={7}>
            <rectangle width="100%" grow={1} minHeight={0} radii={4} clip background={theme().muted}>
              <Show when={thumbnail()} fallback={<container width="100%" height="100%" alignItems="center" justifyContent="center">
                <Icon name="app-window" size={24} color={theme().mutedForeground} />
              </container>}>{source => <image source={source()} width="100%" height="100%" fit="contain" alt={props.choice.label} />}</Show>
            </rectangle>
            <MarqueeText value={props.choice.label} viewportWidth={190} color={theme().foreground} />
          </column>
        </rectangle>
      </touchArea>
    </focusScope>
  </container>
}

/** Native Alt-Tab style selector with real window images and desktop hover preview. */
export function WindowPicker(props: { api: BeamApi }): JSX.Element {
  const TR = useTR('HUD'), S = useTR('ScreenRegionOverlay')
  const theme = useTheme<WidgetTheme>()
  const [choices, setChoices] = createSignal<WindowChoice[]>([])
  const [active, setActive] = createSignal(0)
  const [version, setVersion] = createSignal(1)
  const [initialIndex, setInitialIndex] = createSignal(0)
  const [error, setError] = createSignal('')
  const [pending, setPending] = createSignal(false)
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let hovered: string | undefined
  let previewing = false
  let disposed = false
  let refreshRevision = 0
  let visibleStart = 0, visibleEnd = 4
  const report = (cause: unknown) => { if (!disposed) setError(String(cause)) }
  const refresh = async () => {
    const revision = ++refreshRevision
    if (hoverTimer) clearTimeout(hoverTimer)
    hovered = undefined
    const windows = await props.api.windowChoices()
    if (disposed || revision !== refreshRevision) return
    setChoices(windows); setActive(0); setInitialIndex(0); setError(''); setPending(false)
    setVersion(value => value + 1)
  }
  onMount(() => {
    void refresh().catch(report)
    onCleanup(props.api.onEvent(event => {
      if (event.type === 'windowPickerOpened') void refresh().catch(report)
    }))
  })
  onCleanup(() => { disposed = true; hovered = undefined; if (hoverTimer) clearTimeout(hoverTimer) })
  async function preview(): Promise<void> {
    if (previewing || pending()) return
    previewing = true
    try {
      while (hovered && !disposed && !pending()) {
        const id = hovered
        const choice = choices().find(item => item.id === id)
        if (!choice) break
        await props.api.previewWindow(id, choice.generation)
        if (hovered === id) break
      }
    } catch (cause) { report(cause) }
    finally { previewing = false }
  }
  function hover(index: number): void {
    setActive(index)
    hovered = choices()[index]?.id
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = setTimeout(() => void preview(), 70)
  }
  function move(delta: number): void {
    if (!choices().length || pending()) return
    const next = (active() + delta + choices().length) % choices().length
    hover(next)
    if (next < visibleStart || next >= visibleEnd) {
      setInitialIndex(Math.max(0, next - 1))
      setVersion(value => value + 1)
    }
  }
  async function select(index: number): Promise<void> {
    const choice = choices()[index]
    if (!choice || pending()) return
    setPending(true); hovered = undefined
    try { await props.api.chooseWindow(choice.id, choice.generation) }
    catch (cause) { report(cause); setPending(false) }
  }
  const cancel = () => {
    refreshRevision++; hovered = undefined; setPending(true)
    if (hoverTimer) clearTimeout(hoverTimer)
    void props.api.cancelWindowPicker().catch(cause => { report(cause); setPending(false) })
  }
  return <WindowSurface api={props.api} resizable={false}>
    <keyBinding shortcut="Escape" onActivated={cancel} />
    <keyBinding shortcut="ArrowLeft" onActivated={() => move(-1)} />
    <keyBinding shortcut="ArrowRight" onActivated={() => move(1)} />
    <keyBinding shortcut="Enter" onActivated={() => void select(active())} />
    <column width="100%" height="100%" padding={10} gap={8}>
      <row width="100%" height={26} alignItems="center" justifyContent="spaceBetween">
        <text color={theme().foreground} fontSize={13} weight={600}>{TR('window')}</text>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={S('cancel')} onClick={cancel}>
          <Icon name="x" size={16} color={theme().foreground} />
        </Button>
      </row>
      <Show when={choices().length} fallback={<text fontSize={13} color={theme().mutedForeground}>{TR('noWindowsDetected')}</text>}>
        <Show when={version()} keyed>{_version => <VirtualList axis="horizontal" width="100%" height={172}
          count={choices().length} initialIndex={initialIndex()} estimate={216} overscan={2} variable={false}
          itemKey={index => choices()[index].id} scrollbarWidth={3} scrollbarColor={theme().border}
          shadow={{ color: theme().background, width: 20, intensity: 1, left: true, right: true }}
          onWindowChange={range => { visibleStart = range.start; visibleEnd = range.end }}
          renderItem={index => <WindowTile api={props.api} choice={choices()[index]} active={active() === index}
            disabled={pending()} onHover={() => hover(index)} onSelect={() => void select(index)} />} />}</Show>
      </Show>
      <Show when={error()}><text color={theme().destructive} fontSize={11} lineClamp={1} role="alert">{error()}</text></Show>
    </column>
  </WindowSurface>
}

/** Transparent, input-pass-through outline around the previewed native window. */
export function WindowHighlight(): JSX.Element {
  const theme = useTheme<WidgetTheme>()
  return <container width="100%" height="100%"><rectangle width="100%" height="100%"
    radii={10} border={{ width: 3, color: theme().primary }} /><WindowOutline /></container>
}

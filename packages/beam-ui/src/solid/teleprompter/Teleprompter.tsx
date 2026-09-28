import { useTR } from '../shared/i18n'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { applyInputEdit } from '@argui/host'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import { Slider, Switch, ScrollShadow, type WidgetTheme } from '@argui/widgets/solid'
import { mediaAssets } from '../../../assets.generated'
import type { BeamApi } from '../shared/beamApi'
import { Select } from '../shared/base-ui/select'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import { WindowSurface } from '../shared/base-ui/windowSurface'
import { clampTeleprompterLine, splitTeleprompterLines } from './teleprompterTypes'
import { useTeleprompter } from './useTeleprompter'
import { usePlayback } from './usePlayback'

/** Retained native script editor and reader, sharing Beam's existing document schema. */
export function Teleprompter(props: { api: BeamApi }): JSX.Element {
  const TR = useTR('Teleprompter'), T = useTR('TopbarHUD'), N = useTR('Native')
  const theme = useTheme<WidgetTheme>()
  const script = useTeleprompter(props.api)
  const playback = usePlayback(props.api, script.document)
  const [editing, setEditing] = createSignal(true)
  const [settings, setSettings] = createSignal(false)
  const [line, setLine] = createSignal(0)
  const document = script.document
  const lines = () => splitTeleprompterLines(document().text)
  const continuous = () => document().mode === 'continuous'
  const nextLine = (delta: number) => setLine(value => clampTeleprompterLine(value + delta, lines().length))
  const edit = () => { playback.pause(); setEditing(value => !value) }
  const close = async () => { playback.pause(); await script.flush(); await props.api.hideWindow() }
  const toggleAuto = () => { playback.pause(); script.update({ autoscroll: !document().autoscroll }) }
  const updateReader = (patch: Parameters<typeof script.update>[0]) => { playback.reset(); script.update(patch) }
  onMount(() => onCleanup(props.api.onEvent(event => {
    if (event.type === 'windowResized' || (event.type === 'windowVisibility' && !event.visible)) playback.pause()
    if (event.type !== 'shortcut' || event.state !== 'pressed') return
    if (event.id === 'teleprompter.toggleAutoscroll') toggleAuto()
    else if (event.id === 'teleprompter.nextLine') nextLine(1)
    else if (event.id === 'teleprompter.previousLine') nextLine(-1)
  })))
  return <WindowSurface api={props.api}>
    <column width="100%" height="100%" padding={1}>
      <row width="100%" height={34} shrink={0} padding={{ left: 12, right: 6 }} alignItems="center" background={theme().card}>
        <container height="100%" grow={1} minWidth={0}>
          <touchArea width="100%" height="100%" mouseCursor="grab" onPointerDown={() => void props.api.dragWindow().catch(console.error)}>
            <row height="100%" gap={7} alignItems="center"><Icon name="scroll-text" size={16} color={theme().primary} />
              <text fontSize={12} weight={600} color={theme().foreground}>{TR('title')}</text></row>
          </touchArea>
        </container>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR(editing() ? 'preview' : 'edit')} disabled={!script.ready()} onClick={edit}>
          <Icon name={editing() ? 'eye' : 'square-pen'} size={16} color={theme().foreground} />
        </Button>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR('settings')} pressed={settings()} onClick={() => setSettings(value => !value)}>
          <Icon name="settings" size={16} color={theme().foreground} />
        </Button>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('minimize')} onClick={() => void props.api.minimizeWindow().catch(console.error)}>
          <Icon name="minus" size={16} color={theme().foreground} />
        </Button>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('close')} onClick={() => void close().catch(console.error)}>
          <Icon name="x" size={16} color={theme().foreground} />
        </Button>
      </row>
      <rectangle width="100%" height={1} shrink={0} background={theme().border} />
      <Show when={settings()}>
        <column width="100%" gap={7} padding={10} shrink={0}>
          <row width="100%" alignItems="center" gap={8}>
            <container grow={1} minWidth={0}><Select label={TR('mode')} width="100%" value={document().mode}
              options={[{ value: 'continuous', label: TR('continuous') }, { value: 'line-by-line', label: TR('lineByLine') }]}
              onValueChange={value => updateReader({ mode: value as 'continuous' | 'line-by-line' })} allowOutsideWindow /></container>
            <Switch size="sm" accessibleName={TR('autoscroll')} label={TR('autoscroll')} value={document().autoscroll} onValueChange={toggleAuto} />
            <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR('alignLeft')} pressed={document().textAlign === 'left'} onClick={() => updateReader({ textAlign: 'left' })}>
              <Icon name="text-align-start" size={16} color={theme().foreground} />
            </Button>
            <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR('alignCenter')} pressed={document().textAlign === 'center'} onClick={() => updateReader({ textAlign: 'center' })}>
              <Icon name="text-align-center" size={16} color={theme().foreground} />
            </Button>
          </row>
          <row width="100%" alignItems="center" gap={9}>
            <text fontSize={11} color={theme().mutedForeground}>{TR('speed')}</text>
            <Slider grow={1} width={100} min={5} max={200} value={document().scrollSpeed} accessibleName={TR('speed')}
              onValueChange={scrollSpeed => updateReader({ scrollSpeed })} />
            <text fontSize={11} color={theme().mutedForeground}>{TR('fontSize')}</text>
            <Slider grow={1} width={100} min={16} max={36} value={document().fontSize} accessibleName={TR('fontSize')}
              onValueChange={fontSize => updateReader({ fontSize })} />
          </row>
        </column>
      </Show>
      <container id="teleprompterViewport" width="100%" grow={1} minHeight={0} clip padding={16}>
        <Show when={editing()} fallback={<Show when={continuous()} fallback={
          <column width="100%" height="100%" justifyContent="center" gap={12}>
            <text width="100%" color={theme().mutedForeground} fontSize={16} lineClamp={2} textAlign={document().textAlign}>{lines()[line() - 1] ?? ''}</text>
            <text width="100%" color={theme().foreground} fontSize={document().fontSize} lineHeight={document().fontSize * document().lineHeight}
              textAlign={document().textAlign}>{lines()[line()] ?? ''}</text>
            <text width="100%" color={theme().mutedForeground} fontSize={16} lineClamp={2} textAlign={document().textAlign}>{lines()[line() + 1] ?? ''}</text>
          </column>}>
          <Show when={document().autoscroll} fallback={<ScrollShadow width="100%" height="100%">
            <text width="100%" color={theme().foreground} fontSize={document().fontSize} lineHeight={document().fontSize * document().lineHeight}
              textAlign={document().textAlign}>{document().text}</text>
          </ScrollShadow>}>
          <container width="100%" transform={{ translateY: -playback.offset() }} transitionMs={playback.duration()} transitionTimingFunction="linear">
            <text id="teleprompterContent" width="100%" color={theme().foreground} fontSize={document().fontSize}
              lineHeight={document().fontSize * document().lineHeight} textAlign={document().textAlign}>{document().text}</text>
          </container>
          </Show>
        </Show>}>
          <textInput width="100%" height="100%" multiline value={document().text} enabled={script.ready()} label={TR('editorLabel')} placeholder={TR('placeholder')}
            textColor={theme().foreground} placeholderColor={theme().mutedForeground} caretColor={theme().primary}
            onEdit={event => { const text = applyInputEdit(document().text, event); if (text !== undefined) { playback.reset(); setLine(0); script.update({ text }) } }} />
        </Show>
      </container>
      <row width="100%" height={38} shrink={0} padding={{ left: 10, right: 10 }} gap={6} alignItems="center" justifyContent="center" background={theme().card}>
        <Show when={!editing()}>
          <Button variant="ghost" size="icon-xs" iconOnly accessibleName={N('resetReader')} onClick={() => { playback.reset(); setLine(0) }}><Icon name="rotate-ccw" size={16} color={theme().foreground} /></Button>
          <Show when={!continuous()}>
            <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR('previousLine')} onClick={() => nextLine(-1)}><Icon name="chevron-left" size={16} color={theme().foreground} /></Button>
            <Button variant="ghost" size="icon-xs" iconOnly accessibleName={TR('nextLine')} onClick={() => nextLine(1)}><Icon name="chevron-right" size={16} color={theme().foreground} /></Button>
          </Show>
          <Show when={continuous() && document().autoscroll}>
            <Button size="icon-xs" iconOnly accessibleName={TR(playback.playing() ? 'pause' : 'resume')} onClick={() => void playback.play()}><Icon name={playback.playing() ? 'pause' : 'play'} size={16} color={theme().primaryForeground} /></Button>
          </Show>
        </Show>
        <Show when={script.error() || playback.error()}><text color={theme().destructive} fontSize={11} lineClamp={1}>{script.error() || playback.error()}</text></Show>
      </row>
      <keyBinding shortcut="Escape" onActivated={() => void close().catch(console.error)} />
      <keyBinding shortcut="ArrowDown" enabled={!editing() && !continuous()} onActivated={() => nextLine(1)} />
      <keyBinding shortcut="ArrowUp" enabled={!editing() && !continuous()} onActivated={() => nextLine(-1)} />
      <keyBinding shortcut="Space" enabled={!editing() && continuous() && document().autoscroll} onActivated={() => void playback.play()} />
    </column>
  </WindowSurface>
}

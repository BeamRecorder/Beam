import { createEffect, createSignal, Show } from 'solid-js'
import { applyInputEdit } from '@argui/host'
import type { JSX } from '@argui/solid/jsx-runtime'
import { useTheme } from '@argui/solid'
import type { WidgetTheme } from '@argui/widgets/solid'
import { Button } from '../shared/base-ui/button'
import { Icon } from '../shared/base-ui/icon'
import { useTR } from '../shared/i18n'
import { useWindowMetrics } from '../shared/useWindowMetrics'
import { TeleprompterSurface } from './TeleprompterSurface'
import { TeleprompterToolbar } from './TeleprompterToolbar'
import { useTeleprompter } from './useTeleprompter'
import { usePlayback } from './usePlayback'
import { resolvedTextColor } from './textColor'
import type { TeleprompterProps } from './teleprompterUiTypes'

/** Inline script editing and continuous scrolling preview with four floating adjustments. */
export function Teleprompter(props: TeleprompterProps): JSX.Element {
  const TR = useTR('Teleprompter'), T = useTR('TopbarHUD')
  const theme = useTheme<WidgetTheme>()
  const script = useTeleprompter(props.api)
  const document = script.document
  const textColor = () => resolvedTextColor(document(), theme().foreground)
  const metrics = useWindowMetrics(props.api, { width: 520, height: 360 })
  const [previewing, setPreviewing] = createSignal(false)
  const [toolbarOpen, setToolbarOpen] = createSignal(false)
  const playback = usePlayback(props.api, document, () => script.ready() && previewing())
  createEffect(() => {
    if (!previewing() || playback.playing() || playback.pending()) return
    // Live adjustment briefly pauses internally before scheduling its next animation.
    queueMicrotask(() => {
      if (!playback.playing() && !playback.pending()) setPreviewing(false)
    })
  })

  function preview(): void {
    if (playback.playing() || playback.pending()) {
      playback.pause()
      setPreviewing(false)
      return
    }
    if (!script.ready() || !document().text.trim()) return
    setPreviewing(true)
    void playback.start()
  }

  async function close(): Promise<void> {
    playback.pause()
    await script.flush()
    await props.api.hideWindow()
  }

  return <TeleprompterSurface api={props.api} opacity={document().windowOpacity}>
    <column width="100%" height="100%" padding={1}>
      <row width="100%" height={40} shrink={0} padding={{ start: 14, end: 8 }} alignItems="center" gap={6}>
        <container height="100%" grow={1} minWidth={0}>
          <touchArea width="100%" height="100%" mouseCursor="grab" onPointerDown={() => void props.api.dragWindow().catch(console.error)}>
            <row height="100%" gap={7} alignItems="center">
              <Icon name="scroll-text" size={16} color={theme().mutedForeground} />
              <text id="teleprompter-title" fontSize={12} weight={600} color={theme().foreground}>{TR('title')}</text>
            </row>
          </touchArea>
        </container>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('minimize')} onClick={() => void props.api.minimizeWindow().catch(console.error)}>
          <Icon name="minus" size={16} color={theme().mutedForeground} />
        </Button>
        <Button variant="ghost" size="icon-xs" iconOnly accessibleName={T('close')} onClick={() => void close().catch(console.error)}>
          <Icon name="x" size={16} color={theme().mutedForeground} />
        </Button>
      </row>
      <container width="100%" grow={1} minHeight={0} padding={{ start: 24, end: 24, top: 8, bottom: previewing() ? 18 : 88 }}>
        <container id="teleprompterViewport" width="100%" height="100%" clip>
          <Show when={previewing()} fallback={
            <textInput width="100%" height="100%" multiline value={document().text} enabled={script.ready()}
              label={TR('editorLabel')} placeholder={TR('placeholder')} background="#00000000"
              textColor={textColor()} placeholderColor={theme().mutedForeground} caretColor={theme().primary}
              onEdit={event => {
                const text = applyInputEdit(document().text, event)
                if (text !== undefined && text !== document().text) { playback.reset(); script.update({ text }) }
              }} />
          }>
            <container width="100%" shrink={0} transform={{ translateY: -playback.offset() }}
              transitionMs={playback.duration() || undefined}
              transitionTimingFunction={playback.duration() ? 'linear' : undefined}>
              <column id="teleprompterContent" width="100%" shrink={0} padding={{ bottom: 88 }}>
                <text width="100%" color={textColor()} fontSize={document().fontSize}
                  lineHeight={document().fontSize * document().lineHeight} textAlign={document().textAlign}>{document().text}</text>
              </column>
            </container>
          </Show>
        </container>
      </container>
      <keyBinding shortcut="Escape" enabled={!toolbarOpen()} onActivated={() => void close().catch(console.error)} />
      <keyBinding shortcut="Space" enabled={previewing() && !toolbarOpen()} onActivated={preview} />
    </column>
    <TeleprompterToolbar document={document()} ready={script.ready()} playing={playback.playing()} pending={playback.pending()}
      error={script.error() || playback.error()} onCopyError={text => props.api.copyText(text)} onUpdate={script.update} onPreview={preview}
      viewportHeight={metrics().height} onPopoverOpenChange={setToolbarOpen} />
  </TeleprompterSurface>
}

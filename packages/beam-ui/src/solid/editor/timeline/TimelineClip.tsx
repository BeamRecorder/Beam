import { Show, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { NativeEventPayload } from '@argui/host';
import { ClipVisuals } from './ClipVisuals';
import type { VisualViewport } from '../media/visualTypes';
import { Icon } from '../../shared/base-ui/icon';
import { useTR } from '../../shared/i18n';
import type { Asset, Clip, Project, Track } from '../shared/editorTypes';
import type { EditorState } from '../shared/useEditor';
import { snapStart, timecode } from './timelineModel';

/** Pointer gestures keep a local draft and commit one non-destructive edit on release. */
export function TimelineClip(props: {
  clip: Clip;
  asset?: Asset;
  track: Track;
  project: Project;
  pixels: number;
  height: number;
  snapping: boolean;
  editor: EditorState;
  viewport: VisualViewport;
}) {
  const theme = useTheme<WidgetTheme>(),
    TR = useTR('NativeEditor');
  const [start, setStart] = createSignal<number>(),
    [trim, setTrim] = createSignal<{ left: number; duration: number }>();
  const currentStart = () => start() ?? props.clip.startMs;
  const currentDuration = () => trim()?.duration ?? props.clip.durationMs;
  const selected = () => props.editor.selected() === props.clip.id;
  let originX = 0,
    dragging = false,
    trimMode: 'left' | 'right' | undefined;
  function down(payload: NativeEventPayload<'pointerDown'>, mode?: 'left' | 'right') {
    props.editor.select(props.clip.id);
    originX = payload.x ?? 0;
    trimMode = mode;
    dragging = true;
  }
  function move(payload: NativeEventPayload<'pointerMove'>) {
    if (!dragging) return;
    const delta = Math.round((((payload.x ?? originX) - originX) * 1000) / props.pixels);
    if (!trimMode) {
      setStart(
        props.snapping ? snapStart(
          props.clip.startMs + delta,
          props.clip,
          props.project,
          props.editor.transport().positionMs,
          props.pixels,
        ) : Math.max(0, props.clip.startMs + delta),
      );
      return;
    }
    if (trimMode === 'left') {
      const amount = Math.max(-props.clip.sourceInMs, -props.clip.startMs, Math.min(props.clip.durationMs - 1, delta));
      setTrim({ left: amount, duration: props.clip.durationMs - amount });
      setStart(props.clip.startMs + amount);
    } else {
      const available = (props.asset?.durationMs ?? 21_600_000) - props.clip.sourceInMs;
      setTrim({ left: 0, duration: Math.max(1, Math.min(available, props.clip.durationMs + delta)) });
    }
  }
  function finish() {
    if (!dragging) return;
    const draft = trim(),
      position = start();
    if (draft)
      void props.editor.edit({
        type: 'trim',
        id: props.clip.id,
        sourceInMs: props.clip.sourceInMs + draft.left,
        durationMs: draft.duration,
        startMs: position ?? props.clip.startMs,
      });
    else if (position !== undefined && position !== props.clip.startMs)
      void props.editor.edit({ type: 'move', id: props.clip.id, trackId: props.clip.trackId, startMs: position });
    cancel();
  }
  function cancel() {
    setStart(undefined);
    setTrim(undefined);
    trimMode = undefined;
    dragging = false;
  }
  const color = () => props.clip.title ? theme().chart3 : props.track.kind === 'video' ? theme().chart1 : theme().chart2;
  const label = () => props.clip.title?.text ?? props.asset?.name ?? TR('unavailable');
  const plan = () => ({ asset: props.asset!, clip: { startMs: currentStart(), sourceInMs: props.clip.sourceInMs + (trim()?.left ?? 0), durationMs: currentDuration() }, viewport: props.viewport });
  return (
    <focusScope
      id={`timeline-clip-${props.clip.id}`}
      position="absolute"
      inset={{ start: (currentStart() / 1000) * props.pixels, top: 4 }}
      width={Math.max(5, (currentDuration() / 1000) * props.pixels)}
      height={props.height}
      role="button"
      accessibleName={`${label()} ${timecode(props.clip.startMs)}`}
      selected={selected()}
      keyboardActivation="enterOrSpace"
      enabled={!props.editor.busy()}
      onClick={() => props.editor.select(props.clip.id)}
    >
      <rectangle
        width="100%"
        height="100%"
        radii={5}
        background={color()}
        opacity={props.track.hidden ? 0.35 : 1}
        border={{ width: selected() ? 2 : 1, color: selected() ? '#f5f5f7' : color() }}
        focusBorderColor={theme().focusRing}
      >
        <touchArea
          width="100%"
          height="100%"
          enabled={!props.editor.busy()}
          mouseCursor="grab"
          onPointerDown={(event) => down(event)}
          onMoved={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
        >
          <column width="100%" height="100%" gap={0}>
            <row width="100%" height={18} shrink={0} padding={{ start: 8, end: 8 }} gap={4} alignItems="center">
              <Icon name={props.clip.title ? 'type' : props.track.kind === 'video' ? 'film' : 'audio-lines'} size={10} color="#ffffff" />
              <container grow={1} minWidth={0}><text fontSize={10} color="#ffffff" lineClamp={1} text={label()} /></container>
              <Show when={props.asset?.zoomCount && props.clip.effects.autoZoom}><Icon name="mouse-pointer-2" size={10} color="#ffffff" /></Show>
            </row>
            <Show when={props.asset && !props.clip.title} fallback={
              <row width="100%" grow={1} padding={{ start: 8 }} alignItems="center"><text fontSize={10} color="#ffffff" text={timecode(currentDuration())} /></row>
            }>
              <Show when={props.asset?.hasVideo && props.track.kind === 'video'}>
                <container width="100%" grow={1} minHeight={0}><ClipVisuals plan={plan()} kind="video" asset={props.asset!} editor={props.editor} /></container>
              </Show>
              <Show when={props.asset?.hasAudio}>
                <container width="100%" height={props.track.kind === 'video' ? 20 : props.height - 18} shrink={0}>
                  <ClipVisuals plan={plan()} kind="audio" asset={props.asset!} editor={props.editor} />
                </container>
              </Show>
            </Show>
          </column>
        </touchArea>
        <Show when={selected()}>
          <touchArea
            position="absolute"
            inset={{ start: 0, top: 0 }}
            width={7}
            height="100%"
            mouseCursor="ewResize"
            accessibleName={TR('trimStart')}
            onPointerDown={(event) => down(event, 'left')}
            onMoved={move}
            onPointerUp={finish}
            onPointerCancel={cancel}
          >
            <rectangle
              width={3}
              height={20}
              position="absolute"
              inset={{ start: 2, top: Math.max(0, (props.height - 20) / 2) }}
              radii={2}
              background={theme().primaryForeground}
            />
          </touchArea>
          <touchArea
            position="absolute"
            inset={{ end: 0, top: 0 }}
            width={7}
            height="100%"
            mouseCursor="ewResize"
            accessibleName={TR('trimEnd')}
            onPointerDown={(event) => down(event, 'right')}
            onMoved={move}
            onPointerUp={finish}
            onPointerCancel={cancel}
          >
            <rectangle
              width={3}
              height={20}
              position="absolute"
              inset={{ end: 2, top: Math.max(0, (props.height - 20) / 2) }}
              radii={2}
              background={theme().primaryForeground}
            />
          </touchArea>
        </Show>
      </rectangle>
    </focusScope>
  );
}

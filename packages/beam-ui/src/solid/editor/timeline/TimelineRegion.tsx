import { Show, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { NativeEventPayload } from '@argui/host';
import { useTR } from '../../shared/i18n';
import { definitionLabel } from '../properties/definitionLabels';
import { dragRegion, regionWindow } from './regionModel';
import type { RegionGesture, RegionRow, RegionWindow } from './regionTypes';
import type { EditorState } from '../shared/useEditor';

/** Region drags submit one edit and retain the instance's existing time space. */
export function TimelineRegion(props: { row: RegionRow; pixels: number; margin: number; editor: EditorState }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const [draft, setDraft] = createSignal<RegionWindow>();
  const [committing, setCommitting] = createSignal(false);
  let originX = 0, gesture: RegionGesture | undefined;
  const transition = () => props.row.region.kind === 'transition';
  const window = () => draft() ?? regionWindow(props.row.region);
  const instance = () => props.row.region;
  const selected = () => (transition() ? props.editor.selectedTransition() : props.editor.selectedEffect()) === props.row.region.id;
  const label = createMemo(() => instance()?.name ?? definitionLabel(props.editor.snapshot()?.project.definitions?.find(definition => definition.id === props.row.region.definitionId && definition.version === props.row.region.definitionVersion)?.label ?? props.row.region.definitionId, TR));
  function select() {
    if (transition()) props.editor.selectTransition(props.row.region.id);
    else props.editor.selectEffect(props.row.clip.id, props.row.region.id);
  }
  function down(event: NativeEventPayload<'pointerDown'>, mode: RegionGesture) {
    select();
    if (transition() || props.editor.busy() || committing()) return;
    originX = event.x ?? 0;
    gesture = mode;
  }
  function move(event: NativeEventPayload<'pointerMove'>) {
    if (gesture) setDraft(dragRegion(regionWindow(props.row.region), props.row.clip, ((event.x ?? originX) - originX) * 1000 / props.pixels, gesture));
  }
  function cancel() { gesture = undefined; setDraft(undefined); }
  async function finish() {
    const range = draft();
    gesture = undefined;
    setCommitting(true);
    try {
      if (range) await props.editor.execute([{ type: 'effectRangeAt', clip: props.row.clip.id, instance: props.row.region.id,
        start: { ticks: Math.round(range.startMs * 1000), timescale: 1000000 }, end: { ticks: Math.round(range.endMs * 1000), timescale: 1000000 } }]);
    } finally { cancel(); setCommitting(false); }
  }
  createEffect(() => { props.editor.gestureVersion(); untrack(cancel); });
  return <container position="absolute" inset={{ start: props.margin + regionWindow(props.row.region).startMs / 1000 * props.pixels, top: props.row.top }}
    transform={{ translateX: (window().startMs - regionWindow(props.row.region).startMs) / 1000 * props.pixels }}
    width={Math.max(5, (window().endMs - window().startMs) / 1000 * props.pixels)} height={20}>
    <focusScope id={`timeline-region-${props.row.region.id}`} enabled={!committing()}
    width={Math.max(5, (window().endMs - window().startMs) / 1000 * props.pixels)} height={20} role="button" accessibleName={label()}
    keyboardActivation="none" selected={selected()} onKey={event => { if (event.state === 'pressed' && event.key === 'Enter') select(); }}>
    <rectangle width="100%" height="100%" radii={4} background={transition() ? theme().chart3 : theme().primary} opacity={props.row.region.enabled ? 0.85 : 0.35}
      border={{ width: selected() ? 2 : 1, color: selected() ? theme().foreground : theme().border }}>
      <touchArea width="100%" height="100%" mouseCursor={transition() ? 'pointer' : 'grab'} onPointerDown={event => down(event, 'move')} onMoved={move} onPointerUp={finish} onPointerCancel={cancel}>
        <container width="100%" height="100%" padding={{ start: 8, end: 8, top: 3 }}><text fontSize={10} color={theme().primaryForeground} lineClamp={1}>{label()}</text></container>
      </touchArea>
      <Show when={selected() && !transition()}>
        <touchArea position="absolute" inset={{ start: 0, top: 0 }} width={6} height="100%" mouseCursor="ewResize" accessibleName={TR('trimStart')}
          onPointerDown={event => down(event, 'start')} onMoved={move} onPointerUp={finish} onPointerCancel={cancel} />
        <touchArea position="absolute" inset={{ end: 0, top: 0 }} width={6} height="100%" mouseCursor="ewResize" accessibleName={TR('trimEnd')}
          onPointerDown={event => down(event, 'end')} onMoved={move} onPointerUp={finish} onPointerCancel={cancel} />
      </Show>
    </rectangle>
  </focusScope></container>;
}

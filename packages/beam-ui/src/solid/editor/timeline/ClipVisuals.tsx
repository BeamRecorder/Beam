import { For, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { Asset } from '../shared/editorTypes';
import type { EditorState } from '../shared/useEditor';
import type { VisualPlan, VisualTile } from '../media/visualTypes';
import { planVisuals } from '../media/visualPlan';
import { SourceVisual } from '../media/SourceVisual';

/** Retains ready source tiles at their new placement while zoom refinements arrive. */
export function ClipVisuals(props: { plan: VisualPlan; kind: 'video' | 'audio'; editor: EditorState; asset: Asset }) {
  const theme = useTheme<WidgetTheme>();
  const tiles = createMemo(() => planVisuals(props.plan, props.kind));
  const [outgoing, setOutgoing] = createSignal<VisualTile[]>([]), [fading, setFading] = createSignal(false);
  let previous: VisualTile[] = [], source = props.asset.id, ready = new Set<string>(), timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on(() => `${props.asset.id}:${tiles().map(tile => tile.id).join(',')}`, () => {
    if (timer) clearTimeout(timer);
    const retained = previous.filter(tile => ready.has(tile.id));
    if (source !== props.asset.id) setOutgoing([]);
    else if (retained.length) setOutgoing(retained);
    const next = tiles(); const known = new Set(next.filter(tile => ready.has(tile.id)).map(tile => tile.id));
    previous = next; source = props.asset.id; ready = known; setFading(false);
  }));
  onCleanup(() => { if (timer) clearTimeout(timer); });
  const retained = () => outgoing().filter(tile => {
    const low = props.plan.clip.sourceInMs + props.plan.viewport.startMs - props.plan.clip.startMs;
    const high = props.plan.clip.sourceInMs + props.plan.viewport.endMs - props.plan.clip.startMs;
    return tile.endMs > low && tile.startMs < high;
  });
  function completed(id: string) {
    ready.add(id);
    if (!untrack(outgoing).length || !tiles().every(tile => ready.has(tile.id))) return;
    setFading(true);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { setOutgoing([]); timer = undefined; }, 160);
  }
  const position = (tile: VisualTile) => {
    return (tile.startMs - props.plan.clip.sourceInMs) / 1000 * props.plan.viewport.pixels;
  };
  return <rectangle width="100%" height="100%" background={props.kind === 'audio' ? theme().chart2 : theme().secondary}>
    <container position="absolute" inset={{ start: 0, top: 0 }} width="100%" height="100%" opacity={fading() ? 0 : 1}
      transitionMs={160} transitionTimingFunction="cubic-bezier(0.2, 0, 0, 1)">
      <For each={retained().map(tile => tile.id)}>{id => {
        const tile = () => outgoing().find(tile => tile.id === id)!;
        const duration = () => tile().endMs - tile().startMs;
        return <container position="absolute" inset={{ start: position(tile()), top: 0 }} width={duration() / 1000 * props.plan.viewport.pixels} height="100%">
          <SourceVisual asset={props.asset} editor={props.editor} request={tile().request} />
        </container>;
      }}</For>
    </container>
    <For each={tiles().map(tile => tile.id)}>{id => {
      const tile = () => tiles().find(tile => tile.id === id)!;
      const request = createMemo(() => tile().request, undefined, { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
      return <container position="absolute" inset={{ start: tile().x, top: 0 }} width={tile().width} height="100%">
        <SourceVisual asset={props.asset} editor={props.editor} request={request()} refining={outgoing().length > 0} onReady={() => completed(id)} />
      </container>;
    }}</For>
  </rectangle>;
}

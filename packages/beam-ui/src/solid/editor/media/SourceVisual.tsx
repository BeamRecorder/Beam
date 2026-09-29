import { Show, createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { Asset } from '../shared/editorTypes';
import type { EditorState } from '../shared/useEditor';
import type { VisualRequest, VisualState } from './visualTypes';
import { Icon } from '../../shared/base-ui/icon';
import { useTR } from '../../shared/i18n';

/** Native GPU canvas with explicit loading/failure and a compositor-only reveal. */
export function SourceVisual(props: { asset: Asset; editor: EditorState; request: VisualRequest; refining?: boolean; onReady?: () => void }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const [state, setState] = createSignal<VisualState>({ status: 'loading', error: null });
  const projectId = createMemo(() => props.editor.snapshot()?.project.id);
  const assetId = createMemo(() => props.asset.id);
  const request = createMemo(() => props.request, undefined, { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
  createEffect(() => {
    const project = projectId();
    setState({ status: 'loading', error: null });
    if (!project || !props.editor.visible()) return;
    onCleanup(props.editor.visuals.subscribe(project, assetId(), request(), value => {
      setState(value); if (value.status === 'ready') untrack(() => props.onReady?.());
    }));
  });
  return <container width="100%" height="100%">
      <container position="absolute" inset={{ start: 0, top: 0 }} width="100%" height="100%" opacity={state().canvasId && state().status !== 'failed' && (!props.refining || state().status === 'ready') ? 1 : 0}
        transitionMs={160} transitionTimingFunction="cubic-bezier(0.2, 0, 0, 1)">
        <Show when={state().canvasId}>
        <gpuCanvas canvasId={state().canvasId!} width="100%" height="100%" alt={props.asset.name} />
        </Show>
      </container>
    <Show when={state().status === 'loading' && props.request.kind === 'audio'}>
      <container position="absolute" inset={{ end: 4, top: 3 }} width={12} height={12} tooltip={TR('loading')}>
        <Icon name="clock-3" size={10} color={theme().foreground} />
      </container>
    </Show>
    <Show when={state().status === 'failed' || (!state().canvasId && props.request.kind === 'video')}>
      <row width="100%" height="100%" justifyContent="center" alignItems="center" tooltip={state().error ?? TR('loading')}>
        <Icon name={state().status === 'failed' ? 'image-off' : 'clock-3'} size={14} color={theme().mutedForeground} />
      </row>
    </Show>
  </container>;
}

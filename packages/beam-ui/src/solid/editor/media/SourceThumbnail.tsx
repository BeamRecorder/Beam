import { Show } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { Asset } from '../shared/editorTypes';
import type { EditorState } from '../shared/useEditor';
import { Icon } from '../../shared/base-ui/icon';
import { SourceVisual } from './SourceVisual';

export function SourceThumbnail(props: { asset: Asset; editor: EditorState }) {
  const theme = useTheme<WidgetTheme>();
  return <rectangle width="100%" height="100%" radii={7} background={theme().muted}>
    <Show when={props.asset.hasVideo} fallback={<row width="100%" height="100%" justifyContent="center" alignItems="center">
      <Icon name="audio-lines" size={18} color={theme().mutedForeground} />
    </row>}>
      <SourceVisual asset={props.asset} editor={props.editor} request={{ kind: 'video', positionMs: 0 }} />
    </Show>
  </rectangle>;
}

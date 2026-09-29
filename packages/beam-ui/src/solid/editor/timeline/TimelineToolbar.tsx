import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import { Popover } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Icon } from '../../shared/base-ui/icon';
import { IconButton } from '../../shared/base-ui/iconButton';
import { useTR } from '../../shared/i18n';
import type { EditorState } from '../shared/useEditor';

export function TimelineToolbar(props: { editor: EditorState; pixels: number; snapping: boolean; width: number;
  setPixels: (value: number) => void; setSnapping: (value: boolean) => void }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const clip = () => props.editor.clip(), position = () => props.editor.transport().positionMs;
  const canSplit = () => !!clip() && position() > clip()!.startMs && position() < clip()!.startMs + clip()!.durationMs;
  return <row width="100%" height={38} shrink={0} padding={{ start: 10, end: 10 }} gap={8} alignItems="center">
    <row id="editor-history-actions" role="group" accessibleName={TR('history')} gap={2} alignItems="center">
      <IconButton id="editor-undo" icon="rotate-ccw" label={TR('undo')} disabled={!props.editor.snapshot()?.canUndo || props.editor.busy()} onClick={() => void props.editor.edit({ type: 'undo' })} />
      <IconButton id="editor-redo" icon="rotate-cw" label={TR('redo')} disabled={!props.editor.snapshot()?.canRedo || props.editor.busy()} onClick={() => void props.editor.edit({ type: 'redo' })} />
    </row>
    <rectangle width={1} height={16} background={theme().border} />
    <IconButton icon="scissors" label={TR('split')} disabled={!canSplit() || props.editor.busy()}
      onClick={() => void props.editor.edit({ type: 'split', id: clip()!.id, timeMs: position() })} />
    <IconButton icon="trash-2" label={TR('delete')} disabled={!clip() || props.editor.busy()}
      onClick={() => void props.editor.edit({ type: 'remove', id: clip()!.id })} />
    <rectangle width={1} height={16} background={theme().border} />
    <IconButton icon="magnet" label={TR('snapping')} pressed={props.snapping} onClick={() => props.setSnapping(!props.snapping)} />
    <Popover width={30} contentWidth={200} accessibleLabel={TR('addTrack')} placement="bottomStart"
      trigger="" leading={<Icon name="plus" size={14} color={theme().mutedForeground} />}>
      <column width="100%" gap={4}>
        <Button variant="ghost" contentAlign="start" width="100%" disabled={props.editor.busy() || !props.editor.snapshot()}
          onClick={() => void props.editor.edit({ type: 'addTrack', name: TR('video'), kind: 'video' })}>{TR('addVideo')}</Button>
        <Button variant="ghost" contentAlign="start" width="100%" disabled={props.editor.busy() || !props.editor.snapshot()}
          onClick={() => void props.editor.edit({ type: 'addTrack', name: TR('audio'), kind: 'audio' })}>{TR('addAudio')}</Button>
      </column>
    </Popover>
    <container grow={1} />
    <IconButton icon="minimize-2" label={TR('fitTimeline')} onClick={() => props.setPixels(Math.max(8, Math.min(180, props.width / Math.max(5, props.editor.transport().durationMs / 1000))))} />
    <IconButton icon="minus" label={TR('zoomOut')} disabled={props.pixels <= 8} onClick={() => props.setPixels(Math.max(8, props.pixels / 1.4))} />
    <text fontSize={11} color={theme().mutedForeground} text={`${Math.round(props.pixels / 80 * 100)}%`} />
    <IconButton icon="plus" label={TR('zoomIn')} disabled={props.pixels >= 300} onClick={() => props.setPixels(Math.min(300, props.pixels * 1.4))} />
  </row>;
}

import { Show, createEffect, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import { InputField, type WidgetTheme } from '@argui/widgets/solid';
import { Icon } from '../../shared/base-ui/icon';
import { IconButton } from '../../shared/base-ui/iconButton';
import { Select } from '../../shared/base-ui/select';
import { PreviewControl } from './PreviewControl';
import { useTR } from '../../shared/i18n';
import { Panel } from '../shared/Panel';
import type { EditorState } from '../shared/useEditor';
import type { PreviewQuality } from '../shared/editorTypes';
import { frameTimecode, parseTimecode } from './timecode';

/** Full/Half/Quarter change the native GPU preview resolution; originals and exports keep their size. */
export function Preview(props: { editor: EditorState; width: number }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const canvas = () => props.editor.snapshot()?.project.canvas;
  const fps = () => canvas()?.fps ?? 30;
  const [position, setPosition] = createSignal('00:00:00:00');
  createEffect(() => setPosition(frameTimecode(props.editor.transport().positionMs, fps())));
  const disabled = () => !props.editor.transport().durationMs || props.editor.busy();
  return <Panel width="100%" title={TR('preview')}
    trailing={<text color={theme().mutedForeground} fontSize={11} text={canvas() ? `${canvas()!.width} × ${canvas()!.height} · ${fps()} fps` : ''} />}>
    <column width="100%" grow={1} minHeight={0} justifyContent="center" alignItems="center" padding={12} background={theme().muted}>
      <Show when={props.editor.canvasId()} fallback={<column gap={12} alignItems="center">
        <Icon name="monitor" size={36} color={theme().mutedForeground} />
        <text id="editor-preview-empty" fontSize={13} color={theme().foreground} text={TR(props.editor.loading() ? 'loading' : 'emptyPreview')} />
        <text fontSize={11} color={theme().mutedForeground} text={TR('previewHint')} />
      </column>}>
        <gpuCanvas canvasId={props.editor.canvasId()!} width="100%" height="100%" alt={TR('preview')} />
      </Show>
    </column>
    <row id="editor-preview-controls" containerScope="editor-preview-controls" width="100%" height={46}
      shrink={0} padding={{ start: 10, end: 10 }} gap={4} alignItems="center">
      <InputField width={108} accessibleName={TR('playhead')} value={position()} onValueChange={setPosition}
        invalid={parseTimecode(position(), fps()) === undefined} disabled={disabled()}
        onSubmit={() => { const time = parseTimecode(position(), fps()); if (time !== undefined) void props.editor.seek(time); }} />
      <PreviewControl width={90} minimumWidth={650}>
        <row width="100%" height="100%" alignItems="center"><text width="100%" fontSize={11} lineClamp={1}
          color={theme().mutedForeground} text={`/ ${frameTimecode(props.editor.transport().durationMs, fps())}`} /></row>
      </PreviewControl>
      <container grow={1} />
      <PreviewControl width={26} minimumWidth={480}><IconButton icon="skip-back" label={TR('goStart')} disabled={disabled()} onClick={() => void props.editor.seek(0)} /></PreviewControl>
      <PreviewControl width={26} minimumWidth={380}><IconButton icon="step-back" label={TR('previousFrame')} disabled={disabled()} onClick={() => void props.editor.seek(props.editor.transport().positionMs - 1000 / fps())} /></PreviewControl>
      <IconButton icon={props.editor.transport().playing ? 'pause' : 'play'} accent label={TR(props.editor.transport().playing ? 'pause' : 'play')} disabled={disabled()} onClick={() => void props.editor.toggle()} />
      <PreviewControl width={26} minimumWidth={380}><IconButton icon="step-forward" label={TR('nextFrame')} disabled={disabled()} onClick={() => void props.editor.seek(props.editor.transport().positionMs + 1000 / fps())} /></PreviewControl>
      <PreviewControl width={26} minimumWidth={480}><IconButton icon="skip-forward" label={TR('goEnd')} disabled={disabled()} onClick={() => void props.editor.seek(props.editor.transport().durationMs - 1000 / fps())} /></PreviewControl>
      <container grow={1} />
      <PreviewControl width={68} minimumWidth={560}><Select id="editor-aspect" width="100%" contentWidth={160} label={TR('aspectRatio')}
        value={canvas()?.width === canvas()?.height ? '1:1' : (canvas()?.width ?? 0) > (canvas()?.height ?? 0) ? '16:9' : '9:16'}
        options={['16:9', '9:16', '1:1'].map(value => ({ value, label: value }))} disabled={!canvas() || props.editor.busy()}
        onValueChange={value => void props.editor.edit({ type: 'canvas', canvas: { ...canvas()!, width: value === '16:9' ? 1920 : 1080, height: value === '9:16' ? 1920 : 1080 } })} /></PreviewControl>
      <Select id="editor-quality" width={82} shrink={0} contentWidth={180} label={TR('previewQuality')} value={props.editor.previewQuality()}
        options={(['full', 'half', 'quarter'] as const).map(value => ({ value, label: TR(value) }))}
        disabled={!canvas() || props.editor.busy()} onValueChange={value => void props.editor.quality(value as PreviewQuality)} />
    </row>
  </Panel>;
}

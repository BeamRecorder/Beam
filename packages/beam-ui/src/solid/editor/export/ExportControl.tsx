import { createEffect, createSignal, Show } from 'solid-js';
import { useTheme } from '@argui/solid';
import { Popover, Progress, type WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { ErrorNotice } from '../../shared/base-ui/errorNotice';
import { Select } from '../../shared/base-ui/select';
import { Icon } from '../../shared/base-ui/icon';
import { useTR } from '../../shared/i18n';
import type { EditorState } from '../shared/useEditor';

/** An immutable export starts only after the native destination dialog resolves. */
export function ExportControl(props: { editor: EditorState; onCopyError: (text: string) => Promise<void> }) {
  const theme = useTheme<WidgetTheme>(),
    TR = useTR('NativeEditor');
  const [format, setFormat] = createSignal('mp4');
  const formats = () => props.editor.snapshot()?.exportFormats ?? [];
  createEffect(() => {
    if (!formats().some((option) => option.container === format()) && formats().length)
      setFormat(formats()[0]!.container);
  });
  return (
    <Popover
      width={104}
      contentWidth={264}
      placement="bottomEnd"
      trigger={TR('export')}
      leading={<Icon name="upload" size={14} color={theme().foreground} />}
    >
      <column width="100%" gap={12}>
        <text fontSize={13} weight={600} color={theme().foreground} text={TR('exportVideo')} />
        <text
          fontSize={11}
          color={theme().mutedForeground}
          text={
            props.editor.snapshot()
              ? `${props.editor.snapshot()!.project.canvas.width} × ${props.editor.snapshot()!.project.canvas.height} · ${props.editor.snapshot()!.project.canvas.fps} fps`
              : ''
          }
        />
        <Select
          label={TR('format')}
          value={format()}
          onValueChange={setFormat}
          options={formats().map((option) => ({
            value: option.container,
            label: `${option.container === 'mp4' ? 'MP4' : 'WebM'} · ${option.codec} · GPU`,
          }))}
        />
        <Show when={!formats().length && props.editor.snapshot()}>
          <text fontSize={11} color={theme().mutedForeground} lineClamp={3}>{TR('hardwareEncoderRequired')}</text>
        </Show>
        <Show
          when={props.editor.exportStatus().phase === 'rendering'}
          fallback={
            <Button
              width="100%"
              disabled={!props.editor.transport().durationMs || props.editor.busy() || !formats().length}
              onClick={() => void props.editor.startExport(format() === 'mp4' ? 'mp4' : 'webm')}
            >
              {TR('chooseDestination')}
            </Button>
          }
        >
          <Progress width="100%" accessibleName={TR('export')} value={props.editor.exportStatus().progress * 100} />
          <row width="100%" alignItems="center" justifyContent="spaceBetween">
            <text
              fontSize={11}
              color={theme().foreground}
             text={`${Math.round(props.editor.exportStatus().progress * 100)}%`} />
            <Button variant="ghost" onClick={props.editor.cancelExport}>
              {TR('cancel')}
            </Button>
          </row>
        </Show>
        <Show when={props.editor.exportStatus().phase === 'completed'}>
          <text fontSize={11} color={theme().chart2} role="status" text={TR('exportComplete')} />
        </Show>
        <Show when={props.editor.exportStatus().error}>
          <ErrorNotice message={props.editor.exportStatus().error!} lineClamp={5} onCopy={props.onCopyError} />
        </Show>
        <text fontSize={10} color={theme().mutedForeground} lineClamp={3} text={TR('exportHint')} />
      </column>
    </Popover>
  );
}

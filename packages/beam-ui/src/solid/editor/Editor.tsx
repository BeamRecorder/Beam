import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { BeamApi } from '../shared/beamApi';
import type { EditorApi } from './shared/editorApi';
import { useWindowMetrics } from '../shared/useWindowMetrics';
import { useTR } from '../shared/i18n';
import { Button } from '../shared/base-ui/button';
import { Icon } from '../shared/base-ui/icon';
import { IconButton } from '../shared/base-ui/iconButton';
import { ErrorNotice } from '../shared/base-ui/errorNotice';
import { mediaAssets } from '../../../assets.generated';
import { MediaLibrary } from './media/MediaLibrary';
import { Preview } from './video/Preview';
import { Inspector } from './properties/Inspector';
import { Timeline } from './timeline/Timeline';
import { ExportControl } from './export/ExportControl';
import { useEditor } from './shared/useEditor';
import { EditorTheme } from './shared/EditorTheme';
import { Splitter } from './layout/Splitter';
import { workspaceLayout, workspaceMode, proportionalPanels, panelRatios, workspaceDividerBounds } from './layout/workspaceLayout';
import type { Divider, PanelSizes, WorkspacePane } from './layout/layoutTypes';
import { Tabs } from '../shared/base-ui/tabs';

/** Concat-inspired native NLE: library, preview, contextual inspector, and timeline. */
export function Editor(props: { api: EditorApi; beam: BeamApi }) {
  return <EditorTheme><Workspace {...props} /></EditorTheme>;
}

function Workspace(props: { api: EditorApi; beam: BeamApi }) {
  const theme = useTheme<WidgetTheme>(),
    TR = useTR('NativeEditor');
  const editor = useEditor(props.api, props.beam),
    metrics = useWindowMetrics(props.beam, { width: 1440, height: 900 });
  const [ratios, setRatios] = createSignal<PanelSizes>(), [pane, setPane] = createSignal<WorkspacePane>('preview');
  const mode = () => workspaceMode(metrics().width);
  const warning = () => !!(editor.error() || editor.transport().error || editor.snapshot()?.recovered || editor.snapshot()?.project.warnings.length);
  const size = () => ({ width: metrics().width, height: metrics().height - (mode() === 'wide' ? 0 : 36) - (warning() ? 30 : 0) });
  const layout = createMemo(() => workspaceLayout(size(), proportionalPanels(size(), ratios())));
  const resize = (divider: Divider, value: number) => {
    const next = workspaceLayout(size(), { ...layout(), [divider]: value });
    if (Math.abs(next[divider] - layout()[divider]) >= 0.25) setRatios(panelRatios(next));
  };
  const bounds = (divider: Divider) => workspaceDividerBounds(layout(), divider);
  const libraryVisible = () => mode() === 'wide' || pane() === 'media';
  const inspectorVisible = () => mode() === 'wide' || pane() === 'properties';
  const previewVisible = () => mode() !== 'compact' || pane() === 'preview';
  const libraryWidth = () => mode() === 'compact' ? layout().width : mode() === 'split' ? Math.min(380, layout().width * 0.4) : layout().library;
  const inspectorWidth = () => mode() === 'compact' ? layout().width : mode() === 'split' ? Math.min(360, layout().width * 0.4) : layout().inspector;
  const previewWidth = () => layout().width - (libraryVisible() ? libraryWidth() + 8 : 0) - (inspectorVisible() ? inspectorWidth() + 8 : 0);
  createEffect(() => { if (editor.selected() && mode() !== 'wide') setPane('properties'); });
  return (
    <focusScope
      width="100%"
      height="100%"
      accessibleName={TR('editor')}
      role="group"
      keyboardActivation="none"
      onKey={event => editor.modifiers(!!(event.control || event.super || event.shift))}
    >
      <column width="100%" height="100%" minHeight={0} background={theme().sidebar}>
        <row width="100%" height={40} shrink={0} padding={{ start: 14, end: 12 }} gap={8} alignItems="center">
          <image source={mediaAssets['brand/beam.png']} width={18} height={18} fit="contain" alt="Beam" />
          <text fontSize={12} weight={600} color={theme().foreground} text="Beam" />
          <rectangle width={1} height={16} background={theme().border} margin={{ start: 5, end: 5 }} />
          <Button variant="ghost" disabled={editor.busy()} onClick={() => void editor.create()}>
            {TR('new')}
          </Button>
          <Button variant="ghost" disabled={editor.busy()} onClick={() => void editor.open()}>
            {TR('open')}
          </Button>
          <row grow={1} minWidth={0} gap={7} alignItems="center">
            <container grow={1} minWidth={0}>
              <text id="editor-project-name" width="100%" textAlign="center" fontSize={11} color={theme().foreground}
                lineClamp={1} text={editor.snapshot()?.project.name ?? TR('editor')} />
            </container>
            <row width={72} shrink={0} gap={4} alignItems="center">
              <Icon name={editor.saving() ? 'clock-3' : 'check'} size={11} color={theme().mutedForeground} />
              <text width={56} fontSize={10} lineClamp={1} color={theme().mutedForeground} text={TR(editor.saving() ? 'saving' : 'saved')} />
            </row>
          </row>
          <ExportControl editor={editor} onCopyError={text => props.beam.copyText(text)} />
        </row>
        <Show
          when={warning()}
        >
          <row
            width="100%"
            height={30}
            shrink={0}
            padding={{ start: 14, end: 14, top: 7, bottom: 7 }}
            gap={8}
            alignItems="center"
            background={theme().secondary}
          >
            <Icon name="info" size={14} color={theme().mutedForeground} />
            <container grow={1} minWidth={0}>
              <Show when={editor.error() || editor.transport().error} fallback={
              <text
                color={theme().mutedForeground}
                fontSize={11}
                lineClamp={2}
                role="alert"
               text={(editor.snapshot()?.recovered ? TR('recovered') : editor.snapshot()?.project.warnings.join(' · ')) ||
                  ''} />
              }>
                <ErrorNotice message={editor.error() || editor.transport().error || ''} onCopy={text => props.beam.copyText(text)} />
              </Show>
            </container>
            <IconButton icon="rotate-cw" label={TR('retry')} onClick={() => void editor.refresh()} />
            <Show when={editor.error()}>
              <IconButton icon="x" label={TR('close')} onClick={editor.clearError} />
            </Show>
          </row>
        </Show>
        <Show when={mode() !== 'wide'}><row width="100%" height={36} shrink={0} padding={{ start: 8, end: 8 }} alignItems="center">
          <Tabs id="editor-panes" label={TR('editor')} width={Math.min(360, layout().width)} height={28}
            value={pane()} onChange={setPane} options={[
              { id: 'media', label: TR('media'), icon: 'film' }, { id: 'preview', label: TR('preview'), icon: 'monitor' },
              { id: 'properties', label: TR('properties'), icon: 'sliders-horizontal' },
            ]} />
        </row></Show>
        <column width="100%" grow={1} minHeight={0} padding={8}>
          <row id="editor-upper-panes" width="100%" grow={1} minHeight={0}>
            <Show when={libraryVisible()}><rectangle id="editor-library-pane" width={libraryWidth()} height="100%" shrink={0} clip radii={12}>
              <MediaLibrary editor={editor} width={libraryWidth()} height={layout().top} />
            </rectangle></Show>
            <Show when={mode() === 'wide'}><Splitter id="editor-library-divider" label={TR('resizeLibrary')} vertical value={layout().library}
              target="editor-library-pane" minimum={bounds('library').minimum} maximum={bounds('library').maximum}
              onCommit={value => resize('library', value)} /></Show>
            <Show when={mode() === 'split' && libraryVisible()}><container width={8} height="100%" shrink={0} /></Show>
            <Show when={previewVisible()}><rectangle id="editor-preview-pane" grow={1} minWidth={0} height="100%" clip radii={12}>
              <Preview editor={editor} width={previewWidth()} />
            </rectangle></Show>
            <Show when={mode() === 'wide'}><Splitter id="editor-inspector-divider" label={TR('resizeInspector')} vertical trailing value={layout().inspector}
              target="editor-inspector-pane" minimum={bounds('inspector').minimum} maximum={bounds('inspector').maximum}
              onCommit={value => resize('inspector', value)} /></Show>
            <Show when={mode() === 'split' && inspectorVisible()}><container width={8} height="100%" shrink={0} /></Show>
            <Show when={inspectorVisible()}><rectangle id="editor-inspector-pane" width={inspectorWidth()} height="100%" shrink={0} clip radii={12}>
              <Inspector editor={editor} width={inspectorWidth()} />
            </rectangle></Show>
          </row>
          <Splitter id="editor-timeline-divider" label={TR('resizeTimeline')} trailing value={layout().timeline}
            target="editor-timeline" minimum={bounds('timeline').minimum} maximum={bounds('timeline').maximum}
            onCommit={value => resize('timeline', value)} />
          <Timeline editor={editor} width={layout().width} height={layout().timeline} />
        </column>
      </column>
    </focusScope>
  );
}

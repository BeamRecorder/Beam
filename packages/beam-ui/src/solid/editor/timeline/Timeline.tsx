import { For, Show, createMemo, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import { Icon } from '../../shared/base-ui/icon';
import { IconButton } from '../../shared/base-ui/iconButton';
import { useTR } from '../../shared/i18n';
import { Splitter } from '../layout/Splitter';
import { timecode, visibleClips } from './timelineModel';
import { trackLayout } from './trackLayout';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineClip } from './TimelineClip';
import { TimelineTabs } from './TimelineTabs';
import type { EditorState } from '../shared/useEditor';

/** The timeline fills its resized pane; lane headers and source clips share one vertical viewport. */
export function Timeline(props: { editor: EditorState; width: number; height: number }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const [pixels, setPixels] = createSignal(80), [offset, setOffset] = createSignal(0);
  const [verticalOffset, setVerticalOffset] = createSignal(0);
  const [requestedHeader, setHeader] = createSignal(190), [snapping, setSnapping] = createSignal(true);
  const project = () => props.editor.snapshot()?.project;
  const header = () => Math.min(Math.max(140, requestedHeader()), Math.min(320, props.width / 3));
  const rows = createMemo(() => trackLayout(project()));
  const viewport = () => Math.max(0, props.height - 82);
  const height = () => Math.max(viewport(), 28 + rows().reduce((sum, row) => sum + row.height, 0));
  const width = () => Math.max(props.width - header() - 1, props.editor.transport().durationMs / 1000 * pixels() + 120);
  const visible = createMemo(() => visibleClips(project()?.clips ?? [], offset() / pixels() * 1000, (offset() + props.width - header()) / pixels() * 1000));
  const visualViewport = () => ({ startMs: offset() / pixels() * 1000, endMs: (offset() + props.width - header()) / pixels() * 1000, pixels: pixels() });
  const visibleRows = createMemo(() => rows().filter(row => row.y + row.height > verticalOffset() && row.y < verticalOffset() + viewport()));
  const step = () => pixels() >= 100 ? 1000 : pixels() >= 30 ? 5000 : 10000;
  const ticks = createMemo(() => {
    const start = Math.floor(offset() / pixels() * 1000 / step()) * step();
    const end = Math.min(width(), offset() + props.width - header()) / pixels() * 1000;
    return Array.from({ length: Math.max(0, Math.ceil((end - start) / step()) + 1) }, (_, i) => start + i * step());
  });
  return <rectangle id="editor-timeline" width="100%" height={props.height} shrink={0} background={theme().background} radii={12}>
    <column width="100%" height="100%" minHeight={0}>
      <TimelineTabs editor={props.editor} width={props.width} />
      <rectangle width="100%" height={1} shrink={0} background={theme().border} />
      <TimelineToolbar editor={props.editor} pixels={pixels()} setPixels={setPixels} snapping={snapping()} setSnapping={setSnapping} width={props.width - header() - 20} />
      <rectangle width="100%" height={1} shrink={0} background={theme().border} />
      <scrollView id="editor-timeline-vertical" width="100%" grow={1} minHeight={0} scrollX={false} onScroll={event => setVerticalOffset(event.offsetY)}>
        <row width="100%" height={height()} alignItems="start">
          <column id="editor-track-headers" width={header()} height="100%" shrink={0}>
            <row width="100%" height={28} shrink={0} padding={{ start: 12 }} alignItems="center">
              <text fontSize={11} color={theme().mutedForeground} text={TR('tracks')} />
            </row>
            <For each={rows()}>{row => <column width="100%" height={row.height} shrink={0}>
              <rectangle width="100%" height={1} shrink={0} background={theme().border} />
              <row width="100%" height={38} padding={{ start: 12, end: 8 }} gap={6} alignItems="center">
                <Icon name={row.text ? 'type' : row.track.kind === 'video' ? 'film' : 'audio-lines'} size={13} color={theme().mutedForeground} />
                <container grow={1} minWidth={0}><text fontSize={12} color={theme().mutedForeground} lineClamp={1} text={row.track.name} /></container>
                <IconButton icon={row.track.hidden ? 'eye-off' : 'eye'} label={TR('visibility')} disabled={props.editor.busy()}
                  onClick={() => void props.editor.edit({ type: 'track', id: row.track.id, muted: row.track.muted, hidden: !row.track.hidden })} />
                <IconButton icon={row.track.muted ? 'volume-x' : 'volume-2'} label={TR('mute')} disabled={props.editor.busy()}
                  onClick={() => void props.editor.edit({ type: 'track', id: row.track.id, muted: !row.track.muted, hidden: row.track.hidden })} />
              </row>
            </column>}</For>
          </column>
          <Splitter id="editor-track-divider" vertical hairline label={TR('resizeTracks')} value={header()}
            target="editor-track-headers" minimum={140} maximum={Math.min(320, props.width / 3)} onCommit={setHeader} />
          <scrollView grow={1} minWidth={0} height="100%" scrollX scrollY={false} onScroll={event => setOffset(event.offsetX)}>
            <container id="editor-timeline-grid" width={width()} height="100%" position="relative" background={theme().muted}>
              <touchArea width="100%" height={28} position="absolute" inset={{ top: 0, start: 0 }} mouseCursor="pointer"
                onClick={event => void props.editor.seek((event.localX ?? 0) / pixels() * 1000)}>
                <For each={ticks()}>{time => <container position="absolute" inset={{ start: time / 1000 * pixels() + 5, top: 8 }}>
                  <text fontSize={10} color={theme().mutedForeground} text={timecode(time).slice(0, 5)} />
                </container>}</For>
              </touchArea>
              <For each={ticks()}>{time => <rectangle width={1} height="100%" position="absolute" inset={{ start: time / 1000 * pixels(), top: 28 }} background={theme().border} opacity={0.3} />}</For>
              <For each={visibleRows().map(row => row.track.id)}>{trackId => { const row = () => rows().find(row => row.track.id === trackId)!; return <container width="100%" height={row().height} position="absolute" inset={{ start: 0, top: row().y }}>
                <rectangle width="100%" height={1} background={theme().border} opacity={0.6} />
                <For each={visible().filter(clip => clip.trackId === row().track.id).map(clip => clip.id)}>{id => <TimelineClip clip={project()!.clips.find(clip => clip.id === id)!} track={row().track} project={project()!}
                  height={row().height - 8} snapping={snapping()} pixels={pixels()} viewport={visualViewport()} editor={props.editor} asset={project()?.assets.find(asset => asset.id === project()!.clips.find(clip => clip.id === id)!.assetId)} />}</For>
              </container>; }}</For>
              <container width={1} height="100%" position="absolute" inset={{ start: props.editor.transport().positionMs / 1000 * pixels(), top: 0 }} background={theme().primary}>
                <rectangle width={9} height={12} position="absolute" inset={{ start: -4, top: 0 }} radii={{ bottomLeft: 4, bottomRight: 4 }} background={theme().primary} />
              </container>
              <Show when={!project()?.clips.length}><container position="absolute" inset={{ start: 24, top: 58 }}>
                <text fontSize={12} color={theme().mutedForeground} text={TR('timelineHint')} />
              </container></Show>
            </container>
          </scrollView>
        </row>
      </scrollView>
    </column>
  </rectangle>;
}

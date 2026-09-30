import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import { Icon } from '../../shared/base-ui/icon';
import { IconButton } from '../../shared/base-ui/iconButton';
import { useTR } from '../../shared/i18n';
import { Splitter } from '../layout/Splitter';
import { visibleClips } from './timelineModel';
import { trackLayout } from './trackLayout';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineClip } from './TimelineClip';
import { TimelineTabs } from './TimelineTabs';
import { timelineShortcut } from './timelineShortcut';
import { TIMELINE_MARGIN, timelineTime, rulerTicks, timelineBands, timelineZoom } from './viewportModel';
import { TimelineRegion } from './TimelineRegion';
import type { TimelineRegion as Region } from '../shared/generated/editorContracts';
import type { RegionRow } from './regionTypes';
import type { EditorState } from '../shared/useEditor';

/** The timeline fills its resized pane; lane headers and source clips share one vertical viewport. */
export function Timeline(props: { editor: EditorState; width: number; height: number }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const [pixels, setPixels] = createSignal(80), [offset, setOffset] = createSignal(0);
  const [verticalOffset, setVerticalOffset] = createSignal(0);
  const [regions, setRegions] = createSignal<Region[]>([]);
  const [requestedHeader, setHeader] = createSignal(190), [snapping, setSnapping] = createSignal(true);
  const project = () => props.editor.snapshot()?.project;
  const header = () => Math.min(Math.max(140, requestedHeader()), Math.min(320, props.width / 3));
  const rows = createMemo(() => trackLayout(project()));
  const viewport = () => Math.max(0, props.height - 82);
  const height = () => Math.max(viewport(), 28 + rows().reduce((sum, row) => sum + row.height, 0));
  const duration = createMemo(() => props.editor.transport().durationMs);
  const width = () => Math.max(props.width - header() - 1, duration() / 1000 * pixels() + TIMELINE_MARGIN * 2);
  createEffect(() => { const request = props.editor.zoomRequest(); if (request.serial) setPixels(value => timelineZoom(value, request.direction)); });
  const visible = createMemo(() => visibleClips(project()?.clips ?? [], timelineTime(offset(), pixels()), timelineTime(offset() + props.width - header(), pixels())));
  const visualViewport = () => ({ startMs: timelineTime(offset(), pixels()), endMs: timelineTime(offset() + props.width - header(), pixels()), pixels: pixels() });
  const visibleRows = createMemo(() => rows().filter(row => row.y + row.height > verticalOffset() && row.y < verticalOffset() + viewport()));
  createEffect(() => {
    const document = props.editor.snapshot(), visible = visualViewport();
    if (!document || visible.endMs <= visible.startMs) { setRegions([]); return; }
    let obsolete = false;
    onCleanup(() => { obsolete = true; });
    void (async () => {
      const values: Region[] = [];
      let offset = 0;
      for (;;) {
        const response = await props.editor.query({ kind: 'regions', sequenceId: document.activeSequence,
          start: { ticks: Math.max(0, Math.floor(visible.startMs)), timescale: 1000 }, end: { ticks: Math.max(1, Math.ceil(visible.endMs)), timescale: 1000 }, offset, limit: 256 });
        if (obsolete || response.type !== 'regions' || response.page.revision !== document.revision) return;
        values.push(...response.page.items);
        if (response.page.next == null) break;
        offset = response.page.next;
      }
      if (!obsolete) setRegions(values);
    })().catch(cause => { if (!obsolete) props.editor.reportError(cause); });
  });
  const regionRows = createMemo(() => {
    const values: RegionRow[] = [], indices = new Map<string, number>();
    const clips = new Map((project()?.clips ?? []).map(clip => [clip.id, clip]));
    const tracks = new Map(rows().map(row => [row.track.id, row]));
    for (const region of regions()) {
      if (region.target.kind !== 'clip') continue;
      const clip = clips.get(region.target.clipId), row = clip && tracks.get(clip.trackId);
      if (!clip || !row) continue;
      const index = indices.get(clip.id) ?? 0;
      const top = region.kind === 'transition' ? row.y + 2 : row.y + row.mediaHeight + index * 22;
      if (region.kind !== 'transition') indices.set(clip.id, index + 1);
      if (top + 20 > verticalOffset() && top < verticalOffset() + viewport()) values.push({ region, clip, top });
    }
    return values;
  });
  const ticks = createMemo(() => rulerTicks(offset(), props.width - header(), pixels()));
  const bands = createMemo(() => timelineBands(rulerTicks(offset() - 160, props.width - header() + 320, pixels())));
  return <rectangle id="editor-timeline" width="100%" height={props.height} shrink={0} background={theme().background} radii={12}>
    <column width="100%" height="100%" minHeight={0}>
      <TimelineTabs editor={props.editor} width={props.width} />
      <rectangle width="100%" height={1} shrink={0} background={theme().border} />
      <TimelineToolbar editor={props.editor} pixels={pixels()} setPixels={setPixels} snapping={snapping()} setSnapping={setSnapping} width={props.width - header() - 20} />
      <rectangle width="100%" height={1} shrink={0} background={theme().border} />
      <scrollView id="editor-timeline-vertical" width="100%" grow={1} minHeight={0} scrollX={false} scrollY={true} enabled={!props.editor.commandModifier()} onScroll={event => setVerticalOffset(event.offsetY)}>
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
          <container grow={1} minWidth={0} height="100%"><touchArea width="100%" height="100%" onWheel={event => {
            if (props.editor.commandModifier()) setPixels(value => timelineZoom(value, (event.deltaY || event.deltaX) / (event.deltaMode === 'lines' ? 3 : 120)));
          }}>
          <scrollView id="editor-timeline-horizontal" width="100%" height="100%" scrollX={true} scrollY={true} enabled={!props.editor.commandModifier()} onScroll={event => setOffset(event.offsetX)}>
            <focusScope id="editor-timeline-grid" role="group" accessibleName={TR('timeline')} keyboardActivation="none"
              onKey={event => {
                const action=timelineShortcut(event,props.editor.busy());
                if(action==='undo' && props.editor.snapshot()?.canUndo) void props.editor.edit({type:'undo'});
                else if(action==='redo' && props.editor.snapshot()?.canRedo) void props.editor.edit({type:'redo'});
                else if(action==='selectAll') props.editor.selectAll();
                else if(action==='copy') props.editor.copy();
                else if(action==='paste') void props.editor.paste();
                else if(action==='remove' && props.editor.selected()) void props.editor.removeSelection();
                else if(action==='cancel') {props.editor.cancelGesture();props.editor.select(undefined);}
              }} width={width()} height="100%" position="relative">
              <rectangle width="100%" height="100%" position="absolute" inset={{start:0,top:0}} background={theme().background} />
              <For each={bands()}>{band => <rectangle width={band.width} height="100%" position="absolute" inset={{ start: band.x, top: 0 }} background={band.alternate ? theme().muted : theme().background} opacity={0.45} />}</For>
              <touchArea width="100%" height={28} position="absolute" inset={{ top: 0, start: 0 }} mouseCursor="pointer"
                onClick={event => void props.editor.seek(timelineTime(event.localX ?? 0, pixels()))}>
                <For each={ticks()}>{tick => <>
                  <rectangle width={1} height={tick.height} position="absolute" inset={{ start: tick.x, top: 28 - tick.height }} background={theme().mutedForeground} opacity={tick.label ? 0.8 : 0.45} />
                  <Show when={tick.label}><container position="absolute" inset={{ start: tick.x + 5, top: 3 }}>
                    <text fontSize={10} color={theme().mutedForeground} text={tick.label!} />
                  </container></Show>
                </>}</For>
              </touchArea>
              <For each={visibleRows().map(row => row.track.id)}>{trackId => { const row = () => rows().find(row => row.track.id === trackId)!; return <container width="100%" height={row().height} position="absolute" inset={{ start: 0, top: row().y }}>
                <rectangle width="100%" height={1} background={theme().border} opacity={0.6} />
                <For each={visible().filter(clip => clip.trackId === row().track.id).map(clip => clip.id)}>{id => <TimelineClip clip={project()!.clips.find(clip => clip.id === id)!} track={row().track} project={project()!}
                  height={row().mediaHeight - 8} snapping={snapping()} pixels={pixels()} viewport={visualViewport()} margin={TIMELINE_MARGIN} editor={props.editor} asset={project()?.assets.find(asset => asset.id === project()!.clips.find(clip => clip.id === id)!.assetId)} />}</For>
              </container>; }}</For>
              <For each={regionRows().map(row => row.region.id)}>{id => {
                const initial = regionRows().find(row => row.region.id === id)!;
                const row = () => regionRows().find(row => row.region.id === id) ?? initial;
                return <TimelineRegion row={row()} pixels={pixels()} margin={TIMELINE_MARGIN} editor={props.editor} />;
              }}</For>
              <container width={1} height="100%" position="absolute" inset={{ start: TIMELINE_MARGIN, top: 0 }} transform={{ translateX: props.editor.transport().positionMs / 1000 * pixels() }} background={theme().primary}>
                <rectangle width={9} height={12} position="absolute" inset={{ start: -4, top: 0 }} radii={{ bottomLeft: 4, bottomRight: 4 }} background={theme().primary} />
              </container>
              <Show when={!project()?.clips.length}><container position="absolute" inset={{ start: 24, top: 58 }}>
                <text fontSize={12} color={theme().mutedForeground} text={TR('timelineHint')} />
              </container></Show>
            </focusScope>
          </scrollView>
          </touchArea></container>
        </row>
      </scrollView>
    </column>
  </rectangle>;
}

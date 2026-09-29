import { Show, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { useTheme } from '@argui/solid';
import { InputField, Switch, type WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { ChoiceTabs } from '../../shared/base-ui/choiceTabs';
import { useTR } from '../../shared/i18n';
import { Panel } from '../shared/Panel';
import type { EditorState } from '../shared/useEditor';
import type { Effects } from '../shared/editorTypes';
import { defaultEffects } from '../shared/defaults';
import { NumberField, PropertyRow, PropertySection, PropertySlider } from './PropertyRow';
import { TitleControls } from './TitleControls';
import { timecode } from '../timeline/timelineModel';

/** Contextual inspector uses one consistent row geometry across video, audio and titles. */
export function Inspector(props: { editor: EditorState; width: number }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const [draft, setDraft] = createSignal<Effects>(defaultEffects), [name, setName] = createSignal('');
  const [tab, setTab] = createSignal('video');
  const projectName = createMemo(() => props.editor.snapshot()?.project.name ?? '');
  const selectedId = createMemo(() => props.editor.clip()?.id);
  const savedEffects = createMemo(() => JSON.stringify({ ...defaultEffects, ...props.editor.clip()?.effects }));
  createEffect(() => setName(projectName()));
  createEffect(() => {
    selectedId(); setDraft(JSON.parse(savedEffects()) as Effects);
  });
  createEffect(() => {
    selectedId();
    untrack(() => setTab(props.editor.clip()?.title ? 'text' : props.editor.asset()?.hasVideo ? 'video' : 'audio'));
  });
  const set = <K extends keyof Effects>(key: K, value: Effects[K]) => setDraft(current => ({ ...current, [key]: value }));
  const changed = () => JSON.stringify(draft()) !== JSON.stringify({ ...defaultEffects, ...props.editor.clip()?.effects });
  const apply = () => { if (props.editor.clip()) void props.editor.edit({ type: 'effects', id: props.editor.clip()!.id, effects: draft() }); };
  const canvas = () => props.editor.snapshot()?.project.canvas;
  const trim = (source: number, duration: number) => { const clip = props.editor.clip(); if (clip) void props.editor.edit({
    type: 'trim', id: clip.id, startMs: clip.startMs, sourceInMs: Math.round(source * 1000), durationMs: Math.round(duration * 1000),
  }); };
  const options = () => [
    { id: props.editor.clip()?.title ? 'text' : props.editor.asset()?.hasVideo ? 'video' : 'audio', label: TR(props.editor.clip()?.title ? 'text' : props.editor.asset()?.hasVideo ? 'video' : 'audio') },
    ...(props.editor.asset()?.hasVideo && props.editor.asset()?.hasAudio ? [{ id: 'audio', label: TR('audio') }] : []),
    { id: 'effects', label: TR('effects') },
  ];
  return <Panel width="100%" header={<Show when={!!props.editor.clip()}
    fallback={<text fontSize={13} weight={500} color={theme().foreground} text={TR('project')} />}>
    <ChoiceTabs id="editor-clip-tabs" label={TR('clip')} width={props.width - 16} value={tab()} options={options()} onChange={setTab} />
  </Show>}>
    <scrollView width="100%" grow={1} minHeight={0}>
      <column width="100%" gap={0}>
        <Show when={props.editor.clip()} fallback={<>
          <PropertySection label={TR('project')}>
            <PropertyRow label={TR('name')}><InputField accessibleName={TR('projectName')} value={name()} onValueChange={setName}
              onSubmit={value => void props.editor.edit({ type: 'rename', name: value })} disabled={!canvas() || props.editor.busy()} /></PropertyRow>
          </PropertySection>
          <PropertySection label={TR('canvas')}>
            <PropertyRow label={TR('resolution')}><Select id="editor-resolution" label={TR('resolution')} value={`${canvas()?.width}x${canvas()?.height}`}
              disabled={!canvas() || props.editor.busy()}
              options={[{ value: '1920x1080', label: '1920 × 1080' }, { value: '1080x1920', label: '1080 × 1920' }, { value: '1080x1080', label: '1080 × 1080' }]}
              onValueChange={value => { const [width, height] = value.split('x').map(Number); void props.editor.edit({ type: 'canvas', canvas: { ...canvas()!, width, height } }); }} /></PropertyRow>
            <PropertyRow label={TR('frameRate')}><NumberField label={TR('frameRate')} value={canvas()?.fps ?? 30} min={1} max={60}
              onChange={fps => void props.editor.edit({ type: 'canvas', canvas: { ...canvas()!, fps: Math.round(fps) } })} /></PropertyRow>
            <text fontSize={11} color={theme().mutedForeground} lineClamp={4} text={TR('selectHint')} />
          </PropertySection>
        </>}>
          <column width="100%" padding={14} gap={5}>
            <text fontSize={12} weight={500} color={theme().foreground} lineClamp={1} text={props.editor.clip()?.title?.text ?? props.editor.asset()?.name ?? TR('unavailable')} />
            <text fontSize={10} color={theme().mutedForeground} text={`${timecode(props.editor.clip()!.durationMs)} · ${TR('nonDestructive')}`} />
          </column>
          <Show when={tab() === 'text'}><TitleControls editor={props.editor} /></Show>
          <Show when={tab() !== 'effects'}>
            <PropertySection label={TR('timing')}>
              <PropertyRow label={TR('duration')}><NumberField label={TR('duration')} value={props.editor.clip()!.durationMs / 1000}
                min={0.001} max={((props.editor.asset()?.durationMs ?? 21_600_000) - props.editor.clip()!.sourceInMs) / 1000}
                onChange={duration => trim(props.editor.clip()!.sourceInMs / 1000, duration)} /></PropertyRow>
              <Show when={!props.editor.clip()?.title}><PropertyRow label={TR('sourceIn')}><NumberField label={TR('sourceIn')}
                value={props.editor.clip()!.sourceInMs / 1000} min={0} max={Math.max(0, ((props.editor.asset()?.durationMs ?? 0) - props.editor.clip()!.durationMs) / 1000)}
                onChange={source => trim(source, props.editor.clip()!.durationMs / 1000)} /></PropertyRow></Show>
              <PropertyRow label={TR('track')}><Select id="editor-clip-track" label={TR('track')} value={props.editor.clip()!.trackId}
                options={props.editor.snapshot()!.project.tracks.filter(track => track.kind === props.editor.snapshot()!.project.tracks.find(lane => lane.id === props.editor.clip()!.trackId)?.kind).map(track => ({ value: track.id, label: track.name }))}
                onValueChange={trackId => void props.editor.edit({ type: 'move', id: props.editor.clip()!.id, trackId, startMs: props.editor.clip()!.startMs })} /></PropertyRow>
            </PropertySection>
          </Show>
          <Show when={tab() === 'video' || tab() === 'text'}>
            <PropertySection label={TR('transform')}>
              <Show when={!props.editor.clip()?.title}><PropertySlider label={TR('scale')} value={draft().scale} min={0.05} max={4} onChange={value => set('scale', value)} /></Show>
              <PropertySlider label={TR('horizontal')} value={draft().x} min={0} max={1} onChange={value => set('x', value)} />
              <PropertySlider label={TR('vertical')} value={draft().y} min={0} max={1} onChange={value => set('y', value)} />
              <PropertySlider label={TR('opacity')} value={draft().opacity} min={0} max={1} onChange={value => set('opacity', value)} />
            </PropertySection>
            <Show when={!props.editor.clip()?.title}><PropertySection label={TR('autoZoom')}>
              <PropertyRow label={TR('enabled')}><Switch accessibleName={TR('autoZoom')} value={draft().autoZoom}
                disabled={!props.editor.asset()?.hasCursor} onValueChange={value => set('autoZoom', value)} /></PropertyRow>
              <text fontSize={10} color={theme().mutedForeground} lineClamp={3} text={props.editor.asset()?.hasCursor ? TR('zoomCount', { count: props.editor.asset()!.zoomCount }) : TR('noCursor')} />
            </PropertySection></Show>
          </Show>
          <Show when={tab() === 'audio'}><PropertySection label={TR('audio')}>
            <PropertySlider label={TR('volume')} value={draft().volume} min={0} max={2} onChange={value => set('volume', value)} />
          </PropertySection></Show>
          <Show when={tab() === 'effects'}>
            <Show when={props.editor.asset()?.hasVideo}><PropertySection label={TR('color')}>
              <PropertySlider label={TR('brightness')} value={draft().brightness} min={-1} max={1} onChange={value => set('brightness', value)} />
              <PropertySlider label={TR('saturation')} value={draft().saturation} min={0} max={2} onChange={value => set('saturation', value)} />
            </PropertySection></Show>
            <PropertySection label={TR('transitions')}>
              <PropertyRow label={TR('fadeIn')}><NumberField label={TR('fadeIn')} value={(draft().fadeInMs ?? 0) / 1000} min={0}
                max={Math.max(0, (props.editor.clip()!.durationMs - (draft().fadeOutMs ?? 0)) / 1000)} onChange={value => set('fadeInMs', Math.round(value * 1000))} /></PropertyRow>
              <PropertyRow label={TR('fadeOut')}><NumberField label={TR('fadeOut')} value={(draft().fadeOutMs ?? 0) / 1000} min={0}
                max={Math.max(0, (props.editor.clip()!.durationMs - (draft().fadeInMs ?? 0)) / 1000)} onChange={value => set('fadeOutMs', Math.round(value * 1000))} /></PropertyRow>
            </PropertySection>
          </Show>
          <row width="100%" padding={14} gap={8}>
            <Button variant="secondary" grow={1} onClick={() => setDraft({ ...defaultEffects })}>{TR('reset')}</Button>
            <Button grow={1} disabled={!changed() || props.editor.busy()} onClick={apply}>{TR('apply')}</Button>
          </row>
        </Show>
      </column>
    </scrollView>
  </Panel>;
}

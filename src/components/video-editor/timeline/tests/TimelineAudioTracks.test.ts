import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioClip } from '@beam/engine/shared/composition-types';
import type { TimelineAudioTracksProps } from '../timeline-audio-tracks-types';
import TimelineAudioTracks from '../TimelineAudioTracks.vue';
import TimelineCanvasClips from '../TimelineCanvasClips.vue';
import TimelineCanvasLane from '../TimelineCanvasLane.vue';
import { groupImportedAudioTimelineTracks } from '../composables/audio-timeline-tracks';
import { TimelineClipStub, composition } from './TimelineTracks.test-support';

enableAutoUnmount(afterEach);
const harness = () => {
  const model = composition();
  const audio = model.clips.filter((clip): clip is AudioClip => clip.kind === 'audio');
  const props: TimelineAudioTracksProps = {
    composition: model,
    systemAudioClips: audio.filter((clip) => clip.role === 'system'),
    microphoneClips: audio.filter((clip) => clip.role === 'microphone'),
    voiceoverClips: [],
    importedAudioTracks: groupImportedAudioTimelineTracks(audio.filter((clip) => clip.role === 'imported')),
    zoomElements: [],
    includeAudioInExport: true,
    layoutDurationMs: 10000,
    rulerLayoutWidth: 1000,
    viewport: { left: 0, top: 0, width: 1000, height: 320 },
    thumbnailSlots: [],
    isWheelZooming: false,
    isMoving: false,
    isTrimming: false,
    selectedClipIdSet: new Set(),
    audioWaveforms: {},
    audioWaveformStatus: {},
    audioWaveformErrors: {},
    assetFor: (clip) => model.assets.find((asset) => 'assetId' in clip && asset.id === clip.assetId) ?? null,
    displayedClip: (clip) => clip,
    trimStateFor: () => null,
    percentageStyle: () => ({ left: '0', width: '100%' }),
    selectItem: vi.fn(),
    startClipMove: vi.fn(),
    beginClipTrim: vi.fn(),
    openClipContextMenu: vi.fn(),
    openTrackContextMenu: vi.fn(),
  };
  const wrapper = mount(TimelineAudioTracks, {
    props: { ...props },
    global: {
      stubs: {
        TimelineCanvasClip: TimelineClipStub,
        TimelineCanvasLane: true,
        TimelineGapButtons: {
          emits: ['remove'],
          template: '<button @click="$emit(\'remove\', { startMs: 10, durationMs: 20 })" />',
        },
        WaveformCanvas: true,
      },
    },
  });
  return { wrapper, props };
};

describe('TimelineAudioTracks', () => {
  it('delegates clip interactions and microphone gap removal without changing the linked metadata', async () => {
    const { wrapper, props } = harness();
    const component = wrapper.findAllComponents(TimelineClipStub)[0]!;
    const clip = component.props('clip');
    const click = new MouseEvent('click');
    const pointer = new MouseEvent('pointerdown');
    component.vm.$emit('select', click);
    component.vm.$emit('move', pointer);
    component.vm.$emit('contextmenu', click);
    component.vm.$emit('trim', { event: pointer, edge: 'end' });
    expect(props.selectItem).toHaveBeenCalledWith('clip', clip.id, click);
    expect(props.startClipMove).toHaveBeenCalledWith(pointer, clip);
    expect(props.openClipContextMenu).toHaveBeenCalledWith(click, clip);
    expect(props.beginClipTrim).toHaveBeenCalledWith(pointer, clip, 'end');
    await wrapper.findAll('.audio-track')[0]!.trigger('contextmenu');
    expect(props.openTrackContextMenu).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      'audio',
      undefined,
      props.systemAudioClips.map((clip) => clip.id),
    );
    await wrapper.get('.audio-track:nth-child(2) button:not(.timeline-clip)').trigger('click');
    expect(wrapper.emitted('remove:gap')).toEqual([[{ startMs: 10, durationMs: 20 }]]);
  });

  it('reuses links through interaction-state changes but invalidates them after a composition edit', async () => {
    const { wrapper, props } = harness();
    const component = wrapper.findAllComponents(TimelineClipStub)[0]!;
    const links = component.props('linkedClipNames');
    await wrapper.setProps({ isMoving: true, selectedClipIdSet: new Set([component.props('clip').id]) });
    expect(component.props('linkedClipNames')).toBe(links);
    expect(component.props('selected')).toBe(true);
    await wrapper.setProps({
      composition: {
        ...props.composition,
        clips: props.composition.clips.map((clip) => ({ ...clip, name: 'Renamed' })),
      },
    });
    expect(component.props('linkedClipNames')).not.toBe(links);
  });

  it('renders drafts and voiceovers, skips a draft context menu and handles empty lanes', async () => {
    const { wrapper, props } = harness();
    await wrapper.setProps({
      voiceoverClips: [{ ...props.systemAudioClips[0]!, role: 'voiceover', id: 'voice' }],
      voiceoverDraft: { startMs: 0, durationMs: 500, bars: [1, 2] },
      includeAudioInExport: false,
    });
    expect(wrapper.findAll('.voiceover-track')).toHaveLength(2);
    await wrapper.get('.voiceover-draft-track').trigger('contextmenu');
    expect(props.openTrackContextMenu).not.toHaveBeenCalled();
    expect(wrapper.find('.export-audio-disabled').exists()).toBe(true);
    await wrapper.setProps({
      systemAudioClips: [],
      microphoneClips: [],
      importedAudioTracks: [],
      voiceoverClips: [],
      voiceoverDraft: null,
    });
    expect(wrapper.findAll('.audio-track')).toHaveLength(0);
  });

  it('publishes waveform source geometry and pending regions to the canvas group without changing ownership', async () => {
    const { wrapper, props } = harness();
    const clip = props.systemAudioClips[0]!;
    const bars = [1, 2, 3],
      bands = new Float32Array([1, 2, 3, 4]);
    const loadingSegments = [{ leftPercent: 70, widthPercent: 30 }];
    await wrapper.setProps({
      audioWaveforms: {
        [clip.id]: { bars, bands, sourceDurationSeconds: 2.75, leftPercent: 20, widthPercent: 60, loadingSegments },
      },
      audioWaveformStatus: { [clip.id]: 'ready' },
      isTrimming: true,
    });
    const group = wrapper.findAllComponents(TimelineCanvasClips)[0]!;
    expect((group.props('audioFor') as (id: string) => unknown)(clip.id)).toMatchObject({
      waveformBars: bars,
      waveformBands: bands,
      waveformSourceDurationSeconds: 2.75,
      waveformLeftPercent: 20,
      waveformWidthPercent: 60,
      waveformLoadingSegments: loadingSegments,
      waveformStatus: 'ready',
    });
    expect(group.props('viewport')).toEqual(props.viewport);
    expect(group.props('deferMedia')).toBe(true);
    expect((group.props('audioFor') as (id: string) => unknown)('missing')).toMatchObject({
      waveformBars: undefined,
      waveformStatus: undefined,
    });
  });

  it('leaves titles to the audio foreground and keeps canvas geometry aligned with the same semantic clip', async () => {
    const { wrapper, props } = harness();
    const clip = { ...props.systemAudioClips[0]!, timelineStartMs: 2000, timelineDurationMs: 3000 };
    await wrapper.setProps({ systemAudioClips: [clip], viewport: { ...props.viewport, left: 240, width: 640 } });
    const group = wrapper.findAllComponents(TimelineCanvasClips)[0]!;
    const lane = group.getComponent(TimelineCanvasLane);
    expect(lane.props('items')).toEqual([expect.objectContaining({ clip, label: '' })]);
    expect(lane.props('viewport')).toEqual({ ...props.viewport, left: 240, width: 640 });
    const target = group.getComponent(TimelineClipStub);
    expect(target.props('clip')).toMatchObject(clip);
    expect(target.get('button').attributes('style')).toContain('translate3d(200px, 0, 0)');
    expect(target.get('button').attributes('style')).toContain('width: 30%');
  });
});

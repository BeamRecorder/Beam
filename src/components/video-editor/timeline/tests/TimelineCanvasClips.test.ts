import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import TimelineCanvasClips from '../TimelineCanvasClips.vue';
import type { TimelineVisualClipsProps } from '../timeline-canvas-types';
import type { BlurClip, ShapeClip } from '@beam/engine/shared/composition-types';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';
import { setCurrentLocale } from '~/i18n';
import { visual, importedAudio, TimelineClipStub } from './TimelineTracks.test-support';

enableAutoUnmount(afterEach);
const Lane = defineComponent({
  name: 'TimelineCanvasLane',
  props: ['items', 'durationMs', 'width', 'viewport', 'artworks'],
  template: '<canvas />',
});
const props = (patch: Partial<TimelineVisualClipsProps> = {}): TimelineVisualClipsProps => ({
  clips: [visual({ id: 'a' })],
  canvas: { width: 1920, height: 1080 },
  durationMs: 60000,
  width: 6000,
  viewport: { left: 0, top: 0, width: 1000, height: 320 },
  thumbnailSlots: [],
  deferMedia: false,
  selectedIds: new Set(),
  displayedClip: (clip) => clip,
  assetFor: () => null,
  linkedNames: () => [],
  trimStateFor: () => null,
  ...patch,
});
const create = (patch: Partial<TimelineVisualClipsProps> = {}) =>
  mount(TimelineCanvasClips, {
    props: { ...props(patch) },
    global: { stubs: { TimelineCanvasLane: Lane, TimelineCanvasClip: TimelineClipStub } },
  });

describe('always-canvas timeline group', () => {
  it('delegates semantic select/context/move and both trim edges with the original clip identity', () => {
    const wrapper = create(),
      clip = props().clips[0]!;
    const item = wrapper.getComponent(TimelineClipStub);
    const mouse = new MouseEvent('click'),
      pointer = new PointerEvent('pointerdown');
    item.vm.$emit('select', mouse);
    item.vm.$emit('contextmenu', mouse);
    item.vm.$emit('move', pointer);
    item.vm.$emit('trim', { event: pointer, edge: 'start' });
    item.vm.$emit('trim', { event: pointer, edge: 'end' });
    expect(wrapper.emitted('select')).toEqual([[mouse, clip]]);
    expect(wrapper.emitted('contextmenu')).toEqual([[mouse, clip]]);
    expect(wrapper.emitted('move')).toEqual([[pointer, clip]]);
    expect(wrapper.emitted('trim')).toEqual([
      [pointer, clip, 'start'],
      [pointer, clip, 'end'],
    ]);
  });
  it('uses the same canvas and semantic controls for selected, locked and transitioning clips', () => {
    const clips = [
      visual({ id: 'a' }),
      visual({ id: 'b', locked: true }),
      visual({ id: 'c', transitions: { entry: { preset: { kind: 'fade' }, durationMs: 200 }, exit: null } }),
    ];
    const wrapper = create({ clips, selectedIds: new Set(['a']), pasteId: 'a' });
    expect(wrapper.findAllComponents(TimelineClipStub)).toHaveLength(3);
    expect(wrapper.findAllComponents(Lane)).toHaveLength(1);
    expect(wrapper.findComponent({ name: 'TimelineClip' }).exists()).toBe(false);
    expect(wrapper.getComponent(TimelineClipStub).props('pasteHighlight')).toBe(true);
    expect(wrapper.getComponent(Lane).props('items')).toMatchObject([
      { selected: true, pasteHighlight: true },
      { selected: false },
      { selected: false },
    ]);
  });
  it('updates the displayed preview and label metadata without recreating the keyed semantic button', async () => {
    const original = visual({ id: 'a' }),
      displayed = { ...original, timelineStartMs: 1500 };
    const wrapper = create({
      clips: [original],
      displayedClip: () => displayed,
      linkedNames: () => ['linked'],
      labelFor: () => 'Custom label',
    });
    const button = wrapper.get('[data-timeline-clip-id="a"]').element;
    expect(wrapper.getComponent(Lane).props('items')[0]).toMatchObject({
      clip: displayed,
      label: 'Custom label',
      labelInset: 15,
    });
    await wrapper.setProps({ selectedIds: new Set(['a']), deferMedia: true });
    expect(wrapper.get('[data-timeline-clip-id="a"]').element).toBe(button);
    expect(wrapper.getComponent(TimelineClipStub).props()).toMatchObject({
      clip: displayed,
      selected: true,
      deferThumbnailRequests: true,
      deferWaveformDraw: true,
    });
  });
  it('accepts an empty lane and forwards borrowed audio data to every visible control', () => {
    const empty = create({ clips: [] });
    expect(empty.findAll('button')).toHaveLength(0);
    expect(empty.getComponent(Lane).props('items')).toEqual([]);
    const bars = [1, 2],
      wrapper = create({ audioFor: () => ({ waveformBars: bars, waveformStatus: 'ready' }) });
    expect(wrapper.getComponent(TimelineClipStub).props()).toMatchObject({
      waveformBars: bars,
      waveformStatus: 'ready',
    });
    expect(wrapper.findComponent({ name: 'TimelineClip' }).exists()).toBe(false);
  });
  it('reserves label space for genuine lock, effect and link badges together', () => {
    const effect: BlurClip = {
      id: 'effect',
      kind: 'blur',
      name: 'Blur',
      assetId: '',
      trackId: 'effects',
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      sourceInMs: 0,
      sourceDurationMs: 1000,
      playbackRate: 1,
      enabled: true,
      locked: true,
      order: 0,
      transform: { x: 0, y: 0, width: 0.5, height: 0.5 },
      shape: 'rectangle',
      mode: 'blur',
      strength: 20,
      feather: 0,
      tintOpacity: 0,
      color: '#000000',
    };
    const wrapper = create({ clips: [effect], linkedNames: () => ['Screen'] });
    expect(wrapper.getComponent(Lane).props('items')[0]).toMatchObject({ clip: effect, labelInset: 45 });
    expect(wrapper.getComponent(TimelineClipStub).props('linkedClipNames')).toEqual(['Screen']);
  });
  it('uses the localized freeze-frame label rather than the original media name', async () => {
    const wrapper = create({ clips: [visual({ id: 'hold', name: 'Original video', freezeFrameSourceMs: 750 })] });
    expect(wrapper.getComponent(Lane).props('items')[0].label).toBe('Hold Segment at Playhead');
    await setCurrentLocale('fr');
    expect(wrapper.getComponent(Lane).props('items')[0].label).toBe('Figer l’image à la tête de lecture');
  });
  it.each([
    { content: '  Release notes  ', expected: 'Release notes' },
    { content: '  \n ', expected: 'Shape fallback' },
    { content: undefined, expected: 'Shape fallback' },
  ])('uses generated text and a real name fallback for $content', ({ content, expected }) => {
    const clip: ShapeClip = {
      ...visual({ id: 'text', name: 'Shape fallback' }),
      ...DEFAULT_ANNOTATION_SHAPE_STYLE,
      kind: 'shape',
      text: content === undefined ? undefined : createElementText(content),
    };
    const wrapper = create({ clips: [clip] });
    expect(wrapper.getComponent(Lane).props('items')[0].label).toBe(expected);
  });
  it('preserves an intentionally blank custom label ahead of both generated and media labels', async () => {
    const wrapper = create({ clips: [visual({ id: 'hold', freezeFrameSourceMs: 750 })], labelFor: () => '' });
    expect(wrapper.getComponent(Lane).props('items')[0].label).toBe('');
    await wrapper.setProps({ clips: [visual({ id: 'regular', name: 'Media name' })] });
    expect(wrapper.getComponent(Lane).props('items')[0].label).toBe('');
  });
  it('does not duplicate audio foreground titles below the GPU waveform even when a custom painter title is provided', () => {
    const audio = importedAudio({ name: 'System audio', locked: true });
    const wrapper = create({
      clips: [audio],
      linkedNames: () => ['Screen'],
      labelFor: () => 'Do not paint below waveform',
    });
    expect(wrapper.getComponent(Lane).props('items')[0]).toMatchObject({ clip: audio, label: '', labelInset: 30 });
    expect(wrapper.getComponent(TimelineClipStub).props('clip').name).toBe('System audio');
    expect(wrapper.getComponent(TimelineClipStub).props('linkedClipNames')).toEqual(['Screen']);
  });
});

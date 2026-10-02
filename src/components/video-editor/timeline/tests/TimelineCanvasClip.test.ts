import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref, type Ref } from 'vue';
import { ImageOff, Link2, Lock } from '@lucide/vue';
import TimelineCanvasClip from '../TimelineCanvasClip.vue';
import type { TimelineClipProps } from '../timeline-clip-types';
import type { AudioClip, ShapeClip } from '@beam/engine/shared/composition-types';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';

const artwork = vi.hoisted(() => ({ error: null as unknown as Ref<string>, use: vi.fn() }));
vi.mock('../composables/useTimelineCanvasArtwork', () => ({
  useTimelineCanvasArtwork: (props: unknown) => {
    artwork.use(props);
    return { error: artwork.error };
  },
}));
const Waveform = defineComponent({
  name: 'BlickWaveformCanvas',
  props: ['bars', 'bands', 'leftPercent', 'widthPercent', 'sourceDurationSeconds', 'loadingSegments', 'deferDraw'],
  template: '<canvas class="gpu-waveform" />',
});
const clip: TimelineClipProps['clip'] = {
  id: 'video',
  kind: 'video',
  name: 'Imported video',
  assetId: 'asset',
  timelineStartMs: 1000,
  timelineDurationMs: 2000,
  sourceInMs: 0,
  sourceDurationMs: 2000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'lane',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
};
const create = (patch: Partial<TimelineClipProps> = {}) =>
  mount(TimelineCanvasClip, {
    props: { clip, selected: false, duration: 10, timelineWidthPx: 1000, thumbnailSlots: [], ...patch },
    global: { stubs: { BlickWaveformCanvas: Waveform } },
  });
const audio: AudioClip = {
  id: 'audio',
  kind: 'audio',
  role: 'imported',
  name: 'Audio',
  assetId: 'audio-asset',
  timelineStartMs: 0,
  timelineDurationMs: 2000,
  sourceInMs: 0,
  sourceDurationMs: 2000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  volume: 100,
};
enableAutoUnmount(afterEach);
beforeEach(() => {
  artwork.error = ref('');
  artwork.use.mockClear();
});

describe('canvas clip semantic controls', () => {
  it('retains native keyboard-accessible selection, move, context menu and precise clip geometry', async () => {
    const wrapper = create(),
      button = wrapper.get('button');
    expect(button.attributes()).toMatchObject({
      type: 'button',
      'aria-label': 'Imported video',
      'data-timeline-clip-id': 'video',
    });
    expect(button.attributes('style')).toContain('translate3d(100px, 0, 0)');
    expect(button.attributes('style')).toContain('width: 20%');
    await button.trigger('click');
    await button.trigger('pointerdown');
    await button.trigger('contextmenu');
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('move')).toHaveLength(1);
    expect(wrapper.emitted('contextmenu')).toHaveLength(1);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.thumbnail-frame').exists()).toBe(false);
  });
  it('keeps selection, disabled state and paste feedback synchronized without replacing the button', async () => {
    const wrapper = create(),
      button = wrapper.get('button').element;
    await wrapper.setProps({ selected: true, clip: { ...clip, enabled: false }, pasteHighlight: true });
    expect(wrapper.get('button').element).toBe(button);
    expect(wrapper.get('button').classes()).toEqual(expect.arrayContaining(['selected', 'disabled']));
    expect(wrapper.get('button').attributes('data-paste-highlight')).toBe('true');
    await wrapper.setProps({ clip, pasteHighlight: false });
    expect(wrapper.get('button').classes()).not.toContain('disabled');
    expect(wrapper.get('button').attributes('data-paste-highlight')).toBeUndefined();
  });
  it('retains genuine lock/link icons, linked names and the playback-rate badge', async () => {
    const wrapper = create({
      clip: { ...clip, locked: true, playbackRate: 1.5 },
      linkedClipNames: ['Screen', 'System audio'],
    });
    expect(wrapper.findComponent(Lock).exists()).toBe(true);
    expect(wrapper.findComponent(Link2).exists()).toBe(true);
    expect(wrapper.get('button').attributes('title')).toBe('Screen · System audio');
    expect(wrapper.get('.speed-badge').text()).toBe('1.50×');
    await wrapper.setProps({ clip, linkedClipNames: [] });
    expect(wrapper.findComponent(Lock).exists()).toBe(false);
    expect(wrapper.findComponent(Link2).exists()).toBe(false);
    expect(wrapper.find('.speed-badge').exists()).toBe(false);
  });
  it('forwards both trim edges without turning handle presses into move events and formats duration/limit feedback', async () => {
    const wrapper = create({ trimState: { edge: 'start', durationMs: 61250, atLimit: true } });
    expect(wrapper.get('.start .trim-side-badge').text()).toBe('1:01.2s');
    expect(wrapper.get('button').classes()).toContain('trim-at-limit');
    expect(wrapper.get('.start').classes()).toContain('at-limit');
    await wrapper.get('.start').trigger('pointerdown');
    await wrapper.get('.end').trigger('pointerdown');
    expect(wrapper.emitted('move')).toBeUndefined();
    expect(wrapper.emitted('trim')?.map((args) => (args[0] as { edge: string }).edge)).toEqual(['start', 'end']);
    await wrapper.setProps({ trimState: { edge: 'end', durationMs: 1250 } });
    expect(wrapper.get('.end .trim-side-badge').text()).toBe('01.2s');
    expect(wrapper.get('.start').classes()).not.toContain('at-limit');
  });
  it('exposes generated text, blank-text fallback and real freeze-frame labels', async () => {
    const shape: ShapeClip = {
      ...DEFAULT_ANNOTATION_SHAPE_STYLE,
      kind: 'shape',
      id: 'text',
      name: 'Text fallback',
      trackId: 'shape-lane',
      assetId: '',
      order: 1,
      enabled: true,
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      sourceInMs: 0,
      sourceDurationMs: 1000,
      playbackRate: 1,
      transform: { x: 0, y: 0, width: 0.5, height: 0.2 },
      family: 'text',
      preset: 'text',
      text: createElementText('  Release notes  '),
    };
    const wrapper = create({ clip: shape });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Release notes');
    await wrapper.setProps({ clip: { ...shape, text: createElementText('  ') } });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Text fallback');
    await wrapper.setProps({ clip: { ...clip, freezeFrameSourceMs: 750 } });
    expect(wrapper.get('button').attributes('aria-label')).not.toBe('Imported video');
    expect(wrapper.get('button').attributes('aria-label')).toBeTruthy();
  });
  it('publishes artwork errors through a genuine unavailable icon while retaining semantic controls', async () => {
    const wrapper = create();
    expect(wrapper.findComponent(ImageOff).exists()).toBe(false);
    artwork.error.value = 'Thumbnail decoding failed';
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(ImageOff).attributes('title')).toBe('Thumbnail decoding failed');
    expect(wrapper.get('button').attributes('aria-label')).toBe('Imported video');
    expect(artwork.use).toHaveBeenCalledOnce();
  });
});

describe('canvas clip GPU audio surface', () => {
  it('borrows waveform data, source slice placement and pending ranges without copying them', () => {
    const bars = [4, 12, 20],
      bands = new Float32Array([1, 2, 3, 4]),
      loadingSegments = [{ leftPercent: 70, widthPercent: 30 }];
    const wrapper = create({
      clip: audio,
      waveformBars: bars,
      waveformBands: bands,
      waveformSourceDurationSeconds: 2.75,
      waveformLeftPercent: 20,
      waveformWidthPercent: 60,
      waveformLoadingSegments: loadingSegments,
      deferWaveformDraw: true,
    });
    expect(wrapper.getComponent(Waveform).props()).toMatchObject({
      bars,
      bands,
      sourceDurationSeconds: 2.75,
      leftPercent: 20,
      widthPercent: 60,
      loadingSegments,
      deferDraw: true,
    });
  });
  it('keeps the audio title in a separate foreground after the GPU waveform and moves it with lock/link badges', async () => {
    const wrapper = create({
      clip: { ...audio, name: 'System audio', locked: true },
      linkedClipNames: ['Screen'],
      waveformBars: [4, 12],
      waveformBands: new Float32Array([1, 2]),
    });
    const foreground = wrapper.get('.audio-clip-label');
    expect(foreground.text()).toBe('System audio');
    expect(foreground.attributes('aria-hidden')).toBe('true');
    expect(foreground.attributes('style')).toContain('left: 38px');
    expect(wrapper.get('.waveform').find('.audio-clip-label').exists()).toBe(false);
    expect(
      wrapper.get('.waveform').element.compareDocumentPosition(foreground.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(foreground.element.parentElement).toBe(wrapper.get('button').element);
    expect(wrapper.get('button').attributes('aria-label')).toBe('System audio');

    await wrapper.setProps({ clip: audio, linkedClipNames: [] });
    expect(wrapper.get('.audio-clip-label').text()).toBe('Audio');
    expect(wrapper.get('.audio-clip-label').attributes('style')).toContain('left: 8px');
    await wrapper.setProps({ clip });
    expect(wrapper.find('.audio-clip-label').exists()).toBe(false);
  });
  it('shows loading and failed extraction explicitly without inventing a waveform', async () => {
    const wrapper = create({ clip: audio, waveformStatus: 'loading' });
    expect(wrapper.get('.waveform-status').text()).toBeTruthy();
    expect(wrapper.findComponent(Waveform).exists()).toBe(false);
    await wrapper.setProps({
      waveformStatus: 'error',
      waveformError: { kind: 'decode-failure', sourceId: 'audio-asset', message: 'Decode failed' },
    });
    expect(wrapper.get('.waveform-status').attributes('title')).toBe('Decode failed');
    expect(wrapper.get('.waveform-status').text()).toContain('unavailable');
  });
  it('defaults ready-slice metadata and removes the GPU surface when no bars remain', async () => {
    const wrapper = create({ clip: audio, waveformBars: [2], waveformBands: new Float32Array([1]) });
    expect(wrapper.getComponent(Waveform).props()).toMatchObject({ sourceDurationSeconds: 0, loadingSegments: [] });
    await wrapper.setProps({ waveformBars: [] });
    expect(wrapper.findComponent(Waveform).exists()).toBe(false);
    expect(wrapper.find('.waveform-status').exists()).toBe(false);
  });
});

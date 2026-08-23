import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captionLayerKey, type CaptionClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import type { TextCaptionLayer } from '../../composition/engine/caption-layer-layout';
import TimelineCaptionTracks from '../TimelineCaptionTracks.vue';

const createCaption = (
  id: string,
  text: string,
  options: Partial<Pick<CaptionClip, 'captionLayerId' | 'timelineStartMs' | 'timelineDurationMs' | 'order'>> = {},
): CaptionClip => ({
  id,
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: options.timelineStartMs ?? 0,
  timelineDurationMs: options.timelineDurationMs ?? 2_000,
  sourceInMs: 0,
  sourceDurationMs: options.timelineDurationMs ?? 2_000,
  playbackRate: 1,
  enabled: true,
  order: options.order ?? 0,
  isAiGenerated: true,
  captionLayerId: options.captionLayerId ?? 'ai-caption-layer',
  caption: {
    type: 'text',
    sentences: text ? [{ id: `${id}-sentence`, text, startMs: 0, endMs: 2_000, words: [] }] : [],
    style: createDefaultCaptionStyle(32),
  },
});

const createLayer = (clips: CaptionClip[]): TextCaptionLayer => ({
  id: captionLayerKey(clips[0]!),
  clips,
  representative: clips[0]!,
  order: clips[0]!.order,
});

const mountCaptionTracks = (textLayers: TextCaptionLayer[] = [], reduceMotion = false) =>
  mount(TimelineCaptionTracks, {
    props: {
      keyboardClips: [],
      textLayers,
      reduceMotion,
      selectedClipId: null,
      selectedClipIds: [],
      hoverCaptionTimeMs: null,
      hoverCaptionDurationMs: 2_000,
      percentageStyle: (startMs: number, durationMs: number) => ({
        left: `${startMs / 100}%`,
        width: `${durationMs / 100}%`,
      }),
      displayedClip: (clip: CaptionClip) => clip,
      trimStateFor: () => null,
      beginClipMove: () => undefined,
      beginClipTrim: () => undefined,
      hoverAt: () => undefined,
      leaveTrack: () => undefined,
      addAt: () => undefined,
    },
  });

describe('TimelineCaptionTracks progressive captions', () => {
  const mountedWrappers: ReturnType<typeof mountCaptionTracks>[] = [];

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
    vi.useRealTimers();
  });

  it('adds AI phrase clips to one text layer while keeping existing button identity', async () => {
    const wrapper = mountCaptionTracks();
    mountedWrappers.push(wrapper);

    const firstCaption = createCaption('ai-caption-1', 'Bonjour', {
      timelineDurationMs: 1_000,
    });
    await wrapper.setProps({ textLayers: [createLayer([firstCaption])] });

    const firstButton = wrapper.get('.text-caption-track .annotation-indicator:not(.preview-ghost)');
    expect(firstButton.text()).toContain('Bonjour');

    const secondCaption = createCaption('ai-caption-2', 'le monde', {
      captionLayerId: firstCaption.captionLayerId,
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      order: 1,
    });
    await wrapper.setProps({ textLayers: [createLayer([firstCaption, secondCaption])] });

    expect(wrapper.findAll('.text-caption-layer')).toHaveLength(1);
    const buttons = wrapper.findAll('.text-caption-track .annotation-indicator:not(.preview-ghost)');
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.text())).toEqual(['Bonjour', 'le monde']);
    expect(buttons[0]?.element).toBe(firstButton.element);
  });

  it('updates a partial caption in place without duplicating the keyed clip', async () => {
    vi.useFakeTimers();
    const wrapper = mountCaptionTracks([createLayer([createCaption('ai-caption-1', 'Bonjour')])]);
    mountedWrappers.push(wrapper);

    const originalButton = wrapper.get('.text-caption-track .annotation-indicator:not(.preview-ghost)');
    const updatedCaption = createCaption('ai-caption-1', 'Bonjour tout le monde');
    await wrapper.setProps({ textLayers: [createLayer([updatedCaption])] });

    const buttons = wrapper.findAll('.text-caption-track .annotation-indicator:not(.preview-ghost)');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.element).toBe(originalButton.element);
    expect(buttons[0]?.text()).toContain('Bonjour tout le monde');
    expect(buttons[0]?.get('.caption-label-text').classes()).toContain('caption-settled');

    await vi.advanceTimersByTimeAsync(320);
    await nextTick();
    expect(buttons[0]?.get('.caption-label-text').classes()).not.toContain('caption-settled');
  });

  it('marks the text track as motion-reduced only when requested', () => {
    const regularWrapper = mountCaptionTracks([createLayer([createCaption('ai-caption-1', 'Bonjour')])]);
    mountedWrappers.push(regularWrapper);
    expect(regularWrapper.get('.text-caption-track').classes()).not.toContain('motion-reduced');

    const reducedWrapper = mountCaptionTracks([createLayer([createCaption('ai-caption-1', 'Bonjour')])], true);
    mountedWrappers.push(reducedWrapper);
    expect(reducedWrapper.get('.text-caption-track').classes()).toContain('motion-reduced');
  });
});

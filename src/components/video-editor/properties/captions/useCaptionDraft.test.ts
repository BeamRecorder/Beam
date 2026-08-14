import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import { useCaptionDraft } from './useCaptionDraft';

const captionClip = (id = 'caption-1'): CaptionClip => ({
  id,
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    style: {
      color: '#ffffff',
      fontSize: 36,
      shadowColor: '#000000',
      shadowBlur: 0,
      placement: 'bottom',
    },
    sentences: [],
  },
});

const mountDraft = (clip = captionClip()) => {
  const selectedClip = ref<CaptionClip | null>(clip);
  const emitUpdate = vi.fn();
  let draft: ReturnType<typeof useCaptionDraft> | null = null;
  const Harness = defineComponent({
    setup() {
      draft = useCaptionDraft(selectedClip, emitUpdate);
      return () => h('div');
    },
  });
  return {
    wrapper: mount(Harness),
    selectedClip,
    emitUpdate,
    get draft() {
      return draft!;
    },
  };
};

describe('useCaptionDraft', () => {
  afterEach(() => vi.useRealTimers());

  it('persists a local edit on the next UI frame', () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((clip) => ({ ...clip, name: 'Edited caption' }));
    expect(harness.draft.draft.value?.name).toBe('Edited caption');
    expect(harness.emitUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15);
    expect(harness.emitUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(harness.emitUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Edited caption' }));
  });

  it('flushes the pending edit immediately', () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((clip) => ({ ...clip, name: 'Blurred caption' }));
    harness.draft.flush();
    expect(harness.emitUpdate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(16);
    expect(harness.emitUpdate).toHaveBeenCalledTimes(1);
  });

  it('keeps a dirty draft when an outdated prop is received', async () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((clip) => ({ ...clip, name: 'Typing now' }));
    harness.selectedClip.value = { ...captionClip(), name: 'Old saved value' };
    await nextTick();
    expect(harness.draft.draft.value?.name).toBe('Typing now');
  });

  it('replaces the draft when a different caption is selected', async () => {
    const harness = mountDraft();
    harness.selectedClip.value = { ...captionClip('caption-2'), name: 'Second caption' };
    await nextTick();
    expect(harness.draft.draft.value).toMatchObject({ id: 'caption-2', name: 'Second caption' });
  });

  it('persists a pending edit before selecting another caption', async () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((clip) => ({ ...clip, name: 'Keep this edit' }));
    harness.selectedClip.value = captionClip('caption-2');
    await nextTick();
    expect(harness.emitUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Keep this edit' }));
    expect(harness.draft.draft.value?.id).toBe('caption-2');
  });
});

import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import { useCaptionDraft } from './useCaptionDraft';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';

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
    type: 'text',
    style: {
      ...createDefaultCaptionStyle(36),
      color: '#ffffff',
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
  it('updates the draft and emits the update', () => {
    const harness = mountDraft();
    harness.draft.update((clip) => ({ ...clip, name: 'Edited caption' }));
    expect(harness.draft.draft.value?.name).toBe('Edited caption');
    expect(harness.emitUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Edited caption' }));
  });

  it('flushes the current draft when requested', () => {
    const harness = mountDraft();
    harness.draft.flush();
    expect(harness.emitUpdate).toHaveBeenCalledTimes(1);
  });

  it('syncs the draft when a different caption is selected', async () => {
    const harness = mountDraft();
    harness.selectedClip.value = { ...captionClip('caption-2'), name: 'Second caption' };
    await nextTick();
    expect(harness.draft.draft.value).toMatchObject({ id: 'caption-2', name: 'Second caption' });
  });
});

import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import type { CaptionClip, ClipComposition } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../output-canvas';
import type { TransformClip } from '../../editor-canvas-types';
import { useCaptionInlineEditing } from '../useCaptionInlineEditing';

const caption = (overrides: Partial<CaptionClip> = {}): CaptionClip => ({
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  caption: {
    type: 'text',
    sentences: [{ id: 'sentence', text: 'Hello', startMs: 0, endMs: 1_000, words: [] }],
    style: { ...createDefaultCaptionStyle(32), customText: 'Original' },
  },
  ...overrides,
});

type MountedEditing = {
  state: ReturnType<typeof useCaptionInlineEditing>;
  composition: Ref<ClipComposition>;
  selected: Ref<TransformClip | null>;
  playing: Ref<boolean>;
  cropping: Ref<boolean>;
  manualZoom: Ref<boolean>;
  activeCaptionIds: Ref<string[]>;
  clipIdAt: ReturnType<typeof vi.fn>;
  onSelect: ReturnType<typeof vi.fn>;
  onUpdate: ReturnType<typeof vi.fn>;
  onStart: ReturnType<typeof vi.fn>;
  onEnd: ReturnType<typeof vi.fn>;
  onRender: ReturnType<typeof vi.fn>;
  wrapper: VueWrapper;
};

const mountedWrappers: VueWrapper[] = [];

const mountEditing = (
  options: { clip?: CaptionClip; selected?: TransformClip | null; selectionTop?: string } = {},
): MountedEditing => {
  const clip = options.clip ?? caption();
  const composition = ref<ClipComposition>({
    schemaVersion: 14,
    keyboardCaptionSessions: [],
    assets: [],
    clips: [clip],
  });
  const selected = ref<TransformClip | null>(options.selected === undefined ? clip : options.selected);
  const playing = ref(false);
  const cropping = ref(false);
  const manualZoom = ref(false);
  const activeCaptionIds = ref([clip.id]);
  const clipIdAt = vi.fn(() => clip.id);
  const onSelect = vi.fn();
  const onUpdate = vi.fn();
  const onStart = vi.fn();
  const onEnd = vi.fn();
  const onRender = vi.fn();
  let state!: ReturnType<typeof useCaptionInlineEditing>;
  const Harness = defineComponent({
    setup: () => {
      state = useCaptionInlineEditing({
        composition: () => composition.value,
        selectedClip: () => selected.value,
        isPlaying: () => playing.value,
        isCropping: () => cropping.value,
        isManualZoom: () => manualZoom.value,
        logicalSize: ref({ width: 1_920, height: 1_080 }),
        outputCanvas: () => DEFAULT_OUTPUT_CANVAS,
        selectionViewportStyle: () => ({ top: options.selectionTop ?? '10px' }),
        selectionLayoutStyle: () => ({ top: '10px' }),
        clipIdAt,
        activeCaptionIds: () => activeCaptionIds.value,
        onSelect,
        onUpdate,
        onStart,
        onEnd,
        onRender,
      });
      return () => h('div');
    },
  });
  const wrapper = mount(Harness);
  mountedWrappers.push(wrapper);
  return {
    state,
    composition,
    selected,
    playing,
    cropping,
    manualZoom,
    activeCaptionIds,
    clipIdAt,
    onSelect,
    onUpdate,
    onStart,
    onEnd,
    onRender,
    wrapper,
  };
};

const pointer = (button = 0) => ({ clientX: 10, clientY: 10, button });

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

describe('useCaptionInlineEditing', () => {
  it('does not begin editing a locked caption', () => {
    const mounted = mountEditing({ clip: caption({ locked: true }) });

    mounted.state.begin(pointer());

    expect(mounted.state.editingCaptionId.value).toBeNull();
    expect(mounted.onSelect).not.toHaveBeenCalled();
    expect(mounted.onStart).not.toHaveBeenCalled();
    expect(mounted.onRender).not.toHaveBeenCalled();
  });

  it('rejects non-left clicks and editing while playing, cropping, or manually zooming', () => {
    const mounted = mountEditing();

    mounted.state.begin(pointer(2));
    mounted.playing.value = true;
    mounted.state.begin(pointer());
    mounted.playing.value = false;
    mounted.cropping.value = true;
    mounted.state.begin(pointer());
    mounted.cropping.value = false;
    mounted.manualZoom.value = true;
    mounted.state.begin(pointer());

    expect(mounted.state.editingCaptionId.value).toBeNull();
    expect(mounted.onStart).not.toHaveBeenCalled();
  });

  it('selects and starts an editable caption, forwards updates, and finishes it', () => {
    const mounted = mountEditing({ selected: null });

    mounted.state.begin(pointer());
    mounted.state.update('Edited caption');
    mounted.state.finish();

    expect(mounted.onSelect).toHaveBeenCalledWith('caption');
    expect(mounted.onStart).toHaveBeenCalledOnce();
    expect(mounted.onUpdate).toHaveBeenCalledWith({ clipId: 'caption', customText: 'Edited caption' });
    expect(mounted.onEnd).toHaveBeenCalledWith(false);
    expect(mounted.onRender).toHaveBeenCalledTimes(2);
    expect(mounted.state.editingCaptionId.value).toBeNull();
  });

  it('restores the original text and marks the edit cancelled', () => {
    const mounted = mountEditing();

    mounted.state.begin(pointer());
    mounted.state.update('Discarded text');
    mounted.state.cancel();

    expect(mounted.onUpdate).toHaveBeenLastCalledWith({ clipId: 'caption', customText: 'Original' });
    expect(mounted.onEnd).toHaveBeenLastCalledWith(true);
    expect(mounted.state.editingCaptionId.value).toBeNull();
  });

  it('finishes when playback, crop mode, selection, or active captions invalidate the edit', async () => {
    const mounted = mountEditing();
    mounted.state.begin(pointer());

    mounted.playing.value = true;
    await nextTick();
    expect(mounted.state.editingCaptionId.value).toBeNull();

    mounted.playing.value = false;
    mounted.state.begin(pointer());
    mounted.cropping.value = true;
    await nextTick();
    expect(mounted.state.editingCaptionId.value).toBeNull();

    mounted.cropping.value = false;
    mounted.state.begin(pointer());
    mounted.selected.value = caption({ id: 'other-caption' });
    await nextTick();
    expect(mounted.state.editingCaptionId.value).toBeNull();

    mounted.selected.value = caption();
    mounted.state.begin(pointer());
    mounted.activeCaptionIds.value = [];
    await nextTick();
    expect(mounted.state.editingCaptionId.value).toBeNull();
    expect(mounted.onEnd).toHaveBeenCalledTimes(4);
  });

  it('returns the current caption, preview scale, and warning placement', () => {
    const mounted = mountEditing();

    expect(mounted.state.editingCaption.value).toBeNull();
    expect(mounted.state.renderScale.value).toBe(1);
    expect(mounted.state.warningPlacement.value).toBe('below');

    mounted.state.begin(pointer());

    expect(mounted.state.editingCaption.value).toMatchObject({ id: 'caption' });
    expect(mounted.state.warningPlacement.value).toBe('below');
  });

  it('ignores commands without an active edit and rejects missing or non-text caption hits', () => {
    const mounted = mountEditing({ selectionTop: '100px' });

    mounted.state.finish();
    mounted.state.cancel();
    mounted.state.update('Ignored');
    mounted.clipIdAt.mockReturnValueOnce(null);
    mounted.state.begin(pointer());

    const keyboardCaption = caption({
      id: 'keyboard-caption',
      caption: {
        type: 'keyboard',
        steps: [{ offsetMs: 0, modifiers: [], key: 'k' }],
        followCursor: false,
        recordedPlatform: 'linux',
        sourceSessionId: 'session',
        style: createDefaultCaptionStyle(32),
      },
    });
    mounted.composition.value = { ...mounted.composition.value, clips: [keyboardCaption] };
    mounted.clipIdAt.mockReturnValue('keyboard-caption');
    mounted.state.begin(pointer());
    mounted.state.editingCaptionId.value = 'keyboard-caption';

    expect(mounted.state.editingCaption.value).toBeNull();
    expect(mounted.state.warningPlacement.value).toBe('above');
    expect(mounted.state.editingCaptionId.value).toBe('keyboard-caption');
    expect(mounted.onStart).not.toHaveBeenCalled();
  });
  it('closes an active edit synchronously when its caption is locked', () => {
    const mounted = mountEditing();
    mounted.state.begin(pointer());
    mounted.composition.value = { ...mounted.composition.value, clips: [caption({ locked: true })] };
    expect(mounted.state.editingCaptionId.value).toBeNull();
    expect(mounted.onEnd).toHaveBeenCalledWith(false);
    mounted.state.update('Ignored after locking');
    expect(mounted.onUpdate).not.toHaveBeenCalled();
  });
});

import { defineComponent, h, ref, type Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import type { ScreenshotState } from '~/api/types/screenshot';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { defaultLayerCompositing } from '~/media/shared/layer-compositing';
import { HIGHLIGHT_DEFAULTS } from '~/media/shared/highlight-defaults';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (namespace: string) => ({ t: (key: string) => `${namespace}.${key}` }),
}));

import { useScreenshotEffects } from '../useScreenshotEffects';

const makeState = (overrides: Partial<ScreenshotState> = {}): ScreenshotState => ({
  canvas: { ...DEFAULT_OUTPUT_CANVAS, preset: 'custom', width: 1_280, height: 720 },
  background: null,
  blurPercent: 0,
  image: {
    id: 'screenshot',
    kind: 'image',
    name: 'Captured screen',
    assetId: 'source',
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
  },
  shapes: [],
  format: 'png',
  quality: 0.9,
  ...overrides,
});

const wrappers: VueWrapper[] = [];

const mountEffects = (
  state: Ref<ScreenshotState | null>,
  canInteract = vi.fn(() => true),
  selectedId: Ref<string | null> = ref(null),
) => {
  let effects!: ReturnType<typeof useScreenshotEffects>;
  const select = vi.fn((id: string) => {
    selectedId.value = id;
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        effects = useScreenshotEffects(state, selectedId, select, canInteract);
        return () => h('div');
      },
    }),
  );
  wrappers.push(wrapper);
  return { effects, select, selectedId, canInteract, wrapper };
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useScreenshotEffects', () => {
  it('adds an independent highlight, selects it, and appends its composition entry', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'highlight-1' });
    const state = ref<ScreenshotState | null>(makeState());
    const mounted = mountEffects(state);

    mounted.effects.add();

    const added = state.value!.effects![0]!;
    expect(added).toMatchObject({
      ...HIGHLIGHT_DEFAULTS,
      id: 'highlight-1',
      trackId: 'highlight-1',
      kind: 'blur',
      assetId: '',
      name: 'Highlight.title',
      enabled: true,
      transitions: { entry: null, exit: null },
    });
    expect(added.transform).not.toBe(HIGHLIGHT_DEFAULTS.transform);
    expect(state.value!.composition?.map(({ id }) => id)).toContain(added.id);
    expect(state.value!.composition?.find(({ id }) => id === added.id)).toEqual(defaultLayerCompositing(added.id));
    expect(mounted.select).toHaveBeenCalledWith(added.id);
    expect(mounted.selectedId.value).toBe(added.id);
    expect(mounted.effects.selected.value).toBe(added);

    added.transform.x = 0.8;
    expect(HIGHLIGHT_DEFAULTS.transform.x).toBe(0.3);
  });

  it('adds an independent blur with the default blur settings and selects its composition entry', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'blur-1' });
    const state = ref<ScreenshotState | null>(makeState());
    const mounted = mountEffects(state);

    mounted.effects.add('blur');

    const added = state.value!.effects![0]!;
    expect(added).toMatchObject({
      id: 'blur-1',
      trackId: 'blur-1',
      kind: 'blur',
      mode: 'blur',
      shape: 'rectangle',
      strength: 60,
      feather: 0,
      cornerRadius: 0,
      tintOpacity: 0,
      color: '#000000',
      name: 'TimelineTracks.blur',
      enabled: true,
      transform: { x: 0.35, y: 0.35, width: 0.3, height: 0.3 },
      transitions: { entry: null, exit: null },
    });
    expect(state.value!.composition?.map(({ id }) => id)).toContain(added.id);
    expect(state.value!.composition?.find(({ id }) => id === added.id)).toEqual(defaultLayerCompositing(added.id));
    expect(mounted.select).toHaveBeenCalledWith(added.id);
    expect(mounted.selectedId.value).toBe(added.id);
    expect(mounted.effects.selected.value).toBe(added);
  });

  it('applies updates to the selected effect only while interaction is allowed', () => {
    const selected = {
      id: 'selected',
      kind: 'blur',
      mode: 'highlight',
      strength: 65,
      color: '#000000',
    } as NonNullable<ScreenshotState['effects']>[number];
    const other = {
      ...selected,
      id: 'other',
      strength: 20,
    };
    const state = ref<ScreenshotState | null>(makeState({ effects: [selected, other] }));
    const selectedId = ref<string | null>(selected.id);
    const canInteract = vi.fn(() => true);
    const mounted = mountEffects(state, canInteract, selectedId);

    expect(mounted.effects.selected.value).toBe(state.value!.effects![0]);
    mounted.effects.update({ strength: 82, color: '#22aa66', highlightColor: '#ffeeaa', tintOpacity: 28 });

    expect(selected).toMatchObject({ strength: 82, color: '#22aa66', highlightColor: '#ffeeaa', tintOpacity: 28 });
    expect(other).toMatchObject({ strength: 20, color: '#000000' });
    expect(canInteract).toHaveBeenCalledOnce();
  });

  it('does nothing when state is absent or interaction is blocked by busy or locked state', () => {
    const missingState = ref<ScreenshotState | null>(null);
    const missing = mountEffects(missingState);
    missing.effects.add('blur');
    missing.effects.update({ strength: 90 });
    expect(missing.select).not.toHaveBeenCalled();
    expect(missing.canInteract).not.toHaveBeenCalled();

    const busyState = ref<ScreenshotState | null>(makeState());
    const busyGuard = vi.fn(() => false);
    const busy = mountEffects(busyState, busyGuard);
    busy.effects.add('blur');
    expect(busyState.value?.effects).toBeUndefined();
    expect(busyState.value?.composition).toBeUndefined();
    expect(busy.select).not.toHaveBeenCalled();
    expect(busyGuard).toHaveBeenCalledOnce();

    const lockedEffect = {
      id: 'locked-highlight',
      kind: 'blur',
      mode: 'highlight',
      strength: 65,
      color: '#000000',
    } as NonNullable<ScreenshotState['effects']>[number];
    const lockedState = ref<ScreenshotState | null>(
      makeState({
        effects: [lockedEffect],
        composition: [{ ...defaultLayerCompositing(lockedEffect.id), locked: true }],
      }),
    );
    const lockedId = ref<string | null>(lockedEffect.id);
    const lockGuard = vi.fn(() => !lockedState.value!.composition!.find(({ id }) => id === lockedId.value)?.locked);
    const locked = mountEffects(lockedState, lockGuard, lockedId);

    locked.effects.add('blur');
    locked.effects.update({ strength: 90 });
    expect(lockedEffect.strength).toBe(65);
    expect(lockedState.value!.effects).toEqual([lockedEffect]);
    expect(lockGuard).toHaveBeenCalledTimes(2);
  });
});

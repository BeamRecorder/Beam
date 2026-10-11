import { hydrateActionBindings } from '~/shortcuts/action-bindings';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { ClipComposition, VisualClip } from '@beam/engine/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { useSelectedLayerMove } from '../useSelectedLayerMove';
import { transformClipDisplayLayout } from '../layer-display-layout';

const visual = (id: string, kind: 'screen' | 'image', x: number): VisualClip => ({
  id,
  kind,
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 10_000,
  sourceInMs: 0,
  sourceDurationMs: 10_000,
  playbackRate: 1,
  enabled: true,
  order: kind === 'screen' ? 0 : 1,
  transform: { x, y: 0.2, width: 0.3, height: 0.3 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
});

const composition = (): ClipComposition => {
  const screen = visual('screen', 'screen', 0);
  const image = visual('image', 'image', 0.4);
  return {
    schemaVersion: 6,
    keyboardCaptionSessions: [],
    assets: [
      {
        id: screen.assetId,
        kind: 'video',
        name: 'Screen',
        fileName: null,
        durationMs: 10_000,
        width: 1920,
        height: 1080,
        src: 'screen.mp4',
        origin: 'session',
      },
      {
        id: image.assetId,
        kind: 'image',
        name: 'Image',
        fileName: null,
        durationMs: 10_000,
        width: 800,
        height: 600,
        src: 'image.png',
        origin: 'project',
      },
    ],
    clips: [screen, image],
  };
};

const pointer = (target: HTMLElement, overrides: Partial<PointerEvent> = {}) =>
  ({
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    currentTarget: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  }) as unknown as PointerEvent;

const mountInteraction = (overrides: Partial<Parameters<typeof useSelectedLayerMove>[0]> = {}) => {
  const scene = composition();
  const selectedIds = ref(['screen', 'image']);
  const bounds = { dx: 10, dy: 20, dw: 800, dh: 400, scale: 1 };
  const onUpdate = vi.fn();
  const onGuides = vi.fn();
  const options = {
    composition: () => scene,
    currentTime: () => 1,
    selectedClipIds: () => selectedIds.value,
    clipIdAt: () => 'image',
    transformFor: (clip: Parameters<typeof transformClipDisplayLayout>[0]['clip']) => clip.transform!,
    boundsFor: () => bounds,
    alignmentViewport: () => bounds,
    displayLayoutFor: (
      clip: Parameters<typeof transformClipDisplayLayout>[0]['clip'],
      transform: VisualClip['transform'],
    ) => transformClipDisplayLayout({ composition: scene, clip, transform, bounds, isCropping: false }),
    zoomScale: () => 1,
    onUpdate,
    onGuides,
    ...overrides,
  };
  let interaction!: ReturnType<typeof useSelectedLayerMove>;
  const wrapper = mount(
    defineComponent({
      setup() {
        interaction = useSelectedLayerMove(options);
        return () => h('div');
      },
    }),
  );
  const target = document.createElement('div');
  return { scene, selectedIds, bounds, onUpdate, onGuides, options, interaction, wrapper, target };
};

describe('useSelectedLayerMove', () => {
  it('rejects secondary buttons, single selections and clicks outside the selection', () => {
    let hit: string | null = 'image';
    const m = mountInteraction({ clipIdAt: () => hit });
    expect(m.interaction.begin(pointer(m.target, { button: 2 }), null)).toBe(false);
    m.selectedIds.value = ['image'];
    expect(m.interaction.begin(pointer(m.target), null)).toBe(false);
    m.selectedIds.value = ['screen', 'image'];
    hit = null;
    expect(m.interaction.begin(pointer(m.target), null)).toBe(false);
    hit = 'unselected';
    expect(m.interaction.begin(pointer(m.target), null)).toBe(false);
    expect(m.interaction.move(pointer(m.target))).toBe(false);
    expect(m.interaction.end(pointer(m.target))).toBe(false);
    expect(m.onUpdate).not.toHaveBeenCalled();
    m.wrapper.unmount();
  });

  it('ignores locked layers, audio and cursor-following captions and requires hit-layer geometry', () => {
    const m = mountInteraction({ clipIdAt: () => 'screen', boundsFor: () => null });
    const base = visual('extra', 'image', 0.2);
    m.scene.clips.push(
      { ...base, id: 'locked', locked: true },
      { ...base, id: 'audio', kind: 'audio', role: 'microphone', volume: 1 },
      {
        ...base,
        id: 'following',
        kind: 'caption',
        caption: {
          type: 'keyboard',
          steps: [],
          followCursor: true,
          recordedPlatform: 'windows',
          sourceSessionId: 'session',
          style: createDefaultCaptionStyle(32),
        },
      },
    );
    m.selectedIds.value = ['screen', 'locked', 'audio', 'following'];
    expect(m.interaction.begin(pointer(m.target), null)).toBe(false);
    expect(m.onUpdate).not.toHaveBeenCalled();
    m.wrapper.unmount();
  });

  it('ignores other pointers and tiny moves, and clears drafts if the selection changes', async () => {
    const m = mountInteraction();
    expect(m.interaction.begin(pointer(m.target), null)).toBe(true);
    expect(m.interaction.move(pointer(m.target, { pointerId: 2, clientX: 200 }))).toBe(false);
    expect(m.interaction.end(pointer(m.target, { pointerId: 2 }))).toBe(false);
    expect(m.interaction.move(pointer(m.target, { clientX: 102 }))).toBe(true);
    expect(m.interaction.drafts.value).toEqual({});
    m.interaction.move(pointer(m.target, { clientX: 220 }));
    expect(Object.keys(m.interaction.drafts.value)).toHaveLength(2);
    m.selectedIds.value = ['image'];
    await nextTick();
    expect(m.interaction.drafts.value).toEqual({});
    expect(m.onGuides).toHaveBeenLastCalledWith([]);
    expect(m.interaction.end(pointer(m.target))).toBe(false);
    expect(m.onUpdate).not.toHaveBeenCalled();
    m.wrapper.unmount();
  });

  it('moves without fabricated snapping when display geometry is unavailable', () => {
    const m = mountInteraction({ displayLayoutFor: () => null, onGuides: undefined });
    expect(m.interaction.begin(pointer(m.target), null)).toBe(true);
    m.interaction.move(pointer(m.target, { clientX: 220 }));
    expect(m.interaction.draftFor('screen')?.x).toBeCloseTo(0.15);
    m.interaction.end(pointer(m.target));
    expect(m.onUpdate).toHaveBeenCalledOnce();
    m.wrapper.unmount();
  });

  it('uses cropped stationary targets and handles webcam and caption overlay coordinates', () => {
    const m = mountInteraction();
    const screen = m.scene.clips[0] as VisualClip;
    const image = m.scene.clips[1] as VisualClip;
    screen.transform = { x: 0, y: 0.2, width: 0.08, height: 0.1 };
    image.transform = { x: 0.1, y: 0.2, width: 0.08, height: 0.1 };
    const reference = visual('reference', 'image', 0.38);
    reference.transform.width = 0.5;
    reference.crop = { x: 0.3, y: 0, width: 0.4, height: 1 };
    m.scene.clips.push(reference);
    m.interaction.begin(pointer(m.target), null);
    m.interaction.move(pointer(m.target, { clientX: 100 + 0.348 * 800 }));
    expect(m.interaction.draftFor('image')?.x).toBeCloseTo(0.45, 8);
    expect(m.onGuides).toHaveBeenLastCalledWith(expect.arrayContaining([{ type: 'vertical', position: 0.53 }]));
    m.interaction.end(pointer(m.target));

    const webcam: VisualClip = { ...image, kind: 'webcam', id: 'webcam' };
    m.scene.clips = [
      webcam,
      {
        ...image,
        id: 'caption',
        kind: 'caption',
        caption: {
          type: 'text',
          sentences: [],
          style: createDefaultCaptionStyle(32),
        },
      },
    ];
    m.selectedIds.value = ['webcam', 'caption'];
    m.options.clipIdAt = () => 'webcam';
    m.bounds.scale = 0;
    expect(m.interaction.begin(pointer(m.target), null)).toBe(true);
    m.interaction.move(pointer(m.target, { clientX: 180 }));
    expect(Object.keys(m.interaction.drafts.value)).toEqual(['webcam', 'caption']);
    m.interaction.end(pointer(m.target));
    m.wrapper.unmount();
  });

  it('moves every selected visual by the same canvas delta and preserves the selection', () => {
    const scene = ref(composition());
    const selectedIds = ref(['screen', 'image']);
    const onUpdate = vi.fn();
    const onGuides = vi.fn();
    let interaction!: ReturnType<typeof useSelectedLayerMove>;
    const wrapper = mount(
      defineComponent({
        setup() {
          interaction = useSelectedLayerMove({
            composition: () => scene.value,
            currentTime: () => 1,
            selectedClipIds: () => selectedIds.value,
            clipIdAt: () => 'image',
            transformFor: (clip) => clip.transform ?? { x: 0, y: 0, width: 1, height: 1 },
            boundsFor: () => ({ dx: 0, dy: 0, dw: 800, dh: 400, scale: 1 }),
            alignmentViewport: () => ({ dx: 0, dy: 0, dw: 800, dh: 400, scale: 1 }),
            displayLayoutFor: (_clip, transform) => ({
              left: transform.x * 800,
              top: transform.y * 400,
              width: transform.width * 800,
              height: transform.height * 400,
            }),
            zoomScale: () => 1,
            onUpdate,
            onGuides,
          });
          return () => h('div');
        },
      }),
    );
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    const start = pointer(target);

    expect(interaction.begin(start, document.createElement('canvas'))).toBe(true);
    expect(interaction.move(pointer(target, { clientX: 220, clientY: 140 }))).toBe(true);
    expect(interaction.draftFor('screen')?.x).toBeCloseTo(0.15);
    expect(interaction.draftFor('screen')?.y).toBeCloseTo(0.3);
    expect(interaction.draftFor('image')?.x).toBeCloseTo(0.55);
    expect(interaction.draftFor('image')?.y).toBeCloseTo(0.3);
    expect(onGuides).toHaveBeenLastCalledWith(expect.arrayContaining([{ type: 'vertical', position: 0.5 }]));
    expect(interaction.end(pointer(target, { clientX: 220, clientY: 140 }))).toBe(true);

    expect(onUpdate).toHaveBeenCalledOnce();
    const updates = onUpdate.mock.calls[0]?.[0] as Array<{
      id: string;
      transform: { x: number; y: number };
    }>;
    expect(updates.map(({ id }) => id)).toEqual(expect.arrayContaining(['screen', 'image']));
    expect(updates.find(({ id }) => id === 'screen')?.transform.x).toBeCloseTo(0.15);
    expect(updates.find(({ id }) => id === 'screen')?.transform.y).toBeCloseTo(0.3);
    expect(updates.find(({ id }) => id === 'image')?.transform.x).toBeCloseTo(0.55);
    expect(updates.find(({ id }) => id === 'image')?.transform.y).toBeCloseTo(0.3);
    expect(selectedIds.value).toEqual(['screen', 'image']);
    expect(start.preventDefault).toHaveBeenCalledOnce();
    expect(start.stopPropagation).toHaveBeenCalledOnce();
    expect(onGuides).toHaveBeenLastCalledWith([]);
    wrapper.unmount();
  });

  it.each([1, 2])('aligns the cropped selection bounds at camera scale %s', (scale) => {
    const scene = composition();
    for (const clip of scene.clips)
      if (clip.kind === 'screen' || clip.kind === 'image') clip.crop = { x: 0, y: 0, width: 0.5, height: 1 };
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400, scale };
    const onUpdate = vi.fn();
    const onGuides = vi.fn();
    let interaction!: ReturnType<typeof useSelectedLayerMove>;
    const wrapper = mount(
      defineComponent({
        setup() {
          interaction = useSelectedLayerMove({
            composition: () => scene,
            currentTime: () => 1,
            selectedClipIds: () => ['screen', 'image'],
            clipIdAt: () => 'image',
            transformFor: (clip) => clip.transform!,
            boundsFor: () => bounds,
            alignmentViewport: () => bounds,
            displayLayoutFor: (clip, transform) =>
              transformClipDisplayLayout({
                composition: scene,
                clip,
                transform,
                bounds,
                isCropping: false,
              }),
            zoomScale: () => 1,
            onUpdate,
            onGuides,
          });
          return () => h('div');
        },
      }),
    );
    const target = document.createElement('div');
    Object.assign(target, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
    expect(interaction.begin(pointer(target), document.createElement('canvas'))).toBe(true);
    interaction.move(pointer(target, { clientX: 100 + (0.225 * scale - 0.002) * 800 }));
    expect(interaction.draftFor('screen')?.x).toBeCloseTo(0.225, 8);
    expect(interaction.draftFor('image')?.x).toBeCloseTo(0.625, 8);
    expect(interaction.draftFor('image')?.width).toBe(0.3);
    expect(onGuides).toHaveBeenLastCalledWith(expect.arrayContaining([{ type: 'vertical', position: 0.5 }]));
    interaction.end(pointer(target));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(scene.clips[0]).toMatchObject({ transform: { x: 0, width: 0.3 }, crop: { width: 0.5 } });
    wrapper.unmount();
  });

  it('does not collapse or commit a multi-selection on a click without movement', () => {
    const selectedIds = ref(['screen', 'image']);
    const onUpdate = vi.fn();
    let interaction!: ReturnType<typeof useSelectedLayerMove>;
    const scene = composition();
    const wrapper = mount(
      defineComponent({
        setup() {
          interaction = useSelectedLayerMove({
            composition: () => scene,
            currentTime: () => 1,
            selectedClipIds: () => selectedIds.value,
            clipIdAt: () => 'image',
            transformFor: (clip) => clip.transform ?? { x: 0, y: 0, width: 1, height: 1 },
            boundsFor: () => ({ dx: 0, dy: 0, dw: 800, dh: 400, scale: 1 }),
            alignmentViewport: () => ({ dx: 0, dy: 0, dw: 800, dh: 400, scale: 1 }),
            displayLayoutFor: () => null,
            zoomScale: () => 1,
            onUpdate,
          });
          return () => h('div');
        },
      }),
    );
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
    });
    const event = pointer(target);

    expect(interaction.begin(event, document.createElement('canvas'))).toBe(true);
    expect(interaction.end(event)).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(selectedIds.value).toEqual(['screen', 'image']);
    wrapper.unmount();
  });
});

describe('configured drag gestures', () => {
  it.each([
    ['Alt', { altKey: true }],
    ['Control', { ctrlKey: true }],
  ] as const)('duplicates the selection with %s without moving the originals', (keys, modifiers) => {
    hydrateActionBindings({ 'gesture.duplicate': { keys, scope: 'application', category: 'gestures' } });
    const onDuplicate = vi.fn();
    const m = mountInteraction({ onDuplicate });
    const before = structuredClone(m.scene);
    expect(m.interaction.begin(pointer(m.target, modifiers), null)).toBe(true);
    m.interaction.move(pointer(m.target, { ...modifiers, clientX: 200 }));
    m.interaction.end(pointer(m.target));
    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onDuplicate.mock.calls[0]![0]).toHaveLength(2);
    expect(m.onUpdate).not.toHaveBeenCalled();
    expect(m.scene).toEqual(before);
    m.wrapper.unmount();
    hydrateActionBindings({});
  });
  it('moves normally with the old duplicate modifier after remapping', () => {
    hydrateActionBindings({ 'gesture.duplicate': { keys: 'Control', scope: 'application', category: 'gestures' } });
    const onDuplicate = vi.fn();
    const m = mountInteraction({ onDuplicate });
    m.interaction.begin(pointer(m.target, { altKey: true }), null);
    m.interaction.move(pointer(m.target, { altKey: true, clientX: 200 }));
    m.interaction.end(pointer(m.target));
    expect(onDuplicate).not.toHaveBeenCalled();
    expect(m.onUpdate).toHaveBeenCalledOnce();
    m.wrapper.unmount();
    hydrateActionBindings({});
  });
});

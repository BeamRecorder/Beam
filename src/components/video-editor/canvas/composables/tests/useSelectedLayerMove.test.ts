import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { useSelectedLayerMove } from '../useSelectedLayerMove';

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

describe('useSelectedLayerMove', () => {
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
            displayLayoutFor: () => null,
            zoomScale: () => 1,
            onUpdate,
          });
          return () => h('div');
        },
      }),
    );
    const target = document.createElement('div');
    Object.assign(target, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => false) });
    const event = pointer(target);

    expect(interaction.begin(event, document.createElement('canvas'))).toBe(true);
    expect(interaction.end(event)).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(selectedIds.value).toEqual(['screen', 'image']);
    wrapper.unmount();
  });
});

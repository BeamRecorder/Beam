import { defineComponent, h, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompositionMedia } from '../useCompositionMedia';
import type { ClipComposition, NormalizedTransform, ShapeClip } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../output-canvas';

const drawShapeClip = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/shape/render-shape-clip', () => ({ drawShapeClip }));

const shapeClip = (overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  id: 'shape',
  trackId: 'shape-track',
  kind: 'shape',
  name: 'Shape',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  family: 'shape',
  preset: 'rounded-rectangle',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 0,
  cornerRadius: 16,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: false,
  opacity: 70,
  backdropBlur: 35,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 32,
  shadowDirection: 'bottom-right',
  ...overrides,
});

const compositionFor = (clips: ShapeClip[]): ClipComposition => ({
  schemaVersion: 13,
  assets: [],
  clips,
  keyboardCaptionSessions: [],
});

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCompositionMedia>;

const mountComposable = (
  clips: ShapeClip[],
  selected: ShapeClip | null = null,
  draft: NormalizedTransform | null = null,
) => {
  const composition = ref(compositionFor(clips));
  const selectedClip = ref<ShapeClip | null>(selected);
  const transformDraft = ref<NormalizedTransform | null>(draft);
  const Harness = defineComponent({
    setup() {
      state = useCompositionMedia({
        composition: () => composition.value,
        currentTime: () => 0.5,
        frameFor: () => null,
        selectedTransformClip: () => selectedClip.value,
        transformDraft: () => transformDraft.value,
        outputCanvas: () => ({ ...DEFAULT_OUTPUT_CANVAS, width: 1_600, height: 900 }),
        captionViewport: () => ({ x: 0, y: 0, width: 800, height: 450 }),
        onRenderOnce: vi.fn(),
      });
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe('useCompositionMedia shape rendering', () => {
  it('draws an active shape in the visual stack', () => {
    const clip = shapeClip({ id: 'active-shape' });
    mountComposable([clip]);
    const ctx = {} as CanvasRenderingContext2D;
    const window = { dx: 10, dy: 20, dw: 800, dh: 400, scale: 1 };

    state.drawVisualStack(ctx, window, vi.fn());

    expect(drawShapeClip).toHaveBeenCalledOnce();
    expect(drawShapeClip).toHaveBeenCalledWith(ctx, clip, { x: 10, y: 20, width: 800, height: 400 }, clip.transform);
  });

  it('uses a selected shape transform draft in the visual stack', () => {
    const clip = shapeClip({ id: 'selected-shape' });
    const draft = { x: 0.4, y: 0.3, width: 0.2, height: 0.25 };
    mountComposable([clip], clip, draft);
    const ctx = {} as CanvasRenderingContext2D;

    state.drawVisualStack(ctx, { dx: 0, dy: 0, dw: 1_000, dh: 500, scale: 1 }, vi.fn());

    expect(drawShapeClip).toHaveBeenCalledWith(ctx, clip, { x: 0, y: 0, width: 1_000, height: 500 }, draft);
  });

  it('draws a shape when drawComposition targets it by id', () => {
    const clip = shapeClip({ id: 'target-shape' });
    mountComposable([clip]);
    const ctx = {} as CanvasRenderingContext2D;

    state.drawComposition(ctx, { dx: 15, dy: 25, dw: 640, dh: 360 }, 'target-shape');

    expect(drawShapeClip).toHaveBeenCalledOnce();
    expect(drawShapeClip).toHaveBeenCalledWith(ctx, clip, { x: 15, y: 25, width: 640, height: 360 }, clip.transform);
  });
});

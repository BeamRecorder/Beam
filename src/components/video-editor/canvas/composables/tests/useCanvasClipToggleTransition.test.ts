import { defineComponent, nextTick, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import { useCanvasClipToggleTransition, CLIP_TOGGLE_FADE_MS } from '../useCanvasClipToggleTransition';

const visual = (id: string, kind: VisualClip['kind'], enabled = true): VisualClip => ({
  id,
  kind,
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: {
    border: { enabled: false, width: 0, color: '#000000' },
    cornerRadius: 0,
    shadow: { enabled: false, blur: 0, opacity: 0, x: 0, y: 0 },
  },
  isMirrored: false,
  isMirroredY: false,
});

const composition = (clips: ClipComposition['clips'] = [visual('screen', 'screen')]): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [],
  clips,
});

const mountTransition = (value: ClipComposition, options: { reducedMotion?: boolean } = {}) => {
  const currentCanvas = { width: 100, height: 50 } as HTMLCanvasElement;
  const captureContext = {
    drawImage: vi.fn(),
  };
  const originalCreateElement = document.createElement.bind(document);
  const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => captureContext,
      } as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tagName);
  }) as typeof document.createElement);
  const renderOnce = vi.fn();
  let now = 0;
  const state = reactive(value);
  let transition!: ReturnType<typeof useCanvasClipToggleTransition>;
  const wrapper = mount(
    defineComponent({
      setup() {
        transition = useCanvasClipToggleTransition({
          canvas: () => currentCanvas,
          composition: () => state,
          onRenderOnce: renderOnce,
          now: () => now,
          prefersReducedMotion: () => options.reducedMotion ?? false,
        });
        return () => null;
      },
    }),
  );

  return {
    state,
    transition,
    renderOnce,
    captureContext,
    setNow: (time: number) => {
      now = time;
    },
    wrapper,
    createElement,
  };
};

afterEach(() => vi.restoreAllMocks());

describe('useCanvasClipToggleTransition', () => {
  it('captures the previous visual frame and blends it out through the toggle', async () => {
    const mounted = mountTransition(composition());
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    mounted.state.clips[0]!.enabled = false;
    await nextTick();

    expect(mounted.captureContext.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0);
    expect(mounted.renderOnce).toHaveBeenCalledTimes(1);
    expect(mounted.transition.blendPreviousFrame(context, 100, 50)).toBe(true);
    expect(context.globalAlpha).toBe(1);
    mounted.setNow(CLIP_TOGGLE_FADE_MS / 2);
    expect(mounted.transition.blendPreviousFrame(context, 100, 50)).toBe(true);
    expect(context.globalAlpha).toBeCloseTo(0.5, 1);
    mounted.setNow(CLIP_TOGGLE_FADE_MS);
    expect(mounted.transition.blendPreviousFrame(context, 100, 50)).toBe(false);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.save).toHaveBeenCalledTimes(2);
    expect(context.restore).toHaveBeenCalledTimes(2);
    mounted.wrapper.unmount();
  });

  it('does not start a transition for additions or non-visual clips', async () => {
    const mounted = mountTransition(composition());
    mounted.state.clips.push(visual('image', 'image'));
    mounted.state.clips.push({
      id: 'audio',
      kind: 'audio',
      role: 'imported',
      name: 'audio',
      assetId: 'audio-asset',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      volume: 100,
    });
    await nextTick();

    expect(mounted.renderOnce).not.toHaveBeenCalled();
    expect(mounted.transition.blendPreviousFrame({} as CanvasRenderingContext2D, 100, 50)).toBe(false);
    mounted.wrapper.unmount();
  });

  it('does not capture when reduced motion is preferred', async () => {
    const mounted = mountTransition(composition(), { reducedMotion: true });
    mounted.state.clips[0]!.enabled = false;
    await nextTick();

    expect(mounted.captureContext.drawImage).not.toHaveBeenCalled();
    expect(mounted.renderOnce).not.toHaveBeenCalled();
    expect(mounted.transition.blendPreviousFrame({} as CanvasRenderingContext2D, 100, 50)).toBe(false);
    mounted.wrapper.unmount();
  });
});

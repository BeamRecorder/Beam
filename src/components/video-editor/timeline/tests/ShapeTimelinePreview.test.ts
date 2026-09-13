import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';

const dependencies = vi.hoisted(() => ({
  loadElementFonts: vi.fn(),
  renderShapeTimelinePreview: vi.fn(),
}));
vi.mock('~/media/shared/element-fonts', () => ({ loadElementFonts: dependencies.loadElementFonts }));
vi.mock('../shape-timeline-preview', () => ({
  renderShapeTimelinePreview: dependencies.renderShapeTimelinePreview,
}));

import ShapeTimelinePreview from '../ShapeTimelinePreview.vue';

const shapeClip = (overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  id: 'shape-1',
  kind: 'shape',
  name: 'Callout',
  assetId: '',
  trackId: 'shape-track',
  timelineStartMs: 250,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.3, width: 0.6, height: 0.4 },
  family: 'drawing',
  preset: 'freehand',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 2,
  cornerRadius: 12,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: true,
  opacity: 100,
  backdropBlur: 0,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 0,
  shadowDirection: 'bottom-right',
  text: createElementText('Original'),
  drawing: {
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.7 },
    ],
    smoothing: 0.4,
    strokeWidth: 12,
  },
  ...overrides,
});

let nextFrameId = 1;
let frames = new Map<number, FrameRequestCallback>();

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};

const runFrame = async () => {
  const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
  expect(entry).toBeDefined();
  frames.delete(entry![0]);
  entry![1](16);
  await settle();
};

beforeEach(() => {
  nextFrameId = 1;
  frames = new Map();
  dependencies.loadElementFonts.mockReset().mockResolvedValue(undefined);
  dependencies.renderShapeTimelinePreview.mockReset().mockReturnValue('data:image/png;base64,ready');
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => vi.restoreAllMocks());

describe('ShapeTimelinePreview', () => {
  it('waits for imported fonts before drawing and keeps the ready bitmap while a refresh is pending', async () => {
    let resolveInitial!: () => void;
    let resolveStale!: () => void;
    let resolveLatest!: () => void;
    dependencies.loadElementFonts
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveInitial = resolve)))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveStale = resolve)))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveLatest = resolve)));
    dependencies.renderShapeTimelinePreview
      .mockReturnValueOnce('data:image/png;base64,first')
      .mockReturnValueOnce('data:image/png;base64,latest');
    const firstClip = shapeClip();
    const wrapper = mount(ShapeTimelinePreview, { props: { clip: firstClip } });

    expect(wrapper.get('.preview-status').text()).toBe('Rendering preview…');
    await runFrame();
    expect(dependencies.loadElementFonts).toHaveBeenCalledWith([firstClip]);
    expect(dependencies.renderShapeTimelinePreview).not.toHaveBeenCalled();

    resolveInitial();
    await settle();
    expect(wrapper.get('.shape-preview').attributes('style')).toContain('data:image/png;base64,first');

    const staleClip = shapeClip({ fillColor: '#ff0000', text: createElementText('Stale') });
    await wrapper.setProps({ clip: staleClip });
    await runFrame();
    expect(wrapper.get('.shape-preview').attributes('style')).toContain('data:image/png;base64,first');
    expect(wrapper.find('.preview-status').exists()).toBe(false);

    const latestClip = shapeClip({ fillColor: '#00ff00', text: createElementText('Latest') });
    await wrapper.setProps({ clip: latestClip });
    resolveStale();
    await settle();
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenCalledTimes(1);

    await runFrame();
    expect(dependencies.loadElementFonts).toHaveBeenLastCalledWith([latestClip]);
    resolveLatest();
    await settle();
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenCalledTimes(2);
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenLastCalledWith(latestClip, DEFAULT_OUTPUT_CANVAS);
    expect(wrapper.get('.shape-preview').attributes('style')).toContain('data:image/png;base64,latest');
    wrapper.unmount();
  });

  it('coalesces visual edits, tracks source canvas dimensions, and ignores placement and timing clones', async () => {
    const original = shapeClip();
    const canvas = { width: 1_920, height: 1_080 };
    const wrapper = mount(ShapeTimelinePreview, { props: { clip: original, canvas } });
    await runFrame();
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenCalledTimes(1);

    const visualEdit = structuredClone(original);
    visualEdit.fillColor = '#aabbcc';
    visualEdit.transform.width = 0.7;
    visualEdit.transform.height = 0.5;
    await wrapper.setProps({ clip: visualEdit });
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    await runFrame();
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenCalledTimes(2);

    const placementClone = structuredClone(visualEdit);
    placementClone.transform.x = 0.8;
    placementClone.transform.y = 0.1;
    placementClone.timelineStartMs = 4_000;
    placementClone.timelineDurationMs = 2_000;
    await wrapper.setProps({ clip: placementClone });
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenCalledTimes(2);

    const resizedCanvas = { width: 1_280, height: 720 };
    await wrapper.setProps({ canvas: resizedCanvas });
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(3);
    await runFrame();
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenCalledWith(placementClone, resizedCanvas);
    expect(dependencies.renderShapeTimelinePreview).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('cancels queued frames and ignores font completion after unmount', async () => {
    let resolveFonts!: () => void;
    dependencies.loadElementFonts.mockImplementation(() => new Promise<void>((resolve) => (resolveFonts = resolve)));
    const queuedWrapper = mount(ShapeTimelinePreview, { props: { clip: shapeClip() } });
    const queuedId = frames.keys().next().value as number;
    queuedWrapper.unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(queuedId);
    expect(dependencies.loadElementFonts).not.toHaveBeenCalled();

    const pendingWrapper = mount(ShapeTimelinePreview, { props: { clip: shapeClip() } });
    await runFrame();
    expect(dependencies.loadElementFonts).toHaveBeenCalledOnce();
    pendingWrapper.unmount();
    resolveFonts();
    await settle();
    expect(dependencies.renderShapeTimelinePreview).not.toHaveBeenCalled();
  });

  it('shows an accessible error when font loading fails', async () => {
    dependencies.loadElementFonts.mockRejectedValue(new Error('The font could not be loaded.'));
    const wrapper = mount(ShapeTimelinePreview, { props: { clip: shapeClip() } });

    await runFrame();

    expect(wrapper.get('.preview-status').attributes('aria-label')).toBe('Preview unavailable');
    expect(wrapper.get('.preview-status').attributes('title')).toBe('The font could not be loaded.');
    expect(dependencies.renderShapeTimelinePreview).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

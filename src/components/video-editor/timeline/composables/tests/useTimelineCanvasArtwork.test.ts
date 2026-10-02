import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, onScopeDispose, provide, ref, shallowRef, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineCanvasArtwork } from '../useTimelineCanvasArtwork';
import { timelineCanvasRegistryKey } from '../../timeline-canvas-registry';
import { TimelineArtworkImages } from '../../timeline-artwork-images';
import { shapePreviewCache } from '../../shape-preview-cache';
import type { TimelineClipProps } from '../../timeline-clip-types';
import type { TimelineCanvasArtwork, TimelineCanvasRegistry } from '../../timeline-canvas-types';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '~/media/shared/shape-layer-style';

const runtime = vi.hoisted(() => ({ thumbnails: null as unknown as Ref<Record<number, string>>, widths: null as unknown as Ref<Record<number, number>>, thumbnailError: null as unknown as Ref<string | null>, request: vi.fn(), assets: [] as Ref<unknown>[], fonts: vi.fn(), render: vi.fn() }));
vi.mock('../../waveform/useThumbnails', () => ({ useThumbnails: (asset: Ref<unknown>) => { runtime.assets.push(asset); return { thumbnails: runtime.thumbnails, widths: runtime.widths, error: runtime.thumbnailError, requestVisibleFrames: runtime.request }; } }));
vi.mock('~/media/shared/element-fonts', () => ({ loadElementFonts: runtime.fonts }));
vi.mock('../../shape-timeline-preview', () => ({ renderShapeTimelinePreview: runtime.render }));
enableAutoUnmount(afterEach);
beforeEach(() => {
  runtime.thumbnails = ref({}); runtime.widths = ref({}); runtime.thumbnailError = ref(null); runtime.request.mockClear(); runtime.assets.length = 0;
  runtime.fonts.mockReset().mockResolvedValue(undefined); runtime.render.mockReset().mockReturnValue('data:image/png;shape');
  shapePreviewCache.clear();
});
afterEach(() => { shapePreviewCache.clear(); vi.restoreAllMocks(); });
class FakeImage {
  src = ''; naturalWidth = 320; naturalHeight = 96;
  onload: ((event: Event) => void) | null = null; onerror: ((event: Event) => void) | null = null;
  load() { this.onload?.(new Event('load')); }
  fail() { this.onerror?.(new Event('error')); }
}
const clip: TimelineClipProps['clip'] = { id: 'clip', kind: 'video', name: 'Video', assetId: 'asset', timelineStartMs: 1000, timelineDurationMs: 2000, sourceInMs: 500, sourceDurationMs: 4000, playbackRate: 1, enabled: true, order: 0, trackId: 'lane', transform: { x: 0, y: 0, width: 1, height: 1 }, appearance: createDefaultClipAppearance('video'), isMirrored: false, isMirroredY: false };
const asset: NonNullable<TimelineClipProps['asset']> = { id: 'asset', kind: 'video', name: 'Video', fileName: 'video.webm', durationMs: 5000, width: 1920, height: 1080, src: 'project-media://asset/video.webm', origin: 'project' };
const shape: ShapeClip = { ...DEFAULT_ANNOTATION_SHAPE_STYLE, kind: 'shape', id: 'shape', name: 'Shape', trackId: 'shapes', assetId: '', enabled: true, order: 1, timelineStartMs: 0, timelineDurationMs: 1000, sourceInMs: 0, sourceDurationMs: 1000, playbackRate: 1, transform: { x: .1, y: .1, width: .5, height: .2 } };
function setup(patch: Partial<TimelineClipProps> = {}, limits: { maxEntries?: number; maxBytes?: number } = {}) {
  const decoded: FakeImage[] = [];
  const images = new TimelineArtworkImages({ ...limits, createImage: () => { const image = new FakeImage(); decoded.push(image); return image as unknown as HTMLImageElement; } });
  const artworks = shallowRef<ReadonlyMap<string, TimelineCanvasArtwork>>(new Map());
  const registry: TimelineCanvasRegistry = { images, artworks, set: vi.fn((id, value) => { const map = new Map(artworks.value); map.set(id, value); artworks.value = map; }), delete: vi.fn(id => { const map = new Map(artworks.value); map.delete(id); artworks.value = map; }) };
  let error!: Ref<string>;
  const Child = defineComponent({ props: ['clip', 'asset', 'duration', 'timelineWidthPx', 'thumbnailSlots', 'deferThumbnailRequests', 'canvas', 'selected'], setup(props) { error = useTimelineCanvasArtwork(props as unknown as TimelineClipProps).error; return {}; }, template: '<span />' });
  const Owner = defineComponent({ props: ['clip', 'asset', 'duration', 'timelineWidthPx', 'thumbnailSlots', 'deferThumbnailRequests', 'canvas', 'selected'], components: { Child }, setup() { provide(timelineCanvasRegistryKey, registry); onScopeDispose(() => images.dispose()); return {}; }, template: '<Child v-bind="$props" />' });
  const wrapper = mount(Owner, { props: { clip, asset, duration: 10, timelineWidthPx: 1000, thumbnailSlots: [{ timelineSeconds: 0, durationSeconds: 2 }, { timelineSeconds: 2, durationSeconds: 2 }], selected: false, ...patch } });
  return { wrapper, registry, decoded, error: () => error };
}

describe('canvas thumbnail scheduling and real source mapping', () => {
  it('requests only intersecting slots, actual source offsets and DPR-dependent widths', async () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    const { registry } = setup({ timelineWidthPx: 2000 }); await flushPromises();
    expect(runtime.request).toHaveBeenLastCalledWith([.5, 1.5], 480);
    expect(registry.artworks.value.get('clip')?.frames).toMatchObject([{ mediaSecond: .5, relativeMs: 0, durationMs: 1000, pending: true }, { mediaSecond: 1.5, relativeMs: 1000, durationMs: 1000, pending: true }]);
  });
  it('maps playback rate and deduplicates genuine frozen source timestamps', async () => {
    const { wrapper } = setup({ clip: { ...clip, playbackRate: 2 } }); await flushPromises();
    expect(runtime.request).toHaveBeenLastCalledWith([.5, 2.5], expect.any(Number));
    await wrapper.setProps({ clip: { ...clip, freezeFrameSourceMs: 750 } }); await flushPromises();
    expect(runtime.request).toHaveBeenLastCalledWith([.75], expect.any(Number));
  });
  it('defers decoding through a gesture while retaining painted source slots, then refreshes on release', async () => {
    const { wrapper, registry } = setup(); await flushPromises(); runtime.request.mockClear();
    const before = registry.artworks.value.get('clip')?.frames;
    await wrapper.setProps({ deferThumbnailRequests: true, thumbnailSlots: [{ timelineSeconds: 1.5, durationSeconds: 1 }] }); await flushPromises();
    expect(runtime.request).not.toHaveBeenCalled(); expect(registry.artworks.value.get('clip')?.frames).toEqual(before);
    await wrapper.setProps({ deferThumbnailRequests: false }); await flushPromises();
    expect(runtime.request).toHaveBeenCalledOnce(); expect(runtime.request).toHaveBeenLastCalledWith([1], expect.any(Number));
  });
  it('does no video extraction for initially deferred clips, absent assets or nonintersecting slots', async () => {
    const deferred = setup({ deferThumbnailRequests: true }); await flushPromises(); expect(runtime.request).not.toHaveBeenCalled(); deferred.wrapper.unmount();
    const missing = setup({ asset: null }); await flushPromises(); expect(runtime.assets.at(-1)!.value).toBeNull(); missing.wrapper.unmount();
    runtime.request.mockClear(); setup({ thumbnailSlots: [{ timelineSeconds: 20, durationSeconds: 2 }] }); await flushPromises();
    expect(runtime.request).toHaveBeenLastCalledWith([], expect.any(Number));
  });
  it('surfaces a real thumbnail-worker decode failure rather than keeping an indefinite pending state', async () => {
    const { error, registry } = setup(); await flushPromises();
    runtime.thumbnailError.value = 'VP9 thumbnail decode failed'; await flushPromises();
    expect(error().value).toContain('VP9 thumbnail decode failed');
    expect(registry.artworks.value.get('clip')?.error).toContain('VP9 thumbnail decode failed');
  });
  it('keeps old ready pixels while a higher-detail replacement URL decodes and updates pending atomically', async () => {
    runtime.thumbnails.value = { .5: 'blob:old', 1.5: 'blob:old' }; runtime.widths.value = { .5: 20, 1.5: 20 };
    const { registry, decoded } = setup(); await flushPromises(); expect(decoded).toHaveLength(1);
    decoded[0]!.load(); await flushPromises();
    expect(registry.artworks.value.get('clip')?.frames?.[0]?.source).toBe(decoded[0]);
    runtime.thumbnails.value = { .5: 'blob:new', 1.5: 'blob:new' }; runtime.widths.value = { .5: 320, 1.5: 320 }; await flushPromises();
    expect(registry.artworks.value.get('clip')?.frames?.[0]?.source).toBe(decoded[0]);
    decoded[1]!.load(); await flushPromises();
    expect(registry.artworks.value.get('clip')?.frames?.[0]).toMatchObject({ source: decoded[1], pending: false });
    expect(registry.images.stats().active).toBe(1);
  });
  it('protects the presented thumbnail during refinement even when its decoded pixels exceed the cache budget', async () => {
    runtime.thumbnails.value = { .5: 'blob:old', 1.5: 'blob:old' }; runtime.widths.value = { .5: 20, 1.5: 20 };
    const { registry, decoded } = setup({}, { maxEntries: 1, maxBytes: 4 }); await flushPromises();
    decoded[0]!.load(); await flushPromises();
    runtime.thumbnails.value = { .5: 'blob:new', 1.5: 'blob:new' }; runtime.widths.value = { .5: 320, 1.5: 320 }; await flushPromises();
    expect(registry.artworks.value.get('clip')?.frames?.[0]?.source).toBe(decoded[0]);
    expect(decoded[0]!.src).toBe('blob:old');
    decoded[1]!.load(); await flushPromises();
    expect(registry.artworks.value.get('clip')?.frames?.[0]?.source).toBe(decoded[1]);
    expect(decoded[0]!.src).toBe('');
    expect(registry.images.stats().active).toBe(1);
  });
  it('releases abandoned pending thumbnail leases instead of treating undefined pixels as a presented source', async () => {
    runtime.thumbnails.value = { .5: 'blob:old', 1.5: 'blob:old' };
    const { registry, decoded } = setup(); await flushPromises();
    runtime.thumbnails.value = { .5: 'blob:current', 1.5: 'blob:current' }; await flushPromises();
    expect(registry.images.stats().active).toBe(1);
    decoded[0]!.load(); await flushPromises();
    expect(registry.artworks.value.get('clip')?.frames?.[0]?.source).toBeUndefined();
    decoded[1]!.load(); await flushPromises();
    expect(registry.artworks.value.get('clip')?.frames?.[0]?.source).toBe(decoded[1]);
  });
});

describe('canvas static artwork ownership', () => {
  it('decodes images once, publishes loading/readiness and drops old URLs after source replacement', async () => {
    const imageAsset = { ...asset, kind: 'image' as const, src: 'project-media://asset/image.png' };
    const { wrapper, registry, decoded } = setup({ asset: imageAsset }); await flushPromises();
    expect(registry.artworks.value.get('clip')).toMatchObject({ kind: 'image', loading: true });
    decoded[0]!.load(); await flushPromises(); expect(registry.artworks.value.get('clip')).toMatchObject({ source: decoded[0], loading: false });
    await wrapper.setProps({ asset: { ...imageAsset, src: 'project-media://asset/replacement.png' } }); await flushPromises();
    expect(registry.images.stats().active).toBe(1); expect(decoded).toHaveLength(2);
    decoded[1]!.load(); await flushPromises(); expect(registry.artworks.value.get('clip')?.source).toBe(decoded[1]);
  });
  it('publishes saved color fills without requesting media or inventing a raster', async () => {
    const color = { kind: 'color' as const, id: 'color', name: 'Color', trackId: 'colors', assetId: '', enabled: true, order: 1, timelineStartMs: 0, timelineDurationMs: 1000, sourceInMs: 0, sourceDurationMs: 1000, playbackRate: 1, transform: { x: 0, y: 0, width: 1, height: 1 }, fill: { kind: 'color' as const, color: '#123456' } };
    const { registry, decoded } = setup({ clip: color, asset: null }); await flushPromises();
    expect(registry.artworks.value.get('color')).toEqual({ kind: 'color', fill: color.fill }); expect(decoded).toHaveLength(0);
  });
  it('awaits fonts and shares shape signatures across timing/placement edits but invalidates real artwork changes', async () => {
    const { wrapper, decoded, registry } = setup({ clip: shape, asset: null, canvas: { width: 1920, height: 1080 } }); await flushPromises();
    expect(runtime.fonts).toHaveBeenCalledOnce(); expect(runtime.render).toHaveBeenCalledOnce();
    decoded[0]!.load(); await flushPromises(); expect(registry.artworks.value.get('shape')?.source).toBe(decoded[0]);
    await wrapper.setProps({ clip: { ...shape, timelineStartMs: 2000, transform: { ...shape.transform, x: .5 } }, timelineWidthPx: 2000 }); await flushPromises();
    expect(runtime.render).toHaveBeenCalledOnce();
    await wrapper.setProps({ clip: { ...shape, borderWidth: shape.borderWidth + 2 } }); await flushPromises(); expect(runtime.render).toHaveBeenCalledTimes(2);
  });
  it('removes the previous ID from the lane registry after clip replacement', async () => {
    const { wrapper, registry } = setup({ clip: shape, asset: null }); await flushPromises();
    await wrapper.setProps({ clip: { ...shape, id: 'replacement' } }); await flushPromises();
    expect(registry.artworks.value.has('shape')).toBe(false); expect(registry.artworks.value.has('replacement')).toBe(true);
  });
  it('reports decode and font errors without replacing failed pixels with fabricated content', async () => {
    const failed = setup({ asset: { ...asset, kind: 'image', src: 'broken' } }); await flushPromises(); failed.decoded[0]!.fail(); await flushPromises();
    expect(failed.error().value).toContain('failed'); expect(failed.registry.artworks.value.get('clip')?.source).toBeUndefined(); failed.wrapper.unmount();
    runtime.fonts.mockRejectedValueOnce(new Error('Font unavailable'));
    const fonts = setup({ clip: shape, asset: null }); await flushPromises();
    expect(fonts.error().value).toContain('Font unavailable'); expect(runtime.render).not.toHaveBeenCalled();
  });
  it('clears a failed source state only after the replacement image is decoded successfully', async () => {
    const { wrapper, registry, decoded, error } = setup({ asset: { ...asset, kind: 'image', src: 'broken' } }); await flushPromises();
    decoded[0]!.fail(); await flushPromises(); expect(error().value).toContain('failed');
    await wrapper.setProps({ asset: { ...asset, kind: 'image', src: 'repaired' } }); await flushPromises();
    decoded[1]!.load(); await flushPromises();
    expect(error().value).toBe(''); expect(registry.artworks.value.get('clip')).toMatchObject({ source: decoded[1], error: '', loading: false });
  });
  it('releases pending borrowed URLs on disposal and ignores their late completion', async () => {
    const { wrapper, decoded, registry } = setup({ asset: { ...asset, kind: 'image', src: 'pending' } }); await flushPromises();
    const oldLoad = decoded[0]!.onload; wrapper.unmount(); await flushPromises(); oldLoad?.(new Event('load')); await flushPromises();
    expect(registry.artworks.value.size).toBe(0); expect(registry.images.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
  });
  it('ignores a stale font/render completion after a newer shape signature is displayed', async () => {
    let complete!: () => void;
    runtime.fonts.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    runtime.render.mockImplementation((clip: ShapeClip) => `data:image/png;stroke-${clip.borderWidth}`);
    const { wrapper, decoded, registry } = setup({ clip: shape, asset: null }); await flushPromises();
    const next = { ...shape, borderWidth: shape.borderWidth + 5 };
    await wrapper.setProps({ clip: next }); await flushPromises();
    expect(decoded).toHaveLength(1); expect(decoded[0]!.src).toBe(`data:image/png;stroke-${next.borderWidth}`);
    decoded[0]!.load(); await flushPromises(); complete(); await flushPromises();
    expect(decoded).toHaveLength(1); expect(registry.artworks.value.get('shape')?.source).toBe(decoded[0]);
  });
  it('does not publish a font completion after the owning clip has been disposed', async () => {
    let complete!: () => void;
    runtime.fonts.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    const { wrapper, registry, decoded } = setup({ clip: shape, asset: null }); await flushPromises();
    wrapper.unmount(); complete(); await flushPromises();
    expect(registry.artworks.value.size).toBe(0); expect(decoded).toHaveLength(0); expect(runtime.render).not.toHaveBeenCalled();
  });
  it('removes generated artwork when a clip switches to an audio-only source', async () => {
    const { wrapper, registry } = setup({ clip: shape, asset: null }); await flushPromises();
    const audio = { id: 'shape', kind: 'audio' as const, role: 'imported' as const, name: 'Audio', assetId: 'audio', order: 0, enabled: true, timelineStartMs: 0, timelineDurationMs: 1000, sourceInMs: 0, sourceDurationMs: 1000, playbackRate: 1, volume: 100 };
    await wrapper.setProps({ clip: audio, asset: { ...asset, kind: 'audio', src: 'project-media://asset/audio.wav' } }); await flushPromises();
    expect(runtime.assets.at(-1)!.value).toBeNull(); expect(registry.artworks.value.has('shape')).toBe(false);
  });
  it('rejects an absent artwork owner explicitly', () => {
    const Child = defineComponent({ setup() { useTimelineCanvasArtwork({ clip, asset, selected: false, duration: 10, thumbnailSlots: [] }); return {}; }, template: '<span />' });
    const error = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => mount(Child)).toThrow('owner unavailable'); error.mockRestore();
  });
});

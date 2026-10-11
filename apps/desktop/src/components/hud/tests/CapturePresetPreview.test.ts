import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { EditorPreset } from '~/api/types/editor-preset';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
const runtime = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn(), decode: vi.fn() }));
vi.mock('@beam/runtime/rendering/render', () => ({
  renderCompositionFrame: runtime.render,
  disposeCompositionRenderer: runtime.dispose,
}));
vi.mock('@beam/runtime/playback/index', () => ({ decodeVideoPoster: runtime.decode }));
import CapturePresetPreview from '../CapturePresetPreview.vue';
import { presetSample } from '../preset-sample';
enableAutoUnmount(afterEach);
const preset = (): EditorPreset => ({
  id: 'custom',
  name: 'Custom',
  protected: false,
  updatedAt: '',
  settings: {
    editor: {
      schemaVersion: 1,
      presentation: {
        canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: true },
        cursor: createDefaultCursorPresentation(),
        selectedBackgroundId: null,
      },
    },
    devices: {},
    export: { format: 'mp4' },
    quickSnip: { automaticZoom: true },
  },
});
const context = { fillRect: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), fillText: vi.fn() };
const mountPreview = (p = preset(), kind: 'video' | 'screenshot' = 'video') =>
  mount(CapturePresetPreview, { props: { preset: p, kind } });
describe('CapturePresetPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.render.mockReset();
    runtime.decode.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('fails explicitly if the sample surface cannot be created', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
    expect(() => presetSample('#111111', '#ffffff', '#ff5500')).toThrow('Preset sample canvas unavailable');
  });
  it.each(['video', 'screenshot'] as const)('renders a labelled %s sample with the shared painter', async (kind) => {
    const wrapper = mountPreview(preset(), kind);
    await flushPromises();
    expect(wrapper.text()).toContain('Example preview');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(runtime.render).toHaveBeenCalledOnce();
    expect(context.fillText).toHaveBeenCalledWith('Beam', 76, 290);
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });
  it('resolves a saved built-in gradient by id', async () => {
    const p = preset();
    p.settings.editor.presentation!.selectedBackgroundId = 'gradient:ocean';
    mountPreview(p);
    await flushPromises();
    expect(runtime.render.mock.calls[0]![2].background).toMatchObject({ kind: 'gradient', gradient: { angle: 120 } });
  });
  it('shows an unavailable state for a missing selected background instead of inventing one', async () => {
    const p = preset();
    p.settings.editor.presentation!.selectedBackgroundId = 'missing';
    const wrapper = mountPreview(p);
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Preview unavailable');
    expect(runtime.render).not.toHaveBeenCalled();
  });
  it('keeps the source image dimensions and reports decoding failure', async () => {
    const decode = vi.fn().mockResolvedValue(undefined);
    class Image {
      src = '';
      naturalWidth = 2048;
      naturalHeight = 1024;
      decode = decode;
    }
    vi.stubGlobal('Image', Image);
    const p = preset();
    p.settings.editor.presentation!.background = {
      kind: 'image',
      id: 'image',
      name: 'Image',
      path: 'file:///image.webp',
      extension: 'webp',
    };
    const wrapper = mountPreview(p);
    await flushPromises();
    expect(runtime.render.mock.calls[0]![4]).toMatchObject({ width: 2048, height: 1024 });
    decode.mockRejectedValueOnce(new Error('Missing image'));
    await wrapper.setProps({ preset: { ...p, updatedAt: 'new' } });
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Preview unavailable');
  });
  it('closes video poster leases after painting and on stale completion', async () => {
    const p = preset();
    p.settings.editor.presentation!.background = {
      kind: 'video',
      id: 'video',
      name: 'Video',
      path: 'https://beam.test/background.webm',
      extension: 'webm',
    };
    const close = vi.fn();
    runtime.decode.mockResolvedValueOnce({ bitmap: { width: 480, height: 270 }, close });
    const wrapper = mountPreview(p);
    await flushPromises();
    expect(runtime.render.mock.calls[0]![4]).toMatchObject({ width: 480, height: 270 });
    expect(close).toHaveBeenCalledOnce();
    let resolve!: (frame: unknown) => void;
    runtime.decode.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await wrapper.setProps({ preset: { ...p, updatedAt: 'new' } });
    await nextTick();
    await nextTick();
    wrapper.unmount();
    resolve({ bitmap: { width: 320, height: 180 }, close });
    await flushPromises();
    expect(close).toHaveBeenCalledTimes(2);
    expect(runtime.render).toHaveBeenCalledOnce();
  });
  it('shows canvas and painter failures without keeping completed content visible', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
    const wrapper = mountPreview();
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Preview unavailable');
    runtime.render.mockImplementationOnce(() => {
      throw new Error('GPU unavailable');
    });
    await wrapper.setProps({ preset: preset() });
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Preview unavailable');
  });
  it('does not decode a hidden background and ignores decoding failures after disposal', async () => {
    const p = preset();
    p.settings.editor.presentation!.canvas.showBackground = false;
    p.settings.editor.presentation!.background = {
      kind: 'video',
      id: 'video',
      name: 'Video',
      path: 'https://beam.test/video.webm',
      extension: 'webm',
    };
    const wrapper = mountPreview(p);
    await flushPromises();
    expect(runtime.decode).not.toHaveBeenCalled();
    let reject!: (reason: Error) => void;
    runtime.decode.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    p.settings.editor.presentation!.canvas.showBackground = true;
    await wrapper.setProps({ preset: { ...p } });
    await nextTick();
    await nextTick();
    wrapper.unmount();
    reject(new Error('Late error'));
    await flushPromises();
    expect(runtime.render).toHaveBeenCalledOnce();
  });
});

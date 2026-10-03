import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import type { CaptionClip } from '@beam/engine/shared/composition-types';
import { applyCanvasCaptionFont } from '../../shared/caption-font-render';
import { captionTextCache } from './caption-text-cache';

const clip = (): CaptionClip => ({
  id: 'text',
  kind: 'caption',
  name: 'Text',
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  transform: { x: 0, y: 0, width: 0.5, height: 0.2 },
  caption: { type: 'text', sentences: [], style: createDefaultCaptionStyle(40) },
});
const context = () =>
  ({
    font: 'normal 800 40px sans-serif',
    letterSpacing: '0px',
    measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
  }) as unknown as CanvasRenderingContext2D;
const input = (value = clip(), text = 'hello world') => ({ clip: value, text, canvasWidth: 400, canvasHeight: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('caption text cache', () => {
  it('retains measurements, including empty strings, by the actual context font and spacing', () => {
    const ctx = context();
    const cache = captionTextCache(ctx);
    for (let tick = 0; tick < 60; tick++) {
      cache.measure('hello');
      cache.measure('');
    }
    expect(ctx.measureText).toHaveBeenCalledTimes(2);
    ctx.font = 'normal 400 20px serif';
    cache.measure('hello');
    ctx.letterSpacing = '2px';
    cache.measure('hello');
    ctx.fontKerning = 'none';
    cache.measure('hello');
    expect(ctx.measureText).toHaveBeenCalledTimes(5);
    cache.measure('hello');
    expect(ctx.measureText).toHaveBeenCalledTimes(5);
  });

  it('retains wrapping and geometry across ticks without borrowing mutable transforms', () => {
    const ctx = context(),
      value = clip(),
      options = input(value);
    value.caption.style.wrap = true;
    const cache = captionTextCache(ctx);
    const first = cache.layout(options);
    const count = vi.mocked(ctx.measureText).mock.calls.length;
    for (let tick = 0; tick < 60; tick++) expect(cache.layout(options)).toBe(first);
    expect(ctx.measureText).toHaveBeenCalledTimes(count);
    expect(first.lines).toEqual(['hello', 'world']);
    const oldX = first.transform.x;
    value.transform!.x = 0.3;
    expect(cache.layout(options).transform.x).toBe(0.3);
    expect(first.transform.x).toBe(oldX);
    value.transform!.x = 0;
    expect(cache.layout(options)).toBe(first);
  });

  it('invalidates layout for text, size, width, line height, wrapping, placement and cursor drafts', () => {
    const ctx = context(),
      options = input();
    const cache = captionTextCache(ctx);
    let prior = cache.layout(options);
    for (const change of [
      () => {
        options.text = 'new sentence';
      },
      () => {
        options.canvasWidth += 100;
      },
      () => {
        options.canvasHeight += 100;
      },
      () => {
        options.clip.caption.style.fontSize += 2;
      },
      () => {
        options.clip.caption.style.lineHeight = 2;
      },
      () => {
        options.clip.caption.style.wrap = !options.clip.caption.style.wrap;
      },
      () => {
        options.clip.transform!.width = 0.9;
      },
      () => {
        delete options.clip.transform;
        options.clip.caption.style.placement = 'top';
      },
    ]) {
      change();
      const next = cache.layout(options);
      expect(next).not.toBe(prior);
      prior = next;
    }
    const following = cache.layout({ ...options, transform: { x: 0.4, y: 0.3, width: 0.6, height: 0.2 } });
    expect(following).not.toBe(prior);
    expect(following.transform.x).toBe(0.4);
    options.clip.caption.style.fontFamily = 'serif';
    applyCanvasCaptionFont(ctx, options.clip.caption.style);
    expect(cache.layout(options)).not.toBe(prior);
  });

  it('isolates contexts and bounds measurement and layout retention, excluding oversized text', () => {
    const ctx = context(),
      other = context(),
      cache = captionTextCache(ctx);
    cache.measure('first');
    captionTextCache(other).measure('first');
    expect(other.measureText).toHaveBeenCalledOnce();
    for (let i = 0; i < 512; i++) cache.measure(`word-${i}`);
    cache.measure('first');
    expect(ctx.measureText).toHaveBeenCalledTimes(514);
    const options = input();
    options.clip.caption.style.wrap = false;
    const first = cache.layout(options);
    for (let i = 0; i < 128; i++) cache.layout({ ...options, text: `sentence-${i}` });
    expect(cache.layout(options)).not.toBe(first);
    const long = 'x'.repeat(5000);
    expect(cache.layout({ ...options, text: long })).not.toBe(cache.layout({ ...options, text: long }));
    cache.measure(long);
    cache.measure(long);
    expect(ctx.measureText).toHaveBeenCalledTimes(516);
  });

  it('invalidates loaded-font changes, even replacements with the same number of faces', () => {
    const a = { status: 'loaded' } as FontFace,
      b = { status: 'loaded' } as FontFace;
    const fonts = Object.assign(new Set<FontFace>(), { status: 'loaded' });
    vi.stubGlobal('document', { fonts });
    const ctx = context();
    captionTextCache(ctx).measure('hello');
    fonts.add(a);
    captionTextCache(ctx).measure('hello');
    fonts.delete(a);
    fonts.add(b);
    captionTextCache(ctx).measure('hello');
    captionTextCache(ctx).measure('hello');
    fonts.clear();
    captionTextCache(ctx).measure('hello');
    expect(ctx.measureText).toHaveBeenCalledTimes(4);
  });

  it('bypasses caches while fonts load and uses Worker fonts without document', () => {
    const face = { status: 'unloaded' };
    const fonts = Object.assign(new Set([face]), { status: 'loaded' });
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('fonts', fonts);
    const ctx = context(),
      options = input();
    options.clip.caption.style.wrap = false;
    const first = captionTextCache(ctx).layout(options);
    fonts.status = 'loading';
    face.status = 'loading';
    const loading = captionTextCache(ctx);
    expect(loading.layout(options)).not.toBe(loading.layout(options));
    loading.measure('hello');
    loading.measure('hello');
    expect(ctx.measureText).toHaveBeenCalledTimes(2);
    fonts.status = 'loaded';
    face.status = 'loaded';
    const loaded = captionTextCache(ctx);
    expect(loaded.layout(options)).not.toBe(first);
    loaded.measure('hello');
    loaded.measure('hello');
    expect(ctx.measureText).toHaveBeenCalledTimes(3);
    face.status = 'error';
    captionTextCache(ctx).measure('hello');
    expect(ctx.measureText).toHaveBeenCalledTimes(4);
  });
});

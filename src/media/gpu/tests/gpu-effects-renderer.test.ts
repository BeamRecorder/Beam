import { beforeEach, describe, expect, it, vi } from 'vitest';
import { engineMetrics } from '../../performance/engine-metrics';
import { GpuEffectsRenderer } from '../gpu-effects-renderer';
import { gpuEffectInput as input, gpuFilterFixture, observeCanvasSizeWrites } from './gpu-filter.test-support';
beforeEach(() => engineMetrics.reset());

describe('GPU effect rendering', () => {
  it('reuses same-sized source textures via sub-image uploads without storing backdrop frames', () => {
    const { gl, canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    expect(renderer.render(input())).toBe(canvas);
    renderer.render(input());
    expect(gl.createTexture).toHaveBeenCalledTimes(6);
    expect(gl.texStorage2D).toHaveBeenCalledTimes(6);
    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(4);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, true);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    expect(renderer.stats()).toMatchObject({
      sourceBytes: (100 * 50 + 112 * 62) * 4,
      gaussianBytes: 0,
      featherBytes: 0,
    });
    expect(draws[0]?.uniforms.get('u_maskRect')).toEqual([6 / 112, 6 / 62, 100 / 112, 50 / 62]);
    expect(engineMetrics.snapshot().counters.uploads).toBe(4);
    expect(engineMetrics.snapshot().counters['gpu-frames']).toBe(2);
    renderer.dispose();
  });

  it('filters backdrop and padded feather mask independently and preserves their crop coordinates', () => {
    const { canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input({ sigma: 2, feather: 1 }));
    expect(draws).toHaveLength(7);
    expect(renderer.stats().gaussianBytes).toBeGreaterThan(0);
    expect(renderer.stats().featherBytes).toBeGreaterThan(0);
    expect(draws.at(-1)?.target).toBeNull();
    expect(draws.at(-1)?.uniforms.get('u_uvRect')).toEqual([8 / 128, 8 / 128, 100 / 128, 50 / 128]);
    const mask = draws.at(-1)?.uniforms.get('u_maskRect') as number[];
    expect(mask[0]).toBeCloseTo(11 / 122, 14);
    expect(mask[1]).toBeCloseTo(11 / 72, 14);
    expect(mask[2]).toBeCloseTo(100 / 122, 14);
    expect(mask[3]).toBeCloseTo(50 / 72, 14);
    renderer.dispose();
  });

  it('uploads immutable geometry once and reuses its feather without caching backdrop pixels', () => {
    const { gl, canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    const paint = input({ maskImmutable: true, feather: 1 });
    renderer.render(paint);
    expect(draws).toHaveLength(4);
    const before = vi.mocked(gl.texImage2D).mock.calls.length;
    renderer.render(paint);
    expect(draws).toHaveLength(5);
    expect(gl.texImage2D).toHaveBeenCalledTimes(before);
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(2);
    expect(engineMetrics.snapshot().counters.uploads).toBe(3);
    expect(renderer.stats()).toMatchObject({ sourceBytes: 100 * 50 * 4, maskBytes: 112 * 62 * 4 });
    expect(draws[0]?.uniforms.get('u_uvRect')).toEqual([0, 1, 1, -1]);
    expect(draws.at(-1)?.uniforms.get('u_maskRect')).toEqual(draws[3]?.uniforms.get('u_maskRect'));
    renderer.dispose();
  });

  it('does not reuse feather pixels across distinct immutable masks', () => {
    const { canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    const paint = input({ maskImmutable: true, feather: 1 });
    renderer.render(paint);
    renderer.render({ ...paint, mask: {} as TexImageSource });
    expect(draws).toHaveLength(8);
    expect(engineMetrics.snapshot().counters.uploads).toBe(4);
    expect(renderer.stats()).toMatchObject({ maskBytes: 112 * 62 * 4 * 2 });
    renderer.dispose();
  });

  it('flips an unfiltered immutable mask without allocating a feather convolution', () => {
    const { canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input({ maskImmutable: true }));
    expect(draws).toHaveLength(1);
    expect(draws[0]?.uniforms.get('u_maskRect')).toEqual([6 / 112, 1 - 6 / 62, 100 / 112, -50 / 62]);
    expect(renderer.stats().featherBytes).toBe(0);
    renderer.dispose();
  });

  it('releases cached immutable masks and feather outputs after context restoration', () => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    const paint = input({ maskImmutable: true, feather: 1 });
    renderer.render(paint);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.stats()).toMatchObject({ sourceBytes: 0, maskBytes: 0, gaussianBytes: 0, featherBytes: 0 });
    const before = vi.mocked(gl.texImage2D).mock.calls.length;
    renderer.render(paint);
    expect(vi.mocked(gl.texImage2D).mock.calls.length).toBeGreaterThan(before);
    expect(engineMetrics.snapshot().counters.uploads).toBe(4);
    renderer.dispose();
  });

  it('invalidates feather hits when the bounded immutable-mask texture pool evicts a source', () => {
    const { gl, canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    const paints = Array.from({ length: 129 }, () => input({ maskImmutable: true, feather: 1 }));
    for (const paint of paints) renderer.render(paint);
    expect(renderer.stats()).toMatchObject({ maskBytes: 128 * 112 * 62 * 4 });
    const count = draws.length;
    const allocations = vi.mocked(gl.createTexture).mock.calls.length;
    renderer.render(paints[0]!);
    expect(draws).toHaveLength(count + 4);
    expect(gl.createTexture).toHaveBeenCalledTimes(allocations + 4);
    expect(renderer.stats().maskBytes).toBe(128 * 112 * 62 * 4);
    renderer.dispose();
  });

  it.each(['opaque', 'highlight'] as const)(
    'paints %s without uploading or Gaussian-filtering backdrop pixels',
    (mode) => {
      const { gl, canvas, draws } = gpuFilterFixture();
      const renderer = new GpuEffectsRenderer(canvas);
      renderer.render(input({ mode, sigma: 48, maskImmutable: true }));
      expect(gl.texSubImage2D).not.toHaveBeenCalled();
      expect(draws).toHaveLength(1);
      expect(engineMetrics.snapshot().counters.uploads).toBe(1);
      expect(renderer.stats()).toMatchObject({
        sourceBytes: 0,
        gaussianBytes: 0,
        featherBytes: 0,
        maskBytes: 112 * 62 * 4,
      });
      renderer.dispose();
    },
  );

  it('restores an opaque-only renderer whose mutable mask was its only uploaded source', () => {
    const { canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input({ mode: 'opaque' }));
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.stats()).toEqual({ sourceBytes: 0, gaussianBytes: 0, featherBytes: 0, maskBytes: 0 });
    expect(() => renderer.render(input({ mode: 'opaque' }))).not.toThrow();
    renderer.dispose();
  });

  it('releases an opaque-only mutable mask after its upload throws', () => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    vi.mocked(gl.texSubImage2D).mockImplementationOnce(() => {
      throw new Error('mask upload failed');
    });
    expect(() => renderer.render(input({ mode: 'opaque' }))).toThrow('mask upload failed');
    expect(gl.endQuery).toHaveBeenCalledOnce();
    expect(() => renderer.dispose()).not.toThrow();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['outside', 0.5, 0],
    ['inside', 0, 0.1],
  ] as const)(
    'paints the independent highlight %s stage with no fabricated backdrop',
    (highlightStage, outerAlpha, innerAlpha) => {
      const { gl, canvas, draws } = gpuFilterFixture();
      const renderer = new GpuEffectsRenderer(canvas);
      renderer.render(input({ mode: 'highlight', highlightStage, maskImmutable: true }));
      expect(draws.at(-1)?.uniforms.get('u_mode')).toBe(highlightStage === 'outside' ? 7 : 6);
      expect(draws.at(-1)?.uniforms.get('u_tint')).toEqual([0.8, 0.2, 0.1, outerAlpha]);
      expect(draws.at(-1)?.uniforms.get('u_inner')).toEqual([1, 1, 1, innerAlpha]);
      expect(gl.texSubImage2D).not.toHaveBeenCalled();
      renderer.dispose();
    },
  );

  it.each([
    ['blur', 2, 1],
    ['frosted', 3, 0.2],
    ['pixelated', 4, 1],
    ['opaque', 5, 1],
    ['highlight', 6, 0.5],
  ] as const)('renders %s with its real mask and tint uniforms', (mode, shaderMode, tintAlpha) => {
    const { canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input({ mode }));
    const last = draws.at(-1)!;
    expect(last.uniforms.get('u_mode')).toBe(shaderMode);
    expect(last.uniforms.get('u_tint')).toEqual([0.8, 0.2, 0.1, tintAlpha]);
    expect(last.uniforms.get('u_inner')).toEqual([1, 1, 1, 0.1]);
    expect(last.uniforms.get('u_target')).toEqual([10, 5, 80, 40]);
    expect(last.uniforms.get('u_grid')).toEqual([4, 2]);
    renderer.dispose();
  });

  it('retains exact-size source storage while resizing masks and presenting the used canvas region', () => {
    const { gl, canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input());
    renderer.render(input({ width: 20, height: 10 }));
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
    expect(draws.at(-1)?.viewport).toEqual([0, 118, 20, 10]);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    expect(gl.createTexture).toHaveBeenCalledTimes(8);
    expect(renderer.stats().sourceBytes).toBe((100 * 50 + 20 * 10 + 32 * 22) * 4);
    renderer.render(input());
    expect(gl.createTexture).toHaveBeenCalledTimes(9);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(5);
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(6);
    expect(renderer.stats().sourceBytes).toBe((100 * 50 + 20 * 10 + 112 * 62) * 4);
    renderer.dispose();
  });

  it.each([
    { width: 0 },
    { height: -1 },
    { width: 1.5 },
    { width: NaN },
    { width: 4097 },
    { width: 4096, height: 4097 },
    { sigma: -1 },
    { sigma: 49 },
    { sigma: Infinity },
    { feather: NaN },
    { feather: 49 },
  ])('rejects invalid geometry or sigma %j before upload', (patch) => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    expect(() => renderer.render(input(patch))).toThrow(RangeError);
    expect(gl.texSubImage2D).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects invalid mask padding %s before allocation',
    (maskPadding) => {
      const { gl, canvas } = gpuFilterFixture();
      const renderer = new GpuEffectsRenderer(canvas);
      expect(() => renderer.render(input({ maskPadding }))).toThrow(RangeError);
      expect(gl.createTexture).toHaveBeenCalledTimes(4);
      renderer.dispose();
    },
  );

  it.each([
    { strength: -1 },
    { strength: 101 },
    { strength: NaN },
    { tintOpacity: -1 },
    { tintOpacity: Infinity },
    { color: [NaN, 0, 0, 1] as const },
    { color: [0, 0, 0, 2] as const },
    { highlight: [1, -1, 1, 1] as const },
    { target: { x: NaN, y: 0, width: 10, height: 10 } },
    { target: { x: 0, y: 0, width: 0, height: 10 } },
    { target: { x: 0, y: 0, width: 10, height: -1 } },
  ])('rejects invalid paint %j before any upload', (patch) => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    expect(() => renderer.render(input(patch))).toThrow('paint');
    expect(gl.texSubImage2D).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('keeps sequential effects on one live GPU backdrop and presents only once', () => {
    const { gl, canvas, draws } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.begin({} as TexImageSource, 200, 100);
    const paint = input({ width: 40, height: 20, target: { x: 5, y: 2, width: 30, height: 15 } });
    renderer.apply(paint, { x: 10, y: 5, width: 40, height: 20 });
    const firstTarget = draws.at(-1)?.target;
    expect(firstTarget).not.toBeNull();
    expect(draws.at(-1)?.viewport).toEqual([10, 75, 40, 20]);
    renderer.apply({ ...paint, sigma: 2, mode: 'frosted' }, { x: 50, y: 30, width: 40, height: 20 });
    expect(draws.at(-1)?.target).toBe(firstTarget);
    expect(draws[2]?.source).toBe(firstTarget);
    expect(draws.every((draw) => draw.source !== draw.target)).toBe(true);
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(3);
    expect(renderer.present()).toBe(canvas);
    expect(draws.at(-1)?.target).toBeNull();
    expect(draws.at(-1)?.source).toBe(firstTarget);
    expect(draws.at(-1)?.viewport).toEqual([0, 28, 200, 100]);
    expect(engineMetrics.snapshot().counters['gpu-frames']).toBe(1);
    expect(gl.enable).toHaveBeenCalledWith(gl.BLEND);
    renderer.dispose();
  });

  it('enforces explicit group boundaries and cancels without publishing a partial group', () => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    const region = { x: 0, y: 0, width: 100, height: 50 };
    expect(() => renderer.apply(input(), region)).toThrow('group unavailable');
    expect(() => renderer.present()).toThrow('group unavailable');
    renderer.begin({} as TexImageSource, 100, 50);
    expect(() => renderer.begin({} as TexImageSource, 100, 50)).toThrow('already active');
    expect(() => renderer.render(input())).toThrow('active GPU effects group');
    renderer.cancel();
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(() => renderer.present()).toThrow('group unavailable');
    renderer.begin({} as TexImageSource, 100, 50);
    renderer.present();
    renderer.dispose();
  });

  it.each([{ x: -1 }, { y: -1 }, { x: 0.5 }, { y: NaN }, { width: 99 }, { height: 51 }, { x: 101 }, { y: 51 }])(
    'rejects invalid group region %j without painting',
    (patch) => {
      const { canvas, draws } = gpuFilterFixture();
      const renderer = new GpuEffectsRenderer(canvas);
      renderer.begin({} as TexImageSource, 200, 100);
      expect(() => renderer.apply(input(), { x: 0, y: 0, width: 100, height: 50, ...patch })).toThrow('group region');
      expect(draws).toHaveLength(0);
      renderer.cancel();
      renderer.dispose();
    },
  );

  it('retains the old source when allocation of its replacement fails', () => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input());
    const previous = renderer.stats().sourceBytes;
    vi.mocked(gl.createTexture).mockReturnValueOnce(null!);
    expect(() => renderer.render(input({ width: 20, height: 10 }))).toThrow('texture allocation');
    expect(renderer.stats().sourceBytes).toBe(previous);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
    renderer.dispose();
  });

  it('rejects an unsupported group framebuffer during initialization and releases all ownership', () => {
    const { gl, canvas } = gpuFilterFixture();
    vi.mocked(gl.checkFramebufferStatus)
      .mockReturnValueOnce(gl.FRAMEBUFFER_COMPLETE)
      .mockReturnValueOnce(gl.FRAMEBUFFER_COMPLETE)
      .mockReturnValueOnce(0);
    expect(() => new GpuEffectsRenderer(canvas)).toThrow('incomplete');
    expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(3);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(4);
    expect(gl.endQuery).not.toHaveBeenCalled();
  });

  it('restores all context-owned programs and uploads after loss without reusing invalid textures', () => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input({ sigma: 1, feather: 1 }));
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(() => renderer.render(input())).toThrow('unavailable');
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(gl.createProgram).toHaveBeenCalledTimes(6);
    expect(renderer.stats()).toMatchObject({ sourceBytes: 0, gaussianBytes: 0, featherBytes: 0 });
    renderer.render(input());
    vi.mocked(gl.isContextLost).mockReturnValueOnce(true);
    expect(() => renderer.render(input())).toThrow('unavailable');
    renderer.dispose();
  });

  it('releases partial initialization and exposes missing WebGL explicitly', () => {
    const missing = gpuFilterFixture();
    vi.mocked(missing.canvas.getContext).mockReturnValueOnce(null);
    expect(() => new GpuEffectsRenderer(missing.canvas)).toThrow('WebGL2');
    const { gl, canvas } = gpuFilterFixture();
    vi.mocked(gl.createProgram)
      .mockReturnValueOnce({} as WebGLProgram)
      .mockReturnValueOnce(null!);
    expect(() => new GpuEffectsRenderer(canvas)).toThrow('allocation failed');
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(2);
  });

  it('releases every initialized pass and dummy after a late framebuffer allocation failure', () => {
    const { gl, canvas } = gpuFilterFixture();
    vi.mocked(gl.createFramebuffer)
      .mockReturnValueOnce({} as WebGLFramebuffer)
      .mockReturnValueOnce({} as WebGLFramebuffer)
      .mockReturnValueOnce(null!);
    expect(() => new GpuEffectsRenderer(canvas)).toThrow('framebuffer allocation');
    expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
  });

  it('does not query framebuffer status across ten changing render and group filter regions', () => {
    const { gl, canvas } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    expect(gl.checkFramebufferStatus).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 10; index++)
      renderer.render(input({ width: 31 + index, height: 20 + index, sigma: 2, feather: 1 }));
    renderer.begin({} as TexImageSource, 200, 100);
    for (let index = 0; index < 10; index++) {
      const width = 31 + index,
        height = 20 + index;
      renderer.apply(input({ width, height, sigma: 2, feather: 1 }), { x: 10, y: 5, width, height });
    }
    renderer.present();
    expect(gl.checkFramebufferStatus).toHaveBeenCalledTimes(3);
    renderer.dispose();
  });

  it('ends GPU queries on upload errors and releases all resources exactly once on disposal', () => {
    const { gl, canvas, loseContext } = gpuFilterFixture();
    const renderer = new GpuEffectsRenderer(canvas);
    vi.mocked(gl.texSubImage2D).mockImplementationOnce(() => {
      throw new Error('upload failed');
    });
    expect(() => renderer.render(input())).toThrow('upload failed');
    expect(gl.endQuery).toHaveBeenCalledOnce();
    renderer.dispose();
    renderer.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(3);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(loseContext).toHaveBeenCalledOnce();
    expect(() => renderer.render(input())).toThrow('unavailable');
  });

  it.each(['render', 'present'] as const)(
    'retains128px capacity through100..127 growth and expands at129 in %s',
    (method) => {
      const { gl, canvas, draws } = gpuFilterFixture(),
        writes = observeCanvasSizeWrites(canvas),
        renderer = new GpuEffectsRenderer(canvas);
      const paint = (width: number) => {
        if (method === 'render') renderer.render(input({ width, height: 100, maskPadding: 0 }));
        else {
          renderer.begin({} as TexImageSource, width, 100);
          renderer.present();
        }
      };
      for (let width = 100; width <= 127; width++) paint(width);
      expect(writes).toEqual([
        { axis: 'width', value: 128 },
        { axis: 'height', value: 128 },
      ]);
      expect(draws.at(-1)?.viewport).toEqual([0, 28, 127, 100]);
      paint(129);
      expect(writes.at(-1)).toEqual({ axis: 'width', value: 256 });
      expect(writes).toHaveLength(3);
      expect(draws.at(-1)?.viewport).toEqual([0, 28, 129, 100]);
      expect(gl.texStorage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 1, gl.RGBA8, 129, 100);
      renderer.dispose();
    },
  );

  it('compacts crossed8192×1 and1×8192 requests without retaining an oversized square', () => {
    const { gl, canvas, draws } = gpuFilterFixture();
    vi.mocked(gl.getParameter).mockImplementation((key) => (key === gl.MAX_TEXTURE_SIZE ? 8192 : false));
    const renderer = new GpuEffectsRenderer(canvas);
    renderer.render(input({ width: 8192, height: 1, maskPadding: 0, mode: 'opaque' }));
    expect([canvas.width, canvas.height]).toEqual([8192, 128]);
    renderer.render(input({ width: 1, height: 8192, maskPadding: 0, mode: 'opaque' }));
    expect([canvas.width, canvas.height]).toEqual([128, 8192]);
    expect(canvas.width * canvas.height * 4).toBeLessThanOrEqual(64 * 2 ** 20);
    expect(draws.at(-1)?.viewport).toEqual([0, 0, 1, 8192]);
    renderer.dispose();
  });

  it.each([
    [4097, 4097, 1, 4097, 128],
    [8192, 4097, 4095, 4097, 4095],
    [8192, 4096, 4096, 4096, 4096],
  ])(
    'respects device and byte bounds with MAX%s for requested%s×%s',
    (limit, width, height, capacityWidth, capacityHeight) => {
      const { gl, canvas, draws } = gpuFilterFixture();
      vi.mocked(gl.getParameter).mockImplementation((key) => (key === gl.MAX_TEXTURE_SIZE ? limit : false));
      const renderer = new GpuEffectsRenderer(canvas);
      renderer.render(input({ width: width!, height: height!, maskPadding: 0, mode: 'opaque' }));
      expect([canvas.width, canvas.height]).toEqual([capacityWidth, capacityHeight]);
      expect(canvas.width * canvas.height * 4).toBeLessThanOrEqual(64 * 2 ** 20);
      expect(draws.at(-1)?.viewport).toEqual([0, canvas.height - height!, width, height]);
      renderer.dispose();
    },
  );
});

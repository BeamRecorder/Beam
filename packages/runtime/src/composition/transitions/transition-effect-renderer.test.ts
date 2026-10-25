import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransitionEffectState } from '@beam/engine/shared/transition-types';
import type { TransitionEffectRect } from './transition-effect-types';
import { TRANSITION_EFFECT_KINDS } from '@beam/engine/shared/transition-preset-schema';
import { gpuFixture } from '../../gpu/tests/gpu-fixtures';
import { observeCanvasSizeWrites } from '../../gpu/tests/gpu-filter.test-support';
import { TransitionEffectRenderer } from './transition-effect-renderer';
import { drawTransitionEffect, disposeTransitionEffects } from './transition-effects';

const effect = (): TransitionEffectState => ({ preset: { kind: 'circle-reveal' }, progress: 0.4, edge: 'entry' });
const region: TransitionEffectRect = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
const source = { width: 80, height: 40 } as CanvasImageSource;

function fixture() {
  const result = gpuFixture();
  const limits = { texture: 8192, width: 8192, height: 8192 };
  Object.assign(result.gl, {
    MAX_VIEWPORT_DIMS: 2001,
    TRIANGLES: 2002,
    createVertexArray: vi.fn(() => ({}) as WebGLVertexArrayObject),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),
    texSubImage2D: vi.fn(),
    uniform3f: vi.fn(),
  });
  vi.mocked(result.gl.getParameter).mockImplementation((key) =>
    key === result.gl.MAX_TEXTURE_SIZE
      ? limits.texture
      : key === result.gl.MAX_VIEWPORT_DIMS
        ? new Int32Array([limits.width, limits.height])
        : false,
  );
  vi.mocked(result.gl.getUniformLocation).mockImplementation(
    (_program, name) => ({ name }) as unknown as WebGLUniformLocation,
  );
  const Canvas = vi.fn(function () {
    return result.canvas;
  });
  vi.stubGlobal('OffscreenCanvas', Canvas);
  return { ...result, limits, Canvas };
}

afterEach(() => {
  disposeTransitionEffects();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('transition GPU resource ownership', () => {
  it('links one fullscreen triangle, releases shader objects and requires premultiplied alpha', () => {
    const h = fixture();
    const renderer = new TransitionEffectRenderer();
    expect(renderer.canvas).toBe(h.canvas);
    expect(h.canvas.getContext).toHaveBeenCalledWith(
      'webgl2',
      expect.objectContaining({ alpha: true, premultipliedAlpha: true }),
    );
    expect(h.gl.createProgram).toHaveBeenCalledOnce();
    expect(h.gl.createTexture).toHaveBeenCalledOnce();
    expect(h.gl.createVertexArray).toHaveBeenCalledOnce();
    expect(h.gl.createShader).toHaveBeenCalledTimes(2);
    expect(h.gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(h.gl.getUniformLocation).toHaveBeenCalledTimes(7);
    renderer.dispose();
  });
  it('fails explicitly when WebGL2 is unavailable without allocating resources', () => {
    const h = fixture();
    vi.mocked(h.canvas.getContext).mockReturnValueOnce(null);
    expect(() => new TransitionEffectRenderer()).toThrow('WebGL2');
    expect(h.gl.createProgram).not.toHaveBeenCalled();
  });
  it.each(['createProgram', 'createTexture', 'createVertexArray'] as const)(
    'cleans partial resources when %s fails',
    (method) => {
      const h = fixture();
      vi.mocked(h.gl[method]).mockReturnValueOnce(null!);
      expect(() => new TransitionEffectRenderer()).toThrow('allocate transition GPU resources');
      expect(h.gl.deleteProgram).toHaveBeenCalledOnce();
      expect(h.gl.deleteTexture).toHaveBeenCalledOnce();
      expect(h.gl.deleteVertexArray).toHaveBeenCalledOnce();
      expect(h.gl.createShader).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1])('releases earlier shaders if allocation of shader %s fails', (index) => {
    const h = fixture();
    if (index) vi.mocked(h.gl.createShader).mockReturnValueOnce({} as WebGLShader);
    vi.mocked(h.gl.createShader).mockReturnValueOnce(null!);
    expect(() => new TransitionEffectRenderer()).toThrow('allocate transition shader');
    expect(h.gl.deleteShader).toHaveBeenCalledTimes(index);
    expect(h.gl.deleteProgram).toHaveBeenCalledOnce();
  });
  it.each([0, 1])('includes the driver diagnostic and frees resources when shader %s compilation fails', (index) => {
    const h = fixture();
    if (index) vi.mocked(h.gl.getShaderParameter).mockReturnValueOnce(true);
    vi.mocked(h.gl.getShaderParameter).mockReturnValueOnce(false);
    expect(() => new TransitionEffectRenderer()).toThrow('compile failed');
    expect(h.gl.deleteShader).toHaveBeenCalledTimes(index + 1);
    expect(h.gl.deleteTexture).toHaveBeenCalledOnce();
  });
  it('includes the link diagnostic and frees both compiled shaders on link failure', () => {
    const h = fixture();
    vi.mocked(h.gl.getProgramParameter).mockReturnValueOnce(false);
    expect(() => new TransitionEffectRenderer()).toThrow('link failed');
    expect(h.gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(h.gl.deleteVertexArray).toHaveBeenCalledOnce();
  });
  it('cleans allocated resources when a driver API throws during initialization', () => {
    const h = fixture();
    vi.mocked(h.gl.shaderSource).mockImplementationOnce(() => {
      throw new Error('driver unavailable');
    });
    expect(() => new TransitionEffectRenderer()).toThrow('driver unavailable');
    expect(h.gl.deleteShader).toHaveBeenCalledOnce();
    expect(h.gl.deleteProgram).toHaveBeenCalledOnce();
    expect(h.gl.deleteTexture).toHaveBeenCalledOnce();
  });
});

describe('transition GPU painting', () => {
  it('uploads one source, sets color and region uniforms, and draws without framebuffer blending', () => {
    const h = fixture(),
      renderer = new TransitionEffectRenderer();
    const selected: TransitionEffectState = {
      preset: { kind: 'dip-color', color: '#24a8e0' },
      progress: 0.6,
      edge: 'exit',
    };
    expect(renderer.render(source, 80, 40, selected, region)).toBe(h.canvas);
    expect(h.gl.pixelStorei).toHaveBeenCalledWith(h.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    expect(h.gl.texSubImage2D).toHaveBeenCalledWith(h.gl.TEXTURE_2D, 0, 0, 0, h.gl.RGBA, h.gl.UNSIGNED_BYTE, source);
    expect(h.gl.uniform1i).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'u_kind' }),
      TRANSITION_EFFECT_KINDS.indexOf('dip-color'),
    );
    expect(h.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({ name: 'u_progress' }), 0.6);
    expect(h.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({ name: 'u_edge' }), -1);
    expect(h.gl.uniform3f).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'u_color' }),
      36 / 255,
      168 / 255,
      224 / 255,
    );
    expect(h.gl.uniform4f).toHaveBeenCalledWith(expect.objectContaining({ name: 'u_region' }), 0.1, 0.2, 0.7, 0.6);
    expect(h.gl.disable).toHaveBeenCalledWith(h.gl.BLEND);
    expect(h.gl.drawArrays).toHaveBeenCalledWith(h.gl.TRIANGLES, 0, 3);
    renderer.dispose();
  });
  it('uses neutral default color, entry direction and actual source raster dimensions', () => {
    const h = fixture(),
      renderer = new TransitionEffectRenderer();
    renderer.render(source, 80, 40, effect(), region);
    expect(h.gl.uniform3f).toHaveBeenCalledWith(expect.objectContaining({ name: 'u_color' }), 0, 0, 0);
    expect(h.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({ name: 'u_edge' }), 1);
    expect(h.gl.viewport).toHaveBeenCalledWith(0, 0, 80, 40);
    expect(h.gl.uniform2f).toHaveBeenCalledWith(expect.objectContaining({ name: 'u_size' }), 80, 40);
    renderer.dispose();
  });
  it('reuses equal-sized textures and canvas buffers while still uploading each new frame', () => {
    const h = fixture(),
      renderer = new TransitionEffectRenderer();
    const writes = observeCanvasSizeWrites(h.canvas);
    renderer.render(source, 80, 40, effect(), region);
    renderer.render(source, 80, 40, effect(), region);
    expect(h.gl.texImage2D).toHaveBeenCalledOnce();
    expect(h.gl.texSubImage2D).toHaveBeenCalledTimes(2);
    expect(writes).toEqual([
      { axis: 'width', value: 80 },
      { axis: 'height', value: 40 },
    ]);
    renderer.render(source, 81, 40, effect(), region);
    renderer.render(source, 81, 41, effect(), region);
    expect(h.gl.texImage2D).toHaveBeenCalledTimes(3);
    renderer.dispose();
  });
  it.each([
    [0, 40],
    [80, 0],
    [-1, 40],
    [1.5, 40],
    [Infinity, 40],
    [80, NaN],
    [4097, 4096],
  ])('rejects invalid or over-budget raster size %s × %s before uploading', (width, height) => {
    const h = fixture(),
      renderer = new TransitionEffectRenderer();
    expect(() => renderer.render(source, width, height, effect(), region)).toThrow('GPU limits');
    expect(h.gl.texSubImage2D).not.toHaveBeenCalled();
    renderer.dispose();
  });
  it.each(['texture', 'width', 'height'] as const)('respects the device %s limit', (limit) => {
    const h = fixture(),
      renderer = new TransitionEffectRenderer();
    h.limits[limit] = 32;
    expect(() => renderer.render(source, 80, 40, effect(), region)).toThrow('GPU limits');
    renderer.dispose();
  });
  it.each([
    { ...effect(), progress: NaN },
    { ...effect(), preset: { kind: 'unknown' } },
  ])('rejects malformed effect state without submitting a draw', (value) => {
    const h = fixture(),
      renderer = new TransitionEffectRenderer();
    expect(() => renderer.render(source, 80, 40, value as TransitionEffectState, region)).toThrow(
      'Invalid transition effect',
    );
    expect(h.gl.drawArrays).not.toHaveBeenCalled();
    renderer.dispose();
  });
  it('refuses rendering after context loss and releases each retained resource only once', () => {
    const h = fixture(),
      renderer = new TransitionEffectRenderer();
    vi.mocked(h.gl.isContextLost).mockReturnValue(true);
    expect(() => renderer.render(source, 80, 40, effect(), region)).toThrow('unavailable');
    renderer.dispose();
    renderer.dispose();
    expect(h.gl.deleteProgram).toHaveBeenCalledOnce();
    expect(h.gl.deleteTexture).toHaveBeenCalledOnce();
    expect(h.gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(h.canvas.width).toBe(1);
    expect(h.canvas.height).toBe(1);
    expect(() => renderer.render(source, 80, 40, effect(), region)).toThrow('unavailable');
  });
});

describe('transition effect destination adapter', () => {
  it.each([
    { width: 80, height: 40 },
    { videoWidth: 80, videoHeight: 40, width: 1, height: 1 },
    { naturalWidth: 80, naturalHeight: 40, width: 1, height: 1 },
    { displayWidth: 80, displayHeight: 40 },
  ])('keeps the source raster resolution when drawing into a different destination size', (input) => {
    const h = fixture();
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawTransitionEffect(ctx, input as CanvasImageSource, { x: 10, y: 20, width: 40, height: 20 }, effect());
    expect(h.gl.viewport).toHaveBeenCalledWith(0, 0, 80, 40);
    expect(h.gl.uniform4f).toHaveBeenCalledWith(expect.objectContaining({ name: 'u_region' }), 0, 0, 1, 1);
    expect(ctx.drawImage).toHaveBeenCalledWith(h.canvas, 10, 20, 40, 20);
  });
  it('retains one renderer across destinations and recreates it only after explicit disposal', () => {
    const h = fixture();
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const frame = { x: 0, y: 0, width: 40, height: 20 };
    drawTransitionEffect(ctx, source, frame, effect(), region);
    drawTransitionEffect(ctx, source, frame, effect(), region);
    expect(h.Canvas).toHaveBeenCalledOnce();
    disposeTransitionEffects();
    disposeTransitionEffects();
    expect(h.gl.deleteProgram).toHaveBeenCalledOnce();
    drawTransitionEffect(ctx, source, frame, effect(), region);
    expect(h.Canvas).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ x: NaN, y: 0, width: 40, height: 20 }, region],
    [{ x: 0, y: 0, width: 0, height: 20 }, region],
    [{ x: 0, y: 0, width: 40, height: -1 }, region],
    [
      { x: 0, y: 0, width: 40, height: 20 },
      { ...region, width: 0 },
    ],
    [
      { x: 0, y: 0, width: 40, height: 20 },
      { ...region, height: -1 },
    ],
    [
      { x: 0, y: 0, width: 40, height: 20 },
      { ...region, x: Infinity },
    ],
  ] as const)(
    'rejects invalid destination or normalized region before allocating a GPU renderer',
    (frame, normalized) => {
      const h = fixture();
      const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
      expect(() => drawTransitionEffect(ctx, source, frame, effect(), normalized)).toThrow(
        'Invalid transition geometry',
      );
      expect(h.Canvas).not.toHaveBeenCalled();
      expect(ctx.drawImage).not.toHaveBeenCalled();
    },
  );
});

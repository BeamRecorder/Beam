import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedFrameRenderer } from './animated-frame-renderer';
import { drawAnimatedFrame, disposeAnimatedFrameRenderer } from './animated-frame';
import { DEFAULT_ANIMATED_FRAME } from '@beam/engine/shared/animated-frame-types';
import { ANIMATED_FRAME_PRESETS } from '@beam/engine/shared/animated-frame-schema';
import type { AnimatedFrameRenderOptions } from './animated-frame-types';
import type { Canvas2DContext } from '../../canvas-types';

function fixture() {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    MAX_VIEWPORT_DIMS: 9,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => 'bad shader'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => 'bad link'),
    createBuffer: vi.fn(() => ({})),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_p: unknown, name: string) => name as unknown as WebGLUniformLocation | null),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform1i: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    isContextLost: vi.fn(() => false),
    getParameter: vi.fn(() => [8192, 8192]),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  };
  const getContext = vi.fn(() => gl);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext = getContext;
    },
  );
  return { gl, getContext };
}
const options = (patch: Partial<AnimatedFrameRenderOptions> = {}): AnimatedFrameRenderOptions => ({
  rect: { x: 80, y: 60, width: 200, height: 100 },
  radius: 16,
  settings: DEFAULT_ANIMATED_FRAME,
  timeMs: 1500,
  appearanceScale: 1,
  pixelScale: 1,
  ...patch,
});
afterEach(() => {
  disposeAnimatedFrameRenderer();
  vi.unstubAllGlobals();
});

describe('retained animated frame shader', () => {
  it.each(ANIMATED_FRAME_PRESETS)('renders %s with the exact geometry and timeline clock', (preset) => {
    const { gl } = fixture();
    const renderer = new AnimatedFrameRenderer();
    const result = renderer.render(options({ settings: { preset, width: 4, speed: 2 } }));
    expect(gl.uniform1i).toHaveBeenCalledWith('u_preset', ANIMATED_FRAME_PRESETS.indexOf(preset));
    expect(gl.uniform2f).toHaveBeenCalledWith('u_size', 200, 100);
    expect(gl.uniform1f).toHaveBeenCalledWith('u_radius', 16);
    expect(gl.uniform1f).toHaveBeenCalledWith('u_width', 4);
    expect(gl.uniform1f).toHaveBeenCalledWith('u_time', 3);
    expect(gl.uniform1i).toHaveBeenCalledWith('u_mask', 0);
    expect(result.padding).toBeGreaterThan(4 * 10);
    const canvas = result.canvas;
    expect(renderer.render(options({ settings: { preset, width: 4, speed: 2 } })).canvas).toBe(canvas);
    renderer.dispose();
    renderer.dispose();
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(() => renderer.render(options())).toThrow('unavailable');
  });
  it.each(['circle', 'squircle'] as const)('preserves the %s mask and scaled appearance', (mask) => {
    const { gl } = fixture();
    const renderer = new AnimatedFrameRenderer();
    renderer.render(options({ mask, appearanceScale: 0.5 }));
    expect(gl.uniform1i).toHaveBeenCalledWith('u_mask', mask === 'circle' ? 1 : 2);
    expect(gl.uniform1f).toHaveBeenCalledWith('u_width', 1.5);
    renderer.dispose();
  });
  it('bounds large outputs and zoomed frames to 16 MiB and GPU viewport limits', () => {
    const { gl } = fixture();
    gl.getParameter.mockReturnValue([2048, 2048]);
    const renderer = new AnimatedFrameRenderer();
    for (const rect of [
      { x: 0, y: 0, width: 8000, height: 8000 },
      { x: 0, y: 0, width: 12000, height: 500 },
    ]) {
      const { canvas } = renderer.render(options({ rect, pixelScale: 4 }));
      expect(canvas.width).toBeLessThanOrEqual(2048);
      expect(canvas.height).toBeLessThanOrEqual(2048);
      expect(canvas.width * canvas.height * 4).toBeLessThanOrEqual(16_777_216);
    }
    renderer.dispose();
  });
  it('freezes at speed zero and repeats the same phase after reverse seeking', () => {
    const { gl } = fixture();
    const renderer = new AnimatedFrameRenderer();
    for (const timeMs of [900, 4000, 900, -100]) {
      renderer.render(options({ timeMs }));
      expect(gl.uniform1f).toHaveBeenLastCalledWith('u_time', timeMs / 1000);
    }
    renderer.render(options({ settings: { ...DEFAULT_ANIMATED_FRAME, speed: 0 } }));
    expect(gl.uniform1f).toHaveBeenLastCalledWith('u_time', 0);
    renderer.dispose();
  });
  it('rejects invalid geometry, clocks, settings and lost contexts before drawing', () => {
    const { gl } = fixture();
    const renderer = new AnimatedFrameRenderer();
    for (const patch of [
      { rect: { x: 0, y: 0, width: 0, height: 100 } },
      { pixelScale: 0 },
      { appearanceScale: NaN },
      { appearanceScale: Number.MAX_VALUE },
      { rect: { x: NaN, y: 0, width: 200, height: 100 } },
      { timeMs: Infinity },
      { radius: NaN },
      { radius: -1 },
      { settings: { ...DEFAULT_ANIMATED_FRAME, width: 17 } },
    ])
      expect(() => renderer.render(options(patch))).toThrow();
    expect(gl.drawArrays).not.toHaveBeenCalled();
    gl.isContextLost.mockReturnValue(true);
    expect(() => renderer.render(options())).toThrow('unavailable');
    renderer.dispose();
  });
  it.each(['context', 'program', 'shader', 'compile', 'link', 'buffer'] as const)(
    'cleans partially allocated resources on %s failure',
    (stage) => {
      const { gl, getContext } = fixture();
      if (stage === 'context') getContext.mockReturnValueOnce(null as never);
      if (stage === 'program') gl.createProgram.mockReturnValueOnce(null as never);
      if (stage === 'shader') gl.createShader.mockReturnValueOnce(null as never);
      if (stage === 'compile') gl.getShaderParameter.mockReturnValueOnce(false);
      if (stage === 'link') gl.getProgramParameter.mockReturnValueOnce(false);
      if (stage === 'buffer') gl.createBuffer.mockReturnValueOnce(null as never);
      expect(() => new AnimatedFrameRenderer()).toThrow();
      if (stage !== 'context') expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
      if (stage === 'compile' || stage === 'link' || stage === 'buffer') expect(gl.deleteShader).toHaveBeenCalled();
    },
  );
  it('handles inactive uniforms and missing lose-context extensions', () => {
    const { gl } = fixture();
    gl.getUniformLocation.mockReturnValue(null);
    gl.getExtension.mockReturnValue(null as never);
    const renderer = new AnimatedFrameRenderer();
    expect(() => renderer.render(options())).not.toThrow();
    renderer.dispose();
  });
  it('shares one bounded program across contexts and releases it before reuse', () => {
    const { gl } = fixture();
    const ctx = { drawImage: vi.fn() } as unknown as Canvas2DContext;
    drawAnimatedFrame(ctx, options());
    drawAnimatedFrame(ctx, options({ timeMs: 1800 }));
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    const args = vi.mocked(ctx.drawImage).mock.calls[0]!;
    expect(args[1]).toBeLessThan(80);
    expect(args[2]).toBeLessThan(60);
    disposeAnimatedFrameRenderer();
    disposeAnimatedFrameRenderer();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    drawAnimatedFrame(ctx, options());
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
  });
});

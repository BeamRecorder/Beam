import { afterEach, describe, it, expect, vi } from 'vitest';
import { GradientRenderer } from './gradient-renderer';
import { DEFAULT_GRADIENT_RECIPE } from '@beam/engine';
import { gradientProjection } from './gradient-projection';
import { toOklab } from './gradient-color';
const projection = gradientProjection({ x: 0, y: 0, width: 100, height: 50 }, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
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
    getUniformLocation: vi.fn((_p: unknown, name: string) => name),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3fv: vi.fn(),
    uniform1i: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    isContextLost: vi.fn(() => false),
    getParameter: vi.fn(() => [2048, 2048]),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  };
  const sizes: { axis: string; value: number }[] = [];
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      private w = 1;
      private h = 1;
      get width() {
        return this.w;
      }
      set width(value: number) {
        sizes.push({ axis: 'w', value });
        this.w = value;
      }
      get height() {
        return this.h;
      }
      set height(value: number) {
        sizes.push({ axis: 'h', value });
        this.h = value;
      }
      getContext() {
        return gl;
      }
    },
  );
  return { gl, sizes };
}
afterEach(() => vi.unstubAllGlobals());
describe('retained BEBE-ui GPU renderer', () => {
  it('binds perceptual colors, every parameter and a fixed saved phase', () => {
    const { gl, sizes } = fixture(),
      renderer = new GradientRenderer();
    const recipe = { ...structuredClone(DEFAULT_GRADIENT_RECIPE), mode: 'mesh' as const, frame: 3, grain: 40 };
    const canvas = renderer.render(recipe, 100, 50, projection, { width: 100, height: 50 }, 1);
    expect(gl.uniform1i).toHaveBeenCalledWith('u_mode', 0);
    expect(gl.uniform1f).toHaveBeenCalledWith('u_time', 3);
    expect(gl.uniform1f).toHaveBeenCalledWith('u_grain', 0.4);
    expect(gl.uniform1f).toHaveBeenCalledWith('u_grainMotion', 0);
    expect(gl.uniform3fv).toHaveBeenCalledWith('u_base', toOklab(recipe.background));
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
    const writes = sizes.length;
    expect(renderer.render(recipe, 100, 50, projection, { width: 100, height: 50 }, 1)).toBe(canvas);
    expect(sizes).toHaveLength(writes);
    renderer.dispose();
    renderer.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(() => renderer.render(recipe, 100, 50, projection, { width: 100, height: 50 }, 1)).toThrow('unavailable');
  });
  it('rejects invalid recipes, viewport sizes and lost contexts before presenting a frame', () => {
    const { gl } = fixture(),
      renderer = new GradientRenderer();
    expect(() =>
      renderer.render({ ...DEFAULT_GRADIENT_RECIPE, grain: 101 }, 100, 50, projection, { width: 100, height: 50 }, 1),
    ).toThrow('grain');
    for (const width of [0, NaN, 2049])
      expect(() =>
        renderer.render(DEFAULT_GRADIENT_RECIPE, width, 50, projection, { width: 100, height: 50 }, 1),
      ).toThrow();
    expect(() =>
      renderer.render(DEFAULT_GRADIENT_RECIPE, 100, 2049, projection, { width: 100, height: 50 }, 1),
    ).toThrow('viewport');
    gl.isContextLost.mockReturnValue(true);
    expect(() => renderer.render(DEFAULT_GRADIENT_RECIPE, 100, 50, projection, { width: 100, height: 50 }, 1)).toThrow(
      'unavailable',
    );
    renderer.dispose();
  });
  it.each(['shader', 'fragment', 'program', 'link', 'buffer'] as const)(
    'releases partially constructed GPU resources after %s failure',
    (stage) => {
      const { gl } = fixture();
      if (stage === 'shader') gl.createShader.mockReturnValueOnce(null as never);
      if (stage === 'fragment') gl.getShaderParameter.mockReturnValueOnce(true).mockReturnValueOnce(false);
      if (stage === 'program') gl.createProgram.mockReturnValue(null as never);
      if (stage === 'link') gl.getProgramParameter.mockReturnValue(false);
      if (stage === 'buffer') gl.createBuffer.mockReturnValue(null as never);
      expect(() => new GradientRenderer()).toThrow();
      expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
      if (stage !== 'shader') expect(gl.deleteShader).toHaveBeenCalled();
    },
  );
  it('reports unavailable WebGL instead of presenting another kind of gradient', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    expect(() => new GradientRenderer()).toThrow('WebGL');
  });
});

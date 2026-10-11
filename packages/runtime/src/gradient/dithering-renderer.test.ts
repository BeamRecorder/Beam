import { afterEach, it, expect, vi } from 'vitest';
import { DitheringRenderer } from './dithering-renderer';
import { DEFAULT_DITHERING_RECIPE } from '@beam/engine';
const projection = { x: [0.01, 0, 0] as [number, number, number], y: [0, 0.02, 0] as [number, number, number] };
const size = { width: 100, height: 50 };
const source = () => new OffscreenCanvas(100, 50);
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
    MAX_TEXTURE_SIZE: 10,
    TEXTURE_2D: 11,
    TEXTURE0: 12,
    RGBA: 13,
    UNSIGNED_BYTE: 14,
    UNPACK_FLIP_Y_WEBGL: 15,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 16,
    createTexture: vi.fn(() => ({})),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    activeTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
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
    getParameter: vi.fn((key: number): number | number[] => (key === 9 ? [2048, 2048] : 2048)),
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
      constructor(width = 1, height = 1) {
        this.w = width;
        this.h = height;
      }
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
it('reuses its texture/program, uploads straight alpha and binds an editable palette', () => {
  const { gl, sizes } = fixture(),
    renderer = new DitheringRenderer(),
    input = source();
  const recipe = { ...DEFAULT_DITHERING_RECIPE, colors: ['#abc', '#123456'], pixelSize: 3 };
  const canvas = renderer.render(recipe, input, projection, size);
  expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
  expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  expect(gl.uniform1f).toHaveBeenCalledWith('u_pixelSize', 3);
  expect(gl.uniform1i).toHaveBeenCalledWith('u_count', 2);
  expect(gl.uniform3fv).toHaveBeenCalledWith('u_colors[0]', expect.any(Float32Array));
  const writes = sizes.length;
  expect(renderer.render(recipe, input, projection, size)).toBe(canvas);
  expect(sizes).toHaveLength(writes);
  expect(gl.createTexture).toHaveBeenCalledOnce();
  renderer.dispose();
  renderer.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledOnce();
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
  expect(gl.deleteBuffer).toHaveBeenCalledOnce();
  expect(() => renderer.render(recipe, input, projection, size)).toThrow('unavailable');
});
it('rejects invalid recipes, dimensions and lost GPU contexts', () => {
  const { gl } = fixture(),
    renderer = new DitheringRenderer();
  expect(() => renderer.render({ ...DEFAULT_DITHERING_RECIPE, pixelSize: 17 }, source(), projection, size)).toThrow(
    'recipe',
  );
  for (const width of [0, NaN, 2049])
    expect(() =>
      renderer.render(DEFAULT_DITHERING_RECIPE, { width, height: 50 } as OffscreenCanvas, projection, size),
    ).toThrow();
  expect(() => renderer.render(DEFAULT_DITHERING_RECIPE, source(), projection, { ...size, height: 0 })).toThrow(
    'dimensions',
  );
  expect(() => renderer.render(DEFAULT_DITHERING_RECIPE, source(), { ...projection, x: [NaN, 0, 0] }, size)).toThrow(
    'dimensions',
  );
  gl.getParameter.mockImplementation((key) => (key === 9 ? [2048, 2048] : 32));
  expect(() => renderer.render(DEFAULT_DITHERING_RECIPE, source(), projection, size)).toThrow('limit');
  gl.isContextLost.mockReturnValue(true);
  expect(() => renderer.render(DEFAULT_DITHERING_RECIPE, source(), projection, size)).toThrow('unavailable');
  renderer.dispose();
});
it.each(['shader', 'compile', 'program', 'link', 'buffer', 'texture'] as const)(
  'releases resources after %s initialization fails',
  (failure) => {
    const { gl } = fixture();
    if (failure === 'shader') gl.createShader.mockReturnValueOnce(null as unknown as WebGLShader);
    if (failure === 'compile') gl.getShaderParameter.mockReturnValueOnce(false);
    if (failure === 'program') gl.createProgram.mockReturnValueOnce(null as unknown as WebGLProgram);
    if (failure === 'link') gl.getProgramParameter.mockReturnValueOnce(false);
    if (failure === 'buffer') gl.createBuffer.mockReturnValueOnce(null as unknown as WebGLBuffer);
    if (failure === 'texture') gl.createTexture.mockReturnValueOnce(null as unknown as WebGLTexture);
    expect(() => new DitheringRenderer()).toThrow();
    if (failure !== 'shader' && failure !== 'compile') expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    if (failure === 'buffer' || failure === 'texture') expect(gl.deleteProgram).toHaveBeenCalledOnce();
  },
);
it('reports missing WebGL without presenting a frame', () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null;
      }
    },
  );
  expect(() => new DitheringRenderer()).toThrow('WebGL is unavailable');
});
it('preserves the pattern scale at thumbnail density and rejects invalid scales or projections', () => {
  const { gl } = fixture(),
    renderer = new DitheringRenderer();
  renderer.render(DEFAULT_DITHERING_RECIPE, source(), projection, size, 0.5);
  expect(gl.uniform2f).toHaveBeenCalledWith('u_size', 200, 100);
  for (const scale of [0, NaN, Infinity])
    expect(() => renderer.render(DEFAULT_DITHERING_RECIPE, source(), projection, size, scale)).toThrow('pixel ratio');
  expect(() => renderer.render(DEFAULT_DITHERING_RECIPE, source(), { x: [0, 0, 0], y: [0, 0, 0] }, size)).toThrow(
    'projection',
  );
  renderer.dispose();
});

import { afterEach, it, expect, vi } from 'vitest';
import { ArtisticRenderer } from './artistic-renderer';
import { createArtisticEffect } from '@beam/engine';
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
    TEXTURE1: 17,
    uniform4f: vi.fn(),
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
  const glyphs = { fillRect: vi.fn(), fillText: vi.fn(), fillStyle: '', font: '', textAlign: '', textBaseline: '' };
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
      getContext(kind: string) {
        return kind === '2d' ? glyphs : gl;
      }
    },
  );
  return { gl, sizes, glyphs };
}
afterEach(() => vi.unstubAllGlobals());
it.each(['ascii', 'grain', 'cyanotype'] as const)('renders editable %s settings with retained resources', (kind) => {
  const { gl, glyphs } = fixture(),
    renderer = new ArtisticRenderer(),
    effect = createArtisticEffect(kind, 'x');
  renderer.render(effect, source(), projection, size);
  renderer.render(effect, source(), projection, size);
  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  expect(gl.createProgram).toHaveBeenCalledOnce();
  if (kind === 'ascii') {
    expect(glyphs.fillText).toHaveBeenCalledTimes(10);
    expect(gl.createTexture).toHaveBeenCalledTimes(2);
  }
  renderer.dispose();
  renderer.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledTimes(kind === 'ascii' ? 2 : 1);
  expect(() => renderer.render(effect, source(), projection, size)).toThrow('unavailable');
});
it('binds monochrome ASCII and colored grain, including short colors and reversed glyphs', () => {
  const { gl } = fixture(),
    renderer = new ArtisticRenderer(),
    ascii = createArtisticEffect('ascii', 'x'),
    grain = createArtisticEffect('grain', 'g');
  ascii.recipe.colored = false;
  ascii.recipe.invert = true;
  ascii.recipe.foreground = '#abc';
  grain.recipe.monochrome = false;
  renderer.render(ascii, source(), projection, size);
  expect(gl.uniform1i).toHaveBeenCalledWith('u_colored', 0);
  expect(gl.uniform1i).toHaveBeenCalledWith('u_invert', 1);
  renderer.render(grain, source(), projection, size);
  expect(gl.uniform1i).toHaveBeenCalledWith('u_colored', 1);
  renderer.dispose();
});
it('rejects malformed recipes, surfaces, projections, GPU limits and lost contexts', () => {
  const { gl } = fixture(),
    renderer = new ArtisticRenderer(),
    effect = createArtisticEffect('grain', 'x');
  expect(() =>
    renderer.render({ ...effect, recipe: { ...effect.recipe, amount: 101 } }, source(), projection, size),
  ).toThrow();
  for (const width of [0, NaN, 2049])
    expect(() => renderer.render(effect, { width, height: 50 } as OffscreenCanvas, projection, size)).toThrow();
  expect(() => renderer.render(effect, source(), projection, { ...size, height: 0 })).toThrow();
  expect(() => renderer.render(effect, source(), { x: [0, 0, 0], y: [0, 0, 0] }, size)).toThrow('projection');
  gl.getParameter.mockImplementation((key) => (key === 9 ? [2048, 2048] : 32));
  expect(() => renderer.render(effect, source(), projection, size)).toThrow('limit');
  gl.isContextLost.mockReturnValue(true);
  expect(() => renderer.render(effect, source(), projection, size)).toThrow('unavailable');
  renderer.dispose();
});
it.each(['shader', 'compile', 'program', 'link', 'buffer', 'texture'] as const)(
  'releases resources after %s allocation fails',
  (failure) => {
    const { gl } = fixture();
    if (failure === 'shader') gl.createShader.mockReturnValueOnce(null as unknown as WebGLShader);
    if (failure === 'compile') gl.getShaderParameter.mockReturnValueOnce(false);
    if (failure === 'program') gl.createProgram.mockReturnValueOnce(null as unknown as WebGLProgram);
    if (failure === 'link') gl.getProgramParameter.mockReturnValueOnce(false);
    if (failure === 'buffer') gl.createBuffer.mockReturnValueOnce(null as unknown as WebGLBuffer);
    if (failure === 'texture') gl.createTexture.mockReturnValueOnce(null as unknown as WebGLTexture);
    expect(() => new ArtisticRenderer()).toThrow();
  },
);
it('reports unavailable WebGL and failed glyph textures', () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null;
      }
    },
  );
  expect(() => new ArtisticRenderer()).toThrow('WebGL');
  const { gl } = fixture(),
    renderer = new ArtisticRenderer();
  gl.createTexture.mockReturnValueOnce(null as unknown as WebGLTexture);
  expect(() => renderer.render(createArtisticEffect('ascii', 'x'), source(), projection, size)).toThrow(
    'glyph texture',
  );
  renderer.dispose();
});
it('keeps texture size stable across preview density and rejects invalid pixel ratios', () => {
  const { gl } = fixture(),
    renderer = new ArtisticRenderer(),
    effect = createArtisticEffect('grain', 'x');
  renderer.render(effect, source(), projection, size, 0.5);
  expect(gl.uniform2f).toHaveBeenCalledWith('u_size', 200, 100);
  for (const scale of [0, NaN, Infinity])
    expect(() => renderer.render(effect, source(), projection, size, scale)).toThrow('pixel ratio');
  renderer.dispose();
});

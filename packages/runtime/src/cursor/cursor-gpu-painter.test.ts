import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CursorGpuPainter } from './cursor-gpu-painter';
import { CursorBlurTarget } from './cursor-blur-target';
import type { CursorGpuOptions } from './cursor-gpu-types';

function gpu() {
  return {
    MAX_VIEWPORT_DIMS: 1,
    MAX_TEXTURE_SIZE: 2,
    NO_ERROR: 0,
    VERTEX_SHADER: 3,
    FRAGMENT_SHADER: 4,
    COMPILE_STATUS: 5,
    LINK_STATUS: 6,
    ARRAY_BUFFER: 7,
    STATIC_DRAW: 8,
    FLOAT: 9,
    TEXTURE0: 10,
    TEXTURE_2D: 11,
    TEXTURE_WRAP_S: 12,
    TEXTURE_WRAP_T: 13,
    CLAMP_TO_EDGE: 14,
    TEXTURE_MIN_FILTER: 15,
    TEXTURE_MAG_FILTER: 16,
    LINEAR: 17,
    UNPACK_FLIP_Y_WEBGL: 18,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 19,
    RGBA: 20,
    UNSIGNED_BYTE: 21,
    FRAMEBUFFER: 22,
    DEPTH_TEST: 23,
    BLEND: 24,
    COLOR_BUFFER_BIT: 1,
    DEPTH_BUFFER_BIT: 2,
    ONE: 25,
    ONE_MINUS_SRC_ALPHA: 26,
    TRIANGLES: 27,
    LEQUAL: 28,
    RENDERBUFFER: 29,
    DEPTH_COMPONENT16: 30,
    COLOR_ATTACHMENT0: 31,
    DEPTH_ATTACHMENT: 32,
    FRAMEBUFFER_COMPLETE: 33,
    getParameter: vi.fn((kind: number) => (kind === 1 ? new Int32Array([4096, 4096]) : 4096)),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    createFramebuffer: vi.fn(() => ({})),
    createRenderbuffer: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    getShaderParameter: vi.fn(() => true),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => 'compile failure'),
    getProgramInfoLog: vi.fn(() => 'link failure'),
    getUniformLocation: vi.fn(() => ({})),
    getAttribLocation: vi.fn(() => 0),
    isContextLost: vi.fn(() => false),
    getError: vi.fn(() => 0),
    checkFramebufferStatus: vi.fn(() => 33),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteRenderbuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    useProgram: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    viewport: vi.fn(),
    bindFramebuffer: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    blendFunc: vi.fn(),
    depthFunc: vi.fn(),
    drawArrays: vi.fn(),
    bindRenderbuffer: vi.fn(),
    renderbufferStorage: vi.fn(),
    framebufferTexture2D: vi.fn(),
    framebufferRenderbuffer: vi.fn(),
  };
}
let gl: ReturnType<typeof gpu>, canvasCount: number, missingCanvas: number, unavailable: boolean;
beforeEach(() => {
  gl = gpu();
  canvasCount = 0;
  missingCanvas = -1;
  unavailable = false;
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      private readonly number = canvasCount++;
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext(kind: string) {
        if (kind === 'webgl2') return unavailable ? null : gl;
        if (this.number === missingCanvas) return null;
        let color = '#000000';
        return {
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          get fillStyle() {
            return color;
          },
          set fillStyle(value: string) {
            if (value !== 'bad') color = value;
          },
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4).fill(255),
          }),
        };
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
const image = (size = 32) => ({ width: size, height: size }) as ImageBitmap;
const options = (patch: Partial<CursorGpuOptions> = {}): CursorGpuOptions => ({
  image: image(),
  geometry: { width: 32, height: 32, hotspot: { x: 4, y: 4 } },
  samples: [{ x: 10, y: 10, weight: 1 }],
  resolution: 1,
  shadow: { enabled: false, blur: 4, color: '#000000', direction: 'bottom' },
  ...patch,
});
const asGl = () => gl as unknown as WebGL2RenderingContext;
it('retains artwork and uniforms across frames and releases every GPU allocation once', () => {
  const painter = new CursorGpuPainter(),
    input = options();
  painter.render(input);
  painter.render(input);
  expect(gl.createTexture).toHaveBeenCalledOnce();
  expect(gl.bufferData).toHaveBeenCalledOnce();
  expect(gl.getError).toHaveBeenCalledOnce();
  painter.dispose();
  painter.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledOnce();
  expect(gl.deleteBuffer).toHaveBeenCalledOnce();
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
  expect(() => painter.render(input)).toThrow('unavailable');
});
it('evicts immutable artwork by count and byte budget', () => {
  const painter = new CursorGpuPainter();
  for (let i = 0; i < 10; i++) painter.render(options());
  expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 6; i++)
    painter.render(
      options({ image: image(4096), geometry: { width: 512, height: 512, hotspot: { x: 4, y: 4 } }, resolution: 2 }),
    );
  expect(gl.deleteTexture.mock.calls.length).toBeGreaterThan(8);
  painter.dispose();
  expect(gl.deleteTexture.mock.calls.length).toBe(gl.createTexture.mock.calls.length);
});
it('accepts decoded HTML artwork and caps raster resolution', () => {
  const painter = new CursorGpuPainter();
  painter.render(options({ image: { naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement, resolution: 8 }));
  expect(gl.viewport.mock.calls[0]![2]).toBeLessThan(4096);
  painter.dispose();
});
it('upgrades artwork for magnification and retains the sharp raster when shrinking', () => {
  const painter = new CursorGpuPainter(),
    artwork = image();
  painter.render(options({ image: artwork }));
  painter.render(
    options({ image: artwork, geometry: { width: 160, height: 160, hotspot: { x: 80, y: 80 } }, resolution: 2 }),
  );
  expect(gl.createTexture).toHaveBeenCalledTimes(2);
  expect(gl.deleteTexture).toHaveBeenCalledOnce();
  painter.render(options({ image: artwork }));
  expect(gl.createTexture).toHaveBeenCalledTimes(2);
  painter.dispose();
});
it('composes complete cursor and shadow samples before additive exposure', () => {
  const painter = new CursorGpuPainter(),
    input = options({
      samples: [
        { x: 10, y: 10, weight: 1 },
        { x: 20, y: 10, weight: 1 },
      ],
      volume: { pitch: 0.2, yaw: -0.2, height: 0.3 },
      shadow: { enabled: true, blur: 3, color: '#000', direction: 'bottom' },
    });
  painter.render(input);
  painter.render(input);
  expect(gl.createFramebuffer).toHaveBeenCalledOnce();
  expect(gl.checkFramebufferStatus).toHaveBeenCalledOnce();
  expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE);
  expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 0.5);
  expect(gl.enable).toHaveBeenCalledWith(gl.DEPTH_TEST);
  painter.render({ ...input, geometry: { ...input.geometry, width: 60 } });
  expect(gl.checkFramebufferStatus).toHaveBeenCalledTimes(2);
  painter.dispose();
  expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
});
it('bounds the parsed shadow color cache and rejects malformed colors', () => {
  const painter = new CursorGpuPainter();
  for (let i = 0; i < 65; i++)
    painter.render(options({ shadow: { enabled: false, blur: 0, color: `rgb(${i},0,0)`, direction: 'bottom' } }));
  expect(() =>
    painter.render(options({ shadow: { enabled: true, blur: 0, color: 'bad', direction: 'bottom' } })),
  ).toThrow('color');
  painter.dispose();
});
it.each([
  { samples: [] },
  { samples: Array(17).fill({ x: 0, y: 0, weight: 1 }) },
  { samples: [{ x: NaN, y: 0, weight: 1 }] },
  { samples: [{ x: 0, y: 0, weight: -1 }] },
  { samples: [{ x: 0, y: 0, weight: 0 }] },
  { geometry: { width: 0, height: 10, hotspot: { x: 0, y: 0 } } },
  { geometry: { width: 1e7, height: 10, hotspot: { x: 0, y: 0 } } },
  { geometry: { width: 2100, height: 2100, hotspot: { x: 0, y: 0 } } },
  { resolution: 0 },
  { volume: { pitch: 1, yaw: 0, height: 0 } },
  { volume: { pitch: 0, yaw: 0, height: 2 } },
])('rejects unsafe geometry %o', (patch) => {
  const painter = new CursorGpuPainter();
  expect(() => painter.render(options(patch))).toThrow(RangeError);
  painter.dispose();
});
it('rejects incomplete artwork and context loss', () => {
  const painter = new CursorGpuPainter();
  expect(() => painter.render(options({ image: image(0) }))).toThrow('artwork dimensions');
  gl.isContextLost.mockReturnValue(true);
  expect(() => painter.render(options())).toThrow('unavailable');
  painter.dispose();
});
it.each([1, 2, 3])('cleans up when Canvas2D surface %s is unavailable', (number) => {
  missingCanvas = number;
  const painter = new CursorGpuPainter();
  expect(() => painter.render(options())).toThrow('canvas unavailable');
  painter.dispose();
});
it('fails explicitly without WebGL2', () => {
  unavailable = true;
  expect(() => new CursorGpuPainter()).toThrow('WebGL2');
});
it.each(['createProgram', 'createShader', 'createBuffer', 'createTexture'] as const)(
  'cleans partial allocation failure in %s',
  (method) => {
    gl[method].mockReturnValue(null as unknown as object);
    if (method === 'createProgram' || method === 'createShader')
      expect(() => new CursorGpuPainter()).toThrow('allocate');
    else {
      const painter = new CursorGpuPainter();
      expect(() => painter.render(options())).toThrow('allocate');
      painter.dispose();
    }
    expect(gl.deleteProgram).toHaveBeenCalled();
  },
);
it.each(['getShaderParameter', 'getProgramParameter'] as const)(
  'reports %s failure and frees the program',
  (method) => {
    gl[method].mockReturnValue(false);
    expect(() => new CursorGpuPainter()).toThrow('failed');
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
  },
);
it('cleans failed uploads rather than caching invalid GPU artwork', () => {
  gl.getError.mockReturnValue(1285);
  const painter = new CursorGpuPainter();
  expect(() => painter.render(options())).toThrow('upload');
  expect(gl.deleteTexture).toHaveBeenCalledOnce();
  painter.dispose();
});
it.each([
  'createProgram',
  'createFramebuffer',
  'createTexture',
  'createRenderbuffer',
  'createBuffer',
  'createVertexArray',
  'createShader',
] as const)('cleans a failed exposure allocation in %s', (method) => {
  gl[method].mockReturnValue(null as unknown as object);
  expect(() => new CursorBlurTarget(asGl())).toThrow('allocate');
  expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
});
it.each(['getShaderParameter', 'getProgramParameter'] as const)('cleans exposure %s failure', (method) => {
  gl[method].mockReturnValue(false);
  expect(() => new CursorBlurTarget(asGl())).toThrow(/failed/);
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
});
it('rejects incomplete framebuffers and cannot reuse a disposed exposure', () => {
  const target = new CursorBlurTarget(asGl());
  gl.checkFramebufferStatus.mockReturnValue(0);
  expect(() => target.begin(10, 10)).toThrow('incomplete');
  target.dispose();
  target.dispose();
  expect(() => target.begin(10, 10)).toThrow('disposed');
  expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
});

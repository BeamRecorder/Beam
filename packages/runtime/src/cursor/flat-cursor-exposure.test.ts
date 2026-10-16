import { expect, it, vi } from 'vitest';
import { FlatCursorExposurePainter } from './flat-cursor-exposure';
import { cursorRasterBounds } from './cursor-raster-bounds';
import { gpuFixture } from '../gpu/tests/gpu-fixtures';
import type { CursorGpuOptions, CursorRasterSurface } from './cursor-gpu-types';

const options = (patch: Partial<CursorGpuOptions> = {}): CursorGpuOptions => ({
  image: {} as ImageBitmap,
  geometry: { width: 32, height: 32, hotspot: { x: 4, y: 4 } },
  samples: [
    { x: 10, y: 20, weight: 1 },
    { x: 20, y: 10, weight: 3 },
  ],
  resolution: 1,
  shadow: { enabled: true, blur: 4, color: '#000', direction: 'bottom' },
  ...patch,
});
function fixture(maxSize = 4096) {
  const base = gpuFixture(),
    canvas = base.canvas;
  const gl = {
    ...base.mock,
    STATIC_DRAW: 1001,
    DYNAMIC_DRAW: 1002,
    TRIANGLES: 1003,
    DEPTH_TEST: 1004,
    DEPTH_BUFFER_BIT: 1005,
    NO_ERROR: 0,
    getAttribLocation: vi.fn((_program: unknown, name: string) => (name === 'a_corner' ? 0 : 1)),
    createVertexArray: vi.fn(() => ({})),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),
    copyTexImage2D: vi.fn(),
    getError: vi.fn(() => 0),
  };
  const rasterizer = {
    canvas,
    gl: gl as unknown as WebGL2RenderingContext,
    maxSize,
    render: vi.fn((input: CursorGpuOptions, density = 1): CursorRasterSurface => {
      const bounds = cursorRasterBounds(input, maxSize, density);
      canvas.width = bounds.pixelWidth;
      canvas.height = bounds.pixelHeight;
      return { canvas, ...bounds };
    }),
  };
  return { gl, canvas, rasterizer };
}
it('rasterizes one complete cursor, normalizes shutter weights and batches all placements in one draw', () => {
  const { gl, rasterizer, canvas } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer),
    input = options();
  const surface = painter.render(input);
  expect(rasterizer.render).toHaveBeenCalledExactlyOnceWith(
    { ...input, resolution: 2, samples: [{ x: 0, y: 0, weight: 1 }] },
    1,
  );
  expect([surface.x, surface.y, surface.width, surface.height]).toEqual([-8, -8, 70, 70]);
  expect([canvas.width, canvas.height]).toEqual([70, 70]);
  expect(gl.copyTexImage2D).toHaveBeenCalledExactlyOnceWith(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, 120, 120, 0);
  expect(Array.from(gl.bufferSubData.mock.calls[0]![2] as Float32Array)).toEqual([0, 10, 0.25, 10, 0, 0.75]);
  expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE);
  expect(gl.drawArraysInstanced).toHaveBeenCalledExactlyOnceWith(gl.TRIANGLES, 0, 6, 2);
  painter.render({
    ...input,
    samples: input.samples.map((sample) => ({
      ...sample,
      x: sample.x + 100,
      y: sample.y + 50,
    })),
  });
  expect(rasterizer.render).toHaveBeenCalledOnce();
  expect(gl.copyTexImage2D).toHaveBeenCalledOnce();
  expect(gl.drawArraysInstanced).toHaveBeenCalledTimes(2);
  painter.dispose();
});
it('keeps one stamp across smooth zooms within a resolution band without reducing raster density', () => {
  const { gl, rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer),
    input = options();
  for (let frame = 0; frame < 1000; frame++) painter.render({ ...input, resolution: 1.01 + (frame % 99) / 100 });
  expect(rasterizer.render).toHaveBeenCalledOnce();
  expect(rasterizer.render.mock.calls[0]![0].resolution).toBe(4);
  expect(gl.drawArraysInstanced).toHaveBeenCalledTimes(1000);
  painter.dispose();
});
it('invalidates all artwork inputs while excluding absolute translations and shutter weights from the stamp key', () => {
  const { rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer),
    base = options();
  const cases = [
    base,
    { ...base, image: {} as ImageBitmap },
    { ...base, resolution: 2 },
    { ...base, geometry: { ...base.geometry, width: 40 } },
    { ...base, geometry: { ...base.geometry, height: 40 } },
    { ...base, geometry: { ...base.geometry, hotspot: { x: 1, y: 2 } } },
    ...[{ enabled: false }, { blur: 5 }, { color: '#f00' }, { direction: 'top-left' as const }].map((patch) => ({
      ...base,
      shadow: { ...base.shadow, ...patch },
    })),
  ];
  for (const input of cases) painter.render(input);
  expect(rasterizer.render).toHaveBeenCalledTimes(cases.length);
  painter.dispose();
});
it('evicts by recency and releases only owned textures and batch resources exactly once', () => {
  const { gl, rasterizer, canvas } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer);
  const inputs = Array.from({ length: 9 }, () => options());
  for (const input of inputs.slice(0, 8)) painter.render(input);
  const oldest = gl.createTexture.mock.results[0]!.value,
    second = gl.createTexture.mock.results[1]!.value;
  painter.render(inputs[0]!);
  painter.render(inputs[8]!);
  expect(gl.deleteTexture).toHaveBeenCalledExactlyOnceWith(second);
  painter.dispose();
  painter.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledWith(oldest);
  expect(gl.deleteTexture).toHaveBeenCalledTimes(9);
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
  expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
  expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
  expect(canvas.width).toBeGreaterThan(0);
  expect(() => painter.render(inputs[0]!)).toThrow('unavailable');
});
it('enforces the byte budget independently of the entry count', () => {
  const { gl, rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer);
  const geometry = { width: 400, height: 400, hotspot: { x: 0, y: 0 } };
  painter.render(options({ geometry }));
  painter.render(options({ geometry }));
  expect(gl.deleteTexture).toHaveBeenCalledOnce();
  painter.dispose();
});
it('uses oversized stamps transiently and preserves the requested density within device limits', () => {
  const { gl, rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer);
  const input = options({
    geometry: { width: 1500, height: 1000, hotspot: { x: 0, y: 0 } },
  });
  painter.render(input);
  painter.render(input);
  expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  expect(rasterizer.render).toHaveBeenCalledTimes(2);
  expect(rasterizer.render.mock.calls[0]![0].resolution).toBe(1);
  painter.dispose();
});
it('keeps the authored resolution when a supersampled stamp does not fit the device', () => {
  const { rasterizer } = fixture(110),
    painter = new FlatCursorExposurePainter(rasterizer);
  painter.render(options());
  expect(rasterizer.render.mock.calls[0]![0].resolution).toBe(1);
  painter.dispose();
});
it('supports the highest supersampling band through the same bounded GPU rasterizer', () => {
  const { rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer);
  painter.render(options({ resolution: 4 }));
  expect(rasterizer.render.mock.calls[0]![1]).toBe(2);
  painter.dispose();
});
it('skips zero-weight samples and rejects invalid requests and lost contexts before rasterization', () => {
  const { gl, rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer),
    base = options();
  painter.render({
    ...base,
    samples: [
      { x: 0, y: 0, weight: 0 },
      { x: 10, y: 10, weight: 2 },
    ],
  });
  expect(gl.drawArraysInstanced).toHaveBeenCalledExactlyOnceWith(gl.TRIANGLES, 0, 6, 1);
  expect(() => painter.render({ ...base, samples: [] })).toThrow(RangeError);
  expect(() => painter.render({ ...base, volume: { pitch: 0, yaw: 0, height: 0 } })).toThrow('volume');
  gl.isContextLost.mockReturnValue(true);
  expect(() => painter.render(base)).toThrow('unavailable');
  expect(rasterizer.render).toHaveBeenCalledOnce();
  painter.dispose();
});
it.each(['createProgram', 'createBuffer', 'createVertexArray', 'createShader'] as const)(
  'cleans partial batch allocation when %s fails',
  (method) => {
    const { gl, rasterizer } = fixture();
    gl[method].mockReturnValueOnce(null!);
    expect(() => new FlatCursorExposurePainter(rasterizer)).toThrow('allocate');
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.bindVertexArray).toHaveBeenLastCalledWith(null);
  },
);
it.each(['getShaderParameter', 'getProgramParameter'] as const)('cleans failed batch compilation in %s', (method) => {
  const { gl, rasterizer } = fixture();
  gl[method].mockReturnValueOnce(false);
  expect(() => new FlatCursorExposurePainter(rasterizer)).toThrow('failed');
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
});
it('does not retain failed texture allocations or copies', () => {
  const { gl, rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer),
    input = options();
  gl.createTexture.mockReturnValueOnce(null!);
  expect(() => painter.render(input)).toThrow('allocate');
  gl.getError.mockReturnValueOnce(1285);
  expect(() => painter.render(input)).toThrow('retain');
  painter.render(input);
  expect(rasterizer.render).toHaveBeenCalledTimes(3);
  expect(gl.drawArraysInstanced).toHaveBeenCalledOnce();
  painter.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledTimes(3);
});
it('propagates rasterizer failure and releases transient stamps when the draw fails', () => {
  const { gl, rasterizer } = fixture(),
    painter = new FlatCursorExposurePainter(rasterizer),
    input = options();
  rasterizer.render.mockImplementationOnce(() => {
    throw new Error('lost');
  });
  expect(() => painter.render(input)).toThrow('lost');
  expect(gl.createTexture).not.toHaveBeenCalled();
  gl.drawArraysInstanced.mockImplementationOnce(() => {
    throw new Error('draw');
  });
  expect(() =>
    painter.render(
      options({
        geometry: { width: 1500, height: 1000, hotspot: { x: 0, y: 0 } },
      }),
    ),
  ).toThrow('draw');
  expect(gl.deleteTexture).toHaveBeenCalledOnce();
  expect(gl.bindVertexArray).toHaveBeenLastCalledWith(null);
  painter.dispose();
});

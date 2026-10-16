import { afterEach, describe, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../gpu/tests/gpu-fixtures';
import { HoverDifferenceGpu } from './hover-difference-gpu';

function fixture() {
  const gl = {
    ...gpuFixture().mock,
    DITHER: 1001,
    STATIC_DRAW: 1002,
    TRIANGLES: 1003,
    NO_ERROR: 0,
    readPixels: vi.fn(),
    getError: vi.fn(() => 0),
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
afterEach(() => vi.unstubAllGlobals());
describe('bounded GPU hover difference lifetime', () => {
  it('uses two textures, reads only a small tile grid, resets and disposes idempotently', () => {
    const { gl } = fixture();
    const gpu = new HoverDifferenceGpu(384, 216);
    const image = new OffscreenCanvas(384, 216);
    expect(gpu.sample(image)).toBeNull();
    const result = gpu.sample(image)!;
    expect([result.width, result.height, result.pixels.length]).toEqual([64, 36, 9216]);
    gpu.sample(image);
    expect(gl.createTexture).toHaveBeenCalledTimes(2);
    expect(gl.readPixels).toHaveBeenCalledTimes(2);
    gpu.reset();
    expect(gpu.sample(image)).toBeNull();
    gpu.dispose();
    gpu.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(() => gpu.sample(image)).toThrow('unavailable');
  });
  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [385, 1],
    [1, 385],
    [NaN, 1],
    [1.1, 1],
  ])('rejects unbounded dimensions %j', (w, h) => {
    fixture();
    expect(() => new HoverDifferenceGpu(w, h)).toThrow(RangeError);
  });
  it('reports missing WebGL, lost contexts, wrong image sizes and readback errors', () => {
    const { gl, getContext } = fixture();
    getContext.mockReturnValueOnce(null!);
    expect(() => new HoverDifferenceGpu(64, 64)).toThrow('WebGL2');
    const gpu = new HoverDifferenceGpu(64, 64);
    const image = new OffscreenCanvas(64, 64);
    expect(() => gpu.sample(new OffscreenCanvas(65, 64))).toThrow(RangeError);
    gl.isContextLost.mockReturnValueOnce(true);
    expect(() => gpu.sample(image)).toThrow('unavailable');
    gpu.sample(image);
    gl.getError.mockReturnValueOnce(1);
    expect(() => gpu.sample(image)).toThrow('sampling failed');
    gpu.dispose();
  });
  it.each(['createProgram', 'createShader', 'createBuffer', 'createTexture'] as const)(
    'cleans up partial allocation when %s fails',
    (method) => {
      const { gl } = fixture();
      gl[method].mockReturnValueOnce(null!);
      expect(() => new HoverDifferenceGpu(64, 64)).toThrow('allocate');
      expect(gl.deleteProgram).toHaveBeenCalled();
    },
  );
  it.each(['getShaderParameter', 'getProgramParameter'] as const)(
    'releases failed shaders/programs after %s',
    (method) => {
      const { gl } = fixture();
      gl[method].mockReturnValue(false);
      expect(() => new HoverDifferenceGpu(64, 64)).toThrow();
      expect(gl.deleteProgram).toHaveBeenCalled();
      expect(gl.deleteShader).toHaveBeenCalled();
    },
  );
});

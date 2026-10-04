import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaterRippleGpu } from './water-ripple-gpu';
import { gpuFixture } from '../gpu/tests/gpu-fixtures';
import { disposeWaterRippleRenderer, screenWithWaterRipples } from '../rendering/render-water-ripple';
import { snapshot, context } from '../rendering/tests/render.test-support';
import { disposeCompositionRenderer, renderCompositionFrame } from '../rendering/render';
import type { CursorWaterRipple } from '@beam/engine/cursor/cursor-ripple-types';

function fixture() {
  const gl = {
    ...gpuFixture().mock,
    MAX_VIEWPORT_DIMS: 2001,
    STATIC_DRAW: 2002,
    TRIANGLES: 2003,
    texSubImage2D: vi.fn(),
    getParameter: vi.fn((key: number) => (key === 2001 ? [8192, 8192] : 8192)),
    getUniformLocation: vi.fn((_p: unknown, name: string) => name as unknown as WebGLUniformLocation | null),
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
const media = () => ({ source: {} as CanvasImageSource, width: 200, height: 100 });
const sample = (patch: Partial<CursorWaterRipple> = {}): CursorWaterRipple => ({
  x: 0.2,
  y: 0.7,
  ageSeconds: 0.3,
  spread: 18,
  intensity: 25,
  durationSeconds: 0.9,
  width: 4,
  ...patch,
});
const waterSnapshot = () => {
  const value = snapshot();
  value.cursor.available = true;
  value.cursor.events = [
    { event: 'button', sessionNs: 0, button: 1, pressed: true, normalizedX: 0.2, normalizedY: 0.7 },
  ];
  value.cursorSettings.clickEffects.left = {
    ...value.cursorSettings.clickEffects.left,
    rippleStyle: 'water',
    rippleEnabled: true,
  };
  return value;
};
afterEach(() => {
  disposeWaterRippleRenderer();
  vi.unstubAllGlobals();
});

describe('water ripple GPU ownership and live pixels', () => {
  it('reuses one surface and texture but uploads mutable source pixels every render', () => {
    const { gl } = fixture();
    const gpu = new WaterRippleGpu();
    const source = media();
    const first = gpu.render(source, [sample()]);
    expect(first.width).toBe(200);
    expect(first.height).toBe(100);
    expect(gl.uniform4fv).toHaveBeenCalledWith('u_ripples[0]', expect.any(Float32Array));
    expect(
      Array.from(
        gl.uniform4fv.mock.calls.findLast((call: unknown[]) => call[0] === 'u_ripples[0]')![1] as Float32Array,
      ).slice(0, 4),
    ).toEqual([expect.closeTo(0.2), expect.closeTo(0.7), expect.closeTo(0.3), 18]);
    expect(gpu.render(source, [sample({ ageSeconds: 0.7 })])).toBe(first);
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(2);
    expect(gl.uniform1i).toHaveBeenCalledWith('u_count', 1);
    gpu.dispose();
  });
  it('resizes storage only when the source dimensions change, with zero or eight waves', () => {
    const { gl } = fixture();
    const gpu = new WaterRippleGpu();
    gpu.render(
      media(),
      Array.from({ length: 8 }, () => sample()),
    );
    expect(gl.uniform1i).toHaveBeenCalledWith('u_count', 8);
    const canvas = gpu.render({ ...media(), width: 3840, height: 2160 }, []);
    expect(canvas.width).toBe(3840);
    expect(canvas.height).toBe(2160);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    expect(gl.uniform1i).toHaveBeenCalledWith('u_count', 0);
    gpu.dispose();
  });
  it.each([
    { width: 0 },
    { height: NaN },
    { width: 1.5 },
    { height: -1 },
    { width: Infinity },
    { width: 8193 },
    { width: 4096, height: 4096 },
  ])('rejects unsupported source dimensions %j before upload', (patch) => {
    const { gl } = fixture();
    const gpu = new WaterRippleGpu();
    expect(() => gpu.render({ ...media(), ...patch }, [sample()])).toThrow('surface limits');
    expect(gl.texSubImage2D).not.toHaveBeenCalled();
    gpu.dispose();
  });
  it('respects the device viewport and texture maximum', () => {
    const { gl } = fixture();
    gl.getParameter.mockImplementation((key: number) => (key === 2001 ? [128, 256] : 4096));
    const gpu = new WaterRippleGpu();
    expect(() => gpu.render(media(), [sample()])).toThrow('surface limits');
    gpu.dispose();
  });
  it.each([
    { x: NaN },
    { y: Infinity },
    { x: -0.1 },
    { y: 1.1 },
    { ageSeconds: NaN },
    { ageSeconds: -1 },
    { ageSeconds: 0.9 },
    { spread: NaN },
    { spread: 0 },
    { spread: 61 },
    { intensity: NaN },
    { intensity: -1 },
    { intensity: 101 },
    { width: Infinity },
    { width: 0 },
    { width: 13 },
    { durationSeconds: NaN },
    { durationSeconds: 0.39 },
    { durationSeconds: 2.41 },
  ])('rejects malformed wave samples %j before upload', (patch) => {
    const { gl } = fixture();
    const gpu = new WaterRippleGpu();
    expect(() => gpu.render(media(), [sample(patch)])).toThrow('samples');
    expect(gl.drawArrays).not.toHaveBeenCalled();
    gpu.dispose();
  });
  it('rejects unbounded simultaneous waves and lost or disposed contexts', () => {
    const { gl } = fixture();
    const gpu = new WaterRippleGpu();
    expect(() =>
      gpu.render(
        media(),
        Array.from({ length: 9 }, () => sample()),
      ),
    ).toThrow('samples');
    gl.isContextLost.mockReturnValue(true);
    expect(() => gpu.render(media(), [sample()])).toThrow('unavailable');
    gl.isContextLost.mockReturnValue(false);
    gpu.dispose();
    gpu.dispose();
    expect(() => gpu.render(media(), [])).toThrow('unavailable');
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gpu.canvas.width).toBe(0);
  });
  it.each(['context', 'program', 'shader', 'compile', 'link', 'buffer', 'texture'] as const)(
    'releases partially initialized resources on %s failure',
    (stage) => {
      const { gl, getContext } = fixture();
      if (stage === 'context') getContext.mockReturnValueOnce(null as never);
      if (stage === 'program') gl.createProgram.mockReturnValueOnce(null as never);
      if (stage === 'shader') gl.createShader.mockReturnValueOnce(null as never);
      if (stage === 'compile') gl.getShaderParameter.mockReturnValueOnce(false);
      if (stage === 'link') gl.getProgramParameter.mockReturnValueOnce(false);
      if (stage === 'buffer') gl.createBuffer.mockReturnValueOnce(null as never);
      if (stage === 'texture') gl.createTexture.mockReturnValueOnce(null as never);
      expect(() => new WaterRippleGpu()).toThrow();
      if (stage !== 'context') expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
      if (['compile', 'link', 'buffer', 'texture'].includes(stage)) expect(gl.deleteShader).toHaveBeenCalled();
    },
  );
  it('supports unavailable optional uniforms and lose-context extensions', () => {
    const { gl } = fixture();
    gl.getUniformLocation.mockReturnValue(null);
    gl.getExtension.mockReturnValue(null as never);
    const gpu = new WaterRippleGpu();
    gpu.render(media(), [sample()]);
    gpu.dispose();
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  });
});

describe('water ripple completed composition', () => {
  it('leaves screen media unchanged without active clicks, enabled presentation or telemetry', () => {
    const { gl } = fixture();
    const source = media();
    const value = waterSnapshot();
    value.cursor.available = false;
    expect(screenWithWaterRipples(source, value, 0.2)).toBe(source);
    value.cursor.available = true;
    value.cursorSettings.enabled = false;
    expect(screenWithWaterRipples(source, value, 0.2)).toBe(source);
    value.cursorSettings.enabled = true;
    expect(screenWithWaterRipples(source, value, 2)).toBe(source);
    expect(gl.createProgram).not.toHaveBeenCalled();
  });
  it('preserves source metadata and disposes/recreates the singleton explicitly', () => {
    const { gl } = fixture();
    const source = media(),
      value = waterSnapshot();
    const first = screenWithWaterRipples(source, value, 0.2);
    expect(first).toMatchObject({ width: 200, height: 100 });
    expect(first.source).not.toBe(source.source);
    expect(screenWithWaterRipples(source, value, 0.6).source).toBe(first.source);
    disposeWaterRippleRenderer();
    disposeWaterRippleRenderer();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(screenWithWaterRipples(source, value, 0.2).source).not.toBe(first.source);
  });
  it('uses source session timing after trims/rate changes and draws no superficial rings', () => {
    const { gl } = fixture();
    const value = waterSnapshot();
    value.composition.assets[0]!.sessionStartMs = 3000;
    value.composition.clips[0]!.sourceInMs = 1000;
    value.composition.clips[0]!.playbackRate = 2;
    value.cursor.events[0]!.sessionNs = 4200_000_000;
    const ctx = context();
    renderCompositionFrame(ctx, media(), value, 0.25);
    const upload = gl.uniform4fv.mock.calls.findLast(
      (call: unknown[]) => call[0] === 'u_ripples[0]',
    )![1] as Float32Array;
    expect(upload[2]).toBeCloseTo(0.3);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(
      expect.any(OffscreenCanvas),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    disposeCompositionRenderer();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
  });
  it('does not allocate GPU resources when screen decoding is absent', () => {
    const { gl } = fixture();
    renderCompositionFrame(context(), null, waterSnapshot(), 0.3);
    expect(gl.createTexture).not.toHaveBeenCalled();
  });
});

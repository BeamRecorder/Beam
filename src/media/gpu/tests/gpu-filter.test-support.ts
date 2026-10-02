import { vi } from 'vitest';
import { gpuFixture } from './gpu-fixtures';
import type { GpuEffectInput } from '../gpu-filter-types';

export const gpuEffectInput = (patch: Partial<GpuEffectInput> = {}): GpuEffectInput => ({
  source: {} as TexImageSource,
  mask: {} as TexImageSource,
  maskPadding: 6,
  width: 100,
  height: 50,
  target: { x: 10, y: 5, width: 80, height: 40 },
  sigma: 0,
  feather: 0,
  mode: 'blur',
  color: [0.8, 0.2, 0.1, 1],
  strength: 50,
  tintOpacity: 20,
  highlight: [1, 1, 1, 0.5],
  ...patch,
});

export function observeCanvasSizeWrites(canvas: OffscreenCanvas) {
  const size = { width: canvas.width, height: canvas.height };
  const writes: { axis: 'width' | 'height'; value: number }[] = [];
  for (const axis of ['width', 'height'] as const)
    Object.defineProperty(canvas, axis, {
      configurable: true,
      get: () => size[axis],
      set: (value: number) => {
        size[axis] = value;
        writes.push({ axis, value });
      },
    });
  return writes;
}

export function gpuFilterFixture() {
  const fixture = gpuFixture();
  const { gl } = fixture;
  const loseContext = vi.fn();
  const additions = {
    TEXTURE1: gl.TEXTURE0 + 1,
    TRIANGLES: 100,
    RGBA8: 101,
    createVertexArray: vi.fn(() => ({}) as WebGLVertexArrayObject),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),
    uniform1fv: vi.fn(),
    texSubImage2D: vi.fn(),
    texStorage2D: vi.fn(),
    getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => ({ name }) as unknown as WebGLUniformLocation),
    getExtension: vi.fn((name: string) =>
      name === 'WEBGL_lose_context'
        ? { loseContext }
        : name === 'EXT_disjoint_timer_query_webgl2'
          ? { TIME_ELAPSED_EXT: 1001, GPU_DISJOINT_EXT: 1002 }
          : null,
    ),
  };
  Object.assign(gl, additions);
  const draws: {
    target: WebGLTexture | null;
    source: WebGLTexture | null;
    viewport: number[];
    uniforms: Map<string, unknown>;
  }[] = [];
  const slots = new Map<number, WebGLTexture | null>();
  const attachments = new Map<WebGLFramebuffer, WebGLTexture | null>();
  const uniforms = new Map<string, unknown>();
  let unit: number = gl.TEXTURE0;
  let framebuffer: WebGLFramebuffer | null = null;
  let viewport: number[] = [];
  vi.mocked(gl.activeTexture).mockImplementation((next) => {
    unit = next;
  });
  vi.mocked(gl.bindTexture).mockImplementation((_kind, texture) => {
    slots.set(unit, texture);
  });
  vi.mocked(gl.bindFramebuffer).mockImplementation((_kind, next) => {
    framebuffer = next;
  });
  vi.mocked(gl.framebufferTexture2D).mockImplementation((_kind, _attachment, _target, texture) => {
    if (framebuffer) attachments.set(framebuffer, texture);
  });
  vi.mocked(gl.viewport).mockImplementation((...next) => {
    viewport = next;
  });
  const uniformName = (location: WebGLUniformLocation | null) =>
    (location as unknown as { name: string } | null)?.name ?? '';
  vi.mocked(gl.uniform1i).mockImplementation((location, value) => {
    uniforms.set(uniformName(location), value);
  });
  vi.mocked(gl.uniform1f).mockImplementation((location, value) => {
    uniforms.set(uniformName(location), value);
  });
  vi.mocked(gl.uniform2f).mockImplementation((location, ...value) => {
    uniforms.set(uniformName(location), value);
  });
  vi.mocked(gl.uniform4f).mockImplementation((location, ...value) => {
    uniforms.set(uniformName(location), value);
  });
  vi.mocked(gl.uniform4fv).mockImplementation((location, value) => {
    uniforms.set(uniformName(location), Array.from(value));
  });
  vi.mocked(gl.uniform1fv).mockImplementation((location, value) => {
    uniforms.set(uniformName(location), Array.from(value));
  });
  const recordDraw = () => {
    const target = framebuffer ? (attachments.get(framebuffer) ?? null) : null;
    if (target && Array.from(slots.values()).some((texture) => texture === target))
      throw new Error('GPU feedback loop');
    draws.push({
      target,
      source: slots.get(gl.TEXTURE0) ?? null,
      viewport: [...viewport],
      uniforms: new Map(uniforms),
    });
  };
  vi.mocked(gl.drawArrays).mockImplementation(recordDraw);
  vi.mocked(gl.drawArraysInstanced).mockImplementation(recordDraw);
  return { ...fixture, mock: Object.assign(fixture.mock, additions), draws, loseContext };
}

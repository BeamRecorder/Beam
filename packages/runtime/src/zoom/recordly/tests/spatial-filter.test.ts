// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { RecordlySpatialFilter } from '../spatial-filter';
import type { RecordlyFrameEffect } from '@beam/engine/zoom/experimental/recordly-camera-types';

afterEach(() => vi.unstubAllGlobals());
function host() {
  const events = new Map<string, () => void>();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    MAX_TEXTURE_SIZE: 5,
    NO_ERROR: 0,
    FRAMEBUFFER_COMPLETE: 6,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => 'bad GLSL'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => 'bad link'),
    deleteProgram: vi.fn(),
    createTexture: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    createFramebuffer: vi.fn(() => ({})),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteFramebuffer: vi.fn(),
    isContextLost: vi.fn(() => false),
    getParameter: vi.fn(() => 8192),
    disable: vi.fn(),
    clearColor: vi.fn(),
    pixelStorei: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 6),
    clear: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => name),
    uniform4f: vi.fn(),
    uniform1f: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    viewport: vi.fn(),
    uniform2f: vi.fn(),
    drawArrays: vi.fn(),
    getError: vi.fn(() => 0),
  };
  const getContext = vi.fn(() => gl);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext = getContext;
      addEventListener(name: string, callback: () => void) {
        events.set(name, callback);
      }
    },
  );
  return { gl, getContext, events };
}
const source = (width = 96, height = 64) => ({ width, height }) as OffscreenCanvas;
const effect = (): RecordlyFrameEffect => ({
  transform: { scale: 1, x: 0, y: 0 },
  width: 96,
  height: 64,
  pan: { velocity: { x: 8, y: 3 }, kernelSize: 13, offset: -0.25 },
  zoom: { center: { x: 28, y: 24 }, strength: 0, innerRadius: 0, radius: -1 },
});

it('reuses GPU allocations in a pool bucket and disposes both passes and framebuffer', () => {
  const { gl } = host(),
    filter = new RecordlySpatialFilter();
  filter.draw(source(), effect());
  filter.draw(source(), effect());
  expect(gl.createTexture).toHaveBeenCalledTimes(2);
  expect(gl.texImage2D).toHaveBeenCalledTimes(2);
  expect(gl.texSubImage2D).toHaveBeenCalledTimes(2);
  expect(gl.drawArrays).toHaveBeenCalledTimes(4);
  filter.draw(source(200, 100), effect());
  expect(gl.texImage2D).toHaveBeenCalledTimes(4);
  filter.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
  expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
  expect(filter.canvas.width).toBe(0);
});
it('retains the inactive directional pass while radial blur runs', () => {
  const { gl } = host(),
    filter = new RecordlySpatialFilter(),
    input = effect();
  input.pan.velocity = { x: 0, y: 0 };
  input.zoom.strength = 0.16;
  filter.draw(source(), input);
  expect(gl.uniform1i).toHaveBeenCalledWith('uKernelSize', 0);
  expect(gl.uniform1f).toHaveBeenCalledWith('uStrength', 0.16);
  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  filter.dispose();
});
it.each(['native', 'event'])('fails explicitly on lost context from %s without drawing', (kind) => {
  const { gl, events } = host(),
    filter = new RecordlySpatialFilter();
  if (kind === 'native') gl.isContextLost.mockReturnValue(true);
  else events.get('webglcontextlost')!();
  expect(() => filter.draw(source(), effect())).toThrow('context lost');
  expect(gl.drawArrays).not.toHaveBeenCalled();
  filter.dispose();
});
it.each([100000, 5000])('rejects padded stages exceeding memory or hardware limits: %i', (width) => {
  const { gl } = host(),
    filter = new RecordlySpatialFilter();
  if (width === 5000) gl.getParameter.mockReturnValue(1024);
  expect(() => filter.draw(source(width, 1000), effect())).toThrow('texture limit');
  expect(gl.texImage2D).not.toHaveBeenCalled();
  filter.dispose();
});
it('reports missing WebGL2 without fabricating a successful filter', () => {
  const { getContext } = host();
  getContext.mockReturnValue(null as never);
  expect(() => new RecordlySpatialFilter()).toThrow('requires WebGL2');
});
it('releases the vertex shader when fragment compilation fails', () => {
  const { gl } = host();
  gl.getShaderParameter.mockReturnValueOnce(true).mockReturnValueOnce(false);
  expect(() => new RecordlySpatialFilter()).toThrow('bad GLSL');
  expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  expect(gl.createProgram).not.toHaveBeenCalled();
});
it('releases linked resources when program linking fails', () => {
  const { gl } = host();
  gl.getProgramParameter.mockReturnValue(false);
  expect(() => new RecordlySpatialFilter()).toThrow('bad link');
  expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
});
it.each(['createShader', 'createProgram', 'createTexture', 'createBuffer', 'createFramebuffer'] as const)(
  'reports failed allocation at %s and never draws',
  (method) => {
    const { gl } = host();
    gl[method].mockReturnValueOnce(null as never);
    expect(() => new RecordlySpatialFilter()).toThrow('allocate Recordly');
    expect(gl.drawArrays).not.toHaveBeenCalled();
  },
);
it('releases the completed pan resources if the radial program cannot be created', () => {
  const { gl } = host();
  gl.createProgram.mockReturnValueOnce({}).mockReturnValueOnce(null as never);
  expect(() => new RecordlySpatialFilter()).toThrow('program');
  expect(gl.deleteTexture).toHaveBeenCalledOnce();
  expect(gl.deleteBuffer).toHaveBeenCalledOnce();
});
it('reports framebuffer and draw failures instead of returning empty encoded pixels', () => {
  const { gl } = host(),
    filter = new RecordlySpatialFilter();
  gl.checkFramebufferStatus.mockReturnValue(99);
  expect(() => filter.draw(source(), effect())).toThrow('incomplete');
  gl.checkFramebufferStatus.mockReturnValue(6);
  gl.getError.mockReturnValue(1282);
  expect(() => filter.draw(source(), effect())).toThrow('WebGL 1282');
  filter.dispose();
});

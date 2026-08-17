import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import WebsiteCommunityShader from './WebsiteCommunityShader.vue';

type WebGlMock = {
  [key: string]: ReturnType<typeof vi.fn> | number;
};

const createWebGlMock = (): WebGlMock => {
  const gl: WebGlMock = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    uniform3fv: vi.fn(),
    uniform4f: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  };
  return gl;
};

describe('WebsiteCommunityShader', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;
  let gl: WebGlMock;
  let rafs: FrameRequestCallback[];
  let resizeDisconnect: ReturnType<typeof vi.fn>;
  let intersectionDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gl = createWebGlMock();
    rafs = [];
    resizeDisconnect = vi.fn();
    intersectionDisconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = resizeDisconnect;
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = intersectionDisconnect;
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind) => {
      if (kind === 'webgl') return gl as unknown as WebGLRenderingContext;
      return null;
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      rafs.push(callback);
      return rafs.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('requestAnimationFrame', originalRaf);
    vi.stubGlobal('cancelAnimationFrame', originalCancelRaf);
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('renders a native WebGL canvas and requests the WebGL context', () => {
    const wrapper = mount(WebsiteCommunityShader);
    const canvas = wrapper.get('canvas');

    expect(canvas.attributes('aria-hidden')).toBe('true');
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('webgl', expect.anything());
    expect(gl.createProgram).toHaveBeenCalled();
    rafs[0]?.(performance.now());
    expect(gl.drawArrays).toHaveBeenCalled();
  });

  it('renders an accessible static fallback when WebGL is unavailable', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const wrapper = mount(WebsiteCommunityShader);
    await nextTick();

    expect(wrapper.get('canvas').classes()).toContain('community-shader--fallback');
  });

  it('does not schedule a continuous animation when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })));
    mount(WebsiteCommunityShader);

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(rafs).toHaveLength(1);
  });

  it('cleans up observers, animation frames, listeners, and WebGL resources', () => {
    const wrapper = mount(WebsiteCommunityShader);
    wrapper.unmount();

    expect(resizeDisconnect).toHaveBeenCalled();
    expect(intersectionDisconnect).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(gl.deleteBuffer).toHaveBeenCalled();
    expect(gl.deleteProgram).toHaveBeenCalled();
  });
});

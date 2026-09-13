import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireBlickWaveformRenderer, waveformTexture } from '../blick-waveform-renderer';
import type { BlickWaveformData, BlickWaveformRenderer } from '../blick-waveform-types';

type FakeContext2D = {
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};
type GlOptions = {
  createProgramFailsAt?: number;
  createTextureFailsAt?: number;
  createFramebufferFails?: boolean;
  createShaderFailsAt?: number;
  compileStatus?: boolean;
  compileFailsAt?: number;
  shaderInfoLog?: string | null;
  linkStatus?: boolean;
  linkFailsAt?: number;
  programInfoLog?: string | null;
  framebufferComplete?: boolean;
  maxTextureSize?: number;
  contextLost?: boolean;
  loseContextExtension?: boolean;
};

const makeGl = (options: GlOptions = {}) => {
  const constants = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    TEXTURE_2D: 3553,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    NEAREST: 9728,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    CLAMP_TO_EDGE: 33071,
    MAX_TEXTURE_SIZE: 3379,
    RGBA32F: 34836,
    RGBA8: 32856,
    RGBA: 6408,
    FLOAT: 5126,
    UNSIGNED_BYTE: 5121,
    FRAMEBUFFER: 36160,
    COLOR_ATTACHMENT0: 36064,
    FRAMEBUFFER_COMPLETE: 36053,
    COLOR_BUFFER_BIT: 16384,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
  };
  let programCount = 0;
  let textureCount = 0;
  let shaderCount = 0;
  let compileCount = 0;
  let linkCount = 0;
  const calls = {
    createProgram: vi.fn(() => {
      programCount += 1;
      return options.createProgramFailsAt === programCount ? null : ({ id: programCount } as unknown as WebGLProgram);
    }),
    createTexture: vi.fn(() => {
      textureCount += 1;
      return options.createTextureFailsAt === textureCount ? null : ({ id: textureCount } as unknown as WebGLTexture);
    }),
    createFramebuffer: vi.fn(() => (options.createFramebufferFails ? null : ({} as WebGLFramebuffer))),
    createShader: vi.fn((type: number) => {
      shaderCount += 1;
      return options.createShaderFailsAt === shaderCount ? null : ({ type, id: shaderCount } as unknown as WebGLShader);
    }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => {
      compileCount += 1;
      return options.compileFailsAt === compileCount ? false : (options.compileStatus ?? true);
    }),
    getShaderInfoLog: vi.fn(() => options.shaderInfoLog ?? null),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => {
      linkCount += 1;
      return options.linkFailsAt === linkCount ? false : (options.linkStatus ?? true);
    }),
    getProgramInfoLog: vi.fn(() => options.programInfoLog ?? null),
    useProgram: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    uniform1i: vi.fn(),
    getUniformLocation: vi.fn((_program: WebGLProgram, name: string) => ({ name }) as WebGLUniformLocation),
    getParameter: vi.fn((name: number) => (name === constants.MAX_TEXTURE_SIZE ? (options.maxTextureSize ?? 8192) : 0)),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    getExtension: vi.fn((name: string) =>
      name === 'WEBGL_lose_context' && options.loseContextExtension !== false ? { loseContext } : null,
    ),
    isContextLost: vi.fn(() => options.contextLost ?? false),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => (options.framebufferComplete === false ? 0 : constants.FRAMEBUFFER_COMPLETE)),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    uniform1f: vi.fn(),
    drawArrays: vi.fn(),
    drawArraysInstanced: vi.fn(),
  };
  const loseContext = vi.fn();
  const context = { ...constants, ...calls } as unknown as WebGL2RenderingContext;
  return { context, calls, loseContext };
};

const makeData = (bars: readonly number[] = [19, 38], bands?: Float32Array): BlickWaveformData => ({
  bars,
  bands: bands ?? new Float32Array(bars.length * 4).fill(0.25),
  sourceDurationSeconds: 2,
  loadingSegments: [],
});

const expectCloseArray = (actual: Float32Array, expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 6));
};

let fakeGl: ReturnType<typeof makeGl>;
let webglContext: WebGL2RenderingContext | null;
let context2d: FakeContext2D | null;
let acquired: BlickWaveformRenderer[];
let target: HTMLCanvasElement;
const originalDevicePixelRatio = window.devicePixelRatio;

const trackAcquisition = () => {
  const renderer = acquireBlickWaveformRenderer();
  acquired.push(renderer);
  return renderer;
};

beforeEach(() => {
  fakeGl = makeGl();
  webglContext = fakeGl.context;
  context2d = { clearRect: vi.fn(), drawImage: vi.fn() };
  acquired = [];
  target = document.createElement('canvas');
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
    if (contextId === 'webgl2') return webglContext as never;
    if (contextId === '2d') return context2d as never;
    return null as never;
  });
});

afterEach(() => {
  acquired.forEach((renderer) => renderer.dispose());
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: originalDevicePixelRatio });
  vi.restoreAllMocks();
});

describe('waveformTexture', () => {
  it('packs the master waveform and all four real frequency bands into two RGBA rows', () => {
    const data = makeData([19, 38, 76], new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.8, 0.7, 0.6]));

    const texture = waveformTexture(data);

    expect(texture).toHaveLength(24);
    expect([...texture.slice(0, 12)]).toEqual([0.5, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
    expectCloseArray(texture.slice(12), [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.8, 0.7, 0.6]);
  });

  it('masks pending segments and clamps or clears invalid amplitudes and bands', () => {
    const data = makeData(
      [Number.NaN, -38, 38, Number.POSITIVE_INFINITY],
      new Float32Array([
        0.1,
        0.2,
        0.3,
        0.4,
        -1,
        2,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        0.5,
        0.6,
        0.7,
        0.8,
        0.9,
        0.8,
        0.7,
        0.6,
      ]),
    );
    data.loadingSegments = [
      { leftPercent: 0, widthPercent: 25 },
      { leftPercent: 50, widthPercent: 25 },
    ];

    const texture = waveformTexture(data);

    expect([...texture.slice(0, 16)]).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
    expectCloseArray(texture.slice(16), [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.9, 0.8, 0.7, 0.6]);
  });

  it('returns an empty texture for an empty waveform', () => {
    expect(waveformTexture(makeData([], new Float32Array()))).toEqual(new Float32Array());
  });
});

describe('Blick waveform WebGL renderer', () => {
  it('shares one GPU resource across consumers and disposes it after the last release', () => {
    const first = trackAcquisition();
    const second = trackAcquisition();
    expect(fakeGl.calls.createProgram).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.createTexture).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.createFramebuffer).toHaveBeenCalledOnce();

    first.dispose();
    first.dispose();
    expect(fakeGl.calls.deleteProgram).not.toHaveBeenCalled();
    expect(fakeGl.loseContext).not.toHaveBeenCalled();

    second.draw(target, makeData(), 100, 30);
    expect(fakeGl.calls.drawArrays).toHaveBeenCalledOnce();
    expect(fakeGl.calls.drawArraysInstanced).toHaveBeenCalledOnce();
    second.dispose();
    second.dispose();
    expect(fakeGl.calls.deleteProgram).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.deleteTexture).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(fakeGl.calls.deleteShader).toHaveBeenCalledTimes(4);
    expect(fakeGl.loseContext).toHaveBeenCalledOnce();

    const replacement = trackAcquisition();
    expect(fakeGl.calls.createProgram).toHaveBeenCalledTimes(4);
    replacement.dispose();
    expect(fakeGl.loseContext).toHaveBeenCalledTimes(2);
  });

  it('resizes backing canvases for capped device pixel ratio and uploads each texture width once', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const renderer = trackAcquisition();
    const wideTarget = document.createElement('canvas');
    const data = makeData([10, 20], new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));

    renderer.draw(wideTarget, data, 5000, 40);
    renderer.draw(wideTarget, data, 5000, 40);
    expect(wideTarget.width).toBe(8192);
    expect(wideTarget.height).toBe(80);
    expect(context2d?.clearRect).toHaveBeenCalledWith(0, 0, 8192, 80);
    expect(fakeGl.calls.texImage2D).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.texSubImage2D).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.texSubImage2D.mock.calls[0]?.[8]).toEqual(waveformTexture(data));
    expect(fakeGl.calls.viewport).toHaveBeenCalledWith(0, 0, 4097, 1);
    expect(fakeGl.calls.viewport).toHaveBeenCalledWith(0, 0, 8192, 80);
    expect(fakeGl.calls.uniform1f).toHaveBeenCalledWith(expect.objectContaining({ name: 'uColumns' }), 4096);
    expect(fakeGl.calls.drawArraysInstanced).toHaveBeenCalledWith(fakeGl.context.TRIANGLE_STRIP, 0, 8194, 4);
    expect(fakeGl.calls.drawArrays).toHaveBeenCalledWith(fakeGl.context.TRIANGLES, 0, 3);
    expect(context2d?.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0);

    renderer.draw(wideTarget, makeData([10, 20, 30]), 50, 20);
    expect(fakeGl.calls.texImage2D).toHaveBeenCalledTimes(4);
    expect(fakeGl.calls.texSubImage2D).toHaveBeenCalledTimes(3);
  });

  it('uses a ratio of one when the device pixel ratio is zero and clears empty data', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    const renderer = trackAcquisition();
    renderer.draw(target, makeData([], new Float32Array()), 16, 8);

    expect(target.width).toBe(16);
    expect(target.height).toBe(8);
    expect(context2d?.clearRect).toHaveBeenCalledWith(0, 0, 16, 8);
    expect(fakeGl.calls.texImage2D).not.toHaveBeenCalled();
    expect(fakeGl.calls.drawArraysInstanced).not.toHaveBeenCalled();
  });

  it('keeps the displayed bitmap until the replacement render is ready', () => {
    const renderer = trackAcquisition();
    renderer.draw(target, makeData(), 100, 30);
    context2d!.clearRect.mockClear();
    context2d!.drawImage.mockClear();
    fakeGl.calls.drawArraysInstanced.mockImplementationOnce(() => {
      expect(target.width).toBe(100);
      expect(target.height).toBe(30);
      expect(context2d!.clearRect).not.toHaveBeenCalled();
      throw new Error('render interrupted');
    });
    expect(() => renderer.draw(target, makeData(), 200, 40)).toThrow('render interrupted');
    expect(target.width).toBe(100);
    expect(target.height).toBe(30);
    expect(context2d!.drawImage).not.toHaveBeenCalled();
    renderer.draw(target, makeData(), 200, 40);
    expect(target.width).toBe(200);
    expect(context2d!.drawImage).toHaveBeenCalledOnce();
  });

  it('fails clearly for a lost context, a missing 2D target, or malformed waveform data', () => {
    const renderer = trackAcquisition();
    fakeGl.calls.isContextLost.mockReturnValue(true);
    expect(() => renderer.draw(target, makeData(), 100, 30)).toThrow('The audio waveform GPU context was lost.');
    fakeGl.calls.isContextLost.mockReturnValue(false);

    context2d = null;
    expect(() => renderer.draw(target, makeData(), 100, 30)).toThrow('The audio waveform canvas is unavailable.');
    context2d = { clearRect: vi.fn(), drawImage: vi.fn() };

    renderer.dispose();
    fakeGl = makeGl({ maxTextureSize: 2 });
    webglContext = fakeGl.context;
    const limitedRenderer = trackAcquisition();
    expect(() => limitedRenderer.draw(target, makeData([1, 2, 3]), 100, 30)).toThrow('Invalid audio waveform data.');
    expect(() => limitedRenderer.draw(target, makeData([1], new Float32Array([0.1])), 100, 30)).toThrow(
      'Invalid audio waveform data.',
    );

    limitedRenderer.dispose();
    fakeGl = makeGl({ framebufferComplete: false });
    webglContext = fakeGl.context;
    const framebufferFailure = trackAcquisition();
    expect(() => framebufferFailure.draw(target, makeData(), 100, 30)).toThrow(
      'The waveform envelope framebuffer is unavailable.',
    );
    expect(fakeGl.calls.drawArrays).not.toHaveBeenCalled();
  });

  it('rejects when WebGL2 or renderer allocations are unavailable and releases partial resources', () => {
    webglContext = null;
    expect(() => acquireBlickWaveformRenderer()).toThrow('WebGL2 is unavailable for audio waveforms.');

    fakeGl = makeGl({ createProgramFailsAt: 1 });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('Could not allocate the waveform renderer.');
    expect(fakeGl.calls.deleteProgram).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.deleteTexture).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(fakeGl.loseContext).toHaveBeenCalledOnce();

    fakeGl = makeGl({ createTextureFailsAt: 2 });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('Could not allocate the waveform renderer.');
    expect(fakeGl.calls.deleteProgram).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.deleteTexture).toHaveBeenCalledTimes(2);

    fakeGl = makeGl({ createFramebufferFails: true });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('Could not allocate the waveform renderer.');
    expect(fakeGl.calls.deleteFramebuffer).toHaveBeenCalledOnce();
  });

  it('cleans up when shader allocation or compilation fails', () => {
    fakeGl = makeGl({ createShaderFailsAt: 2 });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('Could not allocate a waveform shader.');
    expect(fakeGl.calls.deleteShader).toHaveBeenCalledOnce();
    expect(fakeGl.calls.deleteProgram).toHaveBeenCalledTimes(2);
    expect(fakeGl.loseContext).toHaveBeenCalledOnce();

    fakeGl = makeGl({ compileStatus: false, shaderInfoLog: 'shader rejected' });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('shader rejected');
    expect(fakeGl.calls.deleteShader).toHaveBeenCalledOnce();

    fakeGl = makeGl({ compileStatus: false });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('Waveform shader compilation failed.');
  });

  it('cleans up when program linking fails and tolerates contexts without a loss extension', () => {
    fakeGl = makeGl({ linkStatus: false, programInfoLog: 'program rejected', loseContextExtension: false });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('program rejected');
    expect(fakeGl.calls.deleteShader).toHaveBeenCalledTimes(4);
    expect(fakeGl.calls.deleteProgram).toHaveBeenCalledTimes(2);
    expect(fakeGl.calls.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(fakeGl.loseContext).not.toHaveBeenCalled();

    fakeGl = makeGl({ linkStatus: false });
    webglContext = fakeGl.context;
    expect(() => acquireBlickWaveformRenderer()).toThrow('Waveform shader linking failed.');
  });
});

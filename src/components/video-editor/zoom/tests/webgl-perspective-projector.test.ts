import { describe, expect, it, vi } from 'vitest';
import { PerspectiveSceneCompositor } from '../perspective-scene-compositor';
import { WebGlPerspectiveProjector, type PerspectiveCanvas } from '../webgl-perspective-projector';

type Listener = (event: Event) => void;

const createWebGlMock = () => {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    DYNAMIC_DRAW: 6,
    STATIC_DRAW: 7,
    FLOAT: 8,
    TEXTURE0: 9,
    TEXTURE_2D: 10,
    TEXTURE_WRAP_S: 11,
    TEXTURE_WRAP_T: 12,
    CLAMP_TO_EDGE: 13,
    TEXTURE_MIN_FILTER: 14,
    TEXTURE_MAG_FILTER: 15,
    LINEAR: 16,
    UNPACK_FLIP_Y_WEBGL: 17,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 18,
    RGBA: 19,
    UNSIGNED_BYTE: 20,
    TRIANGLE_STRIP: 21,
    BLEND: 22,
    DEPTH_TEST: 23,
    COLOR_BUFFER_BIT: 24,
    createShader: vi.fn((kind: number) => ({ kind })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    deleteTexture: vi.fn(),
    getAttribLocation: vi.fn((_program: WebGLProgram, name: string) => (name === 'a_position' ? 0 : 1)),
    viewport: vi.fn(),
    disable: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    uniform1i: vi.fn(),
    drawArrays: vi.fn(),
    flush: vi.fn(),
    isContextLost: vi.fn(() => false),
  } as unknown as WebGLRenderingContext;
  return gl;
};

const createCanvas = (gl: WebGLRenderingContext | null = createWebGlMock()) => {
  let lostListener: Listener | undefined;
  let restoredListener: Listener | undefined;
  const canvas = {
    width: 1,
    height: 1,
    getContext: vi.fn((kind: string) => (kind === 'webgl' ? gl : null)),
    addEventListener: vi.fn((kind: string, listener: Listener) => {
      if (kind === 'webglcontextlost') lostListener = listener;
      if (kind === 'webglcontextrestored') restoredListener = listener;
    }),
    removeEventListener: vi.fn(),
    loseContext: () => {
      const preventDefault = vi.fn();
      lostListener?.({ preventDefault } as unknown as Event);
      return preventDefault;
    },
    restoreContext: () => restoredListener?.(new Event('webglcontextrestored')),
  };
  return canvas;
};

const create2dContext = () =>
  ({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }) as unknown as CanvasRenderingContext2D;

describe('WebGlPerspectiveProjector', () => {
  it('renders one reusable textured quad with the requested dimensions', () => {
    const gl = createWebGlMock();
    const canvas = createCanvas(gl);
    const projector = new WebGlPerspectiveProjector(() => canvas as unknown as PerspectiveCanvas);

    expect(projector.render({} as TexImageSource, 320, 180, { tiltX: 0.1, tiltY: -0.08 })).toBe(canvas);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 320, 180);
    expect(gl.texSubImage2D).toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLE_STRIP, 0, 4);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);

    projector.render({} as TexImageSource, 320, 180, { tiltX: 0.05, tiltY: 0 });
    expect(gl.texImage2D).toHaveBeenCalledOnce();

    projector.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
  });

  it('configures static GPU state once and avoids synchronous flushes on repeated frames', () => {
    const gl = createWebGlMock();
    const projector = new WebGlPerspectiveProjector(() => createCanvas(gl) as unknown as PerspectiveCanvas);
    const source = {} as TexImageSource;

    projector.render(source, 320, 180, { tiltX: 0.1, tiltY: -0.08 });
    projector.render(source, 320, 180, { tiltX: 0.05, tiltY: 0.02 });

    expect(gl.createProgram).toHaveBeenCalledOnce();
    expect(gl.createBuffer).toHaveBeenCalledTimes(2);
    expect(gl.createTexture).toHaveBeenCalledOnce();
    expect(gl.texImage2D).toHaveBeenCalledOnce();
    expect(gl.getUniformLocation).toHaveBeenCalledOnce();
    expect(gl.texParameteri).toHaveBeenCalledTimes(4);
    expect(gl.pixelStorei).toHaveBeenCalledTimes(2);
    expect(gl.flush).not.toHaveBeenCalled();
    expect(vi.mocked(gl.bufferData).mock.calls.filter(([, , usage]) => usage === gl.STATIC_DRAW)).toHaveLength(1);

    projector.dispose();
  });

  it('fails explicitly when WebGL is unavailable or shader setup fails', () => {
    expect(() => new WebGlPerspectiveProjector(() => createCanvas(null) as unknown as PerspectiveCanvas)).toThrow(
      'WebGL is required for perspective zoom rendering.',
    );

    const gl = createWebGlMock();
    vi.mocked(gl.getShaderParameter).mockReturnValue(false);
    vi.mocked(gl.getShaderInfoLog).mockReturnValue('synthetic shader error');
    expect(() => new WebGlPerspectiveProjector(() => createCanvas(gl) as unknown as PerspectiveCanvas)).toThrow(
      'Perspective zoom shader compilation failed: synthetic shader error',
    );
  });

  it('reports every GPU resource initialization failure', () => {
    const createProjector = (configure: (gl: WebGLRenderingContext) => void) => {
      const gl = createWebGlMock();
      configure(gl);
      return () => new WebGlPerspectiveProjector(() => createCanvas(gl) as unknown as PerspectiveCanvas);
    };

    expect(createProjector((gl) => vi.mocked(gl.createShader).mockReturnValueOnce(null))).toThrow(
      'Unable to allocate a WebGL shader for perspective zoom.',
    );
    expect(
      createProjector((gl) => {
        vi.mocked(gl.getShaderParameter).mockReturnValue(false);
        vi.mocked(gl.getShaderInfoLog).mockReturnValue(null);
      }),
    ).toThrow('Perspective zoom shader compilation failed: Unknown shader compilation error.');
    expect(
      createProjector((gl) => vi.mocked(gl.createProgram).mockReturnValue(null as unknown as WebGLProgram)),
    ).toThrow('Unable to allocate the perspective zoom WebGL program.');
    expect(
      createProjector((gl) => {
        vi.mocked(gl.getProgramParameter).mockReturnValue(false);
        vi.mocked(gl.getProgramInfoLog).mockReturnValue(null);
      }),
    ).toThrow('Perspective zoom shader link failed: Unknown shader link error.');
    expect(
      createProjector((gl) => vi.mocked(gl.createTexture).mockReturnValue(null as unknown as WebGLTexture)),
    ).toThrow('Unable to allocate perspective zoom GPU resources.');
  });

  it('detects a context reported lost by WebGL itself', () => {
    const gl = createWebGlMock();
    vi.mocked(gl.isContextLost).mockReturnValue(true);
    const projector = new WebGlPerspectiveProjector(() => createCanvas(gl) as unknown as PerspectiveCanvas);

    expect(() => projector.render({} as TexImageSource, 10, 10, { tiltX: 0.1, tiltY: 0 })).toThrow(
      'Perspective zoom WebGL context was lost.',
    );
    projector.dispose();
  });

  it('surfaces context loss and recreates resources after restoration', () => {
    const gl = createWebGlMock();
    const canvas = createCanvas(gl);
    const projector = new WebGlPerspectiveProjector(() => canvas as unknown as PerspectiveCanvas);
    const preventDefault = canvas.loseContext();

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(() => projector.render({} as TexImageSource, 10, 10, { tiltX: 0.1, tiltY: 0 })).toThrow(
      'Perspective zoom WebGL context was lost.',
    );

    canvas.restoreContext();
    expect(() => projector.render({} as TexImageSource, 10, 10, { tiltX: 0.1, tiltY: 0 })).not.toThrow();
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    projector.dispose();
  });
});

describe('PerspectiveSceneCompositor', () => {
  it('caps an oversized preview pixel scale at 1.25 while preserving logical output bounds', () => {
    const gl = createWebGlMock();
    const canvases: ReturnType<typeof createCanvas>[] = [];
    const surfaceContext = create2dContext();
    const canvasFactory = (width: number, height: number) => {
      const canvas = createCanvas(gl);
      canvas.width = width;
      canvas.height = height;
      vi.mocked(canvas.getContext).mockImplementation((kind: string) => (kind === '2d' ? surfaceContext : gl));
      canvases.push(canvas);
      return canvas as unknown as PerspectiveCanvas;
    };
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width: number;
        height: number;

        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          Object.assign(this, canvasFactory(width, height));
        }
      },
    );
    const compositor = new PerspectiveSceneCompositor();
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

    try {
      compositor.render({
        target,
        bounds: { x: 11, y: 13, width: 160, height: 90 },
        pixelScale: 2,
        draw: () => ({ tiltX: 0, tiltY: 0 }),
      });

      expect(canvases[0]).toMatchObject({ width: 200, height: 113 });
      expect(surfaceContext.setTransform).toHaveBeenLastCalledWith(1.25, 0, 0, 1.25, -13.75, -16.25);
      expect(target.drawImage).toHaveBeenCalledWith(canvases[0], 11, 13, 160, 90);
    } finally {
      compositor.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('bypasses GPU projection for a flat scene and draws the 2D surface directly', () => {
    const gl = createWebGlMock();
    const canvases: ReturnType<typeof createCanvas>[] = [];
    const surfaceContext = create2dContext();
    const canvasFactory = (width: number, height: number) => {
      const canvas = createCanvas(gl);
      canvas.width = width;
      canvas.height = height;
      vi.mocked(canvas.getContext).mockImplementation((kind: string) => (kind === '2d' ? surfaceContext : gl));
      canvases.push(canvas);
      return canvas as unknown as PerspectiveCanvas;
    };
    const compositor = new PerspectiveSceneCompositor();
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

    // The compositor uses the projector's default canvas factory, so a flat render
    // must never allocate a WebGL canvas or ask the target to draw a projected one.
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width: number;
        height: number;

        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          const canvas = canvasFactory(width, height);
          Object.assign(this, canvas);
        }
      },
    );
    try {
      compositor.render({
        target,
        bounds: { x: 5, y: 7, width: 100, height: 50 },
        pixelScale: 1,
        draw: (context) => {
          expect(context).toBe(surfaceContext);
          return { tiltX: 0, tiltY: 0 };
        },
      });
      expect(canvases).toHaveLength(1);
      expect(gl.createProgram).not.toHaveBeenCalled();
      expect(target.drawImage).toHaveBeenCalledWith(canvases[0], 5, 7, 100, 50);
    } finally {
      compositor.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('renders a tilted scene through a GPU projector while keeping the surface draw isolated', () => {
    const gl = createWebGlMock();
    const canvases: Array<{
      width: number;
      height: number;
      getContext: (kind: string) => unknown;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    }> = [];
    const surfaceContext = create2dContext();
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        width: number;
        height: number;

        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          this.getContext = vi.fn((kind: string) => (kind === '2d' ? surfaceContext : gl));
          this.addEventListener = vi.fn();
          this.removeEventListener = vi.fn();
          canvases.push(this);
        }

        getContext: (kind: string) => unknown;
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
      },
    );
    const compositor = new PerspectiveSceneCompositor();
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

    try {
      compositor.render({
        target,
        bounds: { x: 0, y: 0, width: 160, height: 90 },
        pixelScale: 2,
        draw: (context) => {
          expect(context).toBe(surfaceContext);
          return { tiltX: 0.12, tiltY: -0.08 };
        },
      });
      expect(canvases).toHaveLength(2);
      expect(gl.createProgram).toHaveBeenCalledOnce();
      expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLE_STRIP, 0, 4);
      expect(target.drawImage).toHaveBeenCalledWith(canvases[1], 0, 0, 160, 90);
    } finally {
      compositor.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('resizes its reusable staging surface and fails explicitly without Canvas2D', () => {
    const surfaceContext = create2dContext();
    const surface = createCanvas();
    vi.mocked(surface.getContext).mockImplementation((kind: string) => (kind === '2d' ? surfaceContext : null));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {
          return surface;
        }
      },
    );
    const compositor = new PerspectiveSceneCompositor();
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

    try {
      compositor.render({
        target,
        bounds: { x: 0, y: 0, width: 20, height: 10 },
        pixelScale: 1,
        draw: () => ({ tiltX: 0, tiltY: 0 }),
      });
      compositor.render({
        target,
        bounds: { x: 0, y: 0, width: 40, height: 30 },
        pixelScale: 1,
        draw: () => ({ tiltX: 0, tiltY: 0 }),
      });
      expect(surface.width).toBe(40);
      expect(surface.height).toBe(30);
    } finally {
      compositor.dispose();
      vi.unstubAllGlobals();
    }

    const missingContextSurface = createCanvas();
    vi.mocked(missingContextSurface.getContext).mockReturnValue(null);
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {
          return missingContextSurface;
        }
      },
    );
    try {
      expect(() =>
        new PerspectiveSceneCompositor().render({
          target,
          bounds: { x: 0, y: 0, width: 20, height: 10 },
          pixelScale: 1,
          draw: () => ({ tiltX: 0, tiltY: 0 }),
        }),
      ).toThrow('Canvas2D is required to compose a perspective zoom scene.');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('creates an HTML canvas when OffscreenCanvas is unavailable', () => {
    const surface = createCanvas();
    const surfaceContext = create2dContext();
    vi.mocked(surface.getContext).mockImplementation((kind: string) => (kind === '2d' ? surfaceContext : null));
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(surface as unknown as HTMLCanvasElement);
    vi.stubGlobal('OffscreenCanvas', undefined);
    const compositor = new PerspectiveSceneCompositor();

    try {
      compositor.render({
        target: { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
        bounds: { x: 0, y: 0, width: 20, height: 10 },
        pixelScale: 1,
        draw: () => ({ tiltX: 0, tiltY: 0 }),
      });
      expect(createElement).toHaveBeenCalledWith('canvas');
    } finally {
      compositor.dispose();
      createElement.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

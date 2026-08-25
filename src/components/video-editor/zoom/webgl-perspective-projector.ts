import { createPerspectiveGeometry, type PerspectiveTransform } from './perspective-projection';

export type PerspectiveCanvas = HTMLCanvasElement | OffscreenCanvas;
export type PerspectiveCanvasFactory = (width: number, height: number) => PerspectiveCanvas;

interface WebGlResources {
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  textureBuffer: WebGLBuffer;
  texture: WebGLTexture;
  positionLocation: number;
  textureLocation: number;
}

const VERTEX_SHADER = `
attribute vec4 a_position;
attribute vec2 a_texture;
varying vec2 v_texture;
void main() {
  gl_Position = a_position;
  v_texture = a_texture;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_scene;
varying vec2 v_texture;
void main() {
  gl_FragColor = texture2D(u_scene, v_texture);
}`;

const TEXTURE_COORDINATES = new Float32Array([0, 1, 0, 0, 1, 1, 1, 0]);

const defaultCanvasFactory: PerspectiveCanvasFactory = (width, height) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const compileShader = (gl: WebGLRenderingContext, kind: number, source: string) => {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error('Unable to allocate a WebGL shader for perspective zoom.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(`Perspective zoom shader compilation failed: ${message}`);
  }
  return shader;
};

const createResources = (gl: WebGLRenderingContext): WebGlResources => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate the perspective zoom WebGL program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown shader link error.';
    gl.deleteProgram(program);
    throw new Error(`Perspective zoom shader link failed: ${message}`);
  }
  const positionBuffer = gl.createBuffer();
  const textureBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!positionBuffer || !textureBuffer || !texture) {
    gl.deleteProgram(program);
    throw new Error('Unable to allocate perspective zoom GPU resources.');
  }
  return {
    program,
    positionBuffer,
    textureBuffer,
    texture,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    textureLocation: gl.getAttribLocation(program, 'a_texture'),
  };
};

const configureStaticResources = (gl: WebGLRenderingContext, resources: WebGlResources) => {
  gl.useProgram(resources.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, TEXTURE_COORDINATES, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(resources.textureLocation);
  gl.vertexAttribPointer(resources.textureLocation, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, resources.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.uniform1i(gl.getUniformLocation(resources.program, 'u_scene'), 0);
};

export class WebGlPerspectiveProjector {
  readonly canvas: PerspectiveCanvas;
  private readonly gl: WebGLRenderingContext;
  private resources: WebGlResources;
  private textureWidth = 0;
  private textureHeight = 0;
  private lost = false;

  constructor(factory: PerspectiveCanvasFactory = defaultCanvasFactory) {
    this.canvas = factory(1, 1);
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('WebGL is required for perspective zoom rendering.');
    this.gl = gl;
    this.resources = createResources(gl);
    configureStaticResources(gl, this.resources);
    this.canvas.addEventListener?.('webglcontextlost', this.handleContextLost as EventListener);
    this.canvas.addEventListener?.('webglcontextrestored', this.handleContextRestored as EventListener);
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  private readonly handleContextRestored = () => {
    this.resources = createResources(this.gl);
    configureStaticResources(this.gl, this.resources);
    this.textureWidth = 0;
    this.textureHeight = 0;
    this.lost = false;
  };

  render(source: TexImageSource, width: number, height: number, transform: PerspectiveTransform): PerspectiveCanvas {
    const pixelWidth = Math.max(1, Math.round(width));
    const pixelHeight = Math.max(1, Math.round(height));
    if (this.lost || this.gl.isContextLost()) throw new Error('Perspective zoom WebGL context was lost.');
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    const gl = this.gl;
    const resources = this.resources;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(resources.program);

    const geometry = createPerspectiveGeometry(pixelWidth, pixelHeight, transform);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(resources.positionLocation);
    gl.vertexAttribPointer(resources.positionLocation, 4, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.texture);
    if (this.textureWidth !== pixelWidth || this.textureHeight !== pixelHeight) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pixelWidth, pixelHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.textureWidth = pixelWidth;
      this.textureHeight = pixelHeight;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  dispose() {
    this.canvas.removeEventListener?.('webglcontextlost', this.handleContextLost as EventListener);
    this.canvas.removeEventListener?.('webglcontextrestored', this.handleContextRestored as EventListener);
    const { program, positionBuffer, textureBuffer, texture } = this.resources;
    this.gl.deleteTexture(texture);
    this.gl.deleteBuffer(positionBuffer);
    this.gl.deleteBuffer(textureBuffer);
    this.gl.deleteProgram(program);
  }
}

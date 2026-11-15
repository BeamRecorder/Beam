import type { RecordlyFrameEffect } from '@beam/engine/zoom/experimental/recordly-camera-types';
import type { RecordlyFilterResources } from './spatial-filter-types';
import { RECORDLY_PAN_FRAGMENT, RECORDLY_ZOOM_FRAGMENT } from './filter-shaders';
const VERTEX = `precision highp float;
attribute vec2 aPosition;
varying vec2 vTextureCoord;
uniform vec4 uTextureFrame;
uniform float uRenderToTexture;
void main(){
 gl_Position=vec4(aPosition,0.0,1.0);
 vec2 uv=(aPosition+1.0)*.5;
 if(uRenderToTexture<.5)uv.y=1.0-uv.y;
 vTextureCoord=uTextureFrame.xy+uv*uTextureFrame.zw;
}`;
const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Cannot allocate Recordly blur shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Recordly blur shader: ${error}`);
  }
  return shader;
};
function resources(gl: WebGL2RenderingContext, fragment: string): RecordlyFilterResources {
  // Match Pixi GlProgram's ES100 defines: the published kernel uses ES100 identifiers.
  const source =
    '#define in varying\n#define finalColor gl_FragColor\n#define texture texture2D\n' +
    fragment.replace('out vec4 finalColor;', '').replace('${MAX_KERNEL_SIZE}', '13.0');
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  let pixel: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    pixel = compile(gl, gl.FRAGMENT_SHADER, source);
    program = gl.createProgram();
    if (!program) throw new Error('Cannot allocate Recordly blur program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, pixel);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Recordly blur link: ${gl.getProgramInfoLog(program)}`);
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    if (pixel) gl.deleteShader(pixel);
  }
  const texture = gl.createTexture(),
    buffer = gl.createBuffer();
  if (!texture || !buffer) {
    gl.deleteProgram(program);
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    throw new Error('Cannot allocate Recordly blur texture.');
  }
  return { program, texture, buffer };
}

/** Runs the same fragment kernels and uniforms as the upstream Pixi filters, on a host-owned stage texture. */
export class RecordlySpatialFilter {
  readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly pan: RecordlyFilterResources;
  private readonly zoom: RecordlyFilterResources;
  private lost = false;
  private readonly framebuffer: WebGLFramebuffer;
  private textureWidth = 0;
  private textureHeight = 0;
  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('Recordly spatial blur requires WebGL2.');
    this.gl = gl;
    this.pan = resources(gl, RECORDLY_PAN_FRAGMENT);
    try {
      this.zoom = resources(gl, RECORDLY_ZOOM_FRAGMENT);
    } catch (error) {
      this.release(this.pan);
      throw error;
    }
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      this.release(this.pan);
      this.release(this.zoom);
      throw new Error('Cannot allocate Recordly blur framebuffer.');
    }
    this.framebuffer = framebuffer;
    this.canvas.addEventListener('webglcontextlost', () => {
      this.lost = true;
    });
  }
  private release(value: RecordlyFilterResources) {
    this.gl.deleteTexture(value.texture);
    this.gl.deleteBuffer(value.buffer);
    this.gl.deleteProgram(value.program);
  }
  draw(source: OffscreenCanvas, effect: RecordlyFrameEffect): OffscreenCanvas {
    const gl = this.gl,
      width = source.width,
      height = source.height;
    if (this.lost || gl.isContextLost()) throw new Error('Recordly blur WebGL context lost.');
    // Pixi FilterSystem adds MotionBlurFilter.padding, then pools a power-of-two texture.
    // Its second (radial) pass samples that padded texture even when directional blur is idle.
    const padding = (Math.max(Math.abs(effect.pan.velocity.x), Math.abs(effect.pan.velocity.y)) >> 0) + 1;
    const textureWidth = 2 ** Math.ceil(Math.log2(width + padding * 2));
    const textureHeight = 2 ** Math.ceil(Math.log2(height + padding * 2));
    if (
      textureWidth * textureHeight * 4 > 64 * 1024 * 1024 ||
      textureWidth > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
      textureHeight > gl.getParameter(gl.MAX_TEXTURE_SIZE)
    )
      throw new RangeError(
        `Recordly blur stage exceeds the texture limit (${width} × ${height}, padded ${textureWidth} × ${textureHeight}).`,
      );
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    const resize = textureWidth !== this.textureWidth || textureHeight !== this.textureHeight;
    for (const resource of [this.pan, this.zoom]) {
      gl.bindTexture(gl.TEXTURE_2D, resource.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (resize)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureWidth, textureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resource.texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Recordly blur framebuffer is incomplete.');
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.textureWidth = textureWidth;
    this.textureHeight = textureHeight;
    gl.bindTexture(gl.TEXTURE_2D, this.pan.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, padding, padding, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const prepare = (resource: RecordlyFilterResources, toTexture: boolean) => {
      gl.useProgram(resource.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(resource.program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const location = (name: string) => gl.getUniformLocation(resource.program, name);
      gl.uniform4f(location('uInputSize'), textureWidth, textureHeight, 1 / textureWidth, 1 / textureHeight);
      gl.uniform4f(
        location('uTextureFrame'),
        toTexture ? 0 : padding / textureWidth,
        toTexture ? 0 : padding / textureHeight,
        toTexture ? 1 : width / textureWidth,
        toTexture ? 1 : height / textureHeight,
      );
      gl.uniform1f(location('uRenderToTexture'), toTexture ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resource.texture);
      gl.uniform1i(location('uTexture'), 0);
      return location;
    };
    gl.viewport(0, 0, textureWidth, textureHeight);
    const panLocation = prepare(this.pan, true);
    gl.uniform2f(panLocation('uVelocity'), effect.pan.velocity.x, effect.pan.velocity.y);
    gl.uniform1i(
      panLocation('uKernelSize'),
      effect.pan.velocity.x !== 0 || effect.pan.velocity.y !== 0 ? effect.pan.kernelSize : 0,
    );
    gl.uniform1f(panLocation('uOffset'), effect.pan.offset);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const zoomLocation = prepare(this.zoom, false);
    gl.uniform1f(zoomLocation('uStrength'), effect.zoom.strength);
    gl.uniform2f(zoomLocation('uCenter'), effect.zoom.center.x, effect.zoom.center.y);
    gl.uniform2f(zoomLocation('uRadii'), effect.zoom.innerRadius, effect.zoom.radius);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`Recordly spatial blur failed (WebGL ${error}).`);
    return this.canvas;
  }
  dispose() {
    this.release(this.pan);
    this.release(this.zoom);
    this.gl.deleteFramebuffer(this.framebuffer);
    this.canvas.width = this.canvas.height = 0;
  }
}

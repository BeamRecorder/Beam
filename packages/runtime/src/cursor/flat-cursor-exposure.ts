import { cursorRasterBounds, cursorStampResolution } from './cursor-raster-bounds';
import type {
  CursorExposureStamp,
  CursorGpuOptions,
  CursorRasterSurface,
  CursorStampRasterizer,
} from './cursor-gpu-types';

const MAX_STAMP_BYTES = 4 * 1024 * 1024;
const MAX_STAMPS = 8;
const VERTEX = `#version 300 es
in vec2 a_corner;
in vec3 a_sample;
uniform vec2 u_size;
uniform vec2 u_surface;
out vec2 v_uv;
out float v_weight;
void main(){
  vec2 pixel=a_sample.xy+a_corner*u_size;
  gl_Position=vec4(pixel/u_surface*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
  v_uv=vec2(a_corner.x,1.-a_corner.y);v_weight=a_sample.z;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_image;
in vec2 v_uv;
in float v_weight;
out vec4 color;
void main(){color=texture(u_image,v_uv)*v_weight;}`;

/** Cache complete premultiplied cursor rasters, then accumulate shutter instances with the original GPU blend. */
export class FlatCursorExposurePainter {
  private readonly stamps: CursorExposureStamp[] = [];
  private cacheBytes = 0;
  private disposed = false;
  private program: WebGLProgram | null = null;
  private vertices: WebGLBuffer | null = null;
  private samples: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private size: WebGLUniformLocation | null = null;
  private surface: WebGLUniformLocation | null = null;
  private readonly instances = new Float32Array(16 * 3);
  private readonly rasterizer: CursorStampRasterizer;

  constructor(rasterizer: CursorStampRasterizer) {
    this.rasterizer = rasterizer;
    const gl = rasterizer.gl,
      shaders: WebGLShader[] = [];
    try {
      this.program = gl.createProgram();
      this.vertices = gl.createBuffer();
      this.samples = gl.createBuffer();
      this.vao = gl.createVertexArray();
      if (!this.program || !this.vertices || !this.samples || !this.vao)
        throw new Error('Cannot allocate cursor exposure batch.');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, VERTEX],
        [gl.FRAGMENT_SHADER, FRAGMENT],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Cannot allocate cursor exposure shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Cursor exposure shader failed: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Cursor exposure linking failed: ${gl.getProgramInfoLog(this.program)}`);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
      const corner = gl.getAttribLocation(this.program, 'a_corner');
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 8, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.samples);
      gl.bufferData(gl.ARRAY_BUFFER, this.instances.byteLength, gl.DYNAMIC_DRAW);
      const sample = gl.getAttribLocation(this.program, 'a_sample');
      gl.enableVertexAttribArray(sample);
      gl.vertexAttribPointer(sample, 3, gl.FLOAT, false, 12, 0);
      gl.vertexAttribDivisor(sample, 1);
      this.size = gl.getUniformLocation(this.program, 'u_size');
      this.surface = gl.getUniformLocation(this.program, 'u_surface');
      gl.useProgram(this.program);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
      gl.bindVertexArray(null);
    }
  }

  private stampFor(options: CursorGpuOptions, requestedResolution: number): CursorExposureStamp {
    const { geometry, shadow, image } = options;
    const resolution = cursorStampResolution(
      geometry.width + shadow.blur * 6 + 4,
      geometry.height + shadow.blur * 6 + 4,
      requestedResolution,
      this.rasterizer.maxSize,
    );
    const key = JSON.stringify([
      geometry.width,
      geometry.height,
      geometry.hotspot.x,
      geometry.hotspot.y,
      shadow.enabled,
      shadow.blur,
      shadow.color,
      shadow.direction,
      resolution,
    ]);
    const index = this.stamps.findIndex((stamp) => stamp.image === image && stamp.key === key);
    if (index >= 0) {
      const stamp = this.stamps.splice(index, 1)[0]!;
      this.stamps.push(stamp);
      return stamp;
    }
    const gl = this.rasterizer.gl;
    const surface = this.rasterizer.render(
      {
        ...options,
        resolution: Math.min(4, resolution),
        samples: [{ x: 0, y: 0, weight: 1 }],
      },
      resolution > 4 ? 2 : 1,
    );
    const texture = gl.createTexture();
    try {
      if (!texture) throw new Error('Cannot allocate cursor stamp texture.');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, surface.canvas.width, surface.canvas.height, 0);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Cannot retain cursor stamp texture.');
      const width = surface.canvas.width,
        height = surface.canvas.height;
      const bytes = width * height * 4;
      const stamp = {
        image,
        key,
        texture,
        width,
        height,
        x: surface.x,
        y: surface.y,
        bytes,
        resolution,
        retained: bytes <= MAX_STAMP_BYTES,
      };
      if (stamp.retained) {
        while (this.stamps.length && (this.stamps.length >= MAX_STAMPS || this.cacheBytes + bytes > MAX_STAMP_BYTES)) {
          const old = this.stamps.shift()!;
          this.cacheBytes -= old.bytes;
          gl.deleteTexture(old.texture);
        }
        this.stamps.push(stamp);
        this.cacheBytes += bytes;
      }
      return stamp;
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  }

  render(options: CursorGpuOptions): CursorRasterSurface {
    const { gl, canvas } = this.rasterizer;
    if (this.disposed || gl.isContextLost()) throw new Error('Cursor exposure GPU context is unavailable.');
    if (options.volume) throw new RangeError('Flat cursor exposure cannot rasterize a volume.');
    const bounds = cursorRasterBounds(options, this.rasterizer.maxSize);
    const stamp = this.stampFor(options, bounds.resolution);
    try {
      if (canvas.height > bounds.pixelHeight) canvas.height = bounds.pixelHeight;
      if (canvas.width !== bounds.pixelWidth) canvas.width = bounds.pixelWidth;
      if (canvas.height !== bounds.pixelHeight) canvas.height = bounds.pixelHeight;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, bounds.pixelWidth, bounds.pixelHeight);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stamp.texture);
      gl.uniform2f(
        this.size,
        (stamp.width * bounds.resolution) / stamp.resolution,
        (stamp.height * bounds.resolution) / stamp.resolution,
      );
      gl.uniform2f(this.surface, bounds.pixelWidth, bounds.pixelHeight);
      let count = 0;
      for (const sample of options.samples) {
        if (sample.weight === 0) continue;
        this.instances[count * 3] = (sample.x + stamp.x - bounds.x) * bounds.resolution;
        this.instances[count * 3 + 1] = (sample.y + stamp.y - bounds.y) * bounds.resolution;
        this.instances[count * 3 + 2] = sample.weight / bounds.weight;
        count++;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.samples);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instances.subarray(0, count * 3));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      return {
        canvas,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    } finally {
      gl.bindVertexArray(null);
      if (!stamp.retained) gl.deleteTexture(stamp.texture);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.rasterizer.gl;
    for (const stamp of this.stamps) gl.deleteTexture(stamp.texture);
    this.stamps.length = 0;
    this.cacheBytes = 0;
    gl.deleteProgram(this.program);
    gl.useProgram(null);
    gl.deleteBuffer(this.vertices);
    gl.deleteBuffer(this.samples);
    gl.deleteVertexArray(this.vao);
    this.program = null;
    this.vertices = null;
    this.samples = null;
    this.vao = null;
  }
}

import { CURSOR_GPU_VERTEX, CURSOR_GPU_FRAGMENT } from './cursor-gpu-shaders';
import { cursorFaceMesh, cursorVolumeMesh } from './cursor-volume-mesh';
import { cursorShadowOffset } from './cursor-shadow';
import { cursorRasterBounds } from './cursor-raster-bounds';
import { CursorBlurTarget } from './cursor-blur-target';
import type { CursorGpuOptions, CursorGpuAsset } from './cursor-gpu-types';

const MAX_CACHE_BYTES = 16 * 1024 * 1024;

/** Retained GPU assets, with normalized additive blur and a real extruded cursor volume. */
export class CursorGpuPainter {
  readonly canvas = new OffscreenCanvas(1, 1);
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly attributes: Array<readonly [number, number, number]> = [];
  private readonly assets = new Map<HTMLImageElement | ImageBitmap, CursorGpuAsset>();
  private readonly colors = new Map<string, number[]>();
  private cacheBytes = 0;
  private disposed = false;
  private exposure: CursorBlurTarget | null = null;
  readonly maxSize: number;

  constructor() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is required for cursor volume and motion blur.');
    this.gl = gl;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), viewport[0]!, viewport[1]!);
    const shaders: WebGLShader[] = [];
    try {
      this.program = gl.createProgram();
      if (!this.program) throw new Error('Cannot allocate cursor program.');
      for (const [kind, source] of [
        [gl.VERTEX_SHADER, CURSOR_GPU_VERTEX],
        [gl.FRAGMENT_SHADER, CURSOR_GPU_FRAGMENT],
      ] as const) {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error('Cannot allocate cursor shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Cursor shader failed: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Cursor shader linking failed: ${gl.getProgramInfoLog(this.program)}`);
      for (const [name, size, offset] of [
        ['a_position', 3, 0],
        ['a_uv', 2, 12],
        ['a_normal', 3, 20],
      ] as const) {
        const location = gl.getAttribLocation(this.program, name);
        if (location < 0) throw new Error(`Cursor shader attribute is unavailable: ${name}`);
        this.attributes.push([location, size, offset]);
      }
      for (const name of [
        'size',
        'hotspot',
        'surface',
        'origin',
        'pose',
        'volume',
        'shadow',
        'shadowOffset',
        'shadowPad',
        'image',
        'shadowColor',
        'blur',
        'weight',
      ])
        this.uniforms.set(name, gl.getUniformLocation(this.program, `u_${name}`));
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  private evict(image: HTMLImageElement | ImageBitmap, asset: CursorGpuAsset) {
    this.gl.deleteBuffer(asset.buffer);
    this.gl.deleteTexture(asset.texture);
    this.assets.delete(image);
    this.cacheBytes -= asset.bytes;
  }

  private assetFor(image: HTMLImageElement | ImageBitmap, desiredSize: number, volume: boolean): CursorGpuAsset {
    const cached = this.assets.get(image);
    const rasterSize = Math.max(
      cached?.rasterSize ?? 0,
      Math.min(1024, this.maxSize, 2 ** Math.ceil(Math.log2(Math.max(64, desiredSize)))),
    );
    if (cached && cached.rasterSize >= rasterSize && (!volume || cached.volume)) {
      this.assets.delete(image);
      this.assets.set(image, cached);
      return cached;
    }
    if (cached) this.evict(image, cached);
    const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
    const height = 'naturalHeight' in image ? image.naturalHeight : image.height;
    if (![width, height].every((value) => Number.isInteger(value) && value > 0))
      throw new RangeError('Invalid cursor artwork dimensions.');
    const factor = rasterSize / Math.max(width, height);
    const source = new OffscreenCanvas(
      Math.max(1, Math.round(width * factor)),
      Math.max(1, Math.round(height * factor)),
    );
    const context = source.getContext('2d');
    if (!context) throw new Error('Cursor artwork canvas unavailable.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, source.width, source.height);
    let mesh = cursorFaceMesh();
    if (volume) {
      const silhouette = new OffscreenCanvas(
        Math.max(1, Math.round(source.width * Math.min(1, 128 / Math.max(source.width, source.height)))),
        Math.max(1, Math.round(source.height * Math.min(1, 128 / Math.max(source.width, source.height)))),
      );
      const mask = silhouette.getContext('2d');
      if (!mask) throw new Error('Cursor silhouette canvas unavailable.');
      mask.drawImage(source, 0, 0, silhouette.width, silhouette.height);
      mesh = cursorVolumeMesh(
        mask.getImageData(0, 0, silhouette.width, silhouette.height).data,
        silhouette.width,
        silhouette.height,
      );
    }
    const bytes = mesh.byteLength + source.width * source.height * 4;
    if (bytes > MAX_CACHE_BYTES) throw new RangeError('Cursor artwork exceeds the GPU asset budget.');
    while (this.assets.size && (this.cacheBytes + bytes > MAX_CACHE_BYTES || this.assets.size >= 8)) {
      const [key, value] = this.assets.entries().next().value!;
      this.evict(key, value);
    }
    const gl = this.gl,
      buffer = gl.createBuffer(),
      texture = gl.createTexture();
    try {
      if (!buffer || !texture) throw new Error('Cannot allocate cursor GPU artwork.');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Cannot upload cursor GPU artwork.');
      const asset = {
        buffer,
        texture,
        vertices: mesh.length / 8,
        bytes,
        rasterSize,
        volume,
      };
      this.assets.set(image, asset);
      this.cacheBytes += bytes;
      return asset;
    } catch (error) {
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      throw error;
    }
  }

  private color(value: string) {
    const cached = this.colors.get(value);
    if (cached) return cached;
    const context = new OffscreenCanvas(1, 1).getContext('2d', {
      willReadFrequently: true,
    });
    if (!context) throw new Error('Cursor shadow color canvas unavailable.');
    context.fillStyle = '#010203';
    context.fillStyle = value;
    const first = context.fillStyle;
    context.fillStyle = '#040506';
    context.fillStyle = value;
    if (context.fillStyle !== first) throw new RangeError('Invalid cursor shadow color.');
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const color = Array.from(context.getImageData(0, 0, 1, 1).data, (channel) => channel / 255);
    if (this.colors.size >= 64) this.colors.delete(this.colors.keys().next().value!);
    this.colors.set(value, color);
    return color;
  }

  render(options: CursorGpuOptions, density = 1) {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) throw new Error('Cursor GPU context is unavailable.');
    const { geometry, samples } = options;
    const bounds = cursorRasterBounds(options, this.maxSize, density);
    const { x: left, y: top, pixelWidth: width, pixelHeight: height, resolution, weight } = bounds;
    const asset = this.assetFor(
      options.image,
      Math.max(geometry.width, geometry.height) * resolution,
      Boolean(options.volume),
    );
    if (this.canvas.height > height) this.canvas.height = height;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, asset.texture);
    gl.uniform1i(this.uniforms.get('image')!, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, asset.buffer);
    for (const [location, size, offset] of this.attributes) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset);
    }
    const pose = options.volume ?? { pitch: 0, yaw: 0, height: 0 };
    gl.uniform2f(this.uniforms.get('size')!, geometry.width * resolution, geometry.height * resolution);
    gl.uniform2f(this.uniforms.get('hotspot')!, geometry.hotspot.x * resolution, geometry.hotspot.y * resolution);
    gl.uniform2f(this.uniforms.get('surface')!, width, height);
    gl.uniform3f(this.uniforms.get('pose')!, pose.pitch, pose.yaw, pose.height);
    gl.uniform1i(this.uniforms.get('volume')!, Number(Boolean(options.volume)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (samples.length > 1) this.exposure ??= new CursorBlurTarget(gl);
    gl.useProgram(this.program);
    const shadowColor = this.color(options.shadow.color),
      offset = cursorShadowOffset(options.shadow.blur, options.shadow.direction);
    gl.uniform4f(this.uniforms.get('shadowColor')!, shadowColor[0]!, shadowColor[1]!, shadowColor[2]!, shadowColor[3]!);
    gl.uniform2f(this.uniforms.get('shadowOffset')!, offset.x * resolution, offset.y * resolution);
    gl.uniform2f(
      this.uniforms.get('blur')!,
      options.shadow.blur / geometry.width,
      options.shadow.blur / geometry.height,
    );
    gl.uniform1f(
      this.uniforms.get('shadowPad')!,
      (options.shadow.blur * 3) / Math.min(geometry.width, geometry.height),
    );
    for (const sample of samples) {
      if (samples.length > 1) this.exposure!.begin(width, height);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, asset.texture);
      gl.uniform2f(this.uniforms.get('origin')!, (sample.x - left) * resolution, (sample.y - top) * resolution);
      gl.uniform1f(this.uniforms.get('weight')!, 1);
      gl.disable(gl.DEPTH_TEST);
      if (options.shadow.enabled && shadowColor[3]! > 0) {
        gl.uniform1i(this.uniforms.get('shadow')!, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.uniform1i(this.uniforms.get('shadow')!, 0);
      if (options.volume) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      }
      gl.drawArrays(gl.TRIANGLES, 0, options.volume ? asset.vertices : 6);
      if (samples.length > 1) this.exposure!.accumulate(sample.weight / weight);
    }
    return {
      canvas: this.canvas,
      x: left,
      y: top,
      width: bounds.width,
      height: bounds.height,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [key, value] of this.assets) this.evict(key, value);
    this.exposure?.dispose();
    this.exposure = null;
    this.gl.deleteProgram(this.program);
    this.gl.useProgram(null);
    this.program = null;
    this.uniforms.clear();
    this.attributes.length = 0;
    this.colors.clear();
    this.canvas.width = this.canvas.height = 1;
  }
}

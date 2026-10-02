import { engineMetrics } from '@beam/runtime/performance/engine-metrics';
import { createGpuProgram } from '@beam/runtime/gpu/gpu-program';
import { createGpuFilterFramebuffer, createGpuFilterTarget } from '@beam/runtime/gpu/gpu-filter-program';
import { GpuTextures } from '@beam/runtime/gpu/gpu-textures';
import { GpuTimer } from '@beam/runtime/gpu/gpu-timer';
import { GpuGaussianPass } from '@beam/runtime/gpu/gpu-gaussian-pass';
import type { GpuProgram, GpuRect, GpuSceneCommand, GpuSceneOptions } from '@beam/runtime/gpu/gpu-scene-types';

/** Ordered scenes retain one destination; Gaussian passes own their bounded convolution targets. */
export class GpuSceneRenderer {
  readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly metrics;
  private resources!: GpuProgram;
  private textures!: GpuTextures;
  private timer!: GpuTimer;
  private gaussian!: GpuGaussianPass;
  private targets: WebGLTexture[] = [];
  private framebuffer: WebGLFramebuffer | null = null;
  private white: WebGLTexture | null = null;
  private readonly vertices = new Float32Array(16);
  private readonly instances = new Float32Array(4096 * 13);
  private width = 0;
  private height = 0;
  private lost = false;
  private disposed = false;
  private readonly options: GpuSceneOptions;

  constructor(options: GpuSceneOptions = {}) {
    this.options = options;
    this.canvas = options.canvas ?? new OffscreenCanvas(1, 1);
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required for the GPU scene renderer.');
    this.gl = gl;
    this.metrics = options.metrics ?? engineMetrics;
    const targetBudget = options.maxRenderTargetBytes ?? 512 * 1024 * 1024;
    if (!Number.isSafeInteger(targetBudget) || targetBudget < 4) throw new RangeError('Invalid GPU target budget.');
    try {
      this.initialize();
    } catch (error) {
      this.release();
      throw error;
    }
    this.canvas.addEventListener('webglcontextlost', this.onLost);
    this.canvas.addEventListener('webglcontextrestored', this.onRestored);
  }
  private initialize(): void {
    const gl = this.gl;
    this.textures = new GpuTextures(gl, this.metrics, this.options.maxTextureBytes, this.options.maxTextures);
    this.resources = createGpuProgram(gl);
    this.gaussian = new GpuGaussianPass(gl, this.metrics);
    this.framebuffer = createGpuFilterFramebuffer(gl);
    this.timer = new GpuTimer(gl, this.metrics);
    this.white = gl.createTexture();
    if (!this.framebuffer || !this.white) {
      throw new Error('Unable to allocate GPU scene framebuffer.');
    }
    gl.useProgram(this.resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.positions);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.resources.position);
    gl.vertexAttribPointer(this.resources.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.resources.uv);
    gl.vertexAttribPointer(this.resources.uv, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.resources.image, 0);
    for (let i = 0; i < 8; i++) gl.uniform1i(this.resources.images[i]!, i);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.instances);
    gl.bufferData(gl.ARRAY_BUFFER, this.instances.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.resources.instanceRect);
    gl.enableVertexAttribArray(this.resources.instanceColor);
    gl.vertexAttribPointer(this.resources.instanceRect, 4, gl.FLOAT, false, 52, 0);
    gl.vertexAttribPointer(this.resources.instanceColor, 4, gl.FLOAT, false, 52, 16);
    gl.enableVertexAttribArray(this.resources.instanceCrop);
    gl.enableVertexAttribArray(this.resources.instanceTexture);
    gl.vertexAttribPointer(this.resources.instanceCrop, 4, gl.FLOAT, false, 52, 32);
    gl.vertexAttribPointer(this.resources.instanceTexture, 1, gl.FLOAT, false, 52, 48);
    gl.vertexAttribDivisor(this.resources.instanceRect, 1);
    gl.vertexAttribDivisor(this.resources.instanceColor, 1);
    gl.vertexAttribDivisor(this.resources.instanceCrop, 1);
    gl.vertexAttribDivisor(this.resources.instanceTexture, 1);
    for (let i = 0; i < 8; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.white);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  private readonly onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };
  private readonly onRestored = () => {
    // Deleted WebGL objects are invalid after restoration; source ownership is unchanged.
    this.release();
    this.width = this.height = 0;
    this.initialize();
    this.lost = false;
  };
  private resize(width: number, height: number): void {
    const gl = this.gl;
    if (
      ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
      width * height * 4 > (this.options.maxRenderTargetBytes ?? 512 * 1024 * 1024) ||
      Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)
    )
      throw new RangeError('Invalid GPU output dimensions.');
    if (this.width === width && this.height === height) return;
    for (const texture of this.targets) gl.deleteTexture(texture);
    this.targets = [];
    this.width = this.height = 0;
    this.canvas.width = width;
    this.canvas.height = height;
    try {
      const texture = createGpuFilterTarget(gl, width, height).texture;
      this.targets.push(texture);
    } catch (error) {
      for (const texture of this.targets) gl.deleteTexture(texture);
      this.targets = [];
      throw error;
    }
    this.width = width;
    this.height = height;
  }
  private target(texture: WebGLTexture | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, texture ? this.framebuffer : null);
    if (texture) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
    gl.viewport(0, 0, this.width, this.height);
  }
  private quad(rect: GpuRect, uv = [0, 0, 1, 1], flipTarget = false): void {
    const gl = this.gl;
    const x0 = (rect.x / this.width) * 2 - 1,
      x1 = ((rect.x + rect.width) / this.width) * 2 - 1;
    const y0 = 1 - (rect.y / this.height) * 2,
      y1 = 1 - ((rect.y + rect.height) / this.height) * 2;
    const top = flipTarget ? uv[3]! : uv[1]!,
      bottom = flipTarget ? uv[1]! : uv[3]!;
    this.vertices.set([x0, y0, uv[0]!, top, x1, y0, uv[2]!, top, x0, y1, uv[0]!, bottom, x1, y1, uv[2]!, bottom]);
    gl.uniform1i(this.resources.instanced, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.positions);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices);
    gl.uniform2f(this.resources.size, rect.width, rect.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.metrics.count('draws');
  }
  private solidBatch(commands: readonly GpuSceneCommand[], start: number): number {
    const gl = this.gl;
    let count = 0,
      index = start;
    while (index < commands.length && count < 4096) {
      const command = commands[index]!;
      if (command.kind !== 'solid' || command.radius) break;
      const r = command.rect;
      if (
        ![r.x, r.y, r.width, r.height, ...command.color].every(Number.isFinite) ||
        r.width < 0 ||
        r.height < 0 ||
        command.color.some((v) => v < 0 || v > 1)
      )
        throw new RangeError('Invalid GPU solid command.');
      this.instances.set([r.x, r.y, r.width, r.height, ...command.color, 0, 0, 1, 1, 0], count * 13);
      count++;
      index++;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.white);
    gl.uniform1i(this.resources.mode, 1);
    this.drawInstances(1, count);
    return index - 1;
  }
  private drawInstances(mode: number, count: number): void {
    const gl = this.gl;
    gl.uniform1i(this.resources.mode, mode);
    gl.uniform1i(this.resources.instanced, 1);
    gl.uniform4f(this.resources.color, 1, 1, 1, 1);
    gl.uniform1f(this.resources.radius, 0);
    gl.uniform2f(this.resources.output, this.width, this.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.instances);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instances.subarray(0, count * 13));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    this.metrics.count('draws');
  }
  private imageBatch(commands: readonly GpuSceneCommand[], start: number): number {
    const gl = this.gl,
      bank = new Map<TexImageSource, number>();
    let count = 0,
      index = start,
      bankBytes = 0;
    while (index < commands.length && count < 4096) {
      const c = commands[index]!;
      if (
        c.kind !== 'image' ||
        c.radius ||
        (!bank.has(c.source) &&
          (bank.size === Math.min(8, this.options.maxTextures ?? 128) ||
            (bank.size > 0 &&
              bankBytes + c.width * c.height * 4 > (this.options.maxTextureBytes ?? 256 * 1024 * 1024))))
      )
        break;
      let slot = bank.get(c.source);
      if (slot === undefined) {
        slot = bank.size;
        bank.set(c.source, slot);
        bankBytes += c.width * c.height * 4;
        gl.activeTexture(gl.TEXTURE0 + slot);
        gl.bindTexture(gl.TEXTURE_2D, this.textures.get(c.source, c.width, c.height, c.immutable));
      }
      const crop = c.crop ?? { x: 0, y: 0, width: c.width, height: c.height },
        r = c.rect,
        opacity = c.opacity ?? 1;
      if (
        ![r.x, r.y, r.width, r.height, crop.x, crop.y, crop.width, crop.height, opacity].every(Number.isFinite) ||
        r.width < 0 ||
        r.height < 0 ||
        crop.x < 0 ||
        crop.y < 0 ||
        crop.width < 0 ||
        crop.height < 0 ||
        crop.x + crop.width > c.width ||
        crop.y + crop.height > c.height ||
        opacity < 0 ||
        opacity > 1
      )
        throw new RangeError('Invalid GPU image command.');
      const x = crop.x / c.width,
        y = crop.y / c.height,
        w = crop.width / c.width,
        h = crop.height / c.height;
      this.instances.set(
        [
          r.x,
          r.y,
          r.width,
          r.height,
          1,
          1,
          1,
          opacity,
          c.mirrored ? x + w : x,
          c.mirroredY ? y + h : y,
          c.mirrored ? -w : w,
          c.mirroredY ? -h : h,
          slot,
        ],
        count * 13,
      );
      count++;
      index++;
    }
    gl.activeTexture(gl.TEXTURE0);
    for (let slot = bank.size; slot < 8; slot++) {
      gl.activeTexture(gl.TEXTURE0 + slot);
      gl.bindTexture(gl.TEXTURE_2D, this.white);
    }
    gl.activeTexture(gl.TEXTURE0);
    this.drawInstances(0, count);
    return index - 1;
  }
  private image(command: Extract<GpuSceneCommand, { kind: 'image' }>): void {
    const gl = this.gl;
    const texture = this.textures.get(command.source, command.width, command.height, command.immutable);
    const crop = command.crop ?? { x: 0, y: 0, width: command.width, height: command.height };
    if (
      !Object.values(crop).every(Number.isFinite) ||
      crop.x < 0 ||
      crop.y < 0 ||
      crop.width < 0 ||
      crop.height < 0 ||
      crop.x + crop.width > command.width ||
      crop.y + crop.height > command.height ||
      !Number.isFinite(command.opacity ?? 1) ||
      (command.opacity ?? 1) < 0 ||
      (command.opacity ?? 1) > 1
    )
      throw new RangeError('Invalid GPU image command.');
    const uv = [
      crop.x / command.width,
      crop.y / command.height,
      (crop.x + crop.width) / command.width,
      (crop.y + crop.height) / command.height,
    ];
    if (command.mirrored) [uv[0], uv[2]] = [uv[2]!, uv[0]!];
    if (command.mirroredY) [uv[1], uv[3]] = [uv[3]!, uv[1]!];
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.resources.mode, 0);
    gl.uniform4f(this.resources.color, 1, 1, 1, command.opacity ?? 1);
    gl.uniform1f(this.resources.radius, command.radius ?? 0);
    this.quad(command.rect, uv);
  }
  private blur(rect: GpuRect, radius: number): void {
    if (!Number.isFinite(radius) || radius < 0 || radius > 48) throw new RangeError('Invalid GPU blur radius.');
    if (radius === 0) return;
    const gl = this.gl,
      full = { x: 0, y: 0, width: this.width, height: this.height };
    gl.disable(gl.BLEND);
    const result = this.gaussian.filter({ texture: this.targets[0]!, width: this.width, height: this.height }, radius);
    gl.bindVertexArray(null);
    gl.useProgram(this.resources.program);
    for (let i = 1; i < 8; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.white);
    }
    gl.activeTexture(gl.TEXTURE0);
    this.target(this.targets[0]!);
    gl.bindTexture(gl.TEXTURE_2D, result.texture);
    const x = Math.max(0, Math.floor(rect.x)),
      y = Math.max(0, Math.floor(rect.y));
    const right = Math.min(this.width, Math.ceil(rect.x + rect.width)),
      bottom = Math.min(this.height, Math.ceil(rect.y + rect.height));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, this.height - bottom, Math.max(0, right - x), Math.max(0, bottom - y));
    // Already-premultiplied render target: copy without the media alpha conversion.
    gl.uniform1i(this.resources.mode, 3);
    const [u, v, w, h] = result.uv;
    this.quad(full, [u, v, u + w, v + h], true);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
  }
  render(commands: readonly GpuSceneCommand[], width: number, height: number): OffscreenCanvas {
    if (this.disposed || this.lost || this.gl.isContextLost()) throw new Error('GPU scene renderer unavailable.');
    this.resize(width, height);
    return this.metrics.measure('gpu-submit', () => {
      const gl = this.gl;
      this.timer.begin();
      try {
        this.target(this.targets[0]!);
        gl.enable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (let index = 0; index < commands.length; index++) {
          const command = commands[index]!;
          const rect = command.rect;
          if (
            'radius' in command &&
            command.radius !== undefined &&
            (!Number.isFinite(command.radius) || command.radius < 0)
          )
            throw new RangeError('Invalid GPU radius.');
          if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0)
            throw new RangeError('Invalid GPU command geometry.');
          if (
            rect.width === 0 ||
            rect.height === 0 ||
            rect.x >= width ||
            rect.y >= height ||
            rect.x + rect.width <= 0 ||
            rect.y + rect.height <= 0
          )
            continue;
          if (command.kind === 'solid' && !command.radius) {
            index = this.solidBatch(commands, index);
            continue;
          }
          if (command.kind === 'image' && !command.radius) {
            index = this.imageBatch(commands, index);
            continue;
          }
          if (command.kind === 'image') this.image(command);
          else if (command.kind === 'blur') this.blur(rect, command.radius);
          else {
            if (!command.color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
              throw new RangeError('Invalid GPU solid color.');
            gl.bindTexture(gl.TEXTURE_2D, this.white);
            gl.uniform1i(this.resources.mode, 1);
            gl.uniform4fv(this.resources.color, command.color);
            gl.uniform1f(this.resources.radius, command.radius ?? 0);
            this.quad(rect);
          }
        }
        this.target(null);
        gl.disable(gl.BLEND);
        gl.bindTexture(gl.TEXTURE_2D, this.targets[0]!);
        gl.uniform1i(this.resources.mode, 3);
        this.quad({ x: 0, y: 0, width, height }, undefined, true);
        this.metrics.count('gpu-frames');
        return this.canvas;
      } finally {
        this.timer.end();
      }
    });
  }
  stats() {
    return { ...this.textures.stats(), renderTargetBytes: this.width * this.height * 4 + this.gaussian.stats().bytes };
  }
  pollMetrics(): void {
    this.timer.poll();
  }
  private release(): void {
    this.timer?.clear();
    this.gaussian?.dispose();
    this.textures?.clear();
    for (const texture of this.targets) this.gl.deleteTexture(texture);
    this.targets = [];
    this.width = this.height = 0;
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
    if (this.white) this.gl.deleteTexture(this.white);
    if (this.resources) {
      this.gl.deleteBuffer(this.resources.positions);
      this.gl.deleteBuffer(this.resources.instances);
      this.gl.deleteProgram(this.resources.program);
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.release();
    this.canvas.width = this.canvas.height = 1;
  }
}

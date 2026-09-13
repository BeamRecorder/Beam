import {
  BLICK_ANALYSIS_FRAGMENT_SHADER,
  BLICK_ANALYSIS_VERTEX_SHADER,
  BLICK_FRAGMENT_SHADER,
  BLICK_VERTEX_SHADER,
} from './blick-waveform-shaders';
import type { BlickWaveformData, BlickWaveformRenderer } from './blick-waveform-types';

export function waveformTexture(data: BlickWaveformData): Float32Array {
  const count = data.bars.length;
  const pixels = new Float32Array(count * 8);
  for (let point = 0; point < count; point += 1) {
    const value = data.bars[point]!;
    const percent = ((point + 0.5) / count) * 100;
    const pending = data.loadingSegments.some(
      ({ leftPercent, widthPercent }) => percent >= leftPercent && percent < leftPercent + widthPercent,
    );
    pixels[point * 4] = pending || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(1, value / 38));
    pixels[point * 4 + 3] = pending ? 0 : 1;
    for (let band = 0; band < 4; band += 1) {
      const value = data.bands[point * 4 + band]!;
      pixels[count * 4 + point * 4 + band] = pending || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(1, value));
    }
  }
  return pixels;
}

function createRenderer(): BlickWaveformRenderer {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is unavailable for audio waveforms.');
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const analysisProgram = gl.createProgram();
  const texture = gl.createTexture();
  const envelopeTexture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  const dispose = () => {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    gl.deleteProgram(analysisProgram);
    gl.deleteTexture(texture);
    gl.deleteTexture(envelopeTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = canvas.height = 1;
  };
  try {
    if (!program || !analysisProgram || !texture || !envelopeTexture || !framebuffer)
      throw new Error('Could not allocate the waveform renderer.');
    for (const [target, type, source] of [
      [program, gl.VERTEX_SHADER, BLICK_VERTEX_SHADER],
      [program, gl.FRAGMENT_SHADER, BLICK_FRAGMENT_SHADER],
      [analysisProgram, gl.VERTEX_SHADER, BLICK_ANALYSIS_VERTEX_SHADER],
      [analysisProgram, gl.FRAGMENT_SHADER, BLICK_ANALYSIS_FRAGMENT_SHADER],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not allocate a waveform shader.');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) || 'Waveform shader compilation failed.');
      gl.attachShader(target, shader);
    }
    for (const target of [program, analysisProgram]) {
      gl.linkProgram(target);
      if (!gl.getProgramParameter(target, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(target) || 'Waveform shader linking failed.');
    }
    for (const target of [texture, envelopeTexture]) {
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, envelopeTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const uniforms = Object.fromEntries(
      ['uData', 'uLength', 'uColumns', 'uWidth', 'uDuration'].map((name) => [
        name,
        gl.getUniformLocation(analysisProgram, name),
      ]),
    );
    gl.useProgram(analysisProgram);
    gl.uniform1i(uniforms.uData!, 0);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'uData'), 0);
    const drawingColumns = gl.getUniformLocation(program, 'uColumns');
    const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 8192);
    let textureWidth = 0;
    let envelopeWidth = 0;
    return {
      draw(target, data, width, height) {
        if (gl.isContextLost()) throw new Error('The audio waveform GPU context was lost.');
        const context = target.getContext('2d');
        if (!context) throw new Error('The audio waveform canvas is unavailable.');
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const bitmapWidth = Math.max(1, Math.min(maxSize, Math.round(width * ratio)));
        const bitmapHeight = Math.max(1, Math.min(maxSize, Math.round(height * ratio)));
        if (!data.bars.length) {
          target.width = bitmapWidth;
          target.height = bitmapHeight;
          context.clearRect(0, 0, bitmapWidth, bitmapHeight);
          return;
        }
        if (data.bars.length > maxSize || data.bands.length !== data.bars.length * 4)
          throw new Error('Invalid audio waveform data.');
        if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
        if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
        const pixels = waveformTexture(data);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (textureWidth !== data.bars.length) {
          textureWidth = data.bars.length;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, textureWidth, 2, 0, gl.RGBA, gl.FLOAT, null);
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, textureWidth, 2, gl.RGBA, gl.FLOAT, pixels);
        const columns = Math.min(bitmapWidth, maxSize - 1, 4096);
        gl.bindTexture(gl.TEXTURE_2D, envelopeTexture);
        if (envelopeWidth !== columns + 1) {
          envelopeWidth = columns + 1;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, envelopeWidth, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error('The waveform envelope framebuffer is unavailable.');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.useProgram(analysisProgram);
        gl.viewport(0, 0, envelopeWidth, 1);
        gl.uniform1i(uniforms.uLength!, data.bars.length);
        gl.uniform1f(uniforms.uColumns!, columns);
        gl.uniform1f(uniforms.uWidth!, width);
        gl.uniform1f(uniforms.uDuration!, data.sourceDurationSeconds);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, envelopeTexture);
        gl.useProgram(program);
        gl.uniform1f(drawingColumns, columns);
        gl.viewport(0, 0, bitmapWidth, bitmapHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (columns + 1) * 2, 4);
        // Leave the displayed bitmap intact until its replacement has been rendered.
        if (target.width !== bitmapWidth) target.width = bitmapWidth;
        if (target.height !== bitmapHeight) target.height = bitmapHeight;
        context.clearRect(0, 0, bitmapWidth, bitmapHeight);
        context.drawImage(canvas, 0, 0);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

// Clips retain only their small bitmap. One shared GPU context avoids Chromium's context limit.
let renderer: BlickWaveformRenderer | undefined;
let users = 0;
export function acquireBlickWaveformRenderer(): BlickWaveformRenderer {
  renderer ??= createRenderer();
  const owned = renderer;
  users += 1;
  let released = false;
  return {
    draw: (...args) => {
      if (!released) owned.draw(...args);
    },
    dispose() {
      if (released) return;
      released = true;
      if (--users === 0) {
        owned.dispose();
        renderer = undefined;
      }
    },
  };
}

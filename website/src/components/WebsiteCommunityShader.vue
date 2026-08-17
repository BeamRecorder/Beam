<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { fragmentSource, shaderPreset, vertexSource } from './community-shader-source';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const fallback = ref(false);
const pendingContextReleases = new WeakMap<HTMLCanvasElement, number>();
let disposeRenderer: (() => void) | undefined;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const pendingRelease = pendingContextReleases.get(canvas);
  if (pendingRelease !== undefined) window.clearTimeout(pendingRelease);
  pendingContextReleases.delete(canvas);

  const gl = canvas.getContext('webgl', { antialias: false });
  if (!gl) {
    fallback.value = true;
    return;
  }

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertexShader || !fragmentShader || !program) {
    fallback.value = true;
    return;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    fallback.value = true;
    return;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    colors: gl.getUniformLocation(program, 'u_colors'),
    scene: gl.getUniformLocation(program, 'u_scene'),
    shape: gl.getUniformLocation(program, 'u_shape'),
    surface: gl.getUniformLocation(program, 'u_surface'),
    finish: gl.getUniformLocation(program, 'u_finish'),
    transform: gl.getUniformLocation(program, 'u_transform'),
    space: gl.getUniformLocation(program, 'u_space'),
    cursor: gl.getUniformLocation(program, 'u_cursor'),
  };
  gl.uniform3fv(uniforms.colors, new Float32Array(shaderPreset.colors.flat()));
  gl.uniform4f(uniforms.shape, shaderPreset.scale, shaderPreset.intensity, shaderPreset.paramA, shaderPreset.warp);
  gl.uniform4f(
    uniforms.surface,
    shaderPreset.detail,
    shaderPreset.contrast,
    shaderPreset.brightness,
    shaderPreset.saturation,
  );
  gl.uniform4f(uniforms.finish, shaderPreset.hue, shaderPreset.vignette, shaderPreset.blur, shaderPreset.grain);
  gl.uniform4f(uniforms.transform, shaderPreset.seed, shaderPreset.rotate, shaderPreset.drift, shaderPreset.oklab);
  gl.uniform4f(uniforms.cursor, 0, shaderPreset.cursorEffect, shaderPreset.cursorStrength, shaderPreset.cursorRadius);

  let bounds = canvas.getBoundingClientRect();
  let frame = 0;
  let visible = document.visibilityState === 'visible';
  let inView = true;
  let disposed = false;
  const startedAt = performance.now();
  const renderCanvas = canvas;
  const renderContext = gl;

  const resizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rawWidth = Math.max(1, Math.round(bounds.width * dpr));
    const rawHeight = Math.max(1, Math.round(bounds.height * dpr));
    const pixelScale = Math.min(1, Math.sqrt(2_000_000 / Math.max(1, rawWidth * rawHeight)));
    const width = Math.max(1, Math.round(rawWidth * pixelScale));
    const height = Math.max(1, Math.round(rawHeight * pixelScale));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  const requestRender = () => {
    if (!disposed && visible && inView && frame === 0) frame = requestAnimationFrame(render);
  };
  const updateLayout = () => {
    bounds = canvas.getBoundingClientRect();
    resizeCanvas();
    requestRender();
  };
  function render(now: number) {
    frame = 0;
    if (disposed || !visible || !inView) return;
    resizeCanvas();
    renderContext.uniform4f(
      uniforms.scene,
      renderCanvas.width,
      renderCanvas.height,
      ((now - startedAt) / 1_000) * shaderPreset.timeScale,
      shaderPreset.colorCount,
    );
    renderContext.uniform4f(uniforms.space, shaderPreset.offsetX, shaderPreset.offsetY, 0, 0);
    renderContext.uniform4f(
      uniforms.cursor,
      0,
      shaderPreset.cursorEffect,
      shaderPreset.cursorStrength,
      shaderPreset.cursorRadius,
    );
    renderContext.drawArrays(renderContext.TRIANGLES, 0, 3);
    requestRender();
  }

  window.addEventListener('resize', updateLayout);
  const resizeObserver = new ResizeObserver(updateLayout);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry?.isIntersecting ?? true;
    if (inView) requestRender();
    else if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  intersectionObserver.observe(canvas);
  const onVisibilityChange = () => {
    visible = document.visibilityState === 'visible';
    if (visible) requestRender();
    else if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  updateLayout();

  disposeRenderer = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('resize', updateLayout);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    const releaseTimer = window.setTimeout(() => {
      if (pendingContextReleases.get(canvas) !== releaseTimer) return;
      pendingContextReleases.delete(canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width = 1;
      canvas.height = 1;
    }, 0);
    pendingContextReleases.set(canvas, releaseTimer);
  };
});

onBeforeUnmount(() => disposeRenderer?.());
</script>

<template>
  <canvas
    ref="canvasRef"
    class="community-shader"
    :class="{ 'community-shader--fallback': fallback }"
    aria-hidden="true"
  />
</template>

<style scoped>
.community-shader {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--color-primary);
  pointer-events: none;
}

.community-shader--fallback {
  background:
    radial-gradient(circle at 20% 72%, var(--color-track-cursor), transparent 46%),
    radial-gradient(circle at 76% 24%, var(--color-track-annotation), transparent 48%), var(--color-primary);
}
</style>

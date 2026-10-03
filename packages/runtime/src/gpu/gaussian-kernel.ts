import type { GaussianKernel, GaussianLevel } from '@beam/runtime/gpu/gaussian-kernel-types';

/** Bilinear tap pairs implement a normalized, separable Gaussian, not a fixed stretched kernel. */
export function gaussianKernel(sigma: number): GaussianKernel {
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 4) throw new RangeError('Invalid Gaussian sigma.');
  const kernel: GaussianKernel = {
    radius: 0,
    center: 1,
    pairs: 0,
    weights: new Float32Array(6),
    offsets: new Float32Array(6),
  };
  if (sigma <= 0.03) return kernel;
  kernel.radius = Math.ceil(3 * sigma);
  const taps = Array.from({ length: kernel.radius + 1 }, (_, i) => Math.exp((-i * i) / (2 * sigma * sigma)));
  const total = taps[0]! + 2 * taps.slice(1).reduce((a, b) => a + b, 0);
  kernel.center = taps[0]! / total;
  for (let i = 1; i <= kernel.radius; i += 2) {
    const first = taps[i]!,
      second = taps[i + 1] ?? 0,
      sum = first + second;
    kernel.weights[kernel.pairs] = sum / total;
    kernel.offsets[kernel.pairs] = i + second / sum;
    kernel.pairs += 1;
  }
  return kernel;
}

/** Large sigmas use repeated linear reductions, retaining the actual integer scale in the kernel. */
export function gaussianLevels(width: number, height: number, sigma: number): GaussianLevel[] {
  if (
    ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
    !Number.isFinite(sigma) ||
    sigma < 0 ||
    sigma > 48
  )
    throw new RangeError('Invalid Gaussian dimensions or sigma.');
  const scale = sigma > 4 ? 4 / sigma : 1;
  const targetWidth = Math.max(1, Math.floor(width * scale)),
    targetHeight = Math.max(1, Math.floor(height * scale));
  const level = (w: number, h: number) => ({
    width: w,
    height: h,
    sigmaX: (sigma * w) / width,
    sigmaY: (sigma * h) / height,
  });
  const result = [level(width, height)];
  let w = width,
    h = height;
  while (
    Math.max(1, Math.floor(w / 2)) >= targetWidth &&
    Math.max(1, Math.floor(h / 2)) >= targetHeight &&
    (w > targetWidth || h > targetHeight)
  ) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    result.push(level(w, h));
  }
  if (w !== targetWidth || h !== targetHeight) result.push(level(targetWidth, targetHeight));
  return result;
}

import { validateDitheringRecipe } from '@beam/engine';
import type { DitheringRecipe } from '@beam/engine/gradient/dithering-effect-types';

const kernel = [
  [1, 0, 7],
  [2, 0, 5],
  [-2, 1, 3],
  [-1, 1, 5],
  [0, 1, 7],
  [1, 1, 5],
  [2, 1, 3],
  [-2, 2, 1],
  [-1, 2, 3],
  [0, 2, 5],
  [1, 2, 3],
  [2, 2, 1],
] as const;
const weights = [0.2126, 0.7152, 0.0722] as const;
const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** Exact 12-neighbor Jarvis–Judice–Ninke diffusion, with three bounded error rows. Runs in a worker. */
export function jarvisDither(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  recipe: DitheringRecipe,
  pixelRatio = 1,
) {
  validateDitheringRecipe(recipe);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    data.length !== width * height * 4 ||
    !Number.isFinite(pixelRatio) ||
    pixelRatio <= 0
  )
    throw new Error('Invalid JJN surface.');
  const colors = recipe.colors.map((color) => {
    const hex = color.slice(1),
      full = hex.length === 3 ? [...hex].map((d) => d + d).join('') : hex;
    return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  });
  const palette = colors.map((color) => color.map(linear));
  const block = Math.max(1, Math.round(recipe.blockSize * pixelRatio)),
    columns = Math.ceil(width / block);
  const errors = Array.from({ length: 3 }, () => new Float32Array(columns * 3));
  for (let y = 0, row = 0; y < height; y += block, row++) {
    const current = errors[row % 3]!;
    for (let x = 0, column = 0; x < width; x += block, column++) {
      const sample =
        (Math.min(height - 1, y + Math.floor(block / 2)) * width + Math.min(width - 1, x + Math.floor(block / 2))) * 4;
      // A transparent block center must not inject matte colors into a visible edge.
      let source = sample;
      if (data[source + 3] === 0) {
        source = -1;
        for (let yy = y; yy < Math.min(height, y + block) && source < 0; yy++)
          for (let xx = x; xx < Math.min(width, x + block); xx++)
            if (data[(yy * width + xx) * 4 + 3]! > 0) {
              source = (yy * width + xx) * 4;
              break;
            }
        if (source < 0) continue;
      }
      const adjusted = [0, 1, 2].map((c) =>
        Math.min(
          1,
          Math.max(0, ((((data[source + c]! / 255) * recipe.brightness) / 100 - 0.5) * recipe.contrast) / 100 + 0.5),
        ),
      );
      const color = adjusted.map((v, c) => linear(v) + current[column * 3 + c]!);
      let chosen = 0,
        distance = Infinity;
      if (recipe.mapping === 'luminance') {
        const luminance = color.reduce((sum, v, c) => sum + v * weights[c]!, 0);
        chosen = Math.min(palette.length - 1, Math.max(0, Math.round(luminance * (palette.length - 1))));
      } else
        for (let i = 0; i < palette.length; i++) {
          const d = color.reduce((sum, v, c) => sum + (v - palette[i]![c]!) ** 2 * weights[c]!, 0);
          if (d < distance) {
            distance = d;
            chosen = i;
          }
        }
      const output = colors[chosen]!,
        target = palette[chosen]!;
      for (let yy = y; yy < Math.min(height, y + block); yy++)
        for (let xx = x; xx < Math.min(width, x + block); xx++) {
          const index = (yy * width + xx) * 4;
          if (data[index + 3] === 0) continue;
          for (let c = 0; c < 3; c++) data[index + c] = Math.round(output[c]! * 255);
        }
      for (const [dx, dy, weight] of kernel) {
        const next = column + dx,
          yy = y + dy * block;
        if (next < 0 || next >= columns || yy >= height) continue;
        const nextX = Math.min(width - 1, next * block + Math.floor(block / 2)),
          nextY = Math.min(height - 1, yy + Math.floor(block / 2));
        if (data[(nextY * width + nextX) * 4 + 3] === 0) continue;
        for (let c = 0; c < 3; c++) errors[(row + dy) % 3]![next * 3 + c]! += ((color[c]! - target[c]!) * weight) / 48;
      }
    }
    current.fill(0);
  }
}

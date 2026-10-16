import { mediaSourceDescriptor } from '../../shared/media-source';
import type { HoverAnalysisInput } from './hover-types';
import { validateCursorHoverSources } from '@beam/engine/cursor/cursor-hover-sync';

export function validateHoverInput(input: HoverAnalysisInput) {
  if (
    !input ||
    !(input.path instanceof Float64Array) ||
    input.path.length % 4 ||
    input.path.length > 16_000_000 ||
    !Array.isArray(input.sources) ||
    input.sources.length > 10_000
  )
    throw new TypeError('Invalid cursor analysis input.');
  let last = -1;
  for (let index = 0; index < input.path.length; index += 4) {
    const time = input.path[index]!;
    const x = input.path[index + 1]!;
    const y = input.path[index + 2]!;
    const active = input.path[index + 3];
    if (
      ![time, x, y].every(Number.isFinite) ||
      !Number.isSafeInteger(Math.ceil(time * 60)) ||
      time < 0 ||
      time <= last ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1 ||
      (active !== 0 && active !== 1)
    )
      throw new TypeError('Invalid cursor analysis path.');
    last = time;
  }
  validateCursorHoverSources(input.sources);
  for (const source of input.sources) {
    mediaSourceDescriptor({ id: source.id, name: source.id, kind: 'video', src: source.src });
  }
}

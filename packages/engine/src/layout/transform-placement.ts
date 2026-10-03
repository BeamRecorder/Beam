import type { MediaDimensions } from './media-rotation-types';
import type { NormalizedTransform } from '../shared/composition-types';
import type { AlignmentAxis, CanvasAlignment, TransformAlignment } from './transform-placement-types';

const dimension = (value: number) => Math.min(4, Math.max(0.02, value));
const position = (value: number) => Math.min(3, Math.max(-3, value));
const axes: AlignmentAxis[] = [0.5, 0, 1];
function validate(transform: NormalizedTransform) {
  if (!Object.values(transform).every(Number.isFinite) || transform.width <= 0 || transform.height <= 0)
    throw new TypeError('Invalid transform placement.');
}

export function editTransformPlacement(
  transform: NormalizedTransform,
  patch: Partial<NormalizedTransform>,
  lockAspectRatio = true,
): NormalizedTransform {
  validate(transform);
  if (!Object.values(patch).every(Number.isFinite)) throw new TypeError('Invalid transform placement patch.');
  let width = dimension(patch.width ?? transform.width);
  let height = dimension(patch.height ?? transform.height);
  if (lockAspectRatio && (patch.width !== undefined) !== (patch.height !== undefined)) {
    const requestedScale = patch.width !== undefined ? width / transform.width : height / transform.height;
    const scale = Math.min(
      4 / Math.max(transform.width, transform.height),
      Math.max(0.02 / Math.min(transform.width, transform.height), requestedScale),
    );
    width = dimension(transform.width * scale);
    height = dimension(transform.height * scale);
  }
  return {
    x: position(patch.x ?? transform.x),
    y: position(patch.y ?? transform.y),
    width,
    height,
  };
}

export function alignTransformToCanvas(
  transform: NormalizedTransform,
  alignment: CanvasAlignment,
): NormalizedTransform {
  validate(transform);
  if (!axes.includes(alignment.x) || !axes.includes(alignment.y)) throw new TypeError('Invalid canvas alignment.');
  return {
    ...transform,
    x: (1 - transform.width) * alignment.x,
    y: (1 - transform.height) * alignment.y,
  };
}

export function getTransformAlignment(transform: NormalizedTransform): TransformAlignment {
  validate(transform);
  const axis = (offset: number, size: number) =>
    axes.find((value) => Math.abs(offset - (1 - size) * value) < 0.00001) ?? null;
  return { x: axis(transform.x, transform.width), y: axis(transform.y, transform.height) };
}

function validateCanvas(canvas: MediaDimensions) {
  if (![canvas.width, canvas.height].every((value) => Number.isFinite(value) && value > 0))
    throw new TypeError('Invalid canvas dimensions.');
}

export function transformPixelSize(transform: NormalizedTransform, canvas: MediaDimensions): MediaDimensions {
  validate(transform);
  validateCanvas(canvas);
  return { width: transform.width * canvas.width, height: transform.height * canvas.height };
}

export function editTransformPixelSize(
  transform: NormalizedTransform,
  pixels: Partial<MediaDimensions>,
  canvas: MediaDimensions,
  lockAspectRatio = true,
): NormalizedTransform {
  validateCanvas(canvas);
  return editTransformPlacement(
    transform,
    {
      ...(pixels.width === undefined ? {} : { width: pixels.width / canvas.width }),
      ...(pixels.height === undefined ? {} : { height: pixels.height / canvas.height }),
    },
    lockAspectRatio,
  );
}

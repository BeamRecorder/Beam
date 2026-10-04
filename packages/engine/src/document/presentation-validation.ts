import type { OutputCanvasSettings } from '../layout/output-canvas-types';
import { isColorGradient } from '../shared/color-fill-types';

export function validateCanvas(canvas: OutputCanvasSettings) {
  if (
    !canvas ||
    !['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '21:9', 'custom'].includes(canvas.preset) ||
    ![canvas.width, canvas.height].every((value) => Number.isSafeInteger(value) && value >= 2 && value <= 16384) ||
    typeof canvas.showBackground !== 'boolean'
  )
    throw new TypeError('Invalid output canvas.');
  if (canvas.watermark) {
    const value = canvas.watermark;
    if (
      typeof value.enabled !== 'boolean' ||
      typeof value.showLogo !== 'boolean' ||
      typeof value.localized !== 'boolean' ||
      !['none', 'made-with-beam', 'beam', 'custom'].includes(value.text) ||
      !['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value.position) ||
      ![value.size, value.shadow, value.backgroundOpacity, value.backgroundRadius, value.backgroundPadding].every(
        (number) => Number.isFinite(number) && number >= 0,
      ) ||
      value.backgroundOpacity > 100 ||
      typeof value.backgroundColor !== 'string'
    )
      throw new TypeError('Invalid watermark.');
  }
}

/** Host-neutral shape validation; hosts resolve URLs and native asset capabilities. */
export function validateBackground(value: unknown, still = false) {
  if (value === null) return;
  if (!value || typeof value !== 'object') throw new TypeError('Invalid background.');
  const record = value as Record<string, unknown>;
  const valid =
    record.kind === 'color'
      ? typeof record.color === 'string' && Boolean(record.color)
      : record.kind === 'gradient'
        ? isColorGradient(record.gradient)
        : (record.kind === 'image' || (!still && record.kind === 'video')) &&
          typeof record[still ? 'path' : 'src'] === 'string' &&
          Boolean(record[still ? 'path' : 'src']);
  if (!valid) throw new TypeError('Invalid background.');
}

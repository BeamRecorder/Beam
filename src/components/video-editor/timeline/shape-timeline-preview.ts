import type { ShapeClip } from '~/media/shared/composition-types';
import { drawShapeClip } from '../composition/shape/render-shape-clip';
import type { ShapeTimelinePreviewProps } from './shape-timeline-preview-types';

export function renderShapeTimelinePreview(
  clip: ShapeClip,
  canvas: NonNullable<ShapeTimelinePreviewProps['canvas']>,
): string {
  const width = canvas.width * clip.transform.width;
  const height = canvas.height * clip.transform.height;
  if (![width, height, canvas.width, canvas.height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('The element preview dimensions are unavailable.');
  }
  const angle = (clip.rotation * Math.PI) / 180;
  const unit = Math.min(canvas.width, canvas.height) / 1080;
  const text = clip.text?.style;
  const textPadding = text
    ? text.outlineWidth +
      text.extrusionDepth +
      text.shadowBlur * 4 +
      Math.max(Math.abs(text.shadowOffsetX ?? 0), Math.abs(text.shadowOffsetY ?? 0))
    : 0;
  const shapePadding =
    clip.borderWidth + (clip.drawing?.strokeWidth ?? 0) / 2 + (clip.shadowEnabled ? clip.shadowBlur * 4 + 12 : 0);
  const padding = Math.max(shapePadding, textPadding) * unit;
  const rotatedWidth = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle)) + padding * 2;
  const rotatedHeight = Math.abs(height * Math.cos(angle)) + Math.abs(width * Math.sin(angle)) + padding * 2;
  const scale = Math.min(304 / rotatedWidth, 80 / rotatedHeight);
  const surface = document.createElement('canvas');
  surface.width = Math.min(320, Math.max(1, Math.ceil(rotatedWidth * scale + 16)));
  surface.height = Math.min(96, Math.max(1, Math.ceil(rotatedHeight * scale + 16)));
  try {
    const context = surface.getContext('2d');
    if (!context) throw new Error('The element preview canvas is unavailable.');
    context.translate((surface.width - width * scale) / 2, (surface.height - height * scale) / 2);
    drawShapeClip(
      context,
      clip,
      { x: 0, y: 0, width: canvas.width * scale, height: canvas.height * scale },
      { ...clip.transform, x: 0, y: 0 },
    );
    return surface.toDataURL('image/png');
  } finally {
    surface.width = surface.height = 1;
  }
}

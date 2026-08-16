import { normalizeWatermark, type OutputCanvasSettings } from './output-canvas';
import type { Canvas2DContext } from '~/types/canvas';

export const WATERMARK_LOGO_KEY = '__beam-watermark-logo';
export const WATERMARK_LOGO_PATH = '/brand/BeamIcon.webp';
const BEAM_LOGO_CROP = { x: 93, y: 93, size: 1068 } as const;

export function drawBeamWatermark(
  context: Canvas2DContext,
  canvas: OutputCanvasSettings,
  viewport: { x: number; y: number; width: number; height: number },
  logo?: CanvasImageSource | null,
) {
  const settings = normalizeWatermark(canvas.watermark);
  if (!settings.enabled) return;
  const viewportScale = Math.min(viewport.width, viewport.height) / 720;
  const scale = viewportScale * (settings.size / 100);
  const paddingScale = settings.backgroundPadding / 100;
  const fontSize = Math.max(9, 15 * scale);
  const paddingX = 10 * scale * paddingScale;
  const paddingY = 7 * scale * paddingScale;
  const logoSize = settings.showLogo && logo ? 22 * scale : 0;
  const gap = logoSize ? 7 * scale : 0;
  const text =
    settings.text === 'none' ? '' : settings.renderedText || (settings.text === 'beam' ? 'Beam' : 'Made with Beam.');
  const margin = 18 * viewportScale;

  context.save();
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.font = `600 ${fontSize}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textBaseline = 'alphabetic';
  const textMetrics = text ? context.measureText(text) : null;
  const textWidth = textMetrics?.width ?? 0;
  if (!logoSize && !textWidth) {
    context.restore();
    return;
  }
  const width = paddingX * 2 + logoSize + (logoSize && textWidth ? gap : 0) + textWidth;
  const height = Math.max(logoSize, fontSize) + paddingY * 2;
  const right = settings.position.endsWith('right');
  const bottom = settings.position.startsWith('bottom');
  const x = right ? viewport.x + viewport.width - margin - width : viewport.x + margin;
  const y = bottom ? viewport.y + viewport.height - margin - height : viewport.y + margin;
  context.fillStyle = `${settings.backgroundColor}${Math.round((settings.backgroundOpacity / 100) * 255)
    .toString(16)
    .padStart(2, '0')}`;
  context.shadowColor = `rgba(0, 0, 0, ${settings.shadow / 160})`;
  context.shadowBlur = 18 * scale * (settings.shadow / 100);
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(height / 2, 12 * scale) * (settings.backgroundRadius / 100));
  context.fill();
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  let contentX = x + paddingX;
  if (logoSize && logo) {
    context.drawImage(
      logo,
      BEAM_LOGO_CROP.x,
      BEAM_LOGO_CROP.y,
      BEAM_LOGO_CROP.size,
      BEAM_LOGO_CROP.size,
      contentX,
      y + (height - logoSize) / 2,
      logoSize,
      logoSize,
    );
    contentX += logoSize + gap;
  }
  if (text && textMetrics) {
    context.fillStyle = '#ffffff';
    const ascent = textMetrics.actualBoundingBoxAscent || fontSize * 0.72;
    const descent = textMetrics.actualBoundingBoxDescent || fontSize * 0.2;
    context.fillText(text, contentX, y + height / 2 + (ascent - descent) / 2);
  }
  context.restore();
}

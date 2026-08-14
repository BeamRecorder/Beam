import type { GradientBackground } from '../../composables/backgroundCatalog';

export type RenderBackgroundValue =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; gradient: GradientBackground }
  | { kind: 'image' | 'video' };

const sourceDimensions = (source: CanvasImageSource) => {
  const value = source as { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width?: number; height?: number };
  const width = value.naturalWidth ?? value.videoWidth ?? value.width;
  const height = value.naturalHeight ?? value.videoHeight ?? value.height;
  if (!(typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0))
    throw new Error('Background source dimensions are unavailable.');
  return { width, height };
};

export function renderBackground(
  ctx: CanvasRenderingContext2D,
  options: {
    value: RenderBackgroundValue | null;
    source?: CanvasImageSource | null;
    sourceSize?: { width: number; height: number };
    rect: { x: number; y: number; width: number; height: number };
    blurPixels: number;
    alpha?: number;
  },
) {
  if (!options.value || (options.value.kind !== 'color' && options.value.kind !== 'gradient' && !options.source)) return;
  const blur = Math.max(0, Math.min(48, options.blurPixels));
  const overscan = blur * 2;
  const target = {
    x: options.rect.x - overscan,
    y: options.rect.y - overscan,
    width: options.rect.width + overscan * 2,
    height: options.rect.height + overscan * 2,
  };
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, options.alpha ?? 1));
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  if (options.value.kind === 'color') {
    ctx.fillStyle = options.value.color;
    ctx.fillRect(target.x, target.y, target.width, target.height);
  } else if (options.value.kind === 'gradient') {
    const value = options.value.gradient;
    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    const gradient =
      value.type === 'radial'
        ? ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(target.width, target.height) / 2)
        : (() => {
            const radians = ((value.angle - 90) * Math.PI) / 180;
            const dx = (Math.cos(radians) * target.width) / 2;
            const dy = (Math.sin(radians) * target.height) / 2;
            return ctx.createLinearGradient(centerX - dx, centerY - dy, centerX + dx, centerY + dy);
          })();
    for (const stop of value.stops) {
      gradient.addColorStop(
        stop.position,
        `${stop.color}${Math.round(stop.alpha * 255)
          .toString(16)
          .padStart(2, '0')}`,
      );
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(target.x, target.y, target.width, target.height);
  } else if (options.source) {
    const source = options.sourceSize ?? sourceDimensions(options.source);
    ctx.drawImage(options.source, 0, 0, source.width, source.height, target.x, target.y, target.width, target.height);
  }
  ctx.restore();
}

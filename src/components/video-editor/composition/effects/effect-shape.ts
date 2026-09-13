import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { EffectRect } from './effect-types';

export const effectShapeRect = (shape: BlurClip['shape'], rect: EffectRect): EffectRect => {
  if (shape === 'rectangle') return rect;
  const size = Math.min(rect.width, rect.height);
  return {
    x: rect.x + (rect.width - size) / 2,
    y: rect.y + (rect.height - size) / 2,
    width: size,
    height: size,
  };
};

export const appendEffectShape = (ctx: Canvas2DContext, clip: BlurClip, rect: EffectRect) => {
  const target = effectShapeRect(clip.shape, rect);
  const cornerRadius = clip.cornerRadius ?? 0;
  if (clip.shape === 'circle') {
    ctx.moveTo(target.x + target.width, target.y + target.height / 2);
    ctx.arc(target.x + target.width / 2, target.y + target.height / 2, target.width / 2, 0, Math.PI * 2);
  } else if (cornerRadius > 0) {
    const radius = (Math.min(target.width, target.height) * cornerRadius) / 200;
    ctx.roundRect(target.x, target.y, target.width, target.height, radius);
  } else ctx.rect(target.x, target.y, target.width, target.height);
};

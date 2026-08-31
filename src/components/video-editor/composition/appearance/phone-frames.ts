import type { ClipFrame } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { MediaRect } from './appearance-types';
import { resolvePhoneFrameGeometry } from './frame-geometry';

export type PhoneFrame = Extract<ClipFrame, 'iphone-16-max' | 'pixel-9-pro'>;

export const isPhoneFrame = (frame: ClipFrame): frame is PhoneFrame =>
  frame === 'iphone-16-max' || frame === 'pixel-9-pro';

const roundedRectPath = (ctx: Canvas2DContext, rect: MediaRect, radius: number) =>
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);

const drawSideButton = (
  ctx: Canvas2DContext,
  rect: MediaRect,
  side: 'left' | 'right',
  topRatio: number,
  heightRatio: number,
  width: number,
  color: string,
) => {
  const height = rect.height * heightRatio;
  const x = side === 'left' ? rect.x : rect.x + rect.width - width;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, rect.y + rect.height * topRatio, width, height, Math.max(0.5, width / 2));
  ctx.fill();
};

const drawShell = (
  ctx: Canvas2DContext,
  geometry: ReturnType<typeof resolvePhoneFrameGeometry>,
  frameColor: string,
  cutout: boolean,
) => {
  const { outer } = geometry;
  ctx.beginPath();
  roundedRectPath(ctx, outer, geometry.outerRadius);
  if (cutout) roundedRectPath(ctx, geometry.content, geometry.contentRadius);
  ctx.fillStyle = frameColor;
  if (cutout) ctx.fill('evenodd');
  else ctx.fill();
};

const drawBezel = (ctx: Canvas2DContext, rect: MediaRect, frame: PhoneFrame, frameColor: string) => {
  ctx.save();
  drawShell(ctx, resolvePhoneFrameGeometry(rect, frame), frameColor, true);
  ctx.restore();
};

const drawIphoneDetails = (ctx: Canvas2DContext, rect: MediaRect) => {
  const { unit } = resolvePhoneFrameGeometry(rect, 'iphone-16-max');
  const islandWidth = Math.min(rect.width * 0.265, 110 * unit);
  const islandHeight = Math.min(rect.height * 0.037, 31 * unit);
  const islandX = rect.x + (rect.width - islandWidth) / 2;
  const islandY = rect.y + rect.height * 0.0285;
  ctx.fillStyle = '#030303';
  ctx.beginPath();
  ctx.roundRect(islandX, islandY, islandWidth, islandHeight, islandHeight / 2);
  ctx.fill();
  ctx.fillStyle = '#171424';
  ctx.beginPath();
  ctx.arc(islandX + islandWidth * 0.85, islandY + islandHeight / 2, Math.max(1, islandHeight * 0.17), 0, Math.PI * 2);
  ctx.fill();
  const buttonWidth = Math.max(1, 4 * unit);
  drawSideButton(ctx, rect, 'left', 0.176, 0.037, buttonWidth, '#77746c');
  drawSideButton(ctx, rect, 'left', 0.248, 0.066, buttonWidth, '#77746c');
  drawSideButton(ctx, rect, 'left', 0.334, 0.066, buttonWidth, '#77746c');
  drawSideButton(ctx, rect, 'right', 0.291, 0.118, buttonWidth, '#77746c');
};

const drawPixelDetails = (ctx: Canvas2DContext, rect: MediaRect) => {
  const { unit } = resolvePhoneFrameGeometry(rect, 'pixel-9-pro');
  const cameraY = rect.y + rect.height * 0.0564;
  ctx.fillStyle = '#080808';
  ctx.beginPath();
  ctx.arc(rect.x + rect.width / 2, cameraY, Math.max(1.5, 11 * unit), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#171424';
  ctx.beginPath();
  ctx.arc(rect.x + rect.width / 2, cameraY, Math.max(1, 4.5 * unit), 0, Math.PI * 2);
  ctx.fill();
  const buttonWidth = Math.max(1, 3 * unit);
  drawSideButton(ctx, rect, 'right', 0.271, 0.075, buttonWidth, '#8b8177');
  drawSideButton(ctx, rect, 'right', 0.397, 0.14, buttonWidth, '#8b8177');
};

export function drawPhoneFrame(
  ctx: Canvas2DContext,
  rect: MediaRect,
  frame: PhoneFrame,
  paintBackground: boolean,
  frameColor = '#c0c0c0',
) {
  const geometry = resolvePhoneFrameGeometry(rect, frame);
  const outer = geometry.outer;
  if (paintBackground) {
    drawShell(ctx, geometry, frameColor, false);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    roundedRectPath(ctx, geometry.content, geometry.contentRadius);
    ctx.fill();
    return;
  }
  drawBezel(ctx, rect, frame, frameColor);
  ctx.save();
  ctx.strokeStyle = frame === 'iphone-16-max' ? 'rgba(255, 255, 255, .42)' : 'rgba(255, 255, 255, .16)';
  ctx.lineWidth = Math.max(0.5, geometry.unit);
  ctx.beginPath();
  ctx.roundRect(
    outer.x + geometry.unit / 2,
    outer.y + geometry.unit / 2,
    Math.max(0, outer.width - geometry.unit),
    Math.max(0, outer.height - geometry.unit),
    geometry.outerRadius,
  );
  ctx.stroke();
  ctx.restore();
  if (frame === 'iphone-16-max') drawIphoneDetails(ctx, outer);
  else drawPixelDetails(ctx, outer);
}

import type { ClipFrame } from '~/media/shared/composition-types';
import type { MediaRect } from './appearance-types';
import type { Canvas2DContext } from '~/types/canvas';
import {
  normalizeFrameChromeScale,
  resolveContainedRect,
  resolveSafariFrameGeometry,
  resolvePhoneFrameGeometry,
  resolveWindowsFrameGeometry,
  type FrameOptions,
} from './frame-geometry';
import { drawPhoneFrame, isPhoneFrame } from './phone-frames';

export { normalizeFrameChromeScale };
export type WindowsFrameOptions = FrameOptions;

export const frameOuterRect = (rect: MediaRect, frame: ClipFrame): MediaRect =>
  isPhoneFrame(frame) ? resolvePhoneFrameGeometry(rect, frame).outer : rect;

export const transformedFrameOuterRect = (
  bounds: MediaRect,
  transform: { x: number; y: number; width: number; height: number },
  frame: ClipFrame,
): MediaRect =>
  frameOuterRect(
    {
      x: bounds.x + transform.x * bounds.width,
      y: bounds.y + transform.y * bounds.height,
      width: transform.width * bounds.width,
      height: transform.height * bounds.height,
    },
    frame,
  );

export const frameContentRect = (rect: MediaRect, frame: ClipFrame, windows: WindowsFrameOptions = {}): MediaRect => {
  if (frame === 'safari') return resolveSafariFrameGeometry(rect, windows.chromeScale).content;
  if (frame === 'windows-95') return resolveWindowsFrameGeometry(rect, windows).content;
  if (isPhoneFrame(frame)) return resolvePhoneFrameGeometry(rect, frame).content;
  return rect;
};

export const frameMediaRect = (
  rect: MediaRect,
  frame: ClipFrame,
  sourceWidth: number,
  sourceHeight: number,
  windows: WindowsFrameOptions = {},
): MediaRect => {
  const content = frameContentRect(rect, frame, windows);
  return isPhoneFrame(frame) ? resolveContainedRect(content, sourceWidth, sourceHeight) : content;
};

export const frameRadius = (frame: ClipFrame, fallback: number, rect: MediaRect) =>
  Math.min(
    frame === 'safari'
      ? resolveSafariFrameGeometry(rect).radius
      : isPhoneFrame(frame)
        ? resolvePhoneFrameGeometry(rect, frame).outerRadius
        : frame === 'windows-95'
          ? 0
          : fallback,
    rect.width / 2,
    rect.height / 2,
  );

function safariPath(ctx: Canvas2DContext, points: Array<[number, number]>, close = false) {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}

function drawSafariToolbar(
  ctx: Canvas2DContext,
  rect: MediaRect,
  title: string,
  paintBackground: boolean,
  frameColor: string,
  chromeScale = 1,
) {
  const geometry = resolveSafariFrameGeometry(rect, chromeScale);
  const { header, unit, detail, radius, showText } = geometry;
  const x = (value: number) => rect.x + value * unit;
  const y = (value: number) => rect.y + value * unit;
  const line = Math.max(0.6, unit);

  if (paintBackground) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
    ctx.clip();
    ctx.fillStyle = frameColor;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  ctx.save();
  ctx.lineWidth = line;
  ctx.strokeStyle = 'rgba(75, 75, 75, .93)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const circle = (cx: number, color: string) => {
    ctx.beginPath();
    ctx.arc(x(cx), rect.y + header / 2, Math.max(1.5, 7.5 * unit), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, .08)';
    ctx.lineWidth = Math.max(0.5, 0.75 * unit);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(75, 75, 75, .93)';
    ctx.lineWidth = line;
  };
  circle(31, '#ff5f57');
  circle(57, '#febc2e');
  circle(83, '#28c840');

  const trafficRight = x(104);
  let addressLeft = trafficRight + 10 * unit;
  let addressRight = rect.x + rect.width - 14 * unit;
  if (detail !== 'compact') {
    const navX = trafficRight + 16 * unit;
    const iconSize = 20 * unit;
    ctx.strokeRect(navX, rect.y + (header - iconSize) / 2, 24 * unit, iconSize);
    safariPath(ctx, [
      [navX + 8 * unit, rect.y + (header - iconSize) / 2],
      [navX + 8 * unit, rect.y + (header + iconSize) / 2],
    ]);
    safariPath(ctx, [
      [navX + 84 * unit, y(26)],
      [navX + 75 * unit, y(34)],
      [navX + 84 * unit, y(42)],
    ]);
    safariPath(ctx, [
      [navX + 112 * unit, y(26)],
      [navX + 121 * unit, y(34)],
      [navX + 112 * unit, y(42)],
    ]);
    addressLeft = navX + 146 * unit;
  }
  if (detail === 'full') {
    const controlY = rect.y + header / 2;
    const rightX = rect.x + rect.width - 104 * unit;
    ctx.strokeRect(rightX, controlY - 7.5 * unit, 16 * unit, 15 * unit);
    safariPath(ctx, [
      [rightX + 8 * unit, controlY],
      [rightX + 8 * unit, controlY - 13 * unit],
      [rightX + 4 * unit, controlY - 9 * unit],
    ]);
    safariPath(ctx, [
      [rightX + 45 * unit, controlY],
      [rightX + 63 * unit, controlY],
    ]);
    safariPath(ctx, [
      [rightX + 54 * unit, controlY - 9 * unit],
      [rightX + 54 * unit, controlY + 9 * unit],
    ]);
    addressRight = rightX - 18 * unit;
  }

  const addressWidth = Math.max(12 * unit, addressRight - addressLeft);
  const addressHeight = Math.min(header - 6 * unit, 34 * unit);
  const addressY = rect.y + (header - addressHeight) / 2;
  ctx.fillStyle = '#f7f7f7';
  ctx.beginPath();
  ctx.roundRect(addressLeft, addressY, addressWidth, addressHeight, Math.min(addressHeight / 2, 9 * unit));
  ctx.fill();
  ctx.strokeStyle = '#d2d2d2';
  ctx.lineWidth = line;
  ctx.stroke();
  if (showText) {
    const addressTitle = title || 'website.com';
    ctx.fillStyle = '#565656';
    ctx.font = `${Math.max(7, 16 * unit)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.beginPath();
    ctx.rect(addressLeft + 4 * unit, addressY, Math.max(1, addressWidth - 8 * unit), addressHeight);
    ctx.clip();
    ctx.fillText(addressTitle, addressLeft + addressWidth / 2, rect.y + header / 2);
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(213, 213, 213, .75)';
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(rect.x + line / 2, rect.y + header - line / 2);
  ctx.lineTo(rect.x + rect.width - line / 2, rect.y + header - line / 2);
  ctx.stroke();
  ctx.restore();
}

function drawBevelEdges(ctx: Canvas2DContext, x: number, y: number, width: number, height: number, raised: boolean) {
  ctx.fillStyle = raised ? '#ffffff' : '#808080';
  ctx.fillRect(x, y, width, 1);
  ctx.fillRect(x, y, 1, height);
  ctx.fillStyle = raised ? '#808080' : '#ffffff';
  ctx.fillRect(x, y + height - 1, width, 1);
  ctx.fillRect(x + width - 1, y, 1, height);
  ctx.fillStyle = raised ? '#dfdfdf' : '#404040';
  ctx.fillRect(x + 1, y + 1, Math.max(0, width - 2), 1);
  ctx.fillRect(x + 1, y + 1, 1, Math.max(0, height - 2));
}

function drawBevel(
  ctx: Canvas2DContext,
  x: number,
  y: number,
  width: number,
  height: number,
  raised: boolean,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  drawBevelEdges(ctx, x, y, width, height, raised);
}

function drawOuterWindowsBevel(ctx: Canvas2DContext, rect: MediaRect) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rect.x, rect.y, rect.width, 1);
  ctx.fillRect(rect.x, rect.y, 1, rect.height);
  ctx.fillStyle = '#dfdfdf';
  ctx.fillRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 3), 1);
  ctx.fillRect(rect.x + 1, rect.y + 1, 1, Math.max(0, rect.height - 3));
  ctx.fillStyle = '#000000';
  ctx.fillRect(rect.x, rect.y + rect.height - 1, rect.width, 1);
  ctx.fillRect(rect.x + rect.width - 1, rect.y, 1, rect.height);
  ctx.fillStyle = '#808080';
  ctx.fillRect(rect.x + 1, rect.y + rect.height - 2, Math.max(0, rect.width - 3), 1);
  ctx.fillRect(rect.x + rect.width - 2, rect.y + 1, 1, Math.max(0, rect.height - 3));
}

function drawWindows95Frame(
  ctx: Canvas2DContext,
  rect: MediaRect,
  title: string,
  paintBackground: boolean,
  color: string,
  windows: WindowsFrameOptions,
) {
  const geometry = resolveWindowsFrameGeometry(rect, windows);
  const { unit, outerInset, titleHeight, menuHeight, scrollbarSize, detail, content, showText } = geometry;
  if (paintBackground) {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  drawOuterWindowsBevel(ctx, rect);
  const titleX = rect.x + outerInset,
    titleY = rect.y + outerInset,
    titleRight = rect.x + rect.width - outerInset,
    titleW = Math.max(1, titleRight - titleX),
    titleH = titleHeight;
  ctx.fillStyle = '#000080';
  ctx.fillRect(titleX, titleY, titleW, titleH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.max(7, Math.round(16 * unit))}px "MS Sans Serif", "Microsoft Sans Serif", Tahoma, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const buttonSize = Math.max(2, Math.min(titleH - 2, 18 * unit));
  const buttonY = titleY + (titleH - buttonSize) / 2;
  const buttonCount = detail === 'full' ? 3 : 1;
  Array.from({ length: buttonCount }, (_, index) => buttonCount - index).forEach((offset, index) => {
    const buttonX = titleRight - outerInset - buttonSize - (offset - 1) * (buttonSize + Math.max(1, unit));
    drawBevel(ctx, buttonX, buttonY, buttonSize, buttonSize, true, color);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(0.6, unit);
    const glyphInset = Math.max(2, buttonSize * 0.28);
    if (index === 0) {
      ctx.beginPath();
      ctx.moveTo(buttonX + glyphInset, buttonY + buttonSize - glyphInset);
      ctx.lineTo(buttonX + buttonSize - glyphInset, buttonY + buttonSize - glyphInset);
      ctx.stroke();
    } else if (index === 1)
      ctx.strokeRect(
        buttonX + glyphInset,
        buttonY + glyphInset,
        Math.max(2, buttonSize - glyphInset * 2),
        Math.max(2, buttonSize - glyphInset * 2),
      );
    else {
      ctx.beginPath();
      ctx.moveTo(buttonX + glyphInset, buttonY + glyphInset);
      ctx.lineTo(buttonX + buttonSize - glyphInset, buttonY + buttonSize - glyphInset);
      ctx.moveTo(buttonX + buttonSize - glyphInset, buttonY + glyphInset);
      ctx.lineTo(buttonX + glyphInset, buttonY + buttonSize - glyphInset);
      ctx.stroke();
    }
  });
  if (showText) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(titleX + 4 * unit, titleY, Math.max(1, titleW - buttonCount * (buttonSize + unit) - 8 * unit), titleH);
    ctx.clip();
    ctx.fillText(title, titleX + 8 * unit, titleY + titleH / 2);
    ctx.restore();
  }
  if (geometry.showMenu) {
    const menuY = titleY + titleH,
      menuH = menuHeight;
    ctx.fillStyle = color;
    ctx.fillRect(titleX, menuY, titleW, menuH);
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.max(7, Math.round(14 * unit))}px "MS Sans Serif", sans-serif`;
    ctx.textBaseline = 'middle';
    if (showText) {
      ctx.fillText('File', titleX + 8 * unit, menuY + menuH / 2);
      if (detail === 'full') {
        ctx.fillText('Edit', titleX + 50 * unit, menuY + menuH / 2);
        ctx.fillText('Search', titleX + 90 * unit, menuY + menuH / 2);
      }
    }
  }
  const clientX = content.x - 2,
    clientY = content.y - 2,
    clientW = content.width + 4,
    clientH = content.height + 4;
  if (paintBackground) drawBevel(ctx, clientX, clientY, clientW, clientH, false, '#ffffff');
  else drawBevelEdges(ctx, clientX, clientY, clientW, clientH, false);
  if (geometry.showScrollbars) {
    const scrollbar = scrollbarSize;
    const verticalX = content.x + content.width;
    const horizontalY = content.y + content.height;
    drawBevel(ctx, verticalX, content.y, scrollbar, scrollbar, true, color);
    drawBevel(ctx, verticalX, horizontalY - scrollbar, scrollbar, scrollbar, true, color);
    const verticalTrackY = content.y + scrollbar;
    const verticalTrackHeight = Math.max(0, horizontalY - content.y - scrollbar * 2);
    ctx.fillStyle = color;
    ctx.fillRect(verticalX, verticalTrackY, scrollbar, verticalTrackHeight);
    const verticalThumbHeight = Math.min(verticalTrackHeight, Math.max(4, 48 * unit));
    drawBevel(
      ctx,
      verticalX + 2,
      verticalTrackY + Math.max(0, (verticalTrackHeight - verticalThumbHeight) * 0.2),
      Math.max(1, scrollbar - 4),
      verticalThumbHeight,
      true,
      color,
    );
    drawBevel(ctx, content.x, horizontalY, scrollbar, scrollbar, true, color);
    drawBevel(ctx, verticalX - scrollbar, horizontalY, scrollbar, scrollbar, true, color);
    const horizontalTrackX = content.x + scrollbar;
    const horizontalTrackWidth = Math.max(0, verticalX - content.x - scrollbar * 2);
    ctx.fillStyle = color;
    ctx.fillRect(horizontalTrackX, horizontalY, horizontalTrackWidth, scrollbar);
    const horizontalThumbWidth = Math.min(horizontalTrackWidth, Math.max(4, 72 * unit));
    drawBevel(
      ctx,
      horizontalTrackX + Math.max(0, (horizontalTrackWidth - horizontalThumbWidth) * 0.2),
      horizontalY + 2,
      horizontalThumbWidth,
      Math.max(1, scrollbar - 4),
      true,
      color,
    );
    ctx.fillStyle = color;
    ctx.fillRect(verticalX, horizontalY, scrollbar, scrollbar);
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const offset = scrollbar * (0.3 + i * 0.18);
      ctx.beginPath();
      ctx.moveTo(verticalX + offset, horizontalY + scrollbar - 3);
      ctx.lineTo(verticalX + scrollbar - 3, horizontalY + offset);
      ctx.stroke();
    }
  }
}

export function drawFrameChrome(
  ctx: Canvas2DContext,
  rect: MediaRect,
  frame: ClipFrame,
  title: string,
  paintBackground = true,
  frameColor = '#c0c0c0',
  windows: WindowsFrameOptions = {},
) {
  if (frame === 'none') return;
  if (isPhoneFrame(frame)) {
    drawPhoneFrame(ctx, rect, frame, paintBackground, frameColor);
    return;
  }
  if (frame === 'safari') {
    drawSafariToolbar(ctx, rect, title, paintBackground, frameColor, windows.chromeScale);
    ctx.save();
    ctx.strokeStyle = 'rgba(169, 169, 169, .75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(
      rect.x + 0.5,
      rect.y + 0.5,
      Math.max(0, rect.width - 1),
      Math.max(0, rect.height - 1),
      resolveSafariFrameGeometry(rect, windows.chromeScale).radius,
    );
    ctx.stroke();
    ctx.restore();
    return;
  }
  drawWindows95Frame(ctx, rect, title, paintBackground, frameColor, windows);
}

export function drawFrameOverlay(
  ctx: Canvas2DContext,
  rect: MediaRect,
  frame: ClipFrame,
  title: string,
  frameColor = '#c0c0c0',
  windows: WindowsFrameOptions = {},
) {
  if (frame === 'none') return;
  const content = frameContentRect(rect, frame, windows);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.rect(content.x, content.y, content.width, content.height);
  ctx.clip('evenodd');
  drawFrameChrome(ctx, rect, frame, title, true, frameColor, windows);
  ctx.restore();
  drawFrameChrome(ctx, rect, frame, title, false, frameColor, windows);
}

import type { ResizeCorner, ResizeHandlePosition, ResizeHandlePositions } from '~/ui/ResizeHandle/types';
import {
  hasPerspectiveTilt,
  perspectiveCoverScale,
  projectPerspectivePoint,
  unprojectPerspectivePoint,
} from '../../zoom/perspective-projection';
import type { CanvasRect } from './layer-transform-geometry';
import type { VideoWindowBounds } from './useCameraZoom';

export interface LayerSelectionPresentation {
  handleStyle: {
    display?: string;
    left?: string;
    top?: string;
    width?: string;
    height?: string;
  };
  handlePositions?: ResizeHandlePositions;
  perspectiveCorners?: [ResizeHandlePosition, ResizeHandlePosition, ResizeHandlePosition, ResizeHandlePosition];
}

const anchorPoint = (rect: CanvasRect, anchor: ResizeCorner): ResizeHandlePosition => {
  const horizontal = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5;
  const vertical = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
  return { x: rect.left + rect.width * horizontal, y: rect.top + rect.height * vertical };
};

export const layerSelectionPresentation = (
  selection: { layout: CanvasRect; viewport: VideoWindowBounds } | null,
  projectPerspective: boolean,
): LayerSelectionPresentation => {
  if (!selection) return { handleStyle: { display: 'none' } };
  const { layout, viewport } = selection;
  const transform = { tiltX: viewport.tiltX ?? 0, tiltY: viewport.tiltY ?? 0 };
  if (!projectPerspective || !hasPerspectiveTilt(transform))
    return {
      handleStyle: {
        left: `${layout.left - viewport.dx}px`,
        top: `${layout.top - viewport.dy}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
      },
    };

  const bounds = { x: viewport.dx, y: viewport.dy, width: viewport.dw, height: viewport.dh };
  const coverScale = perspectiveCoverScale(bounds.width, bounds.height, transform);
  const anchors: ResizeCorner[] = [
    'top-left',
    'top',
    'top-right',
    'right',
    'bottom-right',
    'bottom',
    'bottom-left',
    'left',
  ];
  const projected = Object.fromEntries(
    anchors.map((anchor) => [
      anchor,
      projectPerspectivePoint(anchorPoint(layout, anchor), bounds, transform, coverScale),
    ]),
  ) as Record<ResizeCorner, ResizeHandlePosition>;
  const cornerPoints = [
    projected['top-left'],
    projected['top-right'],
    projected['bottom-right'],
    projected['bottom-left'],
  ];
  const left = Math.min(...cornerPoints.map((point) => point.x));
  const top = Math.min(...cornerPoints.map((point) => point.y));
  const right = Math.max(...cornerPoints.map((point) => point.x));
  const bottom = Math.max(...cornerPoints.map((point) => point.y));
  const local = (point: ResizeHandlePosition) => ({ x: point.x - left, y: point.y - top });
  return {
    handleStyle: {
      left: `${left - viewport.dx}px`,
      top: `${top - viewport.dy}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
    },
    handlePositions: Object.fromEntries(anchors.map((anchor) => [anchor, local(projected[anchor])])),
    perspectiveCorners: cornerPoints.map(local) as LayerSelectionPresentation['perspectiveCorners'],
  };
};

export const perspectivePointerDelta = (
  rect: CanvasRect | null,
  viewport: VideoWindowBounds,
  anchor: ResizeCorner | undefined,
  screenDelta: ResizeHandlePosition,
): ResizeHandlePosition => {
  rect ??= { left: viewport.dx, top: viewport.dy, width: viewport.dw, height: viewport.dh };
  const transform = { tiltX: viewport.tiltX ?? 0, tiltY: viewport.tiltY ?? 0 };
  if (!hasPerspectiveTilt(transform)) return screenDelta;
  const bounds = { x: viewport.dx, y: viewport.dy, width: viewport.dw, height: viewport.dh };
  const coverScale = perspectiveCoverScale(bounds.width, bounds.height, transform);
  const source = anchor ? anchorPoint(rect, anchor) : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const projected = projectPerspectivePoint(source, bounds, transform, coverScale);
  const target = unprojectPerspectivePoint(
    { x: projected.x + screenDelta.x, y: projected.y + screenDelta.y },
    bounds,
    transform,
    coverScale,
  );
  return { x: target.x - source.x, y: target.y - source.y };
};

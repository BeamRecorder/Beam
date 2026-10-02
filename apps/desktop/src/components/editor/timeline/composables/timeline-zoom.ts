export const MIN_TIMELINE_ZOOM = 100;
export const MAX_TIMELINE_ZOOM = 3_200;

export const clampTimelineZoom = (zoom: number) =>
  Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, Math.round(zoom)));

const zoomStep = (zoom: number, compact: boolean) => {
  if (zoom < 500) return compact ? 25 : 50;
  if (zoom < 1_000) return compact ? 50 : 100;
  return compact ? 100 : 250;
};

export const zoomTimelineByButton = (zoom: number, direction: -1 | 1) =>
  clampTimelineZoom(zoom + zoomStep(zoom, false) * direction);

export const zoomTimelineByWheel = (zoom: number, deltaY: number) =>
  clampTimelineZoom(zoom + zoomStep(zoom, true) * (deltaY < 0 ? 1 : -1));

export const timelineVisualScale = (element: HTMLElement | null, measuredVisualWidth?: number): number => {
  if (!element) return 1;
  const layoutWidth = element.offsetWidth || element.clientWidth;
  const visualWidth = measuredVisualWidth ?? element.getBoundingClientRect().width;
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0 || !Number.isFinite(visualWidth) || visualWidth <= 0) return 1;
  return visualWidth / layoutWidth;
};

export const timelineLayoutToVisualPixels = (
  pixels: number,
  element: HTMLElement | null,
  measuredVisualWidth?: number,
) => pixels * timelineVisualScale(element, measuredVisualWidth);

export const timelineVisualToLayoutPixels = (
  pixels: number,
  element: HTMLElement | null,
  measuredVisualWidth?: number,
) => pixels / timelineVisualScale(element, measuredVisualWidth);

export function timelineMoveScale(
  durationSeconds: number,
  rulerWidth: number,
  ticks: HTMLElement | null,
  scroll: HTMLElement | null,
) {
  const baseDurationMs = Math.max(1, Math.round(durationSeconds * 1_000));
  const width = Math.max(
    1,
    rulerWidth || ticks?.getBoundingClientRect().width || scroll?.getBoundingClientRect().width || 1_000,
  );
  return {
    baseDurationMs,
    width,
    msPerPx: baseDurationMs / width,
    visualScale: timelineVisualScale(ticks),
  };
}

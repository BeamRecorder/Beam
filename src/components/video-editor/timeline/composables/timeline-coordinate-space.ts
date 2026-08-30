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

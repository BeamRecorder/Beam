export function loadRecorderWindow(search: string): Promise<unknown> {
  const query = new URLSearchParams(search);
  if (query.has('cameraOverlay') || query.has('quickSnipCrop')) return import('./overlay-main');
  return import('./main');
}

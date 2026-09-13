const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0']);

export function installBrowserZoomGuard(target: Window = window): () => void {
  const preventWheelZoom = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };
  const preventKeyboardZoom = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ZOOM_KEYS.has(event.key)) event.preventDefault();
  };

  target.addEventListener('wheel', preventWheelZoom, { passive: false });
  target.addEventListener('keydown', preventKeyboardZoom);

  return () => {
    target.removeEventListener('wheel', preventWheelZoom);
    target.removeEventListener('keydown', preventKeyboardZoom);
  };
}

// Revalidating a retained catalogue must not rebuild its cards before the first
// visible frame. Two frames allow presentation before any IPC/data processing.
export function createProjectPickerRefresh(refresh: () => void) {
  let frame: number | null = null;
  const cancel = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };
  const schedule = () => {
    cancel();
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        frame = null;
        refresh();
      });
    });
  };
  return { schedule, cancel };
}

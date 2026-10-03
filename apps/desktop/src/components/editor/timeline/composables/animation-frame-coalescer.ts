export function createAnimationFrameCoalescer<Value>(apply: (value: Value) => void) {
  let frame = 0;
  let pending: Value | null = null;

  const flush = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (pending === null) return;
    const value = pending;
    pending = null;
    apply(value);
  };

  const schedule = (value: Value) => {
    pending = value;
    if (frame) return;
    frame = requestAnimationFrame(flush);
  };

  const cancel = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
  };

  return { schedule, flush, cancel };
}

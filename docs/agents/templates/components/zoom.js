/** Smooth camera motion stays on an inner stage, preserving the outer clip geometry. */
export function createZoomTrack(gsap, stage, { width, height, keyframes, perspective = 1600 }) {
  if (
    !stage ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(perspective) ||
    perspective <= 0 ||
    !keyframes.length
  )
    throw new Error('Zoom requires a stage, positive dimensions and keyframes.');
  let previous = -1;
  const frames = keyframes.map((frame) => {
    const { timeMs, scale, focusX = 0.5, focusY = 0.5, rotateX = 0, rotateY = 0 } = frame;
    if (
      !Number.isFinite(timeMs) ||
      timeMs < 0 ||
      timeMs <= previous ||
      !Number.isFinite(scale) ||
      scale <= 0 ||
      !Number.isFinite(focusX) ||
      focusX < 0 ||
      focusX > 1 ||
      !Number.isFinite(focusY) ||
      focusY < 0 ||
      focusY > 1 ||
      !Number.isFinite(rotateX) ||
      !Number.isFinite(rotateY)
    )
      throw new Error('Zoom keyframes need increasing times, positive scale and normalized focus.');
    previous = timeMs;
    return { ...frame, scale, rotateX, rotateY, x: (0.5 - focusX) * width * scale, y: (0.5 - focusY) * height * scale };
  });
  const values = (frame) => ({
    x: frame.x,
    y: frame.y,
    scale: frame.scale,
    rotationX: frame.rotateX,
    rotationY: frame.rotateY,
  });
  const timeline = gsap.timeline({ paused: true });
  timeline.set(stage, { ...values(frames[0]), transformOrigin: '50% 50%', transformPerspective: perspective }, 0);
  frames.slice(1).forEach((frame, index) => {
    const start = frames[index].timeMs;
    timeline.to(
      stage,
      { ...values(frame), duration: (frame.timeMs - start) / 1000, ease: frame.ease ?? 'power3.inOut' },
      start / 1000,
    );
  });
  const seek = (timeMs) => {
    if (!Number.isFinite(timeMs)) throw new Error('Zoom time must be finite.');
    timeline.time(Math.max(0, timeMs / 1000), false);
  };
  seek(0);
  return { seek, dispose: () => timeline.kill() };
}

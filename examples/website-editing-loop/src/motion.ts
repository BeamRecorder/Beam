import { gsap } from "gsap";
import type { DemoPose } from "./demo-types";

export const DURATION_MS = 5000;
export const TRACK_WIDTH = 464;
export const TRACK_LEFT = 119;
export const SCREEN_Y = 277;
export const INITIAL_DURATION = 5400;
export const TRIMMED_DURATION = 3750;
export const INITIAL_NEXT_START = 6600;
export const FIRST_START = 500;
export const FINAL_NEXT_START = FIRST_START + TRIMMED_DURATION;
export const px = (timeMs: number) => (timeMs / 10000) * TRACK_WIDTH;

export const initialPose = (): DemoPose => ({
  trim: 0,
  move: 0,
  cursorX: 548,
  cursorY: 322,
  cursorScale: 1,
  trimActive: 0,
  moveActive: 0,
  snapOpacity: 0,
  camera: 0,
});

export function createMotion(pose: DemoPose) {
  const tl = gsap.timeline({ paused: true });
  const trimX = TRACK_LEFT + px(FIRST_START + INITIAL_DURATION) - 5;
  const trimmedX = TRACK_LEFT + px(FINAL_NEXT_START) - 5;
  const grabX = TRACK_LEFT + px(INITIAL_NEXT_START) + 30;
  const dropX = TRACK_LEFT + px(FINAL_NEXT_START) + 30;
  tl.to(
    pose,
    { cursorX: trimX, cursorY: SCREEN_Y, duration: 0.55, ease: "power3.inOut" },
    0.15,
  );
  tl.to(
    pose,
    { cursorScale: 0.86, trimActive: 1, duration: 0.09, ease: "power2.out" },
    0.73,
  );
  // Edge and pointer share one interval; the grip cannot drift during the drag.
  tl.to(
    pose,
    { trim: 1, cursorX: trimmedX, duration: 1.02, ease: "sine.inOut" },
    0.88,
  );
  tl.to(pose, { camera: 1, duration: 1.4, ease: "sine.inOut" }, 0.6);
  tl.to(
    pose,
    { cursorScale: 1, trimActive: 0, duration: 0.1, ease: "power1.out" },
    1.94,
  );
  tl.to(
    pose,
    {
      cursorX: grabX,
      cursorY: SCREEN_Y - 3,
      duration: 0.38,
      ease: "power2.inOut",
    },
    2.08,
  );
  tl.to(
    pose,
    { cursorScale: 0.86, moveActive: 1, duration: 0.09, ease: "power2.out" },
    2.5,
  );
  tl.to(
    pose,
    { move: 1, cursorX: dropX, duration: 0.78, ease: "power3.inOut" },
    2.65,
  );
  tl.to(pose, { snapOpacity: 1, duration: 0.12, ease: "power1.out" }, 3.33);
  tl.to(
    pose,
    { cursorScale: 1, moveActive: 0, duration: 0.1, ease: "power1.out" },
    3.49,
  );
  tl.to(pose, { snapOpacity: 0, duration: 0.28, ease: "sine.in" }, 3.63);
  tl.to(
    pose,
    { cursorX: 548, cursorY: 322, duration: 0.58, ease: "power2.inOut" },
    3.68,
  );
  tl.to(
    pose,
    { trim: 0, move: 0, camera: 0, duration: 0.7, ease: "sine.inOut" },
    4.2,
  );
  tl.to({}, { duration: 0.1 }, 4.9);
  tl.seek(0, false);
  return tl;
}

export function seekSeconds(timeMs: number) {
  if (!Number.isFinite(timeMs))
    throw new RangeError("Composition time must be finite.");
  return Math.max(0, Math.min(DURATION_MS, timeMs)) / 1000;
}

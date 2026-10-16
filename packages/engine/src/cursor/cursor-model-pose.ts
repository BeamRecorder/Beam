import type { CursorButtonEvent, CursorEvent } from '../capture/capture-session';
import type { CursorMotionSample } from './cursor-motion';
import type { CursorModelPose } from './cursor-exposure-types';

/** Contact follows recorded press/release timing, including a long drag and reverse seeking. */
export function createCursorModelPose(events: readonly CursorEvent[]) {
  const buttons = new Map<number, CursorButtonEvent[]>();
  for (const event of events
    .filter((event): event is CursorButtonEvent => event.event === 'button')
    .sort((a, b) => a.sessionNs - b.sessionNs)) {
    const list = buttons.get(event.button) ?? [];
    list.push(event);
    buttons.set(event.button, list);
  }
  return (
    time: number,
    motion: CursorMotionSample,
    animatedButtons: readonly number[],
    intensityAt: (button: number) => number = () => 1,
  ): CursorModelPose => {
    let height = 0.32,
      active = false;
    const contact = (value: number) => {
      height = active ? Math.min(height, value) : value;
      active = true;
    };
    for (const button of animatedButtons) {
      const intensity = Math.max(0, Math.min(2, intensityAt(button)));
      if (!intensity) continue;
      const contactForButton = (value: number) => contact(0.32 + (value - 0.32) * intensity);
      const list = buttons.get(button) ?? [];
      let low = 0,
        high = list.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (list[mid]!.sessionNs / 1e9 <= time) low = mid + 1;
        else high = mid;
      }
      const previous = list[low - 1],
        next = list[low];
      if (previous?.pressed) {
        contactForButton(0);
        continue;
      }
      if (next?.pressed) {
        const lead = (next.sessionNs / 1e9 - time) / 0.18;
        if (lead >= 0 && lead < 1) contactForButton(0.32 * lead * lead * (3 - 2 * lead));
      }
      if (previous && !previous.pressed) {
        const age = time - previous.sessionNs / 1e9;
        if (age < 0.4) contactForButton(0.32 * (1 - Math.exp(-18 * age) * Math.cos(25 * age)));
      }
    }
    const dt = Math.max(1e-6, motion.deltaSeconds);
    const clamp = (value: number) => Math.max(-0.14, Math.min(0.14, value));
    return {
      pitch: 0.22 + clamp(((motion.y - motion.previousY) / dt) * 0.035),
      yaw: -0.25 + clamp(((motion.x - motion.previousX) / dt) * 0.035),
      height: Math.max(0, Math.min(0.6, height)),
    };
  };
}

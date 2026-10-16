import type { CursorEvent } from '../capture/capture-session';

/** Start of the current visible run, on the immutable recording clock. */
export function createCursorVisibleSince(events: readonly CursorEvent[]) {
  const changes: { time: number; visible: boolean; since: number }[] = [];
  let visible = true,
    since = 0;
  for (const event of events
    .filter((event) => event.event === 'move' || event.event === 'visibility')
    .sort((a, b) => a.sessionNs - b.sessionNs)) {
    if ((event.event !== 'move' && event.event !== 'visibility') || event.visible === visible) continue;
    visible = event.visible;
    if (visible) since = event.sessionNs / 1e9;
    changes.push({ time: event.sessionNs / 1e9, visible, since });
  }
  return (time: number): number | null => {
    let low = 0,
      high = changes.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (changes[mid]!.time <= time) low = mid + 1;
      else high = mid;
    }
    const current = changes[low - 1];
    return !current ? 0 : current.visible ? current.since : null;
  };
}

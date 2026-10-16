// Planning adapted from OpenScreen (MIT); see public/THIRD_PARTY_NOTICES.md.
import { ZOOM_DEPTH_SCALES, type ZoomDepth } from './zoom-types';
import { cinematicZoomDurationMs } from './zoom-transitions';
import { ZOOM_IN_MS, ZOOM_OUT_MS } from './zoom-playback';
import type { ZoomAction, ZoomShot, ZoomShotBox, ZoomShotOptions } from './zoom-shot-types';
import { mergeActionBox as mergeBox, recordingZoomActions } from './zoom-actions';

const MARGIN = 0.12;
const MERGE_GAP_MS = 2500;
const RAPID_BURST_MS = 500;
const WIDE_GAP_MS = 1500;
const MIN_HOLD_MS = 1000;
const ACTION_WINDOW_MS = 8000;
const fittedDepth = (box: ZoomShotBox): ZoomDepth | null => {
  const extent = Math.max(box.right - box.left, box.bottom - box.top) + MARGIN * 2;
  return ([3, 2, 1] as const).find((depth) => extent * ZOOM_DEPTH_SCALES[depth] <= 1) ?? null;
};
const rampFor = (shot: Pick<ZoomShot, 'depth'>) => cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[shot.depth]);

/** Group nearby intentions; connect crowded shots without deleting their actions. */
export function planZoomShots(options: ZoomShotOptions): ZoomShot[] {
  const { durationMs } = options;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  const bounds = options.bounds ?? { wideUntilMs: 0, wideFromMs: durationMs - 1000 };
  const actions = recordingZoomActions(options.telemetry).filter(
    (action) => action.startMs < (bounds.ignoreClicksFromMs ?? durationMs - 1000),
  );
  const groups: { actions: ZoomAction[]; box: ZoomShotBox }[] = [];
  for (const action of actions) {
    const previous = groups.at(-1);
    const box = previous ? mergeBox(previous.box, action.box) : action.box;
    if (
      previous &&
      action.startMs - previous.actions.at(-1)!.endMs <= MERGE_GAP_MS &&
      action.startMs - previous.actions[0]!.startMs <= ACTION_WINDOW_MS &&
      ((fittedDepth(box) ?? 0) >= 2 || action.startMs - previous.actions.at(-1)!.endMs < RAPID_BURST_MS)
    ) {
      previous.actions.push(action);
      previous.box = box;
    } else groups.push({ actions: [action], box: action.box });
  }
  const reserved = (options.reserved ?? [])
    .filter((zoom) => zoom.enabled !== false && zoom.effect !== 'glass')
    .map((zoom) => {
      return {
        start: zoom.startMs - (zoom.transition === 'cinematic' ? rampFor(zoom) : ZOOM_IN_MS),
        end: zoom.endMs + (zoom.transition === 'cinematic' ? rampFor(zoom) : ZOOM_OUT_MS),
      };
    });
  const blocked = (shot: ZoomShot) =>
    reserved.some(
      (fixed) =>
        shot.startMs - rampFor(shot) < fixed.end + WIDE_GAP_MS &&
        shot.endMs + rampFor(shot) > fixed.start - WIDE_GAP_MS,
    );
  const plan: ZoomShot[] = [];
  for (const group of groups) {
    // Wide drags use the shallowest zoom and the normal auto-follow camera.
    const depth = fittedDepth(group.box) ?? 1;
    const ramp = cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[depth]);
    const earliest = Math.ceil(Math.max(0, bounds.wideUntilMs) + ramp);
    const latest = Math.floor(Math.min(durationMs, bounds.wideFromMs) - ramp);
    const first = group.actions[0]!.startMs,
      last = group.actions.at(-1)!.endMs;
    const startMs = Math.ceil(Math.max(earliest, Math.min(first - 500, latest - MIN_HOLD_MS)));
    const endMs = Math.floor(Math.min(latest, Math.max(last + 500, startMs + MIN_HOLD_MS)));
    if (
      endMs - startMs < MIN_HOLD_MS ||
      !group.actions.some((action) => action.endMs >= startMs - ramp && action.startMs <= endMs)
    )
      continue;
    let shot: ZoomShot = {
      startMs,
      endMs,
      firstClickMs: first,
      focus: { ...group.actions[0]!.focus },
      depth,
      box: group.box,
      clicks: group.actions.length,
      actions: group.actions,
    };
    if (blocked(shot)) continue;
    const previous = plan.at(-1);
    if (previous && previous.endMs > shot.startMs) {
      // Ramp occupancy is not evidence that two intentions belong together.
      // Share the idle interval, leaving each complete press/release intact.
      // At a clip boundary there may be no room for another distinct hold.
      // Keep that burst in one shot instead of emitting a reversed/empty interval.
      const lowerBoundary = Math.max(previous.startMs + 200, previous.actions.at(-1)!.endMs);
      const upperBoundary = Math.min(shot.endMs - 200, first);
      if (lowerBoundary > upperBoundary) {
        previous.box = mergeBox(previous.box, shot.box);
        previous.depth = fittedDepth(previous.box) ?? 1;
        previous.endMs = Math.max(previous.endMs, shot.endMs);
        previous.actions = [...previous.actions, ...shot.actions];
        previous.clicks += shot.clicks;
        continue;
      }
      const boundary = Math.max(
        lowerBoundary,
        Math.min(upperBoundary, Math.round((previous.actions.at(-1)!.endMs + first) / 2)),
      );
      previous.endMs = Math.min(previous.endMs, boundary);
      shot = { ...shot, startMs: Math.max(shot.startMs, boundary) };
    }
    if (shot.clicks) plan.push(shot);
  }
  return plan;
}

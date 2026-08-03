import type { ClipComposition } from "../../composition/composition-types";
import type { ZoomElement } from "../../zoom/zoom-types";

export interface SnapTargetParams {
  composition: ClipComposition;
  zoomElements: ZoomElement[];
  currentTime: number;
  duration: number;
  ignoreClipIds?: string[];
  ignoreZoomIds?: string[];
  ignorePlayhead?: boolean;
}

export interface SnapResult {
  snappedValueMs: number;
  targetMs: number;
}

export const collectSnapTargets = ({
  composition,
  zoomElements,
  currentTime,
  duration,
  ignoreClipIds = [],
  ignoreZoomIds = [],
  ignorePlayhead = false,
}: SnapTargetParams): number[] => {
  const durationMs = Math.round(duration * 1_000);
  const targets = new Set<number>();

  targets.add(0);
  if (durationMs > 0) targets.add(durationMs);

  if (!ignorePlayhead) {
    const playheadMs = Math.round(currentTime * 1_000);
    if (playheadMs >= 0 && playheadMs <= durationMs) {
      targets.add(playheadMs);
    }
  }

  const ignoreClipsSet = new Set(ignoreClipIds);
  for (const clip of composition.clips) {
    if (ignoreClipsSet.has(clip.id)) continue;
    targets.add(clip.timelineStartMs);
    targets.add(clip.timelineStartMs + clip.timelineDurationMs);
  }

  const ignoreZoomsSet = new Set(ignoreZoomIds);
  for (const zoom of zoomElements) {
    if (ignoreZoomsSet.has(zoom.id)) continue;
    targets.add(zoom.startMs);
    targets.add(zoom.endMs);
  }

  return Array.from(targets).sort((left, right) => left - right);
};

export const calculateSnapThresholdMs = (
  durationMs: number,
  rulerWidthPx: number,
  thresholdPx = 10,
  defaultFallbackMs = 120,
): number => {
  if (rulerWidthPx <= 0 || durationMs <= 0) return defaultFallbackMs;
  const msPerPixel = durationMs / rulerWidthPx;
  return Math.max(20, Math.round(thresholdPx * msPerPixel));
};

export const snapValue = (
  proposedMs: number,
  targets: number[],
  thresholdMs: number,
): SnapResult | null => {
  let minDiff = Infinity;
  let bestTarget: number | null = null;

  for (const target of targets) {
    const diff = Math.abs(proposedMs - target);
    if (diff <= thresholdMs && diff < minDiff) {
      minDiff = diff;
      bestTarget = target;
    }
  }

  if (bestTarget === null) return null;
  return {
    snappedValueMs: bestTarget,
    targetMs: bestTarget,
  };
};

export const snapSpan = (
  proposedStartMs: number,
  spanLengthMs: number,
  targets: number[],
  thresholdMs: number,
): { snappedStartMs: number; targetMs: number } | null => {
  const proposedEndMs = proposedStartMs + spanLengthMs;

  let minDiff = Infinity;
  let bestStartMs: number | null = null;
  let bestTargetMs: number | null = null;

  for (const target of targets) {
    const startDiff = Math.abs(proposedStartMs - target);
    if (startDiff <= thresholdMs && startDiff < minDiff) {
      minDiff = startDiff;
      bestStartMs = target;
      bestTargetMs = target;
    }

    const endDiff = Math.abs(proposedEndMs - target);
    if (endDiff <= thresholdMs && endDiff < minDiff) {
      minDiff = endDiff;
      bestStartMs = target - spanLengthMs;
      bestTargetMs = target;
    }
  }

  if (bestStartMs === null || bestTargetMs === null) return null;
  return {
    snappedStartMs: bestStartMs,
    targetMs: bestTargetMs,
  };
};

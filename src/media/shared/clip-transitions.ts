import type { Clip, ClipKind, ClipTransition, ClipTransitions, TransitionPreset } from './composition-types';

export const DEFAULT_TRANSITION_DURATION_MS = 500;
export const MAX_TRANSITION_DURATION_MS = 5_000;
export const EMPTY_CLIP_TRANSITIONS: ClipTransitions = Object.freeze({ entry: null, exit: null });

export interface ClipTransitionState {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  blur: number;
}

export interface TransitionDefinition {
  kind: TransitionPreset['kind'];
  domains: readonly ['visual'] | readonly ['visual', 'audio'];
  labelKey: string;
  defaultDurationMs: number;
}

export const TRANSITION_DEFINITIONS = {
  fade: { kind: 'fade', domains: ['visual', 'audio'], labelKey: 'fade', defaultDurationMs: 500 },
  slide: { kind: 'slide', domains: ['visual'], labelKey: 'slide', defaultDurationMs: 500 },
  zoom: { kind: 'zoom', domains: ['visual'], labelKey: 'zoom', defaultDurationMs: 500 },
  blur: { kind: 'blur', domains: ['visual'], labelKey: 'blur', defaultDurationMs: 500 },
} as const satisfies Record<TransitionPreset['kind'], TransitionDefinition>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const visualKind = (kind: ClipKind) => kind !== 'audio';

const presetAllowed = (kind: ClipKind, preset: TransitionPreset) =>
  (visualKind(kind) || preset.kind === 'fade') &&
  (preset.kind === 'fade' ||
    preset.kind === 'blur' ||
    (preset.kind === 'slide' && ['left', 'right', 'up', 'down'].includes(preset.direction)) ||
    (preset.kind === 'zoom' && ['in', 'out'].includes(preset.direction)));

export function normalizeClipTransitions(
  transitions: ClipTransitions,
  timelineDurationMs: number,
  kind: ClipKind,
): ClipTransitions {
  const normalize = (transition: ClipTransition | null): ClipTransition | null => {
    if (!transition || !transition.preset || !presetAllowed(kind, transition.preset)) return null;
    const durationMs = Number.isFinite(transition.durationMs)
      ? Math.max(0, Math.min(MAX_TRANSITION_DURATION_MS, Math.round(transition.durationMs)))
      : 0;
    return durationMs > 0 ? { preset: { ...transition.preset }, durationMs } : null;
  };
  const next = { entry: normalize(transitions.entry), exit: normalize(transitions.exit) };
  const total = (next.entry?.durationMs ?? 0) + (next.exit?.durationMs ?? 0);
  const available = Math.max(0, Math.round(timelineDurationMs));
  if (total <= available || total === 0) return next;
  const ratio = available / total;
  const both = Boolean(next.entry && next.exit && available >= 2);
  const entryDuration = next.entry
    ? both
      ? Math.max(1, Math.min(available - 1, Math.floor(next.entry.durationMs * ratio)))
      : Math.round(next.entry.durationMs * ratio)
    : 0;
  const exitDuration = available - entryDuration;
  return {
    entry: next.entry && entryDuration > 0 ? { ...next.entry, durationMs: entryDuration } : null,
    exit: next.exit && exitDuration > 0 ? { ...next.exit, durationMs: exitDuration } : null,
  };
}

export function normalizeCanvasTransitions(transitions: ClipTransitions, timelineDurationMs: number): ClipTransitions {
  return normalizeClipTransitions(transitions, timelineDurationMs, 'screen');
}

const identity = (): ClipTransitionState => ({ opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 });

function evaluatePreset(preset: TransitionPreset, progress: number): ClipTransitionState {
  const state = identity();
  state.opacity = progress;
  const remaining = 1 - progress;
  if (preset.kind === 'slide') {
    if (preset.direction === 'left') state.translateX = -0.08 * remaining;
    if (preset.direction === 'right') state.translateX = 0.08 * remaining;
    if (preset.direction === 'up') state.translateY = -0.08 * remaining;
    if (preset.direction === 'down') state.translateY = 0.08 * remaining;
  } else if (preset.kind === 'zoom') {
    state.scale = 1 + (preset.direction === 'in' ? -0.04 : 0.04) * remaining;
  } else if (preset.kind === 'blur') state.blur = 12 * remaining;
  return state;
}

export function resolveClipTransitionState(
  clip: Pick<Clip, 'timelineStartMs' | 'timelineDurationMs' | 'transitions'>,
  timeMs: number,
) {
  return resolveTransitionState(
    clip.transitions ?? EMPTY_CLIP_TRANSITIONS,
    timeMs - clip.timelineStartMs,
    clip.timelineDurationMs,
  );
}

export function resolveTransitionState(
  transitions: ClipTransitions,
  localTimeMs: number,
  timelineDurationMs: number,
): ClipTransitionState {
  if (localTimeMs < 0 || localTimeMs > timelineDurationMs) return identity();
  if (transitions.entry && localTimeMs < transitions.entry.durationMs) {
    const linear = clamp01(localTimeMs / transitions.entry.durationMs);
    return evaluatePreset(transitions.entry.preset, 1 - (1 - linear) ** 3);
  }
  const remaining = timelineDurationMs - localTimeMs;
  if (transitions.exit && remaining < transitions.exit.durationMs) {
    const linear = clamp01(remaining / transitions.exit.durationMs);
    return evaluatePreset(transitions.exit.preset, linear ** 3);
  }
  return identity();
}

export function resolveCanvasTransitionState(
  transitions: ClipTransitions,
  timeMs: number,
  timelineDurationMs: number,
): ClipTransitionState | null {
  const normalized = normalizeCanvasTransitions(transitions, timelineDurationMs);
  const remaining = timelineDurationMs - timeMs;
  const active =
    (normalized.entry && timeMs >= 0 && timeMs < normalized.entry.durationMs) ||
    (normalized.exit && remaining >= 0 && remaining < normalized.exit.durationMs);
  return active ? resolveTransitionState(normalized, timeMs, timelineDurationMs) : null;
}

export function audioTransitionGainAt(
  clip: Pick<Clip, 'timelineStartMs' | 'timelineDurationMs' | 'transitions'>,
  timeMs: number,
) {
  const local = timeMs - clip.timelineStartMs;
  if (local < 0 || local > clip.timelineDurationMs) return 0;
  const entry = clip.transitions?.entry;
  const exit = clip.transitions?.exit;
  const entryGain = entry ? clamp01(local / entry.durationMs) : 1;
  const exitGain = exit ? clamp01((clip.timelineDurationMs - local) / exit.durationMs) : 1;
  return Math.min(entryGain, exitGain);
}

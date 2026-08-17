import type { InputEventSidecar, InputKey } from '~/api/types/capture-session';
import { createDefaultCaptionStyle } from './composition-defaults';
import type {
  CaptionClip,
  KeyboardCaptionModifier,
  KeyboardCaptionPlatform,
  KeyboardCaptionStep,
} from './composition-types';
import { sourceTimeAt } from './timeline-mapping';

export const KEYBOARD_CAPTION_BURST_GAP_MS = 600;
export const KEYBOARD_CAPTION_TAIL_MS = 1_200;

export interface KeyboardCaptionRun {
  text: string;
  fontScale: number;
  opacity: number;
  separator: 'none' | 'chord' | 'sequence';
}

const modifierOrder: KeyboardCaptionModifier[] = ['control', 'shift', 'alt', 'meta'];

const modifierLabel = (modifier: KeyboardCaptionModifier, platform: KeyboardCaptionPlatform) => {
  if (platform === 'macos') return { control: '⌃', shift: '⇧', alt: '⌥', meta: '⌘' }[modifier];
  if (modifier === 'meta') return platform === 'windows' ? 'Win' : 'Super';
  return { control: 'Ctrl', shift: 'Shift', alt: 'Alt' }[modifier];
};

const keyLabels: Partial<Record<InputKey, string>> = {
  'arrow-up': '↑',
  'arrow-down': '↓',
  'arrow-left': '←',
  'arrow-right': '→',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  'page-up': 'Page Up',
  'page-down': 'Page Down',
  space: 'Space',
};

export const keyboardKeyLabel = (key: string) => {
  const known = key as InputKey;
  if (keyLabels[known]) return keyLabels[known]!;
  if (/^digit[0-9]$/.test(key)) return key.slice(-1);
  if (/^f(?:[1-9]|1[0-2])$/.test(key)) return key.toUpperCase();
  return key.length === 1 ? key.toUpperCase() : key;
};

export const keyboardStepLabels = (step: KeyboardCaptionStep, platform: KeyboardCaptionPlatform) => [
  ...modifierOrder
    .filter((modifier) => step.modifiers.includes(modifier))
    .map((modifier) => modifierLabel(modifier, platform)),
  keyboardKeyLabel(step.key),
];

export function keyboardCaptionRuns(
  steps: readonly KeyboardCaptionStep[],
  platform: KeyboardCaptionPlatform,
): KeyboardCaptionRun[] {
  const runs: KeyboardCaptionRun[] = [];
  steps.forEach((step, stepIndex) => {
    if (stepIndex > 0) runs.push({ text: ' → ', fontScale: 0.75, opacity: 0.65, separator: 'sequence' });
    keyboardStepLabels(step, platform).forEach((label, labelIndex) => {
      if (labelIndex > 0) runs.push({ text: ' + ', fontScale: 0.65, opacity: 0.55, separator: 'chord' });
      runs.push({ text: label, fontScale: 1, opacity: 1, separator: 'none' });
    });
  });
  return runs;
}

export const keyboardCaptionText = (steps: readonly KeyboardCaptionStep[], platform: KeyboardCaptionPlatform) =>
  keyboardCaptionRuns(steps, platform)
    .map((run) => run.text)
    .join('');

export function keyboardCaptionRunsAt(clip: CaptionClip, timelineTimeMs: number): KeyboardCaptionRun[] {
  if (clip.caption.type !== 'keyboard') return [];
  if (clip.caption.style.customText)
    return [{ text: clip.caption.style.customText, fontScale: 1, opacity: 1, separator: 'none' }];
  const sourceMs = sourceTimeAt(clip, timelineTimeMs);
  if (sourceMs === null) return [];
  return keyboardCaptionRuns(
    clip.caption.steps.filter((step) => step.offsetMs <= sourceMs),
    clip.caption.recordedPlatform,
  );
}

const toMilliseconds = (sessionNs: number) => Math.round(sessionNs / 1_000_000);

export function keyboardCaptionClipsFromInput(
  sidecar: InputEventSidecar,
  sourceSessionId: string,
  recordedPlatform: KeyboardCaptionPlatform,
): CaptionClip[] {
  const presses = sidecar.events
    .flatMap((event, index) =>
      event.event === 'shortcut' && event.pressed
        ? [{ index, timeMs: toMilliseconds(event.sessionNs), modifiers: event.modifiers, key: event.key }]
        : [],
    )
    .sort((left, right) => left.timeMs - right.timeMs || left.index - right.index);
  if (!presses.length) return [];

  const bursts: (typeof presses)[] = [];
  for (const press of presses) {
    const burst = bursts.at(-1);
    if (!burst || press.timeMs - burst.at(-1)!.timeMs > KEYBOARD_CAPTION_BURST_GAP_MS) bursts.push([press]);
    else burst.push(press);
  }

  return bursts.map((burst, index) => {
    const startMs = burst[0].timeMs;
    const lastMs = burst.at(-1)!.timeMs;
    const nextStartMs = bursts[index + 1]?.[0].timeMs ?? Number.POSITIVE_INFINITY;
    const endMs = Math.min(lastMs + KEYBOARD_CAPTION_TAIL_MS, nextStartMs);
    const durationMs = Math.max(40, endMs - startMs);
    const steps: KeyboardCaptionStep[] = burst.map((press) => ({
      offsetMs: press.timeMs - startMs,
      modifiers: [...press.modifiers],
      key: press.key,
    }));
    return {
      id: `keyboard-caption:${sourceSessionId}:${startMs}:${index}`,
      kind: 'caption',
      name: keyboardCaptionText(steps, recordedPlatform),
      timelineStartMs: startMs,
      timelineDurationMs: durationMs,
      sourceInMs: 0,
      sourceDurationMs: durationMs,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      enabled: true,
      order: -10_000 + index,
      caption: {
        type: 'keyboard',
        steps,
        followCursor: true,
        recordedPlatform,
        sourceSessionId,
        style: createDefaultCaptionStyle(28),
      },
    } satisfies CaptionClip;
  });
}

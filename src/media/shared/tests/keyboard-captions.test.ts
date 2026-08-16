import { describe, expect, it } from 'vitest';
import type { InputEvent, InputEventSidecar, InputKey } from '~/api/types/capture-session';
import { createDefaultCaptionStyle } from '../composition-defaults';
import {
  keyboardCaptionClipsFromInput,
  keyboardCaptionRuns,
  keyboardCaptionRunsAt,
  keyboardCaptionText,
  keyboardKeyLabel,
  keyboardStepLabels,
} from '../keyboard-captions';
import type { CaptionClip, KeyboardCaptionStep } from '../composition-types';

const shortcut = (
  sessionNs: number,
  key: InputKey,
  modifiers: Array<'control' | 'shift' | 'alt' | 'meta'> = [],
  pressed = true,
): InputEvent => ({
  event: 'shortcut' as const,
  sessionNs,
  pressed,
  modifiers,
  key,
});

const sidecar = (...events: InputEventSidecar['events']): InputEventSidecar => ({ version: 1, events });

const keyboardClip = (): CaptionClip => ({
  id: 'keyboard-caption',
  kind: 'caption',
  name: 'Ctrl + K',
  timelineStartMs: 1_000,
  timelineDurationMs: 1_200,
  sourceInMs: 0,
  sourceDurationMs: 1_200,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: ['control'], key: 'k' }],
    followCursor: true,
    recordedPlatform: 'windows',
    sourceSessionId: 'session-1',
    style: {
      ...createDefaultCaptionStyle(28),
      color: '#fff',
      fontSize: 28,
      wrap: true,
      shadowColor: '#000',
      shadowBlur: 0,
      backdropBlur: 0,
      outlineColor: '#000',
      outlineWidth: 0,
      extrusionDepth: 0,
      placement: 'center',
    },
  },
});

describe('keyboard captions', () => {
  it('keeps only presses, sorts unstable input, and preserves press order at equal timestamps', () => {
    const clips = keyboardCaptionClipsFromInput(
      sidecar(
        shortcut(1_500_000_000, 'b'),
        shortcut(1_000_000_000, 'a'),
        shortcut(1_000_000_000, 'c'),
        shortcut(1_000_000_000, 'b', [], false),
      ),
      'session-1',
      'linux',
    );

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ timelineStartMs: 1_000, timelineDurationMs: 1_700 });
    expect(clips[0]!.caption).toMatchObject({
      type: 'keyboard',
      recordedPlatform: 'linux',
      steps: [
        { offsetMs: 0, key: 'a' },
        { offsetMs: 0, key: 'c' },
        { offsetMs: 500, key: 'b' },
      ],
    });
  });

  it('returns no clips for an empty sidecar', () => {
    expect(keyboardCaptionClipsFromInput(sidecar(), 'session-1', 'windows')).toEqual([]);
  });

  it('keeps a press exactly 600ms away in the same burst and starts a new burst after it', () => {
    const clips = keyboardCaptionClipsFromInput(
      sidecar(shortcut(1_000_000_000, 'a'), shortcut(1_600_000_000, 'b'), shortcut(2_201_000_000, 'c')),
      'session-1',
      'windows',
    );

    expect(clips.map((clip) => [clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
      [1_000, 1_201],
      [2_201, 1_200],
    ]);
    expect(clips[0]!.caption).toMatchObject({ steps: [{ offsetMs: 0 }, { offsetMs: 600 }] });
  });

  it('tails the final burst for 1200ms but clamps a burst before the next burst', () => {
    const clips = keyboardCaptionClipsFromInput(
      sidecar(shortcut(1_000_000_000, 'a'), shortcut(2_000_000_000, 'b'), shortcut(2_601_000_000, 'c')),
      'session-1',
      'windows',
    );

    expect(clips.map((clip) => [clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
      [1_000, 1_000],
      [2_000, 601],
      [2_601, 1_200],
    ]);
  });

  it('reveals steps progressively through runsAt and respects the clip boundary', () => {
    const clip = keyboardCaptionClipsFromInput(
      sidecar(shortcut(1_000_000_000, 'a'), shortcut(1_300_000_000, 'b')),
      'session-1',
      'windows',
    )[0]!;

    expect(keyboardCaptionRunsAt(clip, 999)).toEqual([]);
    expect(
      keyboardCaptionRunsAt(clip, 1_000)
        .map((run) => run.text)
        .join(''),
    ).toBe('A');
    expect(
      keyboardCaptionRunsAt(clip, 1_299)
        .map((run) => run.text)
        .join(''),
    ).toBe('A');
    expect(
      keyboardCaptionRunsAt(clip, 1_300)
        .map((run) => run.text)
        .join(''),
    ).toBe('A → B');
    expect(
      keyboardCaptionRunsAt(clip, 2_200)
        .map((run) => run.text)
        .join(''),
    ).toBe('A → B');
    expect(keyboardCaptionRunsAt(clip, 2_500)).toEqual([]);
  });

  it('maps key and modifier labels for macOS, Windows, and Linux', () => {
    const step: KeyboardCaptionStep = { offsetMs: 0, modifiers: ['control', 'shift', 'alt', 'meta'], key: 'arrow-up' };

    expect(keyboardStepLabels(step, 'macos')).toEqual(['⌃', '⇧', '⌥', '⌘', '↑']);
    expect(keyboardStepLabels(step, 'windows')).toEqual(['Ctrl', 'Shift', 'Alt', 'Win', '↑']);
    expect(keyboardStepLabels(step, 'linux')).toEqual(['Ctrl', 'Shift', 'Alt', 'Super', '↑']);
    expect(keyboardKeyLabel('digit7')).toBe('7');
    expect(keyboardKeyLabel('f12')).toBe('F12');
    expect(keyboardCaptionText([step], 'macos')).toBe('⌃ + ⇧ + ⌥ + ⌘ + ↑');
    expect(
      keyboardCaptionRuns([step], 'windows')
        .map((run) => run.text)
        .join(''),
    ).toBe('Ctrl + Shift + Alt + Win + ↑');
  });

  it('uses custom caption text without deriving runs from keyboard steps', () => {
    const clip = keyboardClip();
    clip.caption.style.customText = 'Custom caption';
    expect(keyboardCaptionRunsAt(clip, 1_000)).toEqual([
      { text: 'Custom caption', fontScale: 1, opacity: 1, separator: 'none' },
    ]);
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
import { renderCompositionFrame } from '../render';
import { context, snapshot } from './render.test-support';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import type { CaptionClip } from '@beam/engine/shared/composition-types';

const calls = vi.hoisted(() => ({ position: vi.fn(), cursor: vi.fn(), caption: vi.fn() }));
vi.mock('../cursor-render', () => ({
  cursorPositionForKeyboardCaption: calls.position,
  drawCursorLayer: calls.cursor,
}));
vi.mock('../render-caption', () => ({ drawCaption: calls.caption }));
beforeEach(() => {
  vi.clearAllMocks();
  calls.position.mockReturnValue({ x: 30, y: 20 });
});

function keyboardCaption(): CaptionClip {
  return {
    id: 'keys',
    kind: 'caption',
    name: 'Keys',
    enabled: true,
    order: 1,
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    caption: {
      type: 'keyboard',
      followCursor: true,
      steps: [],
      sourceSessionId: 's',
      recordedPlatform: 'linux',
      style: createDefaultCaptionStyle(24),
    },
  };
}
const video = { source: {} as CanvasImageSource, width: 100, height: 50 };

it.each(['none', 'fixed-keyboard', 'text', 'future', 'disabled'] as const)(
  'skips cursor caption placement for %s captions',
  (kind) => {
    const value = snapshot();
    const clip = keyboardCaption();
    if (kind === 'fixed-keyboard' && clip.caption.type === 'keyboard') clip.caption.followCursor = false;
    if (kind === 'text') clip.caption = { type: 'text', sentences: [], style: createDefaultCaptionStyle(24) };
    if (kind === 'future') clip.timelineStartMs = 2000;
    if (kind === 'disabled') clip.enabled = false;
    if (kind !== 'none') value.composition.clips.push(clip);
    renderCompositionFrame(context(), video, value, 0.5);
    expect(calls.position).not.toHaveBeenCalled();
  },
);

it('computes one cursor position for multiple active following keyboard captions', () => {
  const value = snapshot();
  const clip = keyboardCaption();
  value.composition.clips.push(clip, { ...clip, id: 'keys-2', order: 2 });
  renderCompositionFrame(context(), video, value, 0.5);
  expect(calls.position).toHaveBeenCalledOnce();
  expect(calls.caption).toHaveBeenCalledTimes(2);
  for (const call of calls.caption.mock.calls) expect(call[4]).toEqual({ x: 30, y: 20 });
});

it('does not place a following caption through a missing screen frame', () => {
  const value = snapshot();
  value.composition.clips.push(keyboardCaption());
  renderCompositionFrame(context(), null, value, 0.5);
  expect(calls.position).not.toHaveBeenCalled();
});

it('reuses prepared camera and cursor center samples without sampling them again', () => {
  const value = snapshot();
  value.zoomMotionBlur = { enabled: false, intensity: 0 };
  const player = createCursorMotionPlayer([], value.cursorSettings.motion, 100, 50);
  const cursorSample = vi.spyOn(player, 'sample');
  const evaluator = {
    sample: vi.fn(() => {
      throw new Error('Center was sampled again');
    }),
    invalidate: vi.fn(),
  };
  const camera = { scale: 1, focus: { cx: 0.5, cy: 0.5 }, tiltX: 0, tiltY: 0 };
  renderCompositionFrame(context(), video, value, 0.5, null, undefined, undefined, player, evaluator, undefined, {
    camera,
    cursorMotion: null,
  });
  expect(evaluator.sample).not.toHaveBeenCalled();
  expect(cursorSample).not.toHaveBeenCalled();
});

import { describe, expect, it } from 'vitest';
import { shallowRef, ref } from 'vue';
import { cursorComposition, screenClip } from '@beam/engine/capture/screen-cursor.test-support';
import { splitClip } from '@beam/engine/commands/clip-engine';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import { useScreenCursorVisibility } from '../useScreenCursorVisibility';

function harness(clips: VisualClip[] = [screenClip()]) {
  const composition = shallowRef(cursorComposition(clips));
  const ids = ref<string[]>([]);
  const time = ref(0);
  const defaults = ref(true);
  const state = useScreenCursorVisibility(composition, ids, time, defaults);
  return { composition, ids, time, defaults, state };
}
describe('per-clip cursor selection', () => {
  it('targets the clip at the playhead and leaves the other cut fragment unchanged', () => {
    const h = harness([screenClip('screen', { showCursor: true })]);
    h.composition.value = splitClip(h.composition.value, 'screen', 1000);
    h.time.value = 1;
    expect(h.state.enabled.value).toBe(true);
    h.state.enabled.value = false;
    expect(h.composition.value.clips.map((clip) => (clip as VisualClip).showCursor)).toEqual([true, false]);
    h.time.value = 0.999;
    expect(h.state.enabled.value).toBe(true);
    h.time.value = 2;
    expect(h.state.hasTargets.value).toBe(false);
    expect(h.state.disabled.value).toBe(true);
  });
  it('shows a mixed selection without modifying it, then applies a single uniform edit', () => {
    const h = harness([screenClip('on', { showCursor: true }), screenClip('off', { showCursor: false, order: 1 })]);
    const before = h.composition.value;
    h.ids.value = ['on', 'off'];
    expect(h.state.mixed.value).toBe(true);
    expect(h.state.enabled.value).toBe(false);
    expect(h.composition.value).toBe(before);
    h.state.enabled.value = true;
    expect(h.state.mixed.value).toBe(false);
    expect(h.state.enabled.value).toBe(true);
    expect(h.composition.value.clips.every((clip) => (clip as VisualClip).showCursor)).toBe(true);
    // Document history can restore the one immutable revision for the entire selection.
    h.composition.value = before;
    expect(h.state.mixed.value).toBe(true);
    h.state.enabled.value = false;
    expect(h.state.enabled.value).toBe(false);
    expect(h.state.mixed.value).toBe(false);
  });
  it('prioritizes the selected recording over the playhead and ignores other selected media', () => {
    const h = harness([
      screenClip('current', { showCursor: true }),
      screenClip('selected', { showCursor: true, timelineStartMs: 2000, order: 1 }),
      screenClip('camera', { kind: 'webcam', order: 2 }),
    ]);
    h.ids.value = ['selected', 'camera', 'missing'];
    h.state.enabled.value = false;
    expect(h.composition.value.clips.map((clip) => (clip as VisualClip).showCursor)).toEqual([true, false, undefined]);
  });
  it('uses the current screen when only non-screen layers are selected', () => {
    const h = harness([screenClip(), screenClip('camera', { kind: 'webcam', order: 1 })]);
    h.ids.value = ['camera'];
    h.defaults.value = false;
    expect(h.state.enabled.value).toBe(false);
    h.state.enabled.value = true;
    expect(h.state.enabled.value).toBe(true);
    expect(h.defaults.value).toBe(false);
  });
  it('keeps empty timelines unavailable and does not manufacture a clip', () => {
    const h = harness([]);
    const before = h.composition.value;
    expect(h.state.hasTargets.value).toBe(false);
    expect(h.state.mixed.value).toBe(false);
    expect(h.state.enabled.value).toBe(false);
    expect(h.state.disabled.value).toBe(true);
    h.state.enabled.value = true;
    expect(h.composition.value).toBe(before);
  });
  it.each(['screen', 'camera'])(
    'disables a whole multi-selection when %s or its linked partner is locked',
    (lockedId) => {
      const h = harness([
        screenClip('screen', { locked: lockedId === 'screen', groupId: 'capture' }),
        screenClip('second', { order: 1 }),
        screenClip('camera', { kind: 'webcam', locked: lockedId === 'camera', groupId: 'capture', order: 2 }),
      ]);
      const before = h.composition.value;
      h.ids.value = ['screen', 'second'];
      expect(h.state.disabled.value).toBe(true);
      h.state.enabled.value = false;
      expect(h.composition.value).toBe(before);
    },
  );
});

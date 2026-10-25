import { describe, expect, it } from 'vitest';
import { computed, ref, shallowRef } from 'vue';
import { cursorComposition } from '@beam/engine/capture/screen-cursor.test-support';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { useRecordingClipSplit } from '../useRecordingClipSplit';

function fixture() {
  const composition = shallowRef(cursorComposition());
  const zooms = shallowRef<ZoomElement[]>([
    {
      id: 'zoom',
      sessionId: 'session',
      startMs: 100,
      endMs: 1900,
      focus: { cx: 0.2, cy: 0.3 },
      depth: 2,
      mode: 'auto',
    },
  ]);
  const id = ref<string | null>('screen'),
    time = ref(1);
  const selected = computed(() => composition.value.clips.find((clip) => clip.id === id.value) ?? null);
  return { composition, zooms, id, time, split: useRecordingClipSplit(composition, zooms, selected, time) };
}
describe('editor recording split', () => {
  it('publishes both recording and automatic zoom fragments in one synchronous edit', () => {
    const f = fixture();
    f.split();
    expect(f.composition.value.clips).toHaveLength(2);
    expect(f.zooms.value.map((zoom) => [zoom.startMs, zoom.endMs])).toEqual([
      [100, 1000],
      [1000, 1900],
    ]);
  });
  it.each([0, 2])('does not split at the recording boundary %s', (time) => {
    const f = fixture(),
      before = f.composition.value;
    f.time.value = time;
    f.split();
    expect(f.composition.value).toBe(before);
    expect(f.zooms.value).toHaveLength(1);
  });
  it('does nothing without a selected clip and keeps locks intact', () => {
    const f = fixture(),
      before = f.composition.value;
    f.id.value = null;
    f.split();
    expect(f.composition.value).toBe(before);
    f.id.value = 'screen';
    f.zooms.value[0]!.locked = true;
    f.split();
    expect(f.composition.value).toBe(before);
  });
});

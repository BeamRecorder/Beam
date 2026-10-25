import { describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import { bindTrackPropertyHistory } from '../track-property-history';
import { useClipTrackProperties } from '../useClipTrackProperties';
import { trackPropertyComposition } from '@beam/engine/composition/clip-track-properties.test-support';
import { setTransform } from '@beam/engine/commands/clip-engine';
import type { VisualClip } from '@beam/engine/shared/composition-types';

function harness() {
  const composition = shallowRef(trackPropertyComposition());
  const scope = useClipTrackProperties(composition, ref('first'), ref(['first']));
  return { composition, scope };
}
describe('track property history binding', () => {
  it('captures the edited source before activation and all affected peers with the checked mode afterward', () => {
    const { composition, scope } = harness();
    composition.value = setTransform(composition.value, 'first', { x: 0.1, y: 0.2, width: 0.7, height: 0.6 });
    const before = composition.value;
    const states: Array<{ mode: boolean; composition: typeof before }> = [];
    bindTrackPropertyHistory(
      [scope],
      () => states.push({ mode: scope.enabled.value, composition: composition.value }),
      () => true,
    );
    scope.enabled.value = true;
    expect(states).toHaveLength(2);
    expect(states[0]).toEqual({ mode: false, composition: before });
    expect(states[1]!.mode).toBe(true);
    const peer = states[1]!.composition.clips.find(
      (clip): clip is VisualClip => clip.kind === 'screen' && clip.id === 'third',
    )!;
    expect(peer.transform).toEqual((before.clips[0]! as VisualClip).transform);
    scope.enabled.value = false;
    expect(states).toHaveLength(4);
    expect(states[3]!.composition).toBe(states[2]!.composition);
  });
  it('ignores duplicate choices without creating history entries', () => {
    const { scope } = harness(),
      commit = vi.fn();
    bindTrackPropertyHistory([scope], commit, () => true);
    scope.enabled.value = false;
    expect(commit).not.toHaveBeenCalled();
    scope.enabled.value = true;
    scope.enabled.value = true;
    expect(commit).toHaveBeenCalledTimes(2);
  });
  it('refuses changes while loading or restoring and keeps a locked source disabled', () => {
    const { composition, scope } = harness(),
      commit = vi.fn(),
      available = ref(false);
    bindTrackPropertyHistory([scope], commit, () => available.value);
    scope.enabled.value = true;
    expect(scope.enabled.value).toBe(false);
    available.value = true;
    composition.value = {
      ...composition.value,
      clips: composition.value.clips.map((clip) => (clip.id === 'first' ? { ...clip, locked: true } : clip)),
    };
    scope.enabled.value = true;
    expect(scope.enabled.value).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
  it('follows restored modes without publishing another edit or changing the composition', () => {
    const { composition, scope } = harness(),
      commit = vi.fn();
    bindTrackPropertyHistory([scope], commit, () => true);
    const before = composition.value;
    scope.restore(['recording-track']);
    expect(scope.enabled.value).toBe(true);
    scope.restore([]);
    expect(scope.enabled.value).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(composition.value).toBe(before);
  });
});

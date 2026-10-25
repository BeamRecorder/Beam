import { mount } from '@vue/test-utils';
import { ref, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import ClipTrackPropertyToggle from '../ClipTrackPropertyToggle.vue';
import { clipTrackPropertyScopeKey } from '../clip-track-property-context';
import { useClipTrackProperties } from '../../../composables/useClipTrackProperties';
import { trackPropertyComposition } from '@beam/engine/composition/clip-track-properties.test-support';

function harness(id = 'first') {
  const composition = shallowRef(trackPropertyComposition());
  const scope = useClipTrackProperties(composition, ref(id), ref([id]));
  const mounted = mount(ClipTrackPropertyToggle, {
    global: { provide: { [clipTrackPropertyScopeKey as symbol]: scope } },
  });
  return { mounted, scope, composition };
}
describe('apply-to-track checkbox', () => {
  it('is hidden outside an editor or on a track with only one clip', () => {
    expect(mount(ClipTrackPropertyToggle).find('[role="checkbox"]').exists()).toBe(false);
    const h = harness('other');
    expect(h.mounted.find('[role="checkbox"]').exists()).toBe(false);
  });
  it('explains the track scope and toggles the shared mode from the actual checkbox', async () => {
    const h = harness();
    expect(h.mounted.text()).toContain('Apply to all');
    expect(h.mounted.text()).toContain('unlocked clips on this track');
    const checkbox = h.mounted.get('[role="checkbox"]');
    expect(checkbox.attributes('aria-checked')).toBe('false');
    await checkbox.trigger('click');
    expect(h.scope.enabled.value).toBe(true);
    expect(checkbox.attributes('aria-checked')).toBe('true');
    await checkbox.trigger('keydown', { key: ' ' });
    expect(h.scope.enabled.value).toBe(false);
  });
  it('disables the control when its source is locked', () => {
    const h = harness();
    h.composition.value = {
      ...h.composition.value,
      clips: h.composition.value.clips.map((clip) => (clip.id === 'first' ? { ...clip, locked: true } : clip)),
    };
    expect(h.scope.disabled.value).toBe(true);
  });
  it('updates the checked state on history restoration without copying properties again', async () => {
    const h = harness(),
      initial = h.composition.value;
    h.scope.restore(['recording-track']);
    await h.mounted.vm.$nextTick();
    expect(h.mounted.get('[role="checkbox"]').attributes('aria-checked')).toBe('true');
    expect(h.scope.enabledTracks.value).toEqual(['recording-track']);
    expect(h.composition.value).toBe(initial);
    h.scope.restore([]);
    await h.mounted.vm.$nextTick();
    expect(h.mounted.get('[role="checkbox"]').attributes('aria-checked')).toBe('false');
  });
});

import { useRecordingCursorProperties } from '../../composables/useRecordingCursorProperties';
import { useZoomTrackProperties } from '../../composables/useZoomTrackProperties';
import { cursorPropertyScopeKey } from '../../properties/cursor/cursor-property-types';
import { zoomPropertyScopeKey } from '../../properties/zoom/zoom-property-context';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import { mount } from '@vue/test-utils';
import { nextTick, ref, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import TimelineTrackPropertyFeedback from '../TimelineTrackPropertyFeedback.vue';
import { clipTrackPropertyScopeKey } from '../../properties/clip/clip-track-property-context';
import { useClipTrackProperties } from '../../composables/useClipTrackProperties';
import { trackPropertyComposition } from '@beam/engine/composition/clip-track-properties.test-support';

function harness(clipId = 'second') {
  const scope = useClipTrackProperties(shallowRef(trackPropertyComposition()), ref('first'), ref(['first']));
  const mounted = mount(TimelineTrackPropertyFeedback, {
    props: { clipId },
    global: { provide: { [clipTrackPropertyScopeKey as symbol]: scope } },
  });
  return { scope, mounted };
}
describe('timeline property application feedback', () => {
  it('stays inert without an editor context or a new successful application', () => {
    expect(
      mount(TimelineTrackPropertyFeedback, { props: { clipId: 'first' } })
        .find('span')
        .exists(),
    ).toBe(false);
    expect(harness().mounted.find('span').exists()).toBe(false);
  });
  it('animates only affected clips with their position in the wave', async () => {
    const h = harness();
    h.scope.enabled.value = true;
    await nextTick();
    expect(h.mounted.get('span').attributes('style')).toContain('--apply-delay: 75ms');
    expect(h.mounted.get('span').attributes('aria-hidden')).toBe('true');
    const other = harness('other');
    other.scope.enabled.value = true;
    await nextTick();
    expect(other.mounted.find('span').exists()).toBe(false);
  });
  it('removes the overlay on animation completion and restarts for a new revision', async () => {
    const h = harness();
    h.scope.enabled.value = true;
    await nextTick();
    const first = h.mounted.get('span').element;
    await h.mounted.get('span').trigger('animationend');
    expect(h.mounted.find('span').exists()).toBe(false);
    h.scope.enabled.value = true;
    await nextTick();
    expect(h.mounted.get('span').element).not.toBe(first);
    h.scope.reset();
    await nextTick();
    expect(h.mounted.find('span').exists()).toBe(false);
  });
  it('does not replay an old wave when a clip is mounted after scrolling into view', () => {
    const h = harness();
    h.scope.enabled.value = true;
    const late = mount(TimelineTrackPropertyFeedback, {
      props: { clipId: 'third' },
      global: { provide: { [clipTrackPropertyScopeKey as symbol]: h.scope } },
    });
    expect(late.find('span').exists()).toBe(false);
  });
});

it('shows cursor bulk edits on the recording clips without using clip layout scope', async () => {
  const scope = useRecordingCursorProperties({
    composition: shallowRef(trackPropertyComposition()),
    selectedId: ref('first'),
    selectedIds: ref(['first']),
    time: ref(0),
    defaults: ref(createDefaultCursorPresentation()),
  });
  const wrapper = mount(TimelineTrackPropertyFeedback, {
    props: { clipId: 'second' },
    global: { provide: { [cursorPropertyScopeKey as symbol]: scope } },
  });
  scope.enabled.value = true;
  await nextTick();
  expect(wrapper.get('span').attributes('style')).toContain('75ms');
  wrapper.unmount();
});
it('keeps clip and zoom feedback independent even when their IDs coincide', async () => {
  const scope = useZoomTrackProperties(
    shallowRef([createManualZoom('same', 0, 1000), createManualZoom('other', 2000, 3000)]),
    ref('same'),
    ref(['same']),
  );
  const global = { provide: { [zoomPropertyScopeKey as symbol]: scope } };
  const clip = mount(TimelineTrackPropertyFeedback, { props: { clipId: 'same' }, global });
  const zoom = mount(TimelineTrackPropertyFeedback, { props: { clipId: 'same', kind: 'zoom' }, global });
  scope.enabled.value = true;
  await nextTick();
  expect(clip.find('span').exists()).toBe(false);
  expect(zoom.find('span').exists()).toBe(true);
  clip.unmount();
  zoom.unmount();
});

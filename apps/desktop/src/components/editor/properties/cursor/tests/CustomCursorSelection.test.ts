import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { ref } from 'vue';
import CustomCursorToggle from '../CustomCursorToggle.vue';
import { customCursorKey, screenCursorSelectionKey } from '../custom-cursor-context';

enableAutoUnmount(afterEach);
function harness(mixed = false, disabled = false) {
  const enabled = ref(!mixed);
  const state = { enabled, mixed: ref(mixed), disabled: ref(disabled), hasTargets: ref(true) };
  const wrapper = mount(CustomCursorToggle, {
    global: { provide: { [customCursorKey as symbol]: enabled, [screenCursorSelectionKey as symbol]: state } },
  });
  return { wrapper, enabled, state };
}
describe('clip cursor visibility control', () => {
  it('changes the selected recording state with a compact switch', async () => {
    const { wrapper, enabled } = harness();
    const control = wrapper.get('[role="switch"]');
    expect(control.attributes('aria-label')).toBe('Custom cursor');
    expect(wrapper.find('.btn-group').exists()).toBe(false);
    await control.trigger('click');
    expect(enabled.value).toBe(false);
    await control.trigger('click');
    expect(enabled.value).toBe(true);
  });
  it('can unify mixed recording visibility through the same cursor inspector switch', async () => {
    const { wrapper, enabled } = harness(true);
    await wrapper.get('[role="switch"]').trigger('click');
    expect(enabled.value).toBe(true);
  });
  it('blocks the switch on locked or unavailable recordings', async () => {
    const { wrapper, enabled } = harness(false, true);
    const control = wrapper.get('[role="switch"]');
    expect(control.attributes('disabled')).toBeDefined();
    await control.trigger('click');
    expect(enabled.value).toBe(true);
  });
  it('renders no setting outside an editor cursor context', () => {
    expect(mount(CustomCursorToggle).find('.custom-cursor-toggle').exists()).toBe(false);
  });
  it('edits the clip context while preserving the saved document default', async () => {
    const defaults = ref(true);
    const selected = ref(true);
    const wrapper = mount(CustomCursorToggle, {
      global: {
        provide: {
          [customCursorKey as symbol]: defaults,
          [screenCursorSelectionKey as symbol]: {
            enabled: selected,
            mixed: ref(false),
            disabled: ref(false),
            hasTargets: ref(true),
          },
        },
      },
    });
    await wrapper.get('[role="switch"]').trigger('click');
    expect(selected.value).toBe(false);
    expect(defaults.value).toBe(true);
  });
});

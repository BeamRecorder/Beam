import { triggerPointer } from '../../../../tests/support/pointer';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import RecorderBar from './RecorderBar.vue';

const props = { phase: 'recording' as const, recordingTime: '00:12.3', visibility: 'always' as const };
const wrappers: ReturnType<typeof mount>[] = [];
const setup = (overrides: Partial<InstanceType<typeof RecorderBar>['$props']> = {}) => {
  const wrapper = mount(RecorderBar, { props: { ...props, ...overrides }, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
};
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
const restartButton = (wrapper: ReturnType<typeof mount>) => wrapper.get('button[aria-label="Restart recording"]');

describe('compact RecorderBar', () => {
  it('renders Delete, Restart, Pause and Stop in order and emits the capture actions', async () => {
    const wrapper = setup();
    const buttons = wrapper.findAll('button');
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual([
      'Cancel and delete recording',
      'Restart recording',
      'Pause recording',
      'Stop recording',
    ]);
    expect(wrapper.get('.recording-time').text()).toBe('00:12.3');
    buttons.forEach((button) => expect(button.attributes('title')).toBeTruthy());
    await buttons[0]!.trigger('click');
    await buttons[2]!.trigger('click');
    await buttons[3]!.trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('pause')).toHaveLength(1);
    expect(wrapper.emitted('stop')).toHaveLength(1);
    expect(wrapper.emitted('restart')).toBeUndefined();
  });
  it('requires confirmation before discarding and restarting a take', async () => {
    const wrapper = setup();
    await restartButton(wrapper).trigger('click');
    await flushPromises();
    const prompt = wrapper.get('[role="alertdialog"]');
    expect(prompt.text()).toContain('This take will be deleted.');
    expect(document.activeElement).toBe(prompt.findAll('button')[0]!.element);
    expect(wrapper.emitted('restart')).toBeUndefined();
    await prompt.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.emitted('restart')).toHaveLength(1);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(restartButton(wrapper).element);
  });
  it('keeps recording when confirmation is canceled by its button or Escape', async () => {
    const wrapper = setup();
    await restartButton(wrapper).trigger('click');
    await wrapper.get('[role="alertdialog"] button').trigger('click');
    await restartButton(wrapper).trigger('click');
    await wrapper.get('.recorder-bar').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.emitted('restart')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });
  it('invalidates an open confirmation when recording ends or the caller becomes busy', async () => {
    const wrapper = setup();
    await restartButton(wrapper).trigger('click');
    await wrapper.setProps({ busy: true });
    expect(wrapper.get('[role="alertdialog"]').findAll('button')[1]!.attributes('disabled')).toBeDefined();
    await wrapper.get('[role="alertdialog"]').findAll('button')[1]!.trigger('click');
    expect(wrapper.emitted('restart')).toBeUndefined();
    await wrapper.setProps({ phase: 'finalizing' });
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
  });
  it.each(['countdown', 'starting'] as const)(
    'keeps abort controls available during %s and disables pause/restart',
    (phase) => {
      const wrapper = setup({ phase });
      const buttons = wrapper.findAll('button');
      expect(buttons[0]!.attributes('disabled')).toBeUndefined();
      expect(buttons[1]!.attributes('disabled')).toBeDefined();
      expect(buttons[2]!.attributes('disabled')).toBeDefined();
      expect(buttons[3]!.attributes('disabled')).toBeUndefined();
      expect(wrapper.get('.recording-time').text()).toContain(phase === 'starting' ? 'Preparing' : 'Ready');
    },
  );
  it('uses a paused cloud and a Resume control while paused', async () => {
    const wrapper = setup({ mascot: true, phase: 'paused' });
    expect(wrapper.find('button[aria-label="Resume recording"]').exists()).toBe(true);
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('paused');
    await wrapper.setProps({ phase: 'starting' });
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('preparing');
  });
  it('reveals hover-only controls for pointer, keyboard focus and restart confirmation', async () => {
    const wrapper = setup({ visibility: 'hover-only', hoverOnlyActive: true, mascot: true });
    const bar = wrapper.get('.recorder-bar');
    expect(bar.classes()).toContain('hover-only');
    await triggerPointer(bar, 'pointerenter');
    expect(bar.classes()).toContain('pointer-over');
    await triggerPointer(bar, 'pointerleave');
    expect(bar.classes()).not.toContain('pointer-over');
    await bar.trigger('focusin');
    await bar.trigger('focusout', { relatedTarget: restartButton(wrapper).element });
    await bar.trigger('focusout', { relatedTarget: null });
    await restartButton(wrapper).trigger('click');
    expect(bar.classes()).toContain('confirming');
    await wrapper.setProps({ visibility: 'auto-fade' });
    expect(bar.classes()).toContain('auto-fade');
    await wrapper.setProps({ visibility: 'hover-only', hoverOnlyActive: false });
    expect(bar.classes()).not.toContain('hover-only');
  });
});

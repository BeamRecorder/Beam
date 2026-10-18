import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const chooseDevice = vi.hoisted(() => vi.fn());
vi.mock('~/api/capture', () => ({ capture: { preparation: { chooseDevice } } }));
import PreparationDeviceSelect from './PreparationDeviceSelect.vue';
let wrapper: VueWrapper;
const render = (disabled = false) =>
  (wrapper = mount(PreparationDeviceSelect, {
    props: {
      kind: 'camera',
      value: 'off',
      label: 'Camera',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'cam', label: 'Camera one' },
      ],
      disabled,
    },
  }));
beforeEach(() => {
  vi.clearAllMocks();
  chooseDevice.mockResolvedValue('cam');
});
afterEach(() => wrapper?.unmount());
it('uses a bounded native device menu with plain options and current selection', async () => {
  render();
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(chooseDevice).toHaveBeenCalledWith({
    kind: 'camera',
    selectedId: 'off',
    options: [
      { id: 'off', label: 'Off' },
      { id: 'cam', label: 'Camera one' },
    ],
    position: { x: 0, y: 0 },
  });
  expect(wrapper.emitted('select')).toEqual([['cam']]);
});
it.each(['contextmenu', 'ContextMenu', 'F10'])('supports native context access: %s', async (key) => {
  render();
  if (key === 'contextmenu') await wrapper.get('button').trigger(key);
  else await wrapper.get('button').trigger('keydown', { key, shiftKey: key === 'F10' });
  await flushPromises();
  expect(chooseDevice).toHaveBeenCalledOnce();
});
it('does not open for unrelated keyboard input or disabled controls', async () => {
  render(true);
  await wrapper.get('button').trigger('contextmenu');
  await wrapper.get('button').trigger('keydown', { key: 'F10' });
  expect(chooseDevice).not.toHaveBeenCalled();
});
it('ignores dismissal and retains a missing device identity', async () => {
  chooseDevice.mockResolvedValue(null);
  render();
  await wrapper.setProps({ value: 'missing' });
  expect(wrapper.text()).toContain('missing');
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.emitted('select')).toBeUndefined();
});
it('coalesces pending choices and drops results after disposal', async () => {
  let resolve!: (value: string) => void;
  chooseDevice.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render();
  await wrapper.get('button').trigger('click');
  await wrapper.get('button').trigger('contextmenu');
  expect(chooseDevice).toHaveBeenCalledOnce();
  wrapper.unmount();
  resolve('cam');
  await flushPromises();
  expect(wrapper.emitted('select')).toBeUndefined();
});
it('drops a result if handoff disables the control while the menu is open', async () => {
  let resolve!: (value: string) => void;
  chooseDevice.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render();
  await wrapper.get('button').trigger('click');
  await wrapper.setProps({ disabled: true });
  resolve('cam');
  await flushPromises();
  expect(wrapper.emitted('select')).toBeUndefined();
});
it('reports native menu failures and allows retry', async () => {
  chooseDevice.mockRejectedValueOnce(new Error('Menu failed'));
  render();
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.emitted('error')).toEqual([['Error: Menu failed']]);
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.emitted('select')).toEqual([['cam']]);
});
it('does not report late failure after disposal', async () => {
  let reject!: (reason: Error) => void;
  chooseDevice.mockReturnValue(
    new Promise((_done, fail) => {
      reject = fail;
    }),
  );
  render();
  await wrapper.get('button').trigger('click');
  wrapper.unmount();
  reject(new Error('Late'));
  await flushPromises();
  expect(wrapper.emitted('error')).toBeUndefined();
});
it('reports an accessible field name when a device label is empty and leaves unrelated keys alone', async () => {
  render();
  await wrapper.setProps({ value: '', options: [] });
  expect(wrapper.get('button').attributes('aria-label')).toBe('Camera');
  await wrapper.get('button').trigger('keydown', { key: 'a' });
  expect(chooseDevice).not.toHaveBeenCalled();
});
it('does not reopen through a stale direct event while disabled', async () => {
  render(true);
  const Button = (await import('~/ui/button/Button.vue')).default;
  wrapper.getComponent(Button).vm.$emit('click', new MouseEvent('click'));
  await flushPromises();
  expect(chooseDevice).not.toHaveBeenCalled();
});

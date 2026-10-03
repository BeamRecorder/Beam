import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import { stateFixture } from './export-test-support';
const engine = vi.hoisted(() => ({ encode: vi.fn(), dispose: vi.fn(), create: vi.fn() }));
vi.mock('../screenshot-export-cache', () => ({ createScreenshotExporter: engine.create }));
import { useScreenshotExport } from '../useScreenshotExport';
const component = defineComponent({ setup: () => ({ encode: useScreenshotExport() }), template: '<div />' });
beforeEach(() => {
  vi.clearAllMocks();
  engine.create.mockReturnValue({ encode: engine.encode, dispose: engine.dispose });
});
it('creates an owner without starting an export on mount', () => {
  const wrapper = mount(component);
  expect(engine.create).toHaveBeenCalledOnce();
  expect(engine.encode).not.toHaveBeenCalled();
  wrapper.unmount();
});
it('forwards the explicit export request', async () => {
  const wrapper = mount(component),
    state = stateFixture();
  await wrapper.vm.encode('source', state);
  expect(engine.encode).toHaveBeenCalledWith('source', state);
  wrapper.unmount();
});
it('disposes only that editor engine on unmount', () => {
  const wrapper = mount(component);
  wrapper.unmount();
  expect(engine.dispose).toHaveBeenCalledOnce();
});

import { flushPromises } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotEditorTestHarness } from './screenshot-editor-test-helpers';

export function registerScreenshotEditorRenameTests(harness: ScreenshotEditorTestHarness) {
  const { mountEditor, clickText, ScreenshotCanvasStub, ScreenshotCompositionStub } = harness;
  const state = (wrapper: ReturnType<typeof mountEditor>) =>
    wrapper.findComponent(ScreenshotCanvasStub).props('state') as ScreenshotState;
  it('renames a selected layer from Composition and keeps the clickable header in sync without a body field', async () => {
    const wrapper = mountEditor(true);
    try {
      await flushPromises();
      const composition = wrapper.findComponent(ScreenshotCompositionStub);
      composition.vm.$emit('select', 'screenshot');
      await flushPromises();
      composition.vm.$emit('rename', 'screenshot', 'Reference');
      await flushPromises();
      expect(state(wrapper).layerNames).toEqual({ screenshot: 'Reference' });
      expect(wrapper.get('.properties-island button[aria-label="Layer name"]').text()).toBe('Reference');
      expect(wrapper.find('.panel-body input[aria-label="Layer name"]').exists()).toBe(false);
      expect(wrapper.get('.properties-island').attributes('aria-label')).toBe('Reference');
    } finally {
      wrapper.unmount();
    }
  });
  it('single-clicks the header and commits a name as one undoable change, restored with redo', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'renamed-arrow' });
    const wrapper = mountEditor(true);
    try {
      await flushPromises();
      await clickText(wrapper, 'Arrow');
      await wrapper.get('.properties-island button[aria-label="Layer name"]').trigger('click');
      const input = wrapper.get('.properties-island input[aria-label="Layer name"]');
      expect(input.element.closest('.panel-header')).not.toBeNull();
      await input.setValue('Annotation');
      expect(state(wrapper).layerNames).toBeUndefined();
      await input.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(state(wrapper).layerNames?.['renamed-arrow']).toBe('Annotation');
      await wrapper.get('[aria-label="Undo (Ctrl+Z)"]').trigger('click');
      await flushPromises();
      expect(state(wrapper).shapes).toHaveLength(1);
      expect(state(wrapper).layerNames).toBeUndefined();
      await wrapper.get('[aria-label="Redo (Ctrl+Y)"]').trigger('click');
      await flushPromises();
      expect(state(wrapper).layerNames?.['renamed-arrow']).toBe('Annotation');
    } finally {
      wrapper.unmount();
    }
  });
  it('blocks renaming a locked layer or an image during cropping', async () => {
    const wrapper = mountEditor(true);
    try {
      await flushPromises();
      const composition = wrapper.findComponent(ScreenshotCompositionStub);
      composition.vm.$emit('select', 'screenshot');
      composition.vm.$emit('update', 'screenshot', { locked: true });
      await flushPromises();
      expect(
        (wrapper.get('.properties-island button[aria-label="Layer name"]').element as HTMLButtonElement).disabled,
      ).toBe(true);
      composition.vm.$emit('rename', 'screenshot', 'Blocked');
      await flushPromises();
      expect(state(wrapper).layerNames).toBeUndefined();
      composition.vm.$emit('update', 'screenshot', { locked: false });
      await flushPromises();
      await clickText(wrapper, 'Crop');
      composition.vm.$emit('rename', 'screenshot', 'Still blocked');
      await flushPromises();
      expect(state(wrapper).layerNames).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
}

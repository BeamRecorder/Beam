import { flushPromises } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import CommandPalette from '~/ui/command-palette/CommandPalette.vue';
import type { CommandPaletteItem } from '~/ui/command-palette/command-palette-types';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotEditorTestHarness } from './screenshot-editor-test-helpers';
import ScreenshotPropertiesPanel from '../ScreenshotPropertiesPanel.vue';
import ScreenshotSearch from '../ScreenshotSearch.vue';
import ScreenshotViewControls from '../ScreenshotViewControls.vue';

export function registerScreenshotEditorSearchTests(harness: ScreenshotEditorTestHarness) {
  const { mountEditor, ScreenshotCanvasStub, ScreenshotCompositionStub } = harness;
  const run = async (wrapper: ReturnType<typeof mountEditor>, id: string) => {
    const categories = wrapper.findComponent(CommandPalette).props('items') as CommandPaletteItem[];
    const action = categories.flatMap((category) => category.children ?? []).find((item) => item.id === id);
    expect(action, id).toBeDefined();
    await action!.run!();
    await flushPromises();
  };
  it('enables topbar search once the screenshot is loaded and exposes the shared five categories and history', async () => {
    const wrapper = mountEditor(true);
    try {
      expect((wrapper.get('button[aria-label="Search the editor"]').element as HTMLButtonElement).disabled).toBe(true);
      await flushPromises();
      await wrapper.get('button[aria-label="Search the editor"]').trigger('click');
      await flushPromises();
      const palette = wrapper.findComponent(CommandPalette);
      expect(palette.props('open')).toBe(true);
      expect((palette.props('items') as CommandPaletteItem[]).map((item) => item.id)).toEqual([
        'category:insert',
        'category:selection',
        'category:navigation',
        'category:setting',
        'category:action',
      ]);
      expect(document.activeElement?.getAttribute('role')).toBe('combobox');
      expect(
        (palette.props('items') as CommandPaletteItem[]).flatMap((item) => item.children ?? []).map((item) => item.id),
      ).toEqual(
        expect.arrayContaining(['action:undo', 'action:redo', 'action:copy', 'action:crop', 'setting:dimensions']),
      );
    } finally {
      wrapper.unmount();
    }
  });
  it('reopens the left inspector from search without toggling it closed, and chooses an image when none is selected', async () => {
    const wrapper = mountEditor(true);
    try {
      await flushPromises();
      await wrapper.get('button[aria-label="Properties"]').trigger('click');
      expect(wrapper.findComponent(ScreenshotPropertiesPanel).props('open')).toBe(false);
      await run(wrapper, 'navigate:clip');
      expect(wrapper.findComponent(ScreenshotPropertiesPanel).props('open')).toBe(true);
      expect(wrapper.findComponent(ScreenshotCanvasStub).props('selectedId')).toBe('screenshot');
      await run(wrapper, 'navigate:clip');
      expect(wrapper.findComponent(ScreenshotPropertiesPanel).props('open')).toBe(true);
      await run(wrapper, 'navigate:canvas');
      expect(wrapper.find('[data-testid="canvas-panel"]').exists()).toBe(true);
      await run(wrapper, 'navigate:settings');
      expect(wrapper.find('[data-testid="editor-settings"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
  it('opens with Ctrl+F and inserts an arrow through the actual palette input and Enter', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'search-arrow' });
    const wrapper = mountEditor(true);
    try {
      await flushPromises();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true }));
      await flushPromises();
      const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
      input.value = 'Arrow';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPromises();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await flushPromises();
      expect((wrapper.findComponent(ScreenshotCanvasStub).props('state') as ScreenshotState).shapes).toMatchObject([
        { id: 'search-arrow', family: 'arrow' },
      ]);
      expect(wrapper.findComponent(ScreenshotCompositionStub).props('selectedId')).toBe('search-arrow');
      expect(wrapper.findComponent(CommandPalette).props('open')).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
  it('opens the single-click header input when searching for the layer name, including a hidden inspector', async () => {
    const wrapper = mountEditor(true);
    try {
      await flushPromises();
      await run(wrapper, 'navigate:clip');
      await wrapper.get('button[aria-label="Properties"]').trigger('click');
      await run(wrapper, 'setting:ScreenshotComposition.name');
      expect(wrapper.findComponent(ScreenshotPropertiesPanel).props('open')).toBe(true);
      const input = wrapper.get('.panel-header input[aria-label="Layer name"]');
      expect(document.activeElement).toBe(input.element);
      expect(wrapper.find('.panel-body input[aria-label="Layer name"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
  it('routes copy, export, dimensions, recenter, crop and fullscreen search commands to the editor controls', async () => {
    const wrapper = mountEditor(true);
    try {
      await flushPromises();
      await run(wrapper, 'action:copy');
      await run(wrapper, 'action:export');
      await run(wrapper, 'setting:dimensions');
      expect(wrapper.find('.canvas-size-popover').exists()).toBe(true);
      await run(wrapper, 'action:recenter');
      expect(harness.canvasResetView).toHaveBeenCalledOnce();
      wrapper.findComponent(ScreenshotViewControls).vm.$emit('resetView');
      expect(harness.canvasResetView).toHaveBeenCalledTimes(2);
      await run(wrapper, 'navigate:clip');
      await run(wrapper, 'action:crop');
      expect(wrapper.findComponent(ScreenshotCanvasStub).props('cropping')).toBe(true);
      wrapper.findComponent(ScreenshotCanvasStub).vm.$emit('cropDone');
      await flushPromises();
      await run(wrapper, 'action:fullscreen');
      expect(wrapper.get('.screenshot-preview-stage').classes()).toContain('is-app-fullscreen');
      expect(wrapper.findComponent(ScreenshotSearch).exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
}

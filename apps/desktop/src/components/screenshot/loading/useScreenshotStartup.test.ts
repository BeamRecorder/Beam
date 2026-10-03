import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import { useScreenshotStartup } from './useScreenshotStartup';
import { injectScreenshotStartup } from './screenshot-startup-context';
import type { ScreenshotStartup } from './screenshot-startup-types';
vi.mock('~/api/capture', () => ({ capture: {} }));

it('owns a fresh startup controller when an editor is mounted on its own', () => {
  let first!: ScreenshotStartup, second!: ScreenshotStartup;
  const a = mount(
    defineComponent({
      setup() {
        first = useScreenshotStartup();
        return () => null;
      },
    }),
  );
  const b = mount(
    defineComponent({
      setup() {
        second = useScreenshotStartup();
        return () => null;
      },
    }),
  );
  expect(first).not.toBe(second);
  expect(first.report()).toBeNull();
  expect(second.report()).toBeNull();
  a.unmount();
  b.unmount();
});
it('shares a window controller through nested editor and canvas components', () => {
  let parent!: ScreenshotStartup,
    editor!: ScreenshotStartup,
    canvas: ScreenshotStartup | null = null;
  const Canvas = defineComponent({
    setup() {
      canvas = injectScreenshotStartup();
      return () => null;
    },
  });
  const Editor = defineComponent({
    setup() {
      editor = useScreenshotStartup();
      return () => h(Canvas);
    },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        parent = useScreenshotStartup();
        return () => h(Editor);
      },
    }),
  );
  expect(editor).toBe(parent);
  expect(canvas).toBe(parent);
  wrapper.unmount();
});
it('allows standalone preview surfaces to operate without startup reporting', () => {
  let result: ScreenshotStartup | null | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = injectScreenshotStartup();
        return () => null;
      },
    }),
  );
  expect(result).toBeNull();
  wrapper.unmount();
});

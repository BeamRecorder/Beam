import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { captureMock } from './capture.mock';
import { useHudPreviewVisibility } from '../useHudPreviewVisibility';

vi.mock('~/api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));

function setup(embedded = false) {
  let visible!: ReturnType<typeof useHudPreviewVisibility>;
  const wrapper = mount(
    defineComponent({
      setup: () => {
        visible = useHudPreviewVisibility(embedded);
        return () => null;
      },
    }),
  );
  return { wrapper, visible };
}

describe('HUD preview native visibility', () => {
  it('waits for the native snapshot even when Chromium says visible', () => {
    captureMock.onWindowVisibility.mockImplementationOnce(() => () => undefined);
    const f = setup();
    expect(f.visible.value).toBe(false);
    f.wrapper.unmount();
  });

  it('follows native visibility changes and releases its listener on unmount', () => {
    let notify!: (visible: boolean) => void;
    const unsubscribe = vi.fn();
    captureMock.onWindowVisibility.mockImplementationOnce((listener) => {
      notify = listener;
      listener(false);
      return unsubscribe;
    });
    const f = setup();
    notify(true);
    expect(f.visible.value).toBe(true);
    notify(false);
    expect(f.visible.value).toBe(false);
    f.wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('never subscribes to native media visibility for an embedded demonstration', () => {
    captureMock.onWindowVisibility.mockClear();
    const f = setup(true);
    expect(f.visible.value).toBe(false);
    expect(captureMock.onWindowVisibility).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
});

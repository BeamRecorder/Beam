import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCaptureActionShortcuts } from './useCaptureActionShortcuts';
import { hydrateActionBindings } from './action-bindings';
import type { CaptureMode } from '@beam/engine/capture/capture-mode';
let wrapper: ReturnType<typeof mount>;
const setup = (instant = true, callbacks = true) => {
  const mode = ref<CaptureMode>('studio'),
    disabled = ref(false);
  const choose = vi.fn(),
    settings = vi.fn(),
    confirm = vi.fn(),
    fail = vi.fn();
  wrapper = mount(
    defineComponent({
      setup() {
        useCaptureActionShortcuts({
          mode,
          instant,
          disabled: () => disabled.value,
          choose,
          fail,
          ...(callbacks ? { settings, confirm } : {}),
        });
        return () => h('div');
      },
    }),
  );
  return { mode, disabled, choose, settings, confirm, fail };
};
const press = (key: string, ctrlKey = false) => {
  const event = new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
};
afterEach(() => {
  wrapper?.unmount();
  hydrateActionBindings({});
});
describe('capture action adapters', () => {
  it('maps each capture mode and source to its real controller', () => {
    const bindings = {
      'capture.studio': 'v',
      'capture.screenshot': 'i',
      'capture.instant': 'q',
      'capture.screen': 'd',
      'capture.region': 'r',
      'capture.window': 'w',
    };
    hydrateActionBindings(
      Object.fromEntries(
        Object.entries(bindings).map(([id, key]) => [
          id,
          { keys: key, scope: 'application' as const, category: 'recording' },
        ]),
      ),
    );
    const f = setup();
    for (const [key, mode] of [
      ['i', 'screenshot'],
      ['q', 'instant'],
      ['v', 'studio'],
    ] as const) {
      press(key);
      expect(f.mode.value).toBe(mode);
    }
    for (const key of ['d', 'r', 'w']) expect(press(key).defaultPrevented).toBe(true);
    expect(f.choose.mock.calls).toEqual([['screen'], ['region'], ['window']]);
  });
  it('opens settings, confirms and honors controller disable', () => {
    const f = setup();
    press(',', true);
    press('Enter');
    expect(f.settings).toHaveBeenCalledOnce();
    expect(f.confirm).toHaveBeenCalledOnce();
    f.disabled.value = true;
    press('Enter');
    expect(f.confirm).toHaveBeenCalledOnce();
  });
  it('leaves unavailable mode and callbacks alone and reports controller failures', async () => {
    hydrateActionBindings({
      'capture.instant': { keys: 'q', scope: 'application', category: 'recording' },
      'capture.region': { keys: 'r', scope: 'application', category: 'recording' },
    });
    const f = setup(false, false);
    expect(press('q').defaultPrevented).toBe(false);
    expect(f.mode.value).toBe('studio');
    expect(press(',', true).defaultPrevented).toBe(false);
    expect(press('Enter').defaultPrevented).toBe(false);
    f.choose.mockRejectedValueOnce(new Error('Source unavailable'));
    press('r');
    await flushPromises();
    expect(f.fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'Source unavailable' }));
  });
});

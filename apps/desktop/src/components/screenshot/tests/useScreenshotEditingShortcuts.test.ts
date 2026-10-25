import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotEditingShortcutOptions } from '../screenshot-editing-shortcut-types';
import type { useScreenshotLayerShortcuts } from '../useScreenshotLayerShortcuts';
import { useScreenshotEditingShortcuts } from '../useScreenshotEditingShortcuts';
import { screenshotState, screenshotShape } from '../screenshot-state';
import { initializeScreenshotComposition } from '@beam/engine/screenshot/screenshot-layers';
import { documentFixture } from './screenshot-editor-test-helpers';
const mocks = vi.hoisted(() => ({ bind: vi.fn(), duplicate: vi.fn(), begin: vi.fn(), end: vi.fn() }));
vi.mock('../useScreenshotLayerShortcuts', () => ({ useScreenshotLayerShortcuts: mocks.bind }));
vi.mock('../duplicate-screenshot-selection', () => ({ duplicateScreenshotSelection: mocks.duplicate }));
vi.mock('~/composables/property-interaction', () => ({
  beginPropertyInteraction: mocks.begin,
  endPropertyInteraction: mocks.end,
}));
const fixture = () => {
  const state = screenshotState(documentFixture());
  state.shapes = [screenshotShape('rectangle', 'shape')];
  initializeScreenshotComposition(state);
  const options: ScreenshotEditingShortcutOptions = {
    state: ref(state),
    selectedId: ref('shape'),
    selectedIds: ref(['shape']),
    source: () => ({ source: 'project-media://screenshot/image.png', width: 1200, height: 800 }),
    disabled: () => false,
    selectMany: vi.fn(),
    showSelection: vi.fn(),
    remove: vi.fn(),
    group: vi.fn(),
    ungroup: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    fail: vi.fn(),
  };
  const duplicate = useScreenshotEditingShortcuts(options);
  const bindings = mocks.bind.mock.lastCall![0] as Parameters<typeof useScreenshotLayerShortcuts>[0];
  return { options, duplicate, bindings };
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.duplicate.mockReturnValue({ ids: ['copy'], primaryId: 'copy' });
});
describe('Screenshot editing action controller', () => {
  it('duplicates with the current source and selects the result in a single property interaction', () => {
    const { options, duplicate, bindings } = fixture();
    expect(duplicate({ x: 0.1, y: 0.2 })).toBe(true);
    expect(mocks.duplicate).toHaveBeenCalledWith(options.state.value, options.source(), ['shape'], 'shape', {
      x: 0.1,
      y: 0.2,
    });
    expect(options.selectMany).toHaveBeenCalledWith(['copy'], 'copy');
    expect(options.showSelection).toHaveBeenCalledWith('copy');
    expect(bindings.duplicate!()).toBe(true);
    expect(mocks.begin).toHaveBeenCalledTimes(2);
    expect(mocks.end).toHaveBeenCalledTimes(2);
  });
  it('does not duplicate unavailable or disabled documents and closes empty interactions', () => {
    const { options, duplicate } = fixture();
    options.disabled = () => true;
    expect(duplicate()).toBe(false);
    options.disabled = () => false;
    options.source = () => null;
    expect(duplicate()).toBe(false);
    options.source = () => ({ source: 'image.png', width: 10, height: 10 });
    options.state.value = null;
    expect(duplicate()).toBe(false);
    expect(mocks.begin).not.toHaveBeenCalled();
    const next = fixture();
    mocks.duplicate.mockReturnValueOnce(null);
    expect(next.duplicate()).toBe(false);
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it('reports duplicate failures and always releases the interaction', () => {
    const { options, duplicate } = fixture();
    mocks.duplicate.mockImplementationOnce(() => {
      throw new Error('Invalid layer');
    });
    expect(duplicate()).toBe(false);
    expect(options.fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid layer' }));
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it('selects all unlocked layers, finds the removable selection and deselects cleanly', () => {
    const { options, bindings } = fixture();
    expect(bindings.selected()?.id).toBe('shape');
    options.state.value!.composition!.find((layer) => layer.id === 'shape')!.locked = true;
    expect(bindings.selected()).toBeUndefined();
    bindings.selectAll!();
    expect(options.selectMany).toHaveBeenCalledWith(['__background__', options.state.value!.image.id, '__watermark__']);
    bindings.deselect!();
    expect(options.selectMany).toHaveBeenLastCalledWith([]);
    expect(options.showSelection).toHaveBeenCalledWith(null);
    options.state.value = null;
    bindings.selectAll!();
    expect(options.selectMany).toHaveBeenLastCalledWith([]);
    expect(bindings.selected()).toBeUndefined();
  });
});

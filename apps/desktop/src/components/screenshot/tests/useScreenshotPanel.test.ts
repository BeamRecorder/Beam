import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useScreenshotPanel } from '../useScreenshotPanel';
import type { ScreenshotPanel } from '../screenshot-types';
import { documentFixture } from './screenshot-editor-test-helpers';
import { screenshotState } from '../screenshot-state';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
const fixture = () => {
  const state = ref<ScreenshotState | null>(screenshotState(documentFixture()));
  const panel = ref<ScreenshotPanel>('shapes'),
    cropping = ref(true),
    selectedId = ref<string | null>(null),
    finishDrawing = vi.fn();
  const select = vi.fn();
  const api = useScreenshotPanel({
    state,
    panel,
    cropping,
    selectedId,
    select,
    finishDrawing,
  });
  return { state, panel, cropping, selectedId, finishDrawing, select, api };
};
describe('merged screenshot Clip navigation', () => {
  it('routes real selected layers to internal property panels without additional sidebar entries', () => {
    const f = fixture();
    for (const [id, panel] of [
      [null, 'canvas'],
      ['__background__', 'canvas'],
      ['__watermark__', 'canvas'],
      ['screenshot', 'image'],
      ['shape', 'shapes'],
    ]) {
      f.api.showSelection(id);
      expect(f.panel.value).toBe(panel);
      expect(f.cropping.value).toBe(false);
    }
    f.state.value!.cursors = [{ id: 'cursor' } as NonNullable<ScreenshotState['cursors']>[number]];
    f.api.showSelection('cursor');
    expect(f.panel.value).toBe('cursor');
    f.state.value!.effects = [{ id: 'blur' } as NonNullable<ScreenshotState['effects']>[number]];
    f.api.showSelection('blur');
    expect(f.finishDrawing).toHaveBeenCalledOnce();
  });
  it('keeps the selected layer when re-entering Clip and never restores a deleted main image', () => {
    const f = fixture();
    f.state.value!.image.enabled = false;
    f.selectedId.value = 'screenshot';
    f.api.selectPanel('clip');
    expect(f.panel.value).toBe('image');
    expect(f.state.value!.image.enabled).toBe(false);
    expect(f.select).not.toHaveBeenCalled();
    f.selectedId.value = null;
    f.api.selectPanel('clip');
    expect(f.panel.value).toBe('shapes');
  });
  it('ends drawing on Canvas or Settings and handles unready state or unknown tabs safely', () => {
    const f = fixture();
    f.api.selectPanel('canvas');
    expect(f.select).toHaveBeenCalledWith(null);
    f.api.selectPanel('settings');
    expect(f.panel.value).toBe('settings');
    expect(f.finishDrawing).toHaveBeenCalledTimes(2);
    f.api.selectPanel('unknown');
    expect(f.panel.value).toBe('settings');
    f.state.value = null;
    f.api.showSelection(null);
    expect(f.panel.value).toBe('canvas');
  });
});

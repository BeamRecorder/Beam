import './VideoEditor.test.setup';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackPropertyComposition } from '@beam/engine/composition/clip-track-properties.test-support';
import { setTransform } from '@beam/engine/commands/clip-engine';
import type { ClipComposition, VisualClip } from '@beam/engine/shared/composition-types';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { editorState, historyState, mountEditor, setEditorComponent } from './VideoEditor.test.setup';

const { default: VideoEditor } = await import('../VideoEditor.vue');
setEditorComponent(VideoEditor);
afterEach(() => vi.useRealTimers());

async function prepare() {
  vi.useFakeTimers();
  const mounted = mountEditor();
  const state = editorState.store;
  const initial = trackPropertyComposition();
  const source = initial.clips[0] as VisualClip;
  source.appearance = { ...source.appearance, shadowSize: 'lg' };
  source.crop = { x: 0.1, y: 0, width: 0.9, height: 1 };
  state.compositionState.composition.value = initial;
  state.compositionState.selectedClipId.value = 'first';
  state.compositionState.selectedClipIds.value = ['first'];
  await mounted.vm.$nextTick();
  await vi.advanceTimersByTimeAsync(300);
  const clip = (id: string) =>
    (state.compositionState.composition.value as ClipComposition).clips.find((clip) => clip.id === id) as VisualClip;
  return { mounted, state, clip };
}
describe('apply-to-track editor integration', () => {
  it('undoes and redoes an entire cursor application without changing the source or clip layout', async () => {
    const h = await prepare();
    const scope = h.state.cursorProperties;
    scope.update({ ...scope.settings.value, size: 80, color: '#ff0000' });
    await h.mounted.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(300);
    const count = historyState.undoStack!.value.length;
    scope.enabled.value = true;
    await h.mounted.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(h.clip('second').cursorSettings?.size).toBe(80);
    expect(h.clip('second').crop).toBeUndefined();
    expect(historyState.undoStack!.value.length).toBe(count + 1);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(h.clip('second').cursorSettings).toBeUndefined();
    expect(h.clip('first').cursorSettings?.size).toBe(80);
    expect(scope.enabled.value).toBe(false);
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(h.clip('third').cursorSettings?.color).toBe('#ff0000');
    expect(scope.enabled.value).toBe(true);
  });
  it('records shared zoom styling as one undo step while preserving each focus', async () => {
    const h = await prepare();
    const zooms = h.state.zoomState;
    zooms.zoomElements.value = [
      { ...createManualZoom('first-zoom', 0, 1000), depth: 6, focus: { cx: 0.2, cy: 0.2 } },
      { ...createManualZoom('second-zoom', 2000, 3000), depth: 2, focus: { cx: 0.8, cy: 0.8 } },
    ];
    zooms.selectedZoomId.value = 'first-zoom';
    zooms.selectedZoomIds.value = ['first-zoom'];
    await h.mounted.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(300);
    const count = historyState.undoStack!.value.length;
    zooms.propertyScope.enabled.value = true;
    await h.mounted.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(zooms.zoomElements.value[1]!.depth).toBe(6);
    expect(historyState.undoStack!.value.length).toBe(count + 1);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(zooms.zoomElements.value[1]!.depth).toBe(2);
    expect(zooms.propertyScope.enabled.value).toBe(false);
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(zooms.zoomElements.value[1]).toMatchObject({ depth: 6, focus: { cx: 0.8, cy: 0.8 }, startMs: 2000 });
    expect(zooms.propertyScope.enabled.value).toBe(true);
  });
  it('records the entire initial application as one undo step and restores all segments together', async () => {
    const h = await prepare();
    const count = historyState.undoStack!.value.length;
    h.state.compositionState.clipTrackProperties.enabled.value = true;
    await h.mounted.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(h.clip('second').appearance.shadowSize).toBe('lg');
    expect(h.clip('third').crop).toEqual(h.clip('first').crop);
    expect(historyState.undoStack!.value.length).toBe(count + 1);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(h.clip('second').appearance.shadowSize).not.toBe('lg');
    expect(h.clip('third').crop).toBeUndefined();
    expect(h.clip('first').appearance.shadowSize).toBe('lg');
    expect(h.state.compositionState.clipTrackProperties.enabled.value).toBe(false);
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(h.clip('second').appearance.shadowSize).toBe('lg');
    expect(h.clip('third').crop).toEqual(h.clip('first').crop);
    expect(h.state.compositionState.clipTrackProperties.enabled.value).toBe(true);
  });
  it('separates an immediate scope activation from the source edit made just before it', async () => {
    const h = await prepare();
    const scope = h.state.compositionState.clipTrackProperties;
    const original = h.clip('first').transform;
    const transform = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
    h.state.compositionState.composition.value = setTransform(
      h.state.compositionState.composition.value,
      'first',
      transform,
    );
    scope.enabled.value = true;
    expect(h.clip('third').transform).toEqual(transform);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(scope.enabled.value).toBe(false);
    expect(h.clip('first').transform).toEqual(transform);
    expect(h.clip('third').transform).not.toEqual(transform);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(h.clip('first').transform).toEqual(original);
    await h.mounted.get('.redo').trigger('click');
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(scope.enabled.value).toBe(true);
    expect(h.clip('third').transform).toEqual(transform);
  });
  it('undoes a rapid cursor propagation while keeping the checked mode and its earlier copy', async () => {
    const h = await prepare();
    const scope = h.state.cursorProperties;
    scope.update({ ...scope.settings.value, size: 80 });
    scope.enabled.value = true;
    scope.update({ ...scope.settings.value, size: 100 });
    await h.mounted.vm.$nextTick();
    expect(h.clip('third').cursorSettings?.size).toBe(100);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(scope.enabled.value).toBe(true);
    expect(['first', 'second', 'third'].map((id) => h.clip(id).cursorSettings?.size)).toEqual([80, 80, 80]);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(scope.enabled.value).toBe(false);
    expect(h.clip('first').cursorSettings?.size).toBe(80);
    expect(h.clip('third').cursorSettings).toBeUndefined();
    await h.mounted.get('.redo').trigger('click');
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(scope.enabled.value).toBe(true);
    expect(['first', 'second', 'third'].map((id) => h.clip(id).cursorSettings?.size)).toEqual([100, 100, 100]);
  });
  it('undoes and redoes unchecking a scope without applying the source over its peers again', async () => {
    const h = await prepare();
    const scope = h.state.compositionState.clipTrackProperties;
    scope.enabled.value = true;
    scope.enabled.value = false;
    const shared = h.clip('third').appearance;
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(scope.enabled.value).toBe(true);
    expect(h.clip('third').appearance).toEqual(shared);
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(scope.enabled.value).toBe(false);
    expect(h.clip('third').appearance).toEqual(shared);
  });
  it('keeps rapid zoom styling separate from its activation and restores every target and focus', async () => {
    const h = await prepare();
    const zooms = h.state.zoomState;
    zooms.zoomElements.value = [
      { ...createManualZoom('first-zoom', 0, 1000), depth: 6, focus: { cx: 0.2, cy: 0.2 } },
      { ...createManualZoom('second-zoom', 2000, 3000), depth: 2, focus: { cx: 0.8, cy: 0.8 } },
    ];
    zooms.selectedZoomId.value = 'first-zoom';
    zooms.selectedZoomIds.value = ['first-zoom'];
    zooms.propertyScope.enabled.value = true;
    zooms.zoomElements.value = zooms.propertyScope.synchronize(
      zooms.zoomElements.value.map((zoom: ZoomElement) => (zoom.id === 'first-zoom' ? { ...zoom, depth: 4 } : zoom)),
    );
    await h.mounted.vm.$nextTick();
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(zooms.propertyScope.enabled.value).toBe(true);
    expect(zooms.zoomElements.value.map((zoom: ZoomElement) => zoom.depth)).toEqual([6, 6]);
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(zooms.propertyScope.enabled.value).toBe(false);
    expect(zooms.zoomElements.value.map((zoom: ZoomElement) => zoom.depth)).toEqual([6, 2]);
    await h.mounted.get('.redo').trigger('click');
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(zooms.zoomElements.value[1]).toMatchObject({ depth: 4, focus: { cx: 0.8, cy: 0.8 }, startMs: 2000 });
  });
  it('routes composition-based property panels through the same track scope', async () => {
    const h = await prepare();
    h.state.compositionState.clipTrackProperties.enabled.value = true;
    const panel = h.mounted.findComponent({ name: 'MockProperties' });
    panel.vm.$emit(
      'update:composition',
      setTransform(h.state.compositionState.composition.value, 'first', { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }),
    );
    await h.mounted.vm.$nextTick();
    expect(h.clip('third').transform).toEqual(h.clip('first').transform);
    expect(h.clip('other').transform).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('keeps committed canvas rotations uniform and restores the entire propagated edit together', async () => {
    const h = await prepare();
    h.state.compositionState.clipTrackProperties.enabled.value = true;
    h.mounted.findComponent({ name: 'MockEditorCanvas' }).vm.$emit('update:clip-rotation', 23);
    await h.mounted.vm.$nextTick();
    expect(h.clip('first').rotation).toBe(23);
    expect(h.clip('second').rotation).toBe(23);
    expect(h.clip('third').rotation).toBe(23);
    expect(h.clip('other').rotation).toBeUndefined();
    await h.mounted.get('.undo').trigger('click');
    await flushPromises();
    expect(h.state.compositionState.clipTrackProperties.enabled.value).toBe(true);
    expect(['first', 'second', 'third'].map((id) => h.clip(id).rotation)).toEqual([undefined, undefined, undefined]);
    await h.mounted.get('.redo').trigger('click');
    await flushPromises();
    expect(['first', 'second', 'third'].map((id) => h.clip(id).rotation)).toEqual([23, 23, 23]);
  });
});

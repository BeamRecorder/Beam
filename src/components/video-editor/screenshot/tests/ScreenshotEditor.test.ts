import { createPinia, setActivePinia } from 'pinia';
import { useToastStore } from '~/ui/toast/toastStore';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ElementEditorContext } from '../../elements/element-editor-types';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import { createScreenshotEditorTestHarness, documentFixture, presetFixture } from './screenshot-editor-test-helpers';
import { registerScreenshotEditorHistoryAndFooterTests } from './screenshot-editor-history-cases';

const capture = vi.hoisted(() => ({
  getScreenshot: vi.fn(),
  listBackgroundLibrary: vi.fn(),
  listCursorPacks: vi.fn(),
  onCursorPacksChanged: vi.fn(),
  getEditorPresets: vi.fn(),
  reportEditorLoadingStage: vi.fn(),
  saveScreenshot: vi.fn(),
  exportScreenshot: vi.fn(),
  updateEditorPreset: vi.fn(),
  renameEditorPreset: vi.fn(),
  createEditorPreset: vi.fn(),
  selectEditorPreset: vi.fn(),
  deleteEditorPreset: vi.fn(),
  showHud: vi.fn(),
  openEditor: vi.fn(),
  openScreenshot: vi.fn(),
}));
const renderer = vi.hoisted(() => ({ encodeScreenshot: vi.fn() }));
const clipboardRaster = vi.hoisted(() => ({ rasterize: vi.fn() }));
let screenshotCanvasEditor: ElementEditorContext | null = null;

vi.mock('~/api/capture', () => ({ capture }));
vi.mock('../screenshot-render', () => ({
  encodeScreenshot: renderer.encodeScreenshot,
  loadScreenshotAssets: vi.fn(),
  drawScreenshot: vi.fn(),
}));
vi.mock('../screenshot-layer-clipboard-raster', () => ({
  rasterizeScreenshotLayer: clipboardRaster.rasterize,
}));

import ScreenshotEditor from '../ScreenshotEditor.vue';
const editorHarness = createScreenshotEditorTestHarness(ScreenshotEditor, (editor) => {
  screenshotCanvasEditor = editor;
});
const {
  ScreenshotCanvasStub,
  ScreenshotCompositionStub,
  ShapePropertiesStub,
  ScreenshotCursorControlsStub,
  ClipPropertiesStub,
  mountEditor,
  clickText,
  compositionLayers,
} = editorHarness;

describe('ScreenshotEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    screenshotCanvasEditor = null;
    setActivePinia(createPinia());
    capture.getScreenshot.mockResolvedValue(documentFixture());
    capture.listBackgroundLibrary.mockResolvedValue([]);
    capture.listCursorPacks.mockResolvedValue([]);
    capture.onCursorPacksChanged.mockReturnValue(vi.fn());
    capture.getEditorPresets.mockResolvedValue(presetFixture());
    capture.reportEditorLoadingStage.mockImplementation(() => undefined);
    capture.saveScreenshot.mockResolvedValue(undefined);
    capture.exportScreenshot.mockResolvedValue(null);
    capture.updateEditorPreset.mockResolvedValue(presetFixture());
    capture.renameEditorPreset.mockResolvedValue(presetFixture());
    capture.createEditorPreset.mockResolvedValue(presetFixture());
    capture.selectEditorPreset.mockResolvedValue(presetFixture());
    capture.deleteEditorPreset.mockResolvedValue(presetFixture());
    renderer.encodeScreenshot.mockResolvedValue(new ArrayBuffer(4));
    clipboardRaster.rasterize.mockImplementation(async (state: ScreenshotState, layerId: string, name: string) => ({
      ...structuredClone(state.image),
      id: layerId,
      kind: 'image',
      name,
      assetId: layerId,
      source: `data:image/webp;base64,${layerId}`,
      width: state.canvas.width,
      height: state.canvas.height,
    }));
  });

  afterEach(() => {
    document.body.classList.remove('beam-app-fullscreen-active');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('surfaces load errors and still signals that initialization finished', async () => {
    capture.getScreenshot.mockRejectedValueOnce(new Error('Screenshot unavailable'));
    const wrapper = mountEditor();

    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Screenshot unavailable');
    expect(wrapper.emitted('ready')).toEqual([[]]);
    wrapper.unmount();
  });

  it('waits for the screenshot canvas first paint before signaling readiness', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    expect(wrapper.emitted('ready')).toBeUndefined();
    wrapper.findComponent(ScreenshotCanvasStub).vm.$emit('ready');
    expect(wrapper.emitted('ready')).toEqual([[]]);
    wrapper.unmount();
  });

  it('places the fullscreen preview action beside the screenshot dimensions control', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    const controls = wrapper.get('.canvas-controls');
    expect(controls.find('button[aria-label="Dimensions"]').exists()).toBe(true);
    expect(controls.find('button[aria-label="Fullscreen preview"]').exists()).toBe(true);
    expect(controls.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      'Dimensions',
      'Fullscreen preview',
    ]);
    wrapper.unmount();
  });

  it('keeps preview entry unavailable during text editing and drawing', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    const fullscreen = () => wrapper.get('button[aria-label="Fullscreen preview"]');
    const editor = screenshotCanvasEditor!;

    editor.add('drawing');
    await wrapper.vm.$nextTick();
    expect(fullscreen().attributes('disabled')).toBeDefined();

    editor.add('drawing');
    editor.add('text');
    await wrapper.vm.$nextTick();
    expect(fullscreen().attributes('disabled')).toBeDefined();

    editor.cancelText();
    await wrapper.vm.$nextTick();
    expect(fullscreen().attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('enters the fullscreen screenshot preview with an in-canvas back action', async () => {
    vi.useFakeTimers();
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.get('button[aria-label="Fullscreen preview"]').trigger('click');
    await wrapper.vm.$nextTick();

    const stage = wrapper.get('.screenshot-preview-stage');
    expect(stage.classes()).toContain('is-app-fullscreen');
    expect(stage.get('.fullscreen-preview-back button').text()).toContain('Back');

    await stage.get('.fullscreen-preview-back button').trigger('click');
    await vi.advanceTimersByTimeAsync(160);
    await wrapper.vm.$nextTick();
    expect(stage.classes()).not.toContain('is-app-fullscreen');
    expect(stage.classes()).not.toContain('is-fullscreen-exiting');
    wrapper.unmount();
  });

  it('exits the fullscreen screenshot preview with Escape', async () => {
    vi.useFakeTimers();
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.get('button[aria-label="Fullscreen preview"]').trigger('click');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.get('.screenshot-preview-stage').classes()).toContain('is-fullscreen-exiting');
    await vi.advanceTimersByTimeAsync(160);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.screenshot-preview-stage').classes()).not.toContain('is-app-fullscreen');
    expect(wrapper.find('button[aria-label="Fullscreen preview"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('disables screenshot interaction, clears selection and hides composition while fullscreen', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    canvas.vm.$emit('select', 'screenshot');
    await wrapper.vm.$nextTick();
    expect(canvas.props('selectedId')).toBe('screenshot');
    expect(wrapper.findComponent(ScreenshotCompositionStub).exists()).toBe(true);

    await wrapper.get('button[aria-label="Fullscreen preview"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(canvas.props('disabled')).toBe(true);
    expect(canvas.props('selectedId')).toBe(null);
    expect(canvas.props('selectedIds')).toEqual([]);
    expect(canvas.props('cropping')).toBe(false);
    expect(wrapper.findComponent(ScreenshotCompositionStub).exists()).toBe(false);
    wrapper.unmount();
  });

  it('cleans up the fullscreen body state when the screenshot editor unmounts', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.get('button[aria-label="Fullscreen preview"]').trigger('click');
    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(true);

    wrapper.unmount();

    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(false);
  });

  it('opens with the Elements panel active instead of canvas settings', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    expect(wrapper.get('[aria-label="Elements"]').classes()).toContain('active');
    expect(wrapper.find('[data-testid="canvas-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('activates image cropping when the screenshot canvas requests it', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    canvas.vm.$emit('cropRequest', 'screenshot');
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[aria-label="Image"]').classes()).toContain('active');
    expect(canvas.props('selectedId')).toBe('screenshot');
    expect(canvas.props('cropping')).toBe(true);
    wrapper.unmount();
  });

  it('converts numeric input strings, preserves invalid dimensions, and exports the saved image', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await clickText(wrapper, 'Export');

    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0);
    await clickText(wrapper, 'Advanced');
    await wrapper.get('[role="checkbox"]').trigger('click');
    const dimensions = wrapper.findAll('input[type="number"]');
    expect(dimensions).toHaveLength(2);
    await dimensions[0]!.setValue('1400');
    await dimensions[1]!.setValue('0');

    await clickText(wrapper, 'Save image');
    await flushPromises();

    expect(renderer.encodeScreenshot).toHaveBeenCalledWith(
      'project-media://screenshot/screen-1/source.png',
      expect.objectContaining({
        canvas: expect.objectContaining({ width: 1400, height: 800 }),
      }),
    );
    expect(capture.saveScreenshot).toHaveBeenCalledWith(
      'screen-1',
      expect.objectContaining({
        canvas: expect.objectContaining({ width: 1400, height: 800 }),
      }),
      expect.any(Object),
    );
    expect(capture.exportScreenshot).toHaveBeenCalledWith('screen-1', new ArrayBuffer(4), 'png', false);
    wrapper.unmount();
  });

  it('copies the rendered image and marks the copy action complete', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await clickText(wrapper, 'Copy');
    await flushPromises();

    expect(capture.saveScreenshot).toHaveBeenCalledWith('screen-1', expect.any(Object), expect.any(Object));
    expect(capture.exportScreenshot).toHaveBeenCalledWith('screen-1', new ArrayBuffer(4), 'png', true);
    expect(wrapper.text()).toContain('Copied');
    expect(useToastStore().toasts.at(-1)?.message).toBe('Image copied to clipboard, use it anywhere');
    wrapper.unmount();
  });

  it('copies a WebP preset as PNG while keeping WebP for file export', async () => {
    capture.getScreenshot.mockResolvedValueOnce(documentFixture('webp'));
    capture.getEditorPresets.mockResolvedValueOnce(presetFixture('webp'));
    const wrapper = mountEditor();
    await flushPromises();

    await clickText(wrapper, 'Copy');
    await flushPromises();
    expect(renderer.encodeScreenshot).toHaveBeenNthCalledWith(
      1,
      'project-media://screenshot/screen-1/source.png',
      expect.objectContaining({ format: 'png' }),
    );
    expect(capture.saveScreenshot).toHaveBeenCalledWith(
      'screen-1',
      expect.objectContaining({ format: 'webp' }),
      expect.any(Object),
    );
    expect(capture.exportScreenshot).toHaveBeenNthCalledWith(1, 'screen-1', new ArrayBuffer(4), 'png', true);

    await clickText(wrapper, 'Export');
    await clickText(wrapper, 'Save image');
    await flushPromises();

    expect(renderer.encodeScreenshot).toHaveBeenNthCalledWith(
      2,
      'project-media://screenshot/screen-1/source.png',
      expect.objectContaining({ format: 'webp' }),
    );
    expect(capture.exportScreenshot).toHaveBeenNthCalledWith(2, 'screen-1', new ArrayBuffer(4), 'webp', false);
    wrapper.unmount();
  });

  it('adds a highlight with shared controls, saves it, and supports undo/redo', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Highlight');
    await flushPromises();
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const original = canvas.props('state')!.effects[0];
    expect(original).toMatchObject({
      kind: 'blur',
      mode: 'highlight',
      strength: 65,
      highlightColor: '#ffffff',
      tintOpacity: 20,
    });
    expect(canvas.props('selectedId')).toBe(original.id);
    expect(wrapper.text()).toContain('Surrounding opacity');
    expect(wrapper.text()).toContain('Highlight intensity');
    expect(compositionLayers(wrapper)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: original.id, kind: 'effect' })]),
    );
    await clickText(wrapper, 'Copy');
    await flushPromises();
    expect(capture.saveScreenshot).toHaveBeenLastCalledWith(
      'screen-1',
      expect.objectContaining({
        effects: [expect.objectContaining({ id: original.id, highlightColor: '#ffffff', tintOpacity: 20 })],
      }),
      expect.any(Object),
    );
    wrapper.findComponent({ name: 'EditorHistoryControls' }).vm.$emit('undo');
    await flushPromises();
    expect(canvas.props('state')!.effects ?? []).toHaveLength(0);
    wrapper.findComponent({ name: 'EditorHistoryControls' }).vm.$emit('redo');
    await flushPromises();
    expect(canvas.props('state')!.effects).toHaveLength(1);
    wrapper.unmount();
  });

  it('adds a blur with shared controls, saves it, and supports undo/redo', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'blur-1' });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Blur');
    await flushPromises();

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const original = canvas.props('state')!.effects[0]!;
    expect(original).toMatchObject({
      id: 'blur-1',
      kind: 'blur',
      mode: 'blur',
      shape: 'rectangle',
      strength: 60,
      feather: 0,
      cornerRadius: 0,
      tintOpacity: 0,
      color: '#000000',
      transform: { x: 0.35, y: 0.35, width: 0.3, height: 0.3 },
    });
    expect(canvas.props('selectedId')).toBe(original.id);
    expect(wrapper.text()).toContain('Blur radius');
    expect(wrapper.text()).toContain('Privacy');
    expect(compositionLayers(wrapper)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: original.id, kind: 'effect' })]),
    );

    await clickText(wrapper, 'Copy');
    await flushPromises();
    expect(capture.saveScreenshot).toHaveBeenLastCalledWith(
      'screen-1',
      expect.objectContaining({ effects: [expect.objectContaining({ id: original.id, mode: 'blur', strength: 60 })] }),
      expect.any(Object),
    );
    wrapper.findComponent({ name: 'EditorHistoryControls' }).vm.$emit('undo');
    await flushPromises();
    expect(canvas.props('state')!.effects ?? []).toHaveLength(0);
    wrapper.findComponent({ name: 'EditorHistoryControls' }).vm.$emit('redo');
    await flushPromises();
    expect(canvas.props('state')!.effects).toHaveLength(1);
    wrapper.unmount();
  });

  it('finishes text editing and exits drawing mode before adding a blur', async () => {
    let id = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `layer-${++id}` });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');

    await clickText(wrapper, 'Text');
    screenshotCanvasEditor?.updateText('Committed text');
    expect(screenshotCanvasEditor?.editing.value?.text?.content).toBe('Committed text');

    await clickText(wrapper, 'Blur');
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    expect(canvas.props('state')!.shapes[0]!.text?.content).toBe('Committed text');
    expect(screenshotCanvasEditor?.editing.value).toBeNull();

    await clickText(wrapper, 'Draw');
    expect(screenshotCanvasEditor?.drawingMode.value).toBe(true);
    await clickText(wrapper, 'Blur');
    expect(screenshotCanvasEditor?.drawingMode.value).toBe(false);
    expect(canvas.props('state')!.effects).toHaveLength(2);
    wrapper.unmount();
  });

  it('creates and selects a shape, applies its shared style, and removes it', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'shape-1' });
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Arrow');
    expect(wrapper.findComponent(ShapePropertiesStub).props('clip')).toMatchObject({
      id: 'shape-1',
      family: 'arrow',
    });
    expect(wrapper.findComponent(ScreenshotCompositionStub).props('layers')).toContainEqual(
      expect.objectContaining({
        id: 'shape-1',
        kind: 'arrow',
        opacity: 100,
        blendMode: 'source-over',
      }),
    );

    await wrapper.get('[data-testid="change-shape-style"]').trigger('click');
    await clickText(wrapper, 'Copy');
    await flushPromises();

    expect(capture.saveScreenshot).toHaveBeenCalledWith(
      'screen-1',
      expect.objectContaining({
        shapes: [
          expect.objectContaining({
            id: 'shape-1',
            fillColor: '#123456',
            rotation: 90,
          }),
        ],
      }),
      expect.any(Object),
    );

    await wrapper.get('.properties-footer').get('button').trigger('click');
    expect(wrapper.findAll('button').some((button) => button.text().trim() === 'Arrow 1')).toBe(false);
    expect(wrapper.find('[data-testid="shape-properties"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('passes cursor packs into the canvas and wires cursor/composition changes into screenshot state', async () => {
    const cursorAsset: CursorAssetDescriptor = {
      id: 'pointer',
      label: 'Pointer',
      url: 'project-media://cursor/pack/pointer.svg',
      format: 'svg',
      tintable: true,
      intrinsicSize: { width: 32, height: 32 },
      nominalSize: 32,
      hotspot: { x: 8, y: 4 },
    };
    const cursorPack: CursorPackDescriptor = {
      id: 'pack:imported',
      name: 'Imported pack',
      source: 'imported',
      colorMode: 'tintable',
      defaultCursorId: cursorAsset.id,
      cursors: [cursorAsset],
      automaticMap: { default: cursorAsset.id },
    };
    vi.stubGlobal('crypto', { randomUUID: () => 'cursor-1' });
    capture.listCursorPacks.mockResolvedValueOnce([cursorPack]);
    const unsubscribe = vi.fn();
    let packsChanged!: () => void;
    capture.onCursorPacksChanged.mockImplementationOnce((listener: () => void) => {
      packsChanged = listener;
      return unsubscribe;
    });
    const wrapper = mountEditor();
    await flushPromises();

    expect(capture.listCursorPacks).toHaveBeenCalledOnce();
    expect(capture.onCursorPacksChanged).toHaveBeenCalledOnce();
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    expect(canvas.props('cursorPacks')).toContainEqual(cursorPack);
    expect(compositionLayers(wrapper).map(({ id }) => id)).toEqual(['__background__', 'screenshot', '__watermark__']);

    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Cursor');
    await wrapper.vm.$nextTick();

    const state = canvas.props('state')!;
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    expect(state.cursors).toHaveLength(1);
    expect(state.cursors[0]).toMatchObject({
      id: 'cursor-1',
      name: 'Cursor',
      enabled: true,
    });
    expect(composition.props('layers')).toContainEqual(
      expect.objectContaining({
        id: 'cursor-1',
        kind: 'cursor',
        visible: true,
        opacity: 100,
      }),
    );
    expect(composition.props('selectedId')).toBe('cursor-1');
    const cursorControls = wrapper.findComponent(ScreenshotCursorControlsStub);
    expect(cursorControls.props('packs')).toContainEqual(cursorPack);

    cursorControls.vm.$emit('update', {
      size: 72,
      color: '#abcdef',
      rotation: 30,
    });
    composition.vm.$emit('update', 'cursor-1', {
      opacity: 35,
      blendMode: 'multiply',
      locked: true,
    });
    await wrapper.vm.$nextTick();
    expect(state.cursors[0]).toMatchObject({
      size: 72,
      color: '#abcdef',
      rotation: 30,
    });
    expect(state.composition?.find((layer: { id: string }) => layer.id === 'cursor-1')).toMatchObject({
      opacity: 35,
      blendMode: 'multiply',
      locked: true,
    });

    composition.vm.$emit('visibility', 'cursor-1', false);
    composition.vm.$emit('reorder', 'cursor-1', state.composition!.length - 1);
    await wrapper.vm.$nextTick();
    expect(state.cursors[0].enabled).toBe(false);
    expect(state.composition?.[0]?.id).toBe('cursor-1');

    composition.vm.$emit('remove', 'cursor-1');
    await wrapper.vm.$nextTick();
    expect(state.cursors).toHaveLength(1);
    expect(state.composition?.some((layer: { id: string }) => layer.id === 'cursor-1')).toBe(true);

    composition.vm.$emit('update', 'cursor-1', { locked: false });
    await wrapper.vm.$nextTick();
    composition.vm.$emit('remove', 'cursor-1');
    await wrapper.vm.$nextTick();
    expect(state.cursors).toEqual([]);
    expect(state.composition?.some((layer: { id: string }) => layer.id === 'cursor-1')).toBe(false);

    packsChanged();
    await flushPromises();
    expect(capture.listCursorPacks).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('synchronizes composition and canvas multi-selection with toggles and replacement', async () => {
    const ids = ['selection-a', 'selection-b', 'selection-c'];
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => ids[nextId++]! });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    expect(canvas.props('selectedIds')).toEqual(['selection-c']);

    composition.vm.$emit('select', 'selection-a', 'toggle');
    await wrapper.vm.$nextTick();
    expect(composition.props('selectedIds')).toEqual(['selection-c', 'selection-a']);
    expect(canvas.props('selectedIds')).toEqual(['selection-c', 'selection-a']);
    expect(canvas.props('selectedId')).toBe('selection-a');

    canvas.vm.$emit('select', 'selection-b', 'toggle');
    await wrapper.vm.$nextTick();
    expect(canvas.props('selectedIds')).toEqual(['selection-c', 'selection-a', 'selection-b']);
    expect(composition.props('selectedIds')).toEqual(['selection-c', 'selection-a', 'selection-b']);
    expect(composition.props('selectedId')).toBe('selection-b');

    composition.vm.$emit('select', 'selection-a');
    await wrapper.vm.$nextTick();
    expect(composition.props('selectedIds')).toEqual(['selection-a']);
    expect(canvas.props('selectedIds')).toEqual(['selection-a']);

    canvas.vm.$emit('select', 'selection-c');
    await wrapper.vm.$nextTick();
    expect(canvas.props('selectedIds')).toEqual(['selection-c']);
    expect(composition.props('selectedIds')).toEqual(['selection-c']);
    wrapper.unmount();
  });

  it('copies and pastes a selected shape group, then cuts only the pasted copies', async () => {
    const ids = ['clipboard-a', 'clipboard-b', 'untouched-c', 'pasted-a', 'pasted-b'];
    let nextId = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => ids[nextId++] ?? `unexpected-${nextId}`,
    });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    const state = canvas.props('state') as ScreenshotState;
    state.shapes[0]!.name = 'First shape';
    state.shapes[1]!.name = 'Second shape';
    state.shapes[2]!.name = 'Uncopied shape';
    await wrapper.vm.$nextTick();

    composition.vm.$emit('select', 'clipboard-a');
    composition.vm.$emit('select', 'clipboard-b', 'toggle');
    await wrapper.vm.$nextTick();
    expect(composition.props('selectedIds')).toEqual(['clipboard-a', 'clipboard-b']);

    const copyEvent = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(copyEvent);
    expect(copyEvent.defaultPrevented).toBe(true);
    expect(useToastStore().toasts.at(-1)?.message).toBe('Copied: First shape, Second shape');

    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { items: [{ kind: 'string', type: 'text/plain' }] },
    });
    window.dispatchEvent(pasteEvent);
    await flushPromises();
    expect(pasteEvent.defaultPrevented).toBe(true);
    expect((canvas.props('state') as ScreenshotState).shapes.map(({ id }) => id)).toEqual([
      'clipboard-a',
      'clipboard-b',
      'untouched-c',
      'pasted-a',
      'pasted-b',
    ]);
    expect(composition.props('selectedIds')).toEqual(['pasted-a', 'pasted-b']);
    expect(composition.props('selectedId')).toBe('pasted-b');
    expect(useToastStore().toasts.at(-1)?.message).toBe('Pasted: First shape, Second shape');

    const cutEvent = new KeyboardEvent('keydown', {
      key: 'x',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(cutEvent);
    await flushPromises();
    expect(cutEvent.defaultPrevented).toBe(true);
    expect((canvas.props('state') as ScreenshotState).shapes.map(({ id }) => id)).toEqual([
      'clipboard-a',
      'clipboard-b',
      'untouched-c',
    ]);
    expect(composition.props('selectedIds')).toEqual([]);
    expect(compositionLayers(wrapper).map(({ id }) => id)).toEqual(
      expect.arrayContaining(['clipboard-a', 'clipboard-b', 'untouched-c']),
    );
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toEqual(
      expect.arrayContaining(['pasted-a', 'pasted-b']),
    );
    wrapper.unmount();
  });

  it('copies and pastes the captured image, background, and watermark as editable images', async () => {
    const ids = ['captured-copy', 'background-copy', 'watermark-copy'];
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => ids[nextId++]! });
    const wrapper = mountEditor();
    await flushPromises();
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    const state = canvas.props('state') as ScreenshotState;
    const paste = async () => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', {
        value: { items: [{ kind: 'string', type: 'text/plain' }] },
      });
      window.dispatchEvent(event);
      await flushPromises();
      expect(event.defaultPrevented).toBe(true);
    };
    const copy = async (id: string) => {
      composition.vm.$emit('select', id);
      await wrapper.vm.$nextTick();
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
      await flushPromises();
      expect(event.defaultPrevented).toBe(true);
    };

    await copy(state.image.id);
    await paste();
    await copy('__background__');
    await paste();
    await copy('__watermark__');
    await paste();

    expect(state.images?.map(({ id, name, source }) => ({ id, name, source }))).toEqual([
      {
        id: 'captured-copy',
        name: 'Captured screen',
        source: 'project-media://screenshot/screen-1/source.png',
      },
      {
        id: 'background-copy',
        name: 'Background',
        source: 'data:image/webp;base64,__background__',
      },
      {
        id: 'watermark-copy',
        name: 'Watermark',
        source: 'data:image/webp;base64,__watermark__',
      },
    ]);
    expect(clipboardRaster.rasterize.mock.calls.map(([, id]) => id)).toEqual(['__background__', '__watermark__']);
    expect(composition.props('selectedId')).toBe('watermark-copy');
    wrapper.unmount();
  });

  it('cuts a built-in background and pastes its raster as a normal editable image', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'cut-background-copy' });
    const wrapper = mountEditor();
    await flushPromises();
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    const state = canvas.props('state') as ScreenshotState;
    composition.vm.$emit('select', '__background__');
    await wrapper.vm.$nextTick();

    const cut = new KeyboardEvent('keydown', {
      key: 'x',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(cut);
    expect(cut.defaultPrevented).toBe(true);
    await flushPromises();
    expect(state.canvas.showBackground).toBe(false);
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('__background__');

    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { items: [{ kind: 'string', type: 'text/plain' }] },
    });
    window.dispatchEvent(paste);
    await flushPromises();
    expect(paste.defaultPrevented).toBe(true);
    expect(state.images).toContainEqual(
      expect.objectContaining({
        id: 'cut-background-copy',
        kind: 'image',
        source: 'data:image/webp;base64,__background__',
      }),
    );
    wrapper.unmount();
  });

  it('translates a selected group in place and records the movement as one undo step', async () => {
    const ids = ['translate-a', 'translate-b', 'translate-outside'];
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => ids[nextId++]! });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    const state = canvas.props('state') as ScreenshotState;
    const shapeCollection = state.shapes;
    const compositionCollection = state.composition;
    const shapes = new Map(state.shapes.map((shape) => [shape.id, shape]));
    const before = new Map(state.shapes.map((shape) => [shape.id, { ...shape.transform }]));

    composition.vm.$emit('select', 'translate-a');
    composition.vm.$emit('select', 'translate-b', 'toggle');
    await wrapper.vm.$nextTick();
    canvas.vm.$emit('translate', { x: 0.05, y: 0.08 });
    await flushPromises();

    expect(canvas.props('state')).toBe(state);
    expect(state.shapes).toBe(shapeCollection);
    expect(state.composition).toBe(compositionCollection);
    expect(state.shapes[0]).toBe(shapes.get('translate-a'));
    expect(state.shapes[1]).toBe(shapes.get('translate-b'));
    expect(state.shapes[2]).toBe(shapes.get('translate-outside'));
    expect(state.shapes[0]?.transform).toEqual({
      ...before.get('translate-a'),
      x: before.get('translate-a')!.x + 0.05,
      y: before.get('translate-a')!.y + 0.08,
    });
    expect(state.shapes[1]?.transform).toEqual({
      ...before.get('translate-b'),
      x: before.get('translate-b')!.x + 0.05,
      y: before.get('translate-b')!.y + 0.08,
    });
    expect(state.shapes[2]?.transform).toEqual(before.get('translate-outside'));

    const history = wrapper.findComponent({ name: 'EditorHistoryControls' });
    history.vm.$emit('undo');
    await flushPromises();
    let restored = canvas.props('state') as ScreenshotState;
    expect(restored.shapes.map((shape) => shape.transform)).toEqual([
      before.get('translate-a'),
      before.get('translate-b'),
      before.get('translate-outside'),
    ]);

    history.vm.$emit('redo');
    await flushPromises();
    restored = canvas.props('state') as ScreenshotState;
    expect(restored.shapes[0]?.transform).toEqual({
      ...before.get('translate-a'),
      x: before.get('translate-a')!.x + 0.05,
      y: before.get('translate-a')!.y + 0.08,
    });
    expect(restored.shapes[1]?.transform).toEqual({
      ...before.get('translate-b'),
      x: before.get('translate-b')!.x + 0.05,
      y: before.get('translate-b')!.y + 0.08,
    });
    expect(restored.shapes[2]?.transform).toEqual(before.get('translate-outside'));
    wrapper.unmount();
  });

  it('deletes the selected unlocked group from the keyboard and undo restores valid layer ids', async () => {
    const ids = ['keyboard-a', 'keyboard-b'];
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => ids[nextId++]! });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    composition.vm.$emit('select', 'keyboard-a');
    composition.vm.$emit('select', 'keyboard-b', 'toggle');
    await wrapper.vm.$nextTick();

    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    await flushPromises();
    expect(event.defaultPrevented).toBe(true);
    expect((canvas.props('state') as ScreenshotState).shapes).toEqual([]);
    expect(composition.props('selectedIds')).toEqual([]);
    expect(composition.props('selectedId')).toBeNull();
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('keyboard-a');
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('keyboard-b');

    wrapper.findComponent({ name: 'EditorHistoryControls' }).vm.$emit('undo');
    await flushPromises();
    const restored = canvas.props('state') as ScreenshotState;
    expect(restored.shapes.map(({ id }) => id)).toEqual(['keyboard-a', 'keyboard-b']);
    expect(composition.props('selectedIds')).toEqual([]);
    const layerIds = compositionLayers(wrapper).map(({ id }) => id);
    expect(new Set(layerIds).size).toBe(layerIds.length);
    expect(restored.composition?.map(({ id }) => id)).toEqual(layerIds);
    expect(layerIds).toEqual(expect.arrayContaining(['keyboard-a', 'keyboard-b', 'screenshot']));
    wrapper.unmount();
  });

  it('deletes every unlocked selected member from a context target while preserving locked members', async () => {
    const ids = ['context-a', 'context-b'];
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => ids[nextId++]! });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Arrow');
    await clickText(wrapper, 'Arrow');

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    composition.vm.$emit('update', 'context-b', { locked: true });
    composition.vm.$emit('select', 'context-a');
    composition.vm.$emit('select', 'screenshot', 'toggle');
    composition.vm.$emit('select', 'context-b', 'toggle');
    await wrapper.vm.$nextTick();
    expect(composition.props('selectedIds')).toEqual(['context-a', 'screenshot', 'context-b']);

    composition.vm.$emit('remove', 'context-b');
    await flushPromises();
    const state = canvas.props('state') as ScreenshotState;
    expect(state.shapes.map(({ id }) => id)).toEqual(['context-b']);
    expect(state.composition?.find(({ id }) => id === 'context-b')?.locked).toBe(true);
    expect(state.image.enabled).toBe(false);
    expect(compositionLayers(wrapper).map(({ id }) => id)).toEqual(expect.arrayContaining(['context-b']));
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('screenshot');
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('context-a');
    expect(composition.props('selectedIds')).toEqual(['context-b']);
    expect(composition.props('selectedId')).toBe('context-b');

    wrapper.findComponent({ name: 'EditorHistoryControls' }).vm.$emit('undo');
    await flushPromises();
    const restored = canvas.props('state') as ScreenshotState;
    expect(restored.shapes.map(({ id }) => id)).toEqual(['context-a', 'context-b']);
    expect(composition.props('selectedIds')).toEqual(['context-b']);
    const layerIds = compositionLayers(wrapper).map(({ id }) => id);
    expect(new Set(layerIds).size).toBe(layerIds.length);
    expect(restored.composition?.map(({ id }) => id)).toEqual(layerIds);
    expect(layerIds).toEqual(expect.arrayContaining(['screenshot', 'context-a', 'context-b']));
    wrapper.unmount();
  });

  it('deletes built-in visual layers and restores them when their controls are used again', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    const state = canvas.props('state') as ScreenshotState;

    composition.vm.$emit('select', '__background__');
    composition.vm.$emit('remove', '__background__');
    await wrapper.vm.$nextTick();
    expect(state.canvas.showBackground).toBe(false);
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('__background__');

    const canvasPanel = wrapper.findComponent({ name: 'CanvasPanel' });
    canvasPanel.vm.$emit('update:selectedBackground', {
      id: 'restored-background',
      name: 'Restored background',
      kind: 'color',
      color: '#abcdef',
    });
    await wrapper.vm.$nextTick();
    expect(state.canvas.showBackground).toBe(true);
    expect(
      compositionLayers(wrapper)
        .map(({ id }) => id)
        .at(0),
    ).toBe('__background__');

    composition.vm.$emit('select', '__watermark__');
    composition.vm.$emit('remove', '__watermark__');
    await wrapper.vm.$nextTick();
    expect(state.canvas.watermark?.enabled).toBe(false);
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('__watermark__');
    canvasPanel.vm.$emit('update:watermark', { ...state.canvas.watermark!, enabled: true });
    await wrapper.vm.$nextTick();
    expect(
      compositionLayers(wrapper)
        .map(({ id }) => id)
        .at(-1),
    ).toBe('__watermark__');

    composition.vm.$emit('select', 'screenshot');
    composition.vm.$emit('remove', 'screenshot');
    await wrapper.vm.$nextTick();
    expect(state.image.enabled).toBe(false);
    expect(compositionLayers(wrapper).map(({ id }) => id)).not.toContain('screenshot');
    await wrapper.get('[aria-label="Image"]').trigger('click');
    expect(state.image.enabled).toBe(true);
    expect(compositionLayers(wrapper).map(({ id }) => id)).toEqual(['__background__', 'screenshot', '__watermark__']);
    wrapper.unmount();
  });

  it('saves text styling and a completed drawing from the provided element context', async () => {
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `element-${++nextId}` });
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Text');
    const editor = screenshotCanvasEditor;
    expect(editor).not.toBeNull();

    editor!.updateText('A saved screenshot label');
    editor!.finishText();
    await wrapper.get('[data-testid="change-shape-style"]').trigger('click');
    editor!.add('drawing');
    editor!.addDrawing({
      transform: { x: 0.15, y: 0.2, width: 0.5, height: 0.4 },
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.85, y: 0.75 },
        ],
        smoothing: 35,
        strokeWidth: 11,
      },
    });

    await clickText(wrapper, 'Copy');
    await flushPromises();

    expect(capture.saveScreenshot).toHaveBeenCalledWith(
      'screen-1',
      expect.objectContaining({
        shapes: [
          expect.objectContaining({
            id: 'element-1',
            family: 'text',
            fillColor: '#123456',
            rotation: 90,
            text: expect.objectContaining({
              content: 'A saved screenshot label',
            }),
          }),
          expect.objectContaining({
            id: 'element-2',
            family: 'drawing',
            fillColor: '#ff5a1f',
            transform: { x: 0.15, y: 0.2, width: 0.5, height: 0.4 },
            drawing: expect.objectContaining({
              points: [
                { x: 0.1, y: 0.2 },
                { x: 0.85, y: 0.75 },
              ],
              smoothing: 35,
              strokeWidth: 11,
            }),
          }),
        ],
      }),
      expect.any(Object),
    );
    expect(capture.exportScreenshot).toHaveBeenCalledWith('screen-1', new ArrayBuffer(4), 'png', true);
    wrapper.unmount();
  });

  it('ignores initialization that completes after the editor has unmounted', async () => {
    let resolveScreenshot!: (value: ScreenshotDocument) => void;
    capture.getScreenshot.mockReturnValueOnce(
      new Promise<ScreenshotDocument>((resolve) => {
        resolveScreenshot = resolve;
      }),
    );
    const wrapper = mountEditor();

    wrapper.unmount();
    resolveScreenshot(documentFixture());
    await flushPromises();

    expect(wrapper.emitted('ready')).toBeUndefined();
    expect(capture.saveScreenshot).not.toHaveBeenCalled();
  });
  it('keeps properties before the canvas and exposes only still-image navigation', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    const children = wrapper.get('.editor-body').element.children;
    expect(children[0]?.classList.contains('sidebar-island')).toBe(true);
    expect(children[1]?.classList.contains('properties-island')).toBe(true);
    expect(children[2]?.classList.contains('screenshot-preview-stage')).toBe(true);
    expect(children[2]?.querySelector('[data-testid="screenshot-canvas"]')).not.toBeNull();
    expect(wrapper.find('[aria-label="Audio"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Image"]').trigger('click');
    expect(wrapper.findComponent(ClipPropertiesStub).attributes('hide-layout')).toBeDefined();
    await clickText(wrapper, 'Crop');
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    expect(canvas.props('cropping')).toBe(true);
    canvas.vm.$emit('crop', { x: 0.2, y: 0.1, width: 0.6, height: 0.7 });
    canvas.vm.$emit('cropDone');
    await clickText(wrapper, 'Copy');
    await flushPromises();
    expect(canvas.props('cropping')).toBe(false);
    expect(renderer.encodeScreenshot).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        image: expect.objectContaining({
          crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.7 },
        }),
      }),
    );
    wrapper.unmount();
  });

  it('applies size presets to both preview and export and keeps advanced dimensions proportional', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await clickText(wrapper, 'Export');
    await wrapper.get('[aria-label="Size preset"]').setValue('1:1');
    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    expect(canvas.props('state')!.canvas).toMatchObject({
      width: 1080,
      height: 1080,
      preset: 'custom',
    });
    await clickText(wrapper, 'Advanced');
    await wrapper.get('input[aria-label="Width"]').setValue('2048');
    expect(canvas.props('state')!.canvas).toMatchObject({
      width: 2048,
      height: 2048,
    });
    await clickText(wrapper, 'Save image');
    await flushPromises();
    expect(renderer.encodeScreenshot).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        canvas: expect.objectContaining({ width: 2048, height: 2048 }),
      }),
    );
    wrapper.unmount();
  });

  it('keeps the captured aspect when typing a smaller export width digit by digit', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await clickText(wrapper, 'Export');
    await clickText(wrapper, 'Advanced');

    const width = wrapper.get('input[aria-label="Width"]');
    await width.trigger('focus');
    await width.setValue('6');
    await width.setValue('60');
    await width.setValue('600');

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    expect(canvas.props('state')!.canvas).toMatchObject({ width: 600, height: 400 });
    expect(wrapper.get('input[aria-label="Height"]').element).toHaveProperty('value', '400');

    await clickText(wrapper, 'Save image');
    await flushPromises();
    expect(renderer.encodeScreenshot).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ canvas: expect.objectContaining({ width: 600, height: 400 }) }),
    );
    wrapper.unmount();
  });

  it('starts a new aspect calculation when dragging a dimension and switching fields', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await clickText(wrapper, 'Export');
    await clickText(wrapper, 'Advanced');

    const width = wrapper.get('input[aria-label="Width"]');
    await width.trigger('focus');
    await width.setValue('600');
    await width.trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    expect(canvas.props('state')!.canvas).toMatchObject({ width: 700, height: 467 });

    await width.trigger('blur');
    const height = wrapper.get('input[aria-label="Height"]');
    await height.trigger('focus');
    await height.setValue('200');
    expect(canvas.props('state')!.canvas).toMatchObject({ width: 300, height: 200 });
    wrapper.unmount();
  });

  it('shows an export failure without announcing a successful clipboard copy', async () => {
    capture.exportScreenshot.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    const wrapper = mountEditor();
    await flushPromises();
    await clickText(wrapper, 'Copy');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Clipboard unavailable');
    expect(useToastStore().toasts).toHaveLength(0);
    wrapper.unmount();
  });
  it('shares the ambient canvas background and puts project navigation before the right-hand presets', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    expect(wrapper.get('.screenshot-topbar').text()).toContain('Back to HUD');
    const header = wrapper.get('.screenshot-topbar').element;
    const children = Array.from(header.children);
    expect(children.indexOf(wrapper.get('[data-testid="project-switcher"]').element)).toBeLessThan(
      children.indexOf(header.querySelector('.titlebar-space')!),
    );
    expect(children.indexOf(wrapper.get('[data-testid="preset-controls"]').element)).toBeGreaterThan(
      children.indexOf(header.querySelector('.titlebar-space')!),
    );
    const state = wrapper.findComponent(ScreenshotCanvasStub).props('state')!;
    state.background = { kind: 'color', color: '#d54f68' };
    state.canvas.showBackground = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'EditorAmbientBackground' }).props('background')).toEqual(state.background);
    state.canvas.showBackground = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'EditorAmbientBackground' }).props('background')).toBeNull();
    wrapper.unmount();
  });

  it.each(['studio', 'instant', 'screenshot'])(
    'flushes pending image changes before opening a %s project',
    async (mode) => {
      const wrapper = mountEditor();
      await flushPromises();
      let resolveSave!: () => void;
      capture.saveScreenshot.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
      );
      const switcher = wrapper.findComponent({ name: 'VideoProjectEdition' });
      switcher.vm.$emit('open-project', { id: 'next', name: 'Next', mode });
      await flushPromises();
      expect(capture.openEditor).not.toHaveBeenCalled();
      expect(capture.openScreenshot).not.toHaveBeenCalled();
      expect(switcher.props('disabled')).toBe(true);
      resolveSave();
      await flushPromises();
      expect(mode === 'screenshot' ? capture.openScreenshot : capture.openEditor).toHaveBeenCalledWith('next');
      wrapper.unmount();
    },
  );

  it('keeps the screenshot open if saving before a project switch fails', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    capture.saveScreenshot.mockRejectedValueOnce(new Error('Disk full'));
    wrapper.findComponent({ name: 'VideoProjectEdition' }).vm.$emit('open-project', { id: 'next', mode: 'studio' });
    await flushPromises();
    expect(capture.openEditor).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('Disk full');
    wrapper.unmount();
  });
  it('returns to the HUD when the open screenshot is deleted without resaving the deleted document', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    wrapper
      .findComponent({ name: 'VideoProjectEdition' })
      .vm.$emit('delete-project', { id: 'screen-1', mode: 'screenshot' });
    await flushPromises();
    expect(capture.showHud).toHaveBeenCalledOnce();
    wrapper.unmount();
    await flushPromises();
    expect(capture.saveScreenshot).not.toHaveBeenCalled();
  });

  registerScreenshotEditorHistoryAndFooterTests(capture, editorHarness);
});

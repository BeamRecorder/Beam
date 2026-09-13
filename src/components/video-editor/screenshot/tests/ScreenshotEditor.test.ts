import { createPinia, setActivePinia } from 'pinia';
import { useToastStore } from '~/ui/toast/toastStore';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ElementEditorContext } from '../../elements/element-editor-types';
import type { ScreenshotDocument } from '~/api/types/screenshot';
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
let screenshotCanvasEditor: ElementEditorContext | null = null;

vi.mock('~/api/capture', () => ({ capture }));
vi.mock('../screenshot-render', () => ({
  encodeScreenshot: renderer.encodeScreenshot,
  loadScreenshotAssets: vi.fn(),
  drawScreenshot: vi.fn(),
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(state.cursors).toEqual([]);
    expect(state.composition?.some((layer: { id: string }) => layer.id === 'cursor-1')).toBe(false);

    packsChanged();
    await flushPromises();
    expect(capture.listCursorPacks).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
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
    expect(children[2]?.getAttribute('data-testid')).toBe('screenshot-canvas');
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

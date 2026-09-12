import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAsset } from '~/media/shared/composition-types';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import ScreenshotEditor from '../ScreenshotEditor.vue';
import {
  createScreenshotEditorTestHarness,
  documentFixture,
  presetFixture,
  settings,
} from './screenshot-editor-test-helpers';

const capture = vi.hoisted(() => ({
  getScreenshot: vi.fn(),
  listBackgroundLibrary: vi.fn(),
  listCursorPacks: vi.fn(),
  onCursorPacksChanged: vi.fn(),
  getEditorPresets: vi.fn(),
  reportEditorLoadingStage: vi.fn(),
  saveScreenshot: vi.fn(),
  exportScreenshot: vi.fn(),
  pickScreenshotImage: vi.fn(),
  discardScreenshotImage: vi.fn(),
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
const imageLoader = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('~/api/capture', () => ({ capture }));
vi.mock('../screenshot-render', () => ({
  encodeScreenshot: renderer.encodeScreenshot,
  loadScreenshotAssets: vi.fn(),
  drawScreenshot: vi.fn(),
}));
vi.mock('../screenshot-assets', () => ({ createScreenshotImageLoader: () => imageLoader.load }));

const harness = createScreenshotEditorTestHarness(ScreenshotEditor, () => {});
const { mountEditor, ScreenshotCanvasStub, ScreenshotCompositionStub, compositionLayers } = harness;
let nextImageId = 0;

const asset: MediaAsset = {
  id: 'imported-asset',
  kind: 'image',
  name: 'Reference image',
  fileName: 'reference.png',
  durationMs: 0,
  width: 800,
  height: 600,
  src: 'project-media://screenshot/screen-1/reference.png',
  origin: 'project',
};
const canvasState = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findComponent(ScreenshotCanvasStub).props('state') as ScreenshotState;
const addImage = async (wrapper: ReturnType<typeof mount>) => {
  await wrapper.get('[aria-label="Elements"]').trigger('click');
  const button = wrapper.findAll('.element-tools button').find((candidate) => candidate.text().trim() === 'Image');
  if (!button) throw new Error('Missing Add Image button.');
  await button.trigger('click');
  await flushPromises();
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('ScreenshotEditor imported image layers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextImageId = 0;
    setActivePinia(createPinia());
    capture.getScreenshot.mockResolvedValue(documentFixture());
    capture.listBackgroundLibrary.mockResolvedValue([]);
    capture.listCursorPacks.mockResolvedValue([]);
    capture.onCursorPacksChanged.mockReturnValue(vi.fn());
    capture.getEditorPresets.mockResolvedValue(presetFixture());
    capture.reportEditorLoadingStage.mockImplementation(() => undefined);
    capture.saveScreenshot.mockResolvedValue(undefined);
    capture.exportScreenshot.mockResolvedValue(null);
    capture.pickScreenshotImage.mockResolvedValue(null);
    capture.discardScreenshotImage.mockResolvedValue(undefined);
    capture.updateEditorPreset.mockResolvedValue(presetFixture());
    capture.renameEditorPreset.mockResolvedValue(presetFixture());
    capture.createEditorPreset.mockResolvedValue(presetFixture());
    capture.selectEditorPreset.mockResolvedValue(presetFixture());
    capture.deleteEditorPreset.mockResolvedValue(presetFixture());
    renderer.encodeScreenshot.mockResolvedValue(new ArrayBuffer(4));
    imageLoader.load.mockResolvedValue({ naturalWidth: 800, naturalHeight: 600 });
    vi.stubGlobal('crypto', { randomUUID: () => `image-layer-${++nextImageId}` });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats native image-picker cancellation as a no-op', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await addImage(wrapper);

    expect(capture.pickScreenshotImage).toHaveBeenCalledWith('screen-1');
    expect(imageLoader.load).not.toHaveBeenCalled();
    expect(canvasState(wrapper).images ?? []).toEqual([]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findComponent(ScreenshotCompositionStub).props('selectedId')).toBeNull();
    wrapper.unmount();
  });

  it('discards an imported media asset when decoding fails and shows the decode error', async () => {
    capture.pickScreenshotImage.mockResolvedValueOnce(asset);
    imageLoader.load.mockRejectedValueOnce(new Error('Image decode failed'));
    const wrapper = mountEditor();
    await flushPromises();

    await addImage(wrapper);

    expect(imageLoader.load).toHaveBeenCalledWith(asset.src);
    expect(capture.discardScreenshotImage).toHaveBeenCalledWith('screen-1', asset.src);
    expect(canvasState(wrapper).images ?? []).toEqual([]);
    expect(wrapper.get('[role="alert"]').text()).toContain('Image decode failed');
    wrapper.unmount();
  });

  it('selects the imported image and routes its appearance, mirror, crop, and transform edits only to it', async () => {
    capture.pickScreenshotImage.mockResolvedValueOnce(asset);
    const wrapper = mountEditor();
    await flushPromises();

    await addImage(wrapper);

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    const state = canvasState(wrapper);
    const imported = state.images![0]!;
    const capturedImage = clone(state.image);
    expect(imported).toMatchObject({
      id: 'image-layer-1',
      assetId: asset.id,
      kind: 'image',
      name: asset.name,
      source: asset.src,
      width: 800,
      height: 600,
    });
    expect(canvas.props('selectedId')).toBe(imported.id);
    expect(composition.props('selectedId')).toBe(imported.id);
    expect(composition.props('layers')).toContainEqual(
      expect.objectContaining({ id: imported.id, kind: 'image', name: asset.name, removable: true }),
    );
    expect(wrapper.find('[data-testid="clip-properties"]').exists()).toBe(true);

    const transform = { x: 0.21, y: 0.18, width: 0.44, height: 0.38 };
    const crop = { x: 0.1, y: 0.2, width: 0.65, height: 0.6 };
    canvas.vm.$emit('transform', transform);
    canvas.vm.$emit('crop', crop);
    const clipProperties = wrapper.findComponent(harness.ClipPropertiesStub);
    clipProperties.vm.$emit('update:appearance', { shadowBlur: 18 });
    clipProperties.vm.$emit('update:is-mirrored', true);
    clipProperties.vm.$emit('update:is-mirrored-y', true);
    await wrapper.vm.$nextTick();

    expect(imported).toMatchObject({
      transform,
      crop,
      isMirrored: true,
      isMirroredY: true,
      appearance: { shadowBlur: 18 },
    });
    expect(state.image).toEqual(capturedImage);
    wrapper.unmount();
  });

  it('keeps imported images in the Elements panel with palette, crop controls, properties, and one footer delete', async () => {
    capture.pickScreenshotImage.mockResolvedValueOnce(asset);
    const wrapper = mountEditor();
    await flushPromises();

    await addImage(wrapper);

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const state = canvasState(wrapper);
    const importedId = state.images![0]!.id;
    expect(wrapper.get('.sidebar-island .nav-btn.active').attributes('aria-label')).toBe('Elements');
    expect(wrapper.find('.elements-panel .element-tools').exists()).toBe(true);
    const palette = wrapper.get('.elements-panel').element;
    const properties = wrapper.get('[data-testid="clip-properties"]').element;
    expect(palette.compareDocumentPosition(properties) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.findAll('button').filter((button) => button.text().trim().startsWith('Delete'))).toHaveLength(1);
    expect(wrapper.find('.elements-panel [aria-label="Delete"]').exists()).toBe(false);
    expect(wrapper.get('.properties-footer button').text()).toContain(asset.name);

    const crop = wrapper.findAll('button').find((button) => button.text().trim() === 'Crop');
    expect(crop).toBeDefined();
    await crop!.trigger('click');
    expect(canvas.props('selectedId')).toBe(importedId);
    expect(canvas.props('cropping')).toBe(true);
    wrapper.unmount();
  });

  it('returns to the Elements tab after selecting an imported image from composition and keeps it selected on tab click', async () => {
    capture.pickScreenshotImage.mockResolvedValueOnce(asset);
    const wrapper = mountEditor();
    await flushPromises();
    await addImage(wrapper);

    const canvas = wrapper.findComponent(ScreenshotCanvasStub);
    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    const importedId = canvasState(wrapper).images![0]!.id;
    await wrapper.get('[aria-label="Image"]').trigger('click');
    expect(canvas.props('selectedId')).toBe('screenshot');
    expect(wrapper.get('.sidebar-island .nav-btn.active').attributes('aria-label')).toBe('Image');

    composition.vm.$emit('select', importedId);
    await wrapper.vm.$nextTick();
    expect(canvas.props('selectedId')).toBe(importedId);
    expect(composition.props('selectedId')).toBe(importedId);
    expect(wrapper.get('.sidebar-island .nav-btn.active').attributes('aria-label')).toBe('Elements');

    await wrapper.get('[aria-label="Elements"]').trigger('click');
    expect(canvas.props('selectedId')).toBe(importedId);
    expect(composition.props('selectedId')).toBe(importedId);
    expect(wrapper.get('.sidebar-island .nav-btn.active').attributes('aria-label')).toBe('Elements');
    wrapper.unmount();
  });

  it('keeps imported image layers in undo, redo, and saved project history', async () => {
    let persisted: ScreenshotDocument = documentFixture();
    capture.getScreenshot.mockImplementation(async () => clone(persisted));
    capture.saveScreenshot.mockImplementation(
      async (_id: string, state: ScreenshotState, history: ScreenshotDocument['history']) => {
        persisted = { ...persisted, state: clone(state), history: clone(history) };
      },
    );
    capture.pickScreenshotImage.mockResolvedValueOnce(asset);
    const wrapper = mountEditor();
    await flushPromises();
    await addImage(wrapper);
    const importedId = canvasState(wrapper).images![0]!.id;
    const composition = wrapper.findComponent(ScreenshotCompositionStub);

    composition.vm.$emit('remove', importedId);
    await wrapper.vm.$nextTick();
    expect(canvasState(wrapper).images).toEqual([]);

    await wrapper.get('[aria-label="Undo (Ctrl+Z)"]').trigger('click');
    await flushPromises();
    expect(canvasState(wrapper).images).toContainEqual(expect.objectContaining({ id: importedId, source: asset.src }));

    await wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Copy')!
      .trigger('click');
    await flushPromises();
    expect(persisted.state?.images).toContainEqual(expect.objectContaining({ id: importedId, source: asset.src }));
    expect(persisted.history?.undo.at(-1)?.images).toContainEqual(
      expect.objectContaining({ id: importedId, source: asset.src }),
    );
    wrapper.unmount();
    await flushPromises();

    const reopened = mountEditor();
    await flushPromises();
    expect(canvasState(reopened).images).toContainEqual(expect.objectContaining({ id: importedId, source: asset.src }));
    await reopened.get('[aria-label="Redo (Ctrl+Y)"]').trigger('click');
    await flushPromises();
    expect(canvasState(reopened).images).toEqual([]);
    await reopened.get('[aria-label="Undo (Ctrl+Z)"]').trigger('click');
    await flushPromises();
    expect(canvasState(reopened).images).toContainEqual(expect.objectContaining({ id: importedId, source: asset.src }));
    reopened.unmount();
  });

  it('preserves imported image layers when selecting a different screenshot preset', async () => {
    capture.pickScreenshotImage.mockResolvedValueOnce(asset);
    const nextPresets = presetFixture();
    nextPresets.presets.push({
      ...nextPresets.presets[0]!,
      id: 'webp',
      name: 'WebP',
      protected: false,
      settings: settings('webp'),
    });
    nextPresets.activePresetId = 'webp';
    capture.selectEditorPreset.mockResolvedValueOnce(nextPresets);
    const wrapper = mountEditor();
    await flushPromises();
    await addImage(wrapper);
    const importedId = canvasState(wrapper).images![0]!.id;

    wrapper.findComponent({ name: 'EditorPresetControls' }).vm.$emit('select', 'webp');
    await flushPromises();

    expect(canvasState(wrapper).format).toBe('webp');
    expect(canvasState(wrapper).images).toContainEqual(expect.objectContaining({ id: importedId, source: asset.src }));
    expect(compositionLayers(wrapper)).toContainEqual(expect.objectContaining({ id: importedId, kind: 'image' }));
    wrapper.unmount();
  });
});

import { effectScope, ref } from 'vue';
import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { createManualZoom } from '@beam/engine/zoom/manual-zoom';
import {
  initializeScreenshotComposition,
  insertScreenshotLayer,
  removeScreenshotLayer,
} from '@beam/engine/screenshot/screenshot-layers';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import { DEFAULT_WATERMARK } from '@beam/engine/layout/output-canvas';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { createEditorResources } from '../../editor/resources/editor-resources';
import type { EditorResourceHost } from '../../editor/resources/editor-resource-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { ScreenshotPresetHost } from '../screenshot-preset-types';
import { screenshotState } from '../screenshot-state';
import { useScreenshotPresets } from '../useScreenshotPresets';
import { documentFixture, presetFixture } from './screenshot-editor-test-helpers';

const capture = vi.hoisted(() => ({
  updateEditorPreset: vi.fn(),
  selectEditorPreset: vi.fn(),
  createEditorPreset: vi.fn(),
  renameEditorPreset: vi.fn(),
  deleteEditorPreset: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
const { validateScreenshotState } = createRequire(import.meta.url)(
  '../../../../electron/screenshot/screenshot-validation.cjs',
) as {
  validateScreenshotState: (state: ScreenshotState) => void;
};
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach((stop) => stop());
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const setup = () => {
  let changed!: (document: EditorPresetDocument) => void;
  const stop = vi.fn();
  const api = {
    listBackgroundLibrary: vi.fn(async () => []),
    listCursorPacks: vi.fn(async () => []),
    getEditorPresets: vi.fn(async () => presetFixture()),
    onBackgroundLibraryChanged: vi.fn(() => vi.fn()),
    onCursorPacksChanged: vi.fn(() => vi.fn()),
    onEditorPresetsChanged: vi.fn((listener) => {
      changed = listener;
      return stop;
    }),
  } satisfies EditorResourceHost;
  const resources = createEditorResources(api);
  const document = documentFixture();
  const host: ScreenshotPresetHost = {
    document: ref(document),
    state: ref(screenshotState(document)),
    presets: ref(presetFixture()),
    backgroundLibrary: ref([]),
    busy: ref(false),
    t: (key) => key,
    fail: vi.fn(),
  };
  const scope = effectScope();
  const presets = scope.run(() => useScreenshotPresets(host, resources))!;
  presets.initializeBaseline();
  cleanup.push(() => {
    scope.stop();
    resources.dispose();
  });
  return { host, presets, resources, scope, stop, changed: (value: EditorPresetDocument) => changed(value) };
};
it('refreshes a clean preset catalogue without replacing the active canvas or its settings', async () => {
  const { host, presets, resources, changed } = setup();
  const state = host.state.value;
  const next = presetFixture('webp');
  next.presets[0]!.name = 'Renamed externally';
  changed(next);
  expect(host.presets.value).toEqual(next);
  expect(host.state.value).toBe(state);
  expect(host.state.value!.format).toBe('png');
  expect(presets.dirty.value).toBe(false);
  expect(await resources.presets('screenshot')).toEqual(next);
});
it('preserves an unsaved draft while retaining the latest catalogue for another editor', async () => {
  const { host, presets, resources, changed } = setup();
  host.state.value!.blurPercent = 40;
  expect(presets.dirty.value).toBe(true);
  const next = presetFixture('webp');
  changed(next);
  expect(host.presets.value!.presets[0]!.settings.export.format).toBe('png');
  expect(host.state.value!.blurPercent).toBe(40);
  expect(presets.dirty.value).toBe(true);
  expect(await resources.presets('screenshot')).toEqual(next);
});
it.each(['busy', 'unloaded'] as const)('does not overwrite a %s editor during a catalogue change', (mode) => {
  const { host, changed } = setup();
  if (mode === 'busy') host.busy.value = true;
  else host.presets.value = null;
  const before = host.presets.value;
  changed(presetFixture('webp'));
  expect(host.presets.value).toBe(before);
});
it('remembers completed preset writes and removes its listener on editor disposal', async () => {
  const { host, presets, resources, scope, changed } = setup();
  host.state.value!.format = 'webp';
  const saved = presetFixture('webp');
  capture.updateEditorPreset.mockResolvedValue(saved);
  await presets.savePreset();
  expect(presets.dirty.value).toBe(false);
  expect(await resources.presets('screenshot')).toEqual(saved);
  scope.stop();
  changed(presetFixture());
  expect(host.presets.value).toEqual(saved);
  expect(await resources.presets('screenshot')).toEqual(presetFixture());
});

it('leaves an already selected Default preset and the unsaved document untouched', async () => {
  const { host, presets } = setup();
  host.state.value!.blurPercent = 40;
  const state = host.state.value;
  await presets.presetAction('select', 'default');
  expect(host.state.value).toBe(state);
  expect(presets.dirty.value).toBe(true);
  expect(capture.selectEditorPreset).not.toHaveBeenCalled();
  expect(capture.updateEditorPreset).not.toHaveBeenCalled();
  expect(host.busy.value).toBe(false);
});

it('applies Default to a document with a deleted background, watermark and image without breaking save validation', async () => {
  const { host, presets } = setup();
  host.presets.value!.presets[0]!.id = host.presets.value!.activePresetId = 'named';
  const state = host.state.value!;
  initializeScreenshotComposition(state);
  for (const id of ['__background__', '__watermark__', state.image.id]) removeScreenshotLayer(state, id);
  presets.initializeBaseline();
  const next = presetFixture();
  next.presets[0]!.settings.editor.presentation = {
    canvas: { ...state.canvas, showBackground: true, watermark: { ...DEFAULT_WATERMARK, enabled: true } },
    cursor: createDefaultCursorPresentation(),
    selectedBackgroundId: null,
  };
  capture.selectEditorPreset.mockResolvedValueOnce(next);
  await presets.presetAction('select', 'default');
  const saved = JSON.parse(JSON.stringify(host.state.value)) as ScreenshotState;
  expect(() => validateScreenshotState(saved)).not.toThrow();
  expect(saved.composition?.map((layer) => layer.id)).toEqual(['__background__', '__watermark__']);
  expect(saved.image.enabled).toBe(false);
  expect(state.composition).toEqual([]);
  expect(presets.dirty.value).toBe(false);
  expect(host.fail).not.toHaveBeenCalled();
});

it('preserves zooms, names, rotation, crop and layer compositing when switching presets', async () => {
  const { host, presets } = setup();
  const state = host.state.value!;
  state.zooms = [{ ...createManualZoom('lens', 0, 1), mode: 'manual', kind: 'zoom', name: 'Detail', enabled: true }];
  state.layerNames = { lens: 'My lens', screenshot: 'My capture' };
  state.image.rotation = 35;
  state.image.crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  insertScreenshotLayer(state, 'lens');
  state.composition!.find((layer) => layer.id === 'screenshot')!.opacity = 62;
  presets.initializeBaseline();
  const next = presetFixture('webp');
  next.presets[0]!.id = next.activePresetId = 'named';
  capture.selectEditorPreset.mockResolvedValueOnce(next);
  await presets.presetAction('select', 'named');
  const saved = JSON.parse(JSON.stringify(host.state.value)) as ScreenshotState;
  expect(() => validateScreenshotState(saved)).not.toThrow();
  expect(saved).toMatchObject({
    zooms: state.zooms,
    layerNames: state.layerNames,
    composition: state.composition,
    image: { rotation: 35, crop: state.image.crop },
    format: 'webp',
  });
  expect(host.fail).not.toHaveBeenCalled();
});

it('saves the modified Default before selecting a named preset', async () => {
  const { host, presets } = setup();
  host.state.value!.blurPercent = 25;
  const next = presetFixture('webp');
  next.presets[0]!.id = next.activePresetId = 'named';
  capture.updateEditorPreset.mockResolvedValueOnce(presetFixture());
  capture.selectEditorPreset.mockResolvedValueOnce(next);
  await presets.presetAction('select', 'named');
  expect(capture.updateEditorPreset).toHaveBeenCalledWith(
    'default',
    expect.objectContaining({
      editor: expect.objectContaining({ presentation: expect.objectContaining({ blurPercent: 25 }) }),
    }),
    'screenshot',
  );
  expect(host.state.value!.format).toBe('webp');
});

it.each(['save', 'discard', 'cancel'] as const)('honors %s for a dirty named preset', async (choice) => {
  const { host, presets } = setup();
  host.presets.value!.presets[0]!.id = host.presets.value!.activePresetId = 'named';
  host.state.value!.blurPercent = 30;
  vi.spyOn(window, 'confirm')
    .mockReturnValueOnce(choice === 'save')
    .mockReturnValueOnce(choice === 'discard');
  capture.updateEditorPreset.mockResolvedValueOnce(host.presets.value);
  capture.selectEditorPreset.mockResolvedValueOnce(presetFixture('webp'));
  await presets.presetAction('select', 'default');
  expect(capture.updateEditorPreset).toHaveBeenCalledTimes(choice === 'save' ? 1 : 0);
  expect(capture.selectEditorPreset).toHaveBeenCalledTimes(choice === 'cancel' ? 0 : 1);
  expect(host.state.value!.format).toBe(choice === 'cancel' ? 'png' : 'webp');
  expect(host.busy.value).toBe(false);
});

it('creates a preset from current settings, renames it and restores Default on deletion', async () => {
  const { host, presets, resources } = setup();
  host.state.value!.blurPercent = 20;
  const created = presetFixture();
  created.presets[0]!.id = created.activePresetId = 'named';
  created.presets[0]!.settings.editor.presentation = {
    canvas: screenshotState(documentFixture()).canvas,
    cursor: createDefaultCursorPresentation(),
    selectedBackgroundId: null,
    blurPercent: 20,
  };
  capture.createEditorPreset.mockResolvedValueOnce(created);
  capture.updateEditorPreset.mockResolvedValueOnce(created);
  await presets.presetAction('add', 'New');
  expect(capture.createEditorPreset).toHaveBeenCalledWith('New', 'screenshot');
  expect(host.state.value!.blurPercent).toBe(20);
  const renamed = structuredClone(created);
  renamed.presets[0]!.name = 'Renamed';
  capture.renameEditorPreset.mockResolvedValueOnce(renamed);
  await presets.presetAction('rename', 'Renamed');
  expect(await resources.presets('screenshot')).toEqual(renamed);
  capture.deleteEditorPreset.mockResolvedValueOnce(presetFixture());
  await presets.presetAction('delete');
  expect(capture.deleteEditorPreset).toHaveBeenCalledWith('named', 'screenshot');
  expect(presets.activePreset.value!.id).toBe('default');
});

it('reports a failed selection and clears busy without modifying the document', async () => {
  const { host, presets } = setup();
  const state = host.state.value;
  const failure = new Error('Preset unavailable');
  capture.selectEditorPreset.mockRejectedValueOnce(failure);
  await presets.presetAction('select', 'other');
  expect(host.fail).toHaveBeenCalledWith(failure);
  expect(host.state.value).toBe(state);
  expect(host.busy.value).toBe(false);
});

it('ignores actions while busy and saving without a loaded state or active preset', async () => {
  const { host, presets } = setup();
  host.busy.value = true;
  await presets.presetAction('select', 'other');
  expect(capture.selectEditorPreset).not.toHaveBeenCalled();
  host.state.value = null;
  await presets.savePreset();
  host.presets.value = null;
  await presets.savePreset();
  expect(capture.updateEditorPreset).not.toHaveBeenCalled();
  expect(presets.isApplyingPreset()).toBe(false);
});

it.each(['document', 'state', 'selection'] as const)(
  'does not apply presentation when %s is missing',
  async (missing) => {
    const { host, presets } = setup();
    const next = presetFixture('webp');
    if (missing === 'document') host.document.value = null;
    if (missing === 'state') host.state.value = null;
    if (missing === 'selection') next.presets = [];
    capture.selectEditorPreset.mockResolvedValueOnce(next);
    await presets.presetAction('select', 'other');
    expect(host.state.value?.format).not.toBe('webp');
    expect(host.fail).not.toHaveBeenCalled();
    expect(host.busy.value).toBe(false);
  },
);

it('does not replace the catalogue if the active preset changes during a save', async () => {
  const { host, presets } = setup();
  capture.updateEditorPreset.mockImplementationOnce(async () => {
    host.presets.value!.activePresetId = 'other';
    return presetFixture('webp');
  });
  await presets.savePreset();
  expect(host.presets.value!.activePresetId).toBe('other');
});

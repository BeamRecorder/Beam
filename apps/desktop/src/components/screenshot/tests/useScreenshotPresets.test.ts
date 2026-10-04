import { effectScope, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { createEditorResources } from '../../editor/resources/editor-resources';
import type { EditorResourceHost } from '../../editor/resources/editor-resource-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { ScreenshotPresetHost } from '../screenshot-preset-types';
import { screenshotState } from '../screenshot-state';
import { useScreenshotPresets } from '../useScreenshotPresets';
import { documentFixture, presetFixture } from './screenshot-editor-test-helpers';

const capture = vi.hoisted(() => ({ updateEditorPreset: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach((stop) => stop());
  vi.clearAllMocks();
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

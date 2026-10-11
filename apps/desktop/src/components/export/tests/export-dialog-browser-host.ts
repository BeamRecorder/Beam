import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { i18n, initI18n, setCurrentLocale } from '~/i18n';
import { isSupportedLocale } from '~/i18n/locales';
import type { DesktopCaptureApi } from '~/api/types/capture-api';
import type { EditorExportSource } from '@beam/encoder/export-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { ScreenshotExportOptions } from '../../screenshot/screenshot-export-types';
import { waitForFixtureExport, fixturePreview } from './export-pill-fixture-backend';
import EditorTitlebar from '../../editor/EditorTitlebar.vue';
import '~/style.css';

const directories = {
  projects: { directory: null, recent: [] },
  exports: { directory: null, lastDirectory: null, recent: ['/home/test/Videos', '/home/test/Previous exports'] },
  defaultProjectsDirectory: '/home/test/Beam',
  defaultExportDirectory: '/home/test/Videos',
};
window.capture = {
  platform: new URLSearchParams(location.search).get('platform') ?? 'win32',
  getPreferences: async () => ({ extras: {} }),
  openFile: async (path: string) => {
    document.body.dataset.openedFile = path;
  },
  showItemInFolder: async (path: string) => {
    document.body.dataset.openedFolder = path;
  },
  getEditorPresets: async () => ({ presets: [] }),
  updateEditorPreset: async () => ({}),
  getDirectories: async () =>
    new URLSearchParams(location.search).get('mode') === 'folders'
      ? { ...directories, exports: { ...directories.exports, recent: [] } }
      : directories,
  selectDirectory: async ({ directory }: { directory: string | null }) => ({
    ...directories,
    exports: { ...directories.exports, directory },
  }),
  chooseDirectory: async () => ({
    ...directories,
    exports: { directory: '/home/albi/Téléchargements', lastDirectory: null, recent: ['/home/albi/Téléchargements'] },
  }),
  onPreferencesChanged: () => () => {},
} as unknown as DesktopCaptureApi;
const { default: DirectoryPreference } = await import('../../settings/DirectoryPreference.vue');
const { default: ExportDialog } = await import('../ExportDialog.vue');
const { default: ScreenshotExportDialog } = await import('../../screenshot/ScreenshotExportDialog.vue');
const { screenshotState } = await import('../../screenshot/screenshot-state');
await initI18n();
const fixtureLocale = new URLSearchParams(location.search).get('locale') ?? 'en';
if (!isSupportedLocale(fixtureLocale)) throw new Error(`Unsupported fixture locale: ${fixtureLocale}`);
await setCurrentLocale(fixtureLocale);
const audio = ref(true);
const mode = new URLSearchParams(location.search).get('mode');
const request: EditorExportSource = {
  projectName: 'Beautiful captures',
  duration: 48,
  width: 1920,
  height: 1080,
  fps: 60,
  includeAudio: true,
  hasAudio: true,
  createSnapshot: () => {
    return {
      duration: 48,
      render: { fps: 60 },
      canvas: { width: 1920, height: 1080 },
      composition: { schemaVersion: 3, clips: [], assets: [], keyboardCaptionSessions: [] },
    } as unknown as CompositionSnapshot;
  },
};
const original = {
  id: 'test',
  name: 'Beautiful captures',
  source: '',
  width: 1920,
  height: 1080,
  state: null,
  preset: {
    editor: { schemaVersion: 1 as const },
    devices: {},
    export: { format: 'png' as const, quality: 0.9, resolution: '1080p' as const },
    quickSnip: { automaticZoom: false },
  },
};
const state = ref(screenshotState(original));
const imageBusy = ref(false);
const saveImage = async (_name: string, options?: ScreenshotExportOptions) => {
  imageBusy.value = true;
  try {
    await waitForFixtureExport(options?.signal, () => options?.onPreview?.(fixturePreview));
    return { status: 'saved' as const, path: '/home/test/Videos/Beautiful captures.png', bytes: 123456, timings: {} };
  } finally {
    imageBusy.value = false;
  }
};
const exportControl = () =>
  mode === 'image'
    ? h(ScreenshotExportDialog, {
        state: state.value,
        original,
        projectName: original.name,
        busy: imageBusy.value,
        error: '',
        advanced: false,
        keepAspect: true,
        save: saveImage,
      })
    : h(ExportDialog, {
        request: { ...request, includeAudio: audio.value },
        playheadSeconds: 12,
        'onUpdate:includeAudio': (value: boolean) => {
          audio.value = value;
        },
      });
createApp({
  render: () =>
    h('main', { style: { padding: '32px' } }, [
      h(
        'button',
        {
          class: 'editor-test-action',
          style: { position: 'fixed', left: '50px', top: '120px' },
          onClick: () => {
            document.body.dataset.editorClicks = String(Number(document.body.dataset.editorClicks || 0) + 1);
          },
        },
        'Editor action',
      ),
      mode === 'folders'
        ? h(DirectoryPreference, { kind: 'exports' })
        : h(EditorTitlebar, {}, { right: exportControl }),
    ]),
})
  .use(createPinia())
  .use(i18n)
  .mount('#app');

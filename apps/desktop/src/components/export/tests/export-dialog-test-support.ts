import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { type Ref } from 'vue';
import { afterEach, beforeEach, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import { type EditorExportSource } from '@beam/encoder/export-types';
import { type CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { usePreferencesStore } from '~/stores/preferences';

const { mockJob, mockCapture } = vi.hoisted(() => ({
  mockJob: {
    start: vi.fn(),
    cancel: vi.fn(),
    state: null as Record<string, Ref<unknown>> | null,
  },
  mockCapture: {
    platform: 'linux',
    getEditorPresets: vi.fn(),
    updateEditorPreset: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(() => vi.fn()),
  },
}));

vi.mock('~/api/capture', () => ({
  capture: mockCapture,
}));

vi.mock('../useExportJob', async () => {
  const { ref, computed } = await import('vue');
  const progress = ref(null);
  const preview = ref(null);
  const error = ref<string | null>(null);
  const errorContext = ref<unknown>(null);
  const result = ref<{ path: string; format: 'webm' | 'mp4' } | null>(null);
  const diagnostics = ref(null);
  const isChoosingDestination = ref(false);
  const exporting = ref(false);
  mockJob.state = {
    progress,
    preview,
    error,
    errorContext,
    result,
    diagnostics,
    isChoosingDestination,
    isExporting: computed(() => exporting.value),
    exporting,
  };
  return {
    useExportJob: () => ({
      progress,
      preview,
      error,
      errorContext,
      result,
      diagnostics,
      isChoosingDestination,
      isExporting: computed(() => exporting.value),
      start: mockJob.start,
      cancel: mockJob.cancel,
    }),
  };
});

import ExportDialog from '../ExportDialog.vue';

const Dialog = {
  template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>',
};
const Button = {
  inheritAttrs: false,
  props: ['icon', 'iconOnly', 'tooltip', 'tooltipDisabled', 'disabled', 'loading'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" class="button-stub" :disabled="disabled" :data-tooltip="tooltip || undefined" :data-tooltip-disabled="tooltipDisabled ? \'true\' : undefined" :data-icon-only="iconOnly ? \'true\' : undefined" @click="$emit(\'click\')"><slot /></button>',
};
const ButtonGroup = {
  template: '<div class="button-group-stub"><slot /></div>',
};
const ProgressBar = {
  props: ['value', 'indeterminate'],
  template: '<div class="progress-stub" :data-indeterminate="indeterminate">{{ value }}</div>',
};
const CopyButton = {
  props: ['text', 'display', 'label', 'copiedLabel', 'errorLabel'],
  template: '<button class="copy-progress-button" :data-copy-text="text" :aria-label="label">{{ label }}</button>',
};

const snapshot = {
  duration: 12,
  canvas: { width: 1920, height: 1080 },
  render: { fps: 60, sourceWidth: 1920, sourceHeight: 1080 },
} as unknown as CompositionSnapshot;

const request: EditorExportSource = {
  projectName: 'Demo project',
  includeAudio: true,
  hasAudio: true,
  duration: 12,
  fps: 60,
  width: 1920,
  height: 1080,
  createSnapshot: vi.fn(() => snapshot),
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
  mockCapture.platform = 'linux';
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mockCapture.getEditorPresets.mockReset().mockResolvedValue({ activePresetId: 'default', presets: [] });
  mockCapture.updateEditorPreset.mockReset().mockResolvedValue({});
  mockCapture.getPreferences.mockReset().mockResolvedValue({ extras: {} });
  usePreferencesStore().settings = {
    schemaVersion: 3,
    theme: 'light',
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: false, noticeDismissed: false },
    devices: {},
    shortcuts: {},
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  };
  mockCapture.updatePreferences.mockReset().mockImplementation(async (patch) => ({ extras: patch.extras }));
  mockJob.start.mockReset();
  mockJob.cancel.mockReset();
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: { openFile: vi.fn(), showItemInFolder: vi.fn() },
  });
  if (mockJob.state) {
    mockJob.state.progress.value = null;
    mockJob.state.error.value = null;
    mockJob.state.errorContext.value = null;
    mockJob.state.result.value = null;
    mockJob.state.diagnostics.value = null;
    mockJob.state.isChoosingDestination.value = false;
    mockJob.state.exporting.value = false;
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  await setCurrentLocale('en');
});

const mountExport = (playheadSeconds?: number, source = request) =>
  mount(ExportDialog, {
    props: {
      request: source,
      ...(playheadSeconds === undefined ? {} : { playheadSeconds }),
    },
    global: {
      stubs: {
        teleport: true,
        Beamy: true,
        Dialog,
        Button,
        ButtonGroup,
        ProgressBar,
        CopyButton,
        DirectoryPreference: true,
      },
    },
  });
const exportAction = (wrapper: ReturnType<typeof mountExport>) => wrapper.get('.export-submit');
const playheadOption = (wrapper: ReturnType<typeof mountExport>) => wrapper.get('.export-range [role="switch"]');

export { mockJob, mockCapture, request, snapshot, deferred, mountExport, exportAction, playheadOption };

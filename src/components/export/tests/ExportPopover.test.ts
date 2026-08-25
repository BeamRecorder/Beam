import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick, type Ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setCurrentLocale } from '~/i18n';
import { useToastStore } from '~/ui/toast/toastStore';
import { ExportValidationError, type ExportRequest } from '../export-types';

const { mockJob } = vi.hoisted(() => ({
  mockJob: {
    start: vi.fn(),
    cancel: vi.fn(),
    state: null as Record<string, Ref<unknown>> | null,
  },
}));

vi.mock('../useExportJob', async () => {
  const { ref, computed } = await import('vue');
  const progress = ref(null);
  const error = ref<string | null>(null);
  const errorContext = ref<unknown>(null);
  const result = ref<{ path: string; format: 'webm' | 'mp4' } | null>(null);
  const diagnostics = ref(null);
  const isChoosingDestination = ref(false);
  const exporting = ref(false);
  mockJob.state = {
    progress,
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

import ExportPopover from '../ExportPopover.vue';

const Popover = {
  template: '<div class="popover-stub"><slot name="trigger" /><slot /></div>',
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

const request = {
  projectName: 'Demo project',
  includeAudio: true,
  snapshot: {
    duration: 12,
    canvas: { width: 1920, height: 1080 },
    render: { fps: 60, sourceWidth: 1920, sourceHeight: 1080 },
  },
} as unknown as Omit<ExportRequest, 'format' | 'preset'>;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mockJob.start.mockReset();
  mockJob.cancel.mockReset();
  Object.defineProperty(window, 'capture', {
    configurable: true,
    value: { openFile: vi.fn() },
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

describe('ExportPopover', () => {
  const mountExport = (playheadSeconds?: number) =>
    mount(ExportPopover, {
      props: { request, ...(playheadSeconds === undefined ? {} : { playheadSeconds }) },
      global: { stubs: { Popover, Button, ButtonGroup, ProgressBar, CopyButton } },
    });
  const openMoreOptions = async (wrapper: ReturnType<typeof mountExport>) => {
    await wrapper.get('.accordion-trigger').trigger('click');
  };
  const exportAction = (wrapper: ReturnType<typeof mountExport>) =>
    wrapper.findAll('.export-popover .button-stub').find((button) => button.text().includes('Export'))!;
  const playheadSwitch = (wrapper: ReturnType<typeof mountExport>) =>
    wrapper
      .findAll('[role="switch"]')
      .find((toggle) => toggle.attributes('aria-label') === i18n.global.t('ExportPopover.exportUntilPlayhead'))!;

  it('keeps the playhead option off by default and exports the full snapshot duration', async () => {
    const wrapper = mountExport(4);
    expect(wrapper.get('.accordion-trigger').attributes('aria-expanded')).toBe('false');

    await openMoreOptions(wrapper);
    expect(playheadSwitch(wrapper).attributes('aria-checked')).toBe('false');
    expect(exportAction(wrapper).text()).toBe('Export Video');

    await exportAction(wrapper).trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ duration: request.snapshot.duration }) }),
    );
  });

  it('exports through the live playhead with a duration label and explanatory note', async () => {
    const wrapper = mountExport(5.25);
    await openMoreOptions(wrapper);
    await playheadSwitch(wrapper).trigger('click');

    expect(exportAction(wrapper).text()).toBe('Export Video (5.3s)');
    expect(wrapper.get('.playhead-export-note').text()).toBe(i18n.global.t('ExportPopover.exportUntilPlayheadEnabled'));

    await exportAction(wrapper).trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ duration: 5.25 }) }),
    );
  });

  it('updates the duration label live and clamps the playhead to the snapshot end', async () => {
    const wrapper = mountExport(3);
    await openMoreOptions(wrapper);
    await playheadSwitch(wrapper).trigger('click');

    await wrapper.setProps({ playheadSeconds: 7.5 });
    expect(exportAction(wrapper).text()).toBe('Export Video (7.5s)');

    await wrapper.setProps({ playheadSeconds: 99 });
    expect(exportAction(wrapper).text()).toBe('Export Video (12s)');
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ duration: request.snapshot.duration }) }),
    );
  });

  it.each([0, -1, Number.NaN])(
    'disables export and does not start for invalid playhead %s',
    async (playheadSeconds) => {
      const wrapper = mountExport(playheadSeconds);
      await openMoreOptions(wrapper);
      await playheadSwitch(wrapper).trigger('click');

      const action = exportAction(wrapper);
      expect(action.attributes('disabled')).toBeDefined();
      await action.trigger('click');
      expect(mockJob.start).not.toHaveBeenCalled();
    },
  );

  it('keeps audio enabled by default and includes it in the export request', async () => {
    const wrapper = mountExport();

    await wrapper.get('.accordion-trigger').trigger('click');
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');

    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ includeAudio: true }));
  });

  it('emits the disabled audio choice and exports without audio when the parent applies it', async () => {
    const wrapper = mountExport();

    await wrapper.get('.accordion-trigger').trigger('click');
    await wrapper.get('[role="switch"]').trigger('click');
    expect(wrapper.emitted('update:includeAudio')).toEqual([[false]]);

    await wrapper.setProps({ request: { ...request, includeAudio: false } });
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ includeAudio: false }));
  });

  it('passes format and quality to the export job so validation errors stay visible', async () => {
    mockJob.start.mockImplementationOnce(async (value: ExportRequest) => {
      (mockJob.state?.error as Ref<string | null>).value = `${value.format.toUpperCase()} is not encodable`;
    });
    const wrapper = mountExport();
    const buttons = wrapper.findAll('.button-stub');
    await buttons.find((button) => button.text() === 'MP4')?.trigger('click');
    await buttons.find((button) => button.text() === 'High')?.trigger('click');
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ format: 'mp4', preset: 'high' }));
    expect(wrapper.get('[role="alert"]').text()).toContain('MP4');
  });

  it('renders translated quality labels in French and English', () => {
    let wrapper: ReturnType<typeof mountExport> | undefined;

    try {
      setCurrentLocale('fr');
      wrapper = mountExport();
      const qualityField = wrapper
        .findAll('.field')
        .find((field) => field.find('.field-label').text() === 'Qualité & Débit');
      const labels = qualityField
        ?.find('.button-group-stub')
        .findAll('.button-stub')
        .map((button) => button.text());

      expect(labels).toEqual(['Faible', 'Moyen', 'Élevé']);

      wrapper.unmount();
      setCurrentLocale('en');
      wrapper = mountExport();
      const englishQualityField = wrapper
        .findAll('.field')
        .find((field) => field.find('.field-label').text() === 'Quality & Bitrate');
      const englishLabels = englishQualityField
        ?.find('.button-group-stub')
        .findAll('.button-stub')
        .map((button) => button.text());
      expect(englishLabels).toEqual(['Low', 'Medium', 'High']);
    } finally {
      wrapper?.unmount();
      setCurrentLocale('en');
    }
  });

  it('defaults to 60 fps when the source/timeline snapshot is 60 fps', async () => {
    const wrapper = mountExport();
    const sixtyFps = wrapper.findAll('.button-stub').find((button) => button.text() === '60 fps');

    expect(sixtyFps?.classes()).toContain('active');

    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          render: expect.objectContaining({ fps: 60 }),
        }),
      }),
    );
  });

  it.each([24, 30, 60] as const)('passes the selected %s fps option to the export job', async (fps) => {
    const wrapper = mountExport();
    await wrapper
      .findAll('.button-stub')
      .find((button) => button.text() === `${fps} fps`)
      ?.trigger('click');
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          render: expect.objectContaining({ fps }),
        }),
      }),
    );
  });

  it('keeps export explanations compact behind an info tooltip', () => {
    const wrapper = mountExport();
    const fields = wrapper.findAll('.field');

    for (const label of ['Resolution', 'Frame rate', 'Quality & Bitrate']) {
      const field = fields.find((candidate) => candidate.find('.field-label').text() === label);
      expect(field, `missing ${label} field`).toBeDefined();
      expect(field?.find('.option-hint').exists(), `${label} should not render a long inline hint`).toBe(false);
      expect(field?.find('[data-tooltip]').exists(), `${label} should expose an info tooltip`).toBe(true);
    }
  });

  it('updates the FPS info tooltip when switching between 24, 30 and 60 fps', async () => {
    const wrapper = mountExport();
    const frameRateField = wrapper
      .findAll('.field')
      .find((field) => field.find('.field-label').text() === 'Frame rate');
    const getTooltip = () => frameRateField?.find('[data-tooltip]').attributes('data-tooltip');

    expect(getTooltip()).toBe(i18n.global.t('ExportPopover.frameRate60Desc'));

    for (const [fps, description] of [
      ['24', 'ExportPopover.frameRate24Desc'],
      ['30', 'ExportPopover.frameRate30Desc'],
      ['60', 'ExportPopover.frameRate60Desc'],
    ] as const) {
      await frameRateField
        ?.findAll('.button-stub')
        .find((button) => button.text() === `${fps} fps`)
        ?.trigger('click');
      expect(getTooltip()).toBe(i18n.global.t(description));
    }
  });

  it('starts an export, displays its result, and opens the generated file', async () => {
    const wrapper = mountExport();
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ format: 'webm', preset: 'medium' }));

    const result = mockJob.state?.result as Ref<{
      path: string;
      format: 'webm' | 'mp4';
    } | null>;
    result.value = { path: 'C:\\Exports\\demo.webm', format: 'webm' };
    await nextTick();
    expect(wrapper.get('[role="status"]').text()).toContain('demo.webm');
    expect(wrapper.get('.result-box .copy-progress-button').attributes('data-copy-text')).toContain(
      '=== Beam Export ===',
    );
    await wrapper.get('.result-box .button-stub').trigger('click');
    expect((window.capture as unknown as { openFile: ReturnType<typeof vi.fn> }).openFile).toHaveBeenCalledWith(
      'C:\\Exports\\demo.webm',
    );
  });

  it('supports selecting output resolution options without upscaling', async () => {
    const wrapper = mountExport();
    const buttons = wrapper.findAll('.button-stub');
    await buttons.find((button) => button.text() === '720p')?.trigger('click');
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          canvas: expect.objectContaining({ width: 1280, height: 720 }),
        }),
      }),
    );
  });

  it('renders stable export progress and cancellation', async () => {
    const wrapper = mountExport();
    const progress = mockJob.state?.progress as Ref<Record<string, unknown> | null>;
    const exporting = mockJob.state?.exporting as Ref<boolean>;
    progress.value = {
      stage: 'encoding',
      stageLabel: 'Encoding',
      overallProgress: 0.5,
      completedImages: 5,
      totalImages: 10,
      audioProgress: 0.4,
      currentTimeMs: 61_000,
      totalTimeMs: 125_000,
    };
    exporting.value = true;
    await nextTick();
    expect(wrapper.find('.export-progress-card').exists()).toBe(true);
    expect(wrapper.find('.percentage-badge').text()).toBe('50%');
    expect(wrapper.find('.progress-title').exists()).toBe(true);
    expect(wrapper.get('.progress-details').text()).toContain('Frame 5 / 10');
    expect(wrapper.find('.progress-actions .copy-progress-button').exists()).toBe(true);
    expect(wrapper.find('.progress-stub').attributes('data-indeterminate')).toBeUndefined();
    expect(wrapper.text()).not.toContain('01:01.0s');
    await wrapper.find('.export-progress-card .actions .button-stub').trigger('click');
    expect(mockJob.cancel).toHaveBeenCalledOnce();
  });

  it('keeps the full export label before starting and shows only the percentage while exporting', async () => {
    const wrapper = mountExport();
    expect(wrapper.get('.export-trigger').text()).toBe('Export Video');

    const progress = mockJob.state?.progress as Ref<Record<string, unknown> | null>;
    const exporting = mockJob.state?.exporting as Ref<boolean>;
    progress.value = {
      stage: 'encoding',
      overallProgress: 0.25,
      completedImages: 1,
      totalImages: 4,
      audioProgress: null,
      currentTimeMs: 1_000,
      totalTimeMs: 4_000,
    };
    exporting.value = true;
    await nextTick();

    expect(wrapper.get('.export-trigger').text()).toBe('25%');
  });

  it('bases visible progress on video frames while exposing the full diagnostic report for copying', async () => {
    const wrapper = mountExport();
    const progress = mockJob.state?.progress as Ref<Record<string, unknown> | null>;
    const exporting = mockJob.state?.exporting as Ref<boolean>;
    progress.value = {
      stage: 'encoding',
      overallProgress: 0.24595,
      completedImages: 268,
      totalImages: 6_623,
      audioProgress: 1,
      currentTimeMs: 10_000,
      totalTimeMs: 40_000,
    };
    exporting.value = true;
    await nextTick();

    expect(wrapper.find('.export-progress-card').exists()).toBe(true);
    expect(wrapper.get('.percentage-badge').text()).toBe('4%');
    expect(wrapper.find('.stage-title').exists()).toBe(false);
    expect(wrapper.get('.progress-details').text()).toContain('268');
    expect(wrapper.get('.progress-details').text()).toContain('6623');
    expect(wrapper.text()).not.toContain('Audio 100%');

    const copy = wrapper.get('.copy-progress-button');
    const summary = copy.attributes('data-copy-text') ?? '';
    expect(summary).toContain('268');
    expect(summary).toContain('6623');
    expect(summary).toContain('=== Beam Export ===');
    expect(summary).toContain('Video Progress: 4.0%');
    expect(summary).toContain('Audio Progress: 100.0%');
  });

  it('keeps zero percent visible before encoding and hides encoding details', async () => {
    const wrapper = mountExport();
    const progress = mockJob.state?.progress as Ref<Record<string, unknown> | null>;
    const exporting = mockJob.state?.exporting as Ref<boolean>;
    exporting.value = true;

    for (const stage of ['validating_assets', 'loading_assets']) {
      progress.value = {
        stage,
        overallProgress: stage === 'validating_assets' ? 0 : 0.05,
        completedImages: 0,
        totalImages: 1,
        audioProgress: 0,
        currentTimeMs: 0,
        totalTimeMs: 125_000,
      };
      await nextTick();

      expect(wrapper.find('.percentage-badge').exists()).toBe(true);
      expect(wrapper.find('.progress-details .detail-item:not(.time-item)').exists()).toBe(false);
      expect(wrapper.find('.progress-stub').attributes('data-indeterminate')).toBeUndefined();
    }
  });

  it('keeps Export visible and publishes a sanitized copyable error toast', async () => {
    mockJob.start.mockImplementation(async () => {
      (mockJob.state?.error as Ref<string | null>).value = 'The source image could not be decoded.';
      (mockJob.state?.errorContext as Ref<unknown>).value = new ExportValidationError({
        code: 'decode-failure',
        message: 'The source image could not be decoded.',
        assetId: 'vivid-horizon',
        name: 'Vivid Horizon',
      });
    });

    const wrapper = mountExport();
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click');
    await nextTick();

    expect(wrapper.find('.export-trigger').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toContain('The source image could not be decoded.');

    const toast = useToastStore().toasts.at(-1);
    expect(toast).toMatchObject({
      type: 'error',
      action: { label: expect.stringMatching(/copy/i), copyText: expect.any(String) },
    });
    const copied = String(toast?.action?.copyText);
    expect(wrapper.get('.error-box .error-message').text()).toContain('The source image could not be decoded.');
    expect(wrapper.find('.error-box .copy-progress-button').exists()).toBe(true);
    expect(wrapper.get('.error-box .copy-progress-button').attributes('data-copy-text')).toContain(
      '=== Beam Export ===',
    );
    expect(copied).toContain('decode-failure');
    expect(copied).toContain('vivid-horizon');
    expect(copied).not.toContain('/home/albi');
  });
});

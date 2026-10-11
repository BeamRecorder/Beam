import { mockJob, request, mountExport, exportAction } from './export-dialog-test-support';
import { describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick, type Ref } from 'vue';
import { i18n, setCurrentLocale } from '~/i18n';
import { useToastStore } from '~/ui/toast/toastStore';
import { ExportValidationError, type ExportRequest } from '@beam/encoder/export-types';

describe('ExportDialog output and progress', () => {
  it('keeps audio enabled by default and includes it in the export request', async () => {
    const wrapper = mountExport();

    expect(wrapper.get('[role="switch"][aria-label="Include audio"]').attributes('aria-checked')).toBe('true');

    await exportAction(wrapper).trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ includeAudio: true }));
  });

  it('emits the disabled audio choice and exports without audio when the parent applies it', async () => {
    const wrapper = mountExport();

    await wrapper.get('[role="switch"][aria-label="Include audio"]').trigger('click');
    expect(wrapper.emitted('update:includeAudio')).toEqual([[false]]);

    await wrapper.setProps({ request: { ...request, includeAudio: false } });
    expect(wrapper.get('[role="switch"][aria-label="Include audio"]').attributes('aria-checked')).toBe('false');
    await exportAction(wrapper).trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ includeAudio: false }));
  });

  it('passes format and quality to the export job so validation errors stay visible', async () => {
    mockJob.start.mockImplementationOnce(async (value: ExportRequest) => {
      (mockJob.state!.error as Ref<string | null>).value = `${value.format.toUpperCase()} is not encodable`;
    });
    const wrapper = mountExport();
    const buttons = wrapper.findAll('.button-stub');
    await buttons.find((button) => button.text() === 'MP4')?.trigger('click');
    await buttons.find((button) => button.text() === 'High')?.trigger('click');
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ format: 'mp4', preset: 'high' }));
    expect(wrapper.get('[role="alert"]').text()).toContain('MP4');
  });

  it('renders translated quality labels in French and English', async () => {
    let wrapper: ReturnType<typeof mountExport> | undefined;

    try {
      await setCurrentLocale('fr');
      wrapper = mountExport();
      const qualityField = wrapper.findAll('.field').find((field) => field.find('.field-label').text() === 'Qualité');
      const labels = qualityField
        ?.find('.button-group-stub')
        .findAll('.button-stub')
        .map((button) => button.text());

      expect(labels).toEqual(['Basse', 'Standard', 'Élevée']);

      wrapper.unmount();
      await setCurrentLocale('en');
      wrapper = mountExport();
      const englishQualityField = wrapper
        .findAll('.field')
        .find((field) => field.find('.field-label').text() === 'Quality');
      const englishLabels = englishQualityField
        ?.find('.button-group-stub')
        .findAll('.button-stub')
        .map((button) => button.text());
      expect(englishLabels).toEqual(['Low', 'Standard', 'High']);
    } finally {
      wrapper?.unmount();
      await setCurrentLocale('en');
    }
  });

  it('defaults to 60 fps when the source/timeline snapshot is 60 fps', async () => {
    const wrapper = mountExport();
    const sixtyFps = wrapper.findAll('.button-stub').find((button) => button.text() === '60 fps');

    expect(sixtyFps?.classes()).toContain('active');

    await exportAction(wrapper).trigger('click');

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
    await exportAction(wrapper).trigger('click');

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

    for (const label of ['Resolution', 'Frame rate', 'Quality']) {
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

  it('keeps the completed file and diagnostic actions in the pill', async () => {
    mockJob.start.mockImplementationOnce(async () => {
      mockJob.state!.result.value = { path: 'C:\\Exports\\demo.mp4', format: 'mp4' };
    });
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.get('.status-copy').text()).toContain('demo.mp4');
    expect(wrapper.get('.snip-details .copy-progress-button').attributes('data-copy-text')).toContain(
      '=== Beam Export ===',
    );
    await wrapper
      .findAll('.snip-pill button')
      .find((button) => button.attributes('aria-label') === 'Watch')!
      .trigger('click');
    expect(window.capture?.openFile).toHaveBeenCalledWith('C:\\Exports\\demo.mp4');
    expect(wrapper.find('.result-box').exists()).toBe(false);
  });

  it('does not duplicate a completed export with a toast', async () => {
    const toast = useToastStore();
    const success = vi.spyOn(toast, 'success');
    mockJob.start.mockImplementationOnce(async () => {
      mockJob.state!.result.value = { path: '/exports/final.mp4', format: 'mp4' };
    });
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(success).not.toHaveBeenCalled();
    expect(wrapper.get('.snip-pill').text()).toContain('Video ready');
  });

  it('keeps the completed pill usable if the file bridge is unavailable', async () => {
    mockJob.start.mockImplementationOnce(async () => {
      mockJob.state!.result.value = { path: '/exports/offline.webm', format: 'webm' };
    });
    delete (window.capture as unknown as { openFile?: unknown }).openFile;
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    await expect(
      wrapper
        .findAll('.snip-pill button')
        .find((button) => button.attributes('aria-label') === 'Watch')!
        .trigger('click'),
    ).resolves.toBeUndefined();
    expect(wrapper.get('.status-copy').text()).toContain('offline.webm');
  });

  it('supports selecting output resolution options without upscaling', async () => {
    const wrapper = mountExport();
    const buttons = wrapper.findAll('.button-stub');
    await buttons.find((button) => button.text() === '720p')?.trigger('click');
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          canvas: expect.objectContaining({ width: 1280, height: 720 }),
        }),
      }),
    );
  });

  it('restores native resolution and supports choosing WebM after changing export options', async () => {
    const wrapper = mountExport();
    const buttons = wrapper.findAll('.button-stub');
    await buttons.find((button) => button.text() === 'MP4')?.trigger('click');
    await buttons.find((button) => button.text() === 'WebM')?.trigger('click');
    await buttons.find((button) => button.text() === '1080p')?.trigger('click');
    await buttons.find((button) => button.text() === 'Original')?.trigger('click');
    await exportAction(wrapper).trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'webm',
        snapshot: expect.objectContaining({
          canvas: { width: 1920, height: 1080 },
        }),
      }),
    );
    wrapper.unmount();
  });

  it('disables scaled resolution choices that would enlarge a small source', () => {
    const wrapper = mountExport(undefined, {
      ...request,
      width: 854,
      height: 480,
    });
    const buttons = wrapper.findAll('.button-stub');

    expect(buttons.find((button) => button.text() === '720p')?.attributes('disabled')).toBeDefined();
    expect(buttons.find((button) => button.text() === '1080p')?.attributes('disabled')).toBeDefined();
    expect(buttons.find((button) => button.text() === 'Original')?.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders real progress and cancellation in the non-modal pill', async () => {
    mockJob.start.mockImplementationOnce(() => new Promise(() => {}));
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    mockJob.state!.progress.value = { stage: 'encoding', stageLabel: 'Encoding', overallProgress: 0.5 };
    mockJob.state!.exporting.value = true;
    await nextTick();
    expect(wrapper.find('.export-progress-card').exists()).toBe(false);
    expect(wrapper.get('.progress').attributes('aria-valuenow')).toBe('50');
    expect(wrapper.get('.snip-pill').text()).toContain('Encoding');
    await wrapper
      .findAll('.snip-details button')
      .find((button) => button.text() === 'Cancel Export')!
      .trigger('click');
    expect(mockJob.cancel).toHaveBeenCalledOnce();
  });

  it('does not invent progress before the first progress event', async () => {
    mockJob.start.mockImplementationOnce(() => new Promise(() => {}));
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.get('.progress').attributes('aria-valuenow')).toBeUndefined();
    expect(wrapper.get('.status-value').text()).not.toContain('%');
  });

  it('keeps the full export label before starting and shows only the percentage while exporting', async () => {
    const wrapper = mountExport();
    expect(wrapper.get('.export-trigger').text()).toBe('Export');

    const progress = mockJob.state!.progress as Ref<Record<string, unknown> | null>;
    const exporting = mockJob.state!.exporting as Ref<boolean>;
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

  it('keeps audio and frame details in the copyable report while showing overall progress', async () => {
    mockJob.start.mockImplementationOnce(() => new Promise(() => {}));
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    mockJob.state!.progress.value = {
      stage: 'encoding',
      overallProgress: 0.24595,
      completedImages: 268,
      totalImages: 6623,
      audioProgress: 1,
      currentTimeMs: 10000,
      totalTimeMs: 40000,
    };
    await nextTick();
    expect(wrapper.get('.progress').attributes('aria-valuenow')).toBe('25');
    const summary = wrapper.get('.snip-details .copy-progress-button').attributes('data-copy-text')!;
    expect(summary).toContain('268');
    expect(summary).toContain('6623');
    expect(summary).toContain('Video Progress: 4.0%');
    expect(summary).toContain('Audio Progress: 100.0%');
  });

  it('retains preparation updates without a second progress panel', async () => {
    mockJob.start.mockImplementationOnce(() => new Promise(() => {}));
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    for (const value of [0, 0.05]) {
      mockJob.state!.progress.value = { overallProgress: value, stageLabel: 'Preparing' };
      await nextTick();
      expect(wrapper.get('.progress').attributes('aria-valuenow')).toBe(String(value * 100));
      expect(wrapper.find('.export-progress-card').exists()).toBe(false);
    }
  });

  it('keeps a sanitized copyable failure in the pill without a duplicate toast', async () => {
    mockJob.start.mockImplementationOnce(async () => {
      mockJob.state!.error.value = 'The source image could not be decoded.';
      mockJob.state!.errorContext.value = new ExportValidationError({
        code: 'decode-failure',
        message: 'The source image could not be decoded.',
        assetId: 'vivid-horizon',
        name: 'Vivid Horizon',
      });
    });
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.get('.status-error').text()).toContain('The source image could not be decoded.');
    const copied = wrapper.get('.snip-details .copy-progress-button').attributes('data-copy-text')!;
    expect(copied).toContain('=== Beam Export ===');
    expect(copied).toContain('decode-failure');
    expect(copied).toContain('vivid-horizon');
    expect(copied).not.toContain('/home/albi');
    expect(useToastStore().toasts).toHaveLength(0);
  });
});

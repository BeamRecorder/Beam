import {
  mockJob,
  mockCapture,
  request,
  snapshot,
  deferred,
  mountExport,
  exportAction,
  playheadOption,
} from './export-dialog-test-support';
import { describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n, setCurrentLocale } from '~/i18n';
import { type EditorExportSource } from '@beam/encoder/export-types';
import { usePreferencesStore } from '~/stores/preferences';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';

describe('ExportDialog settings', () => {
  it('puts both format explanations in the heading info button without tooltips on the choices', () => {
    const wrapper = mountExport();
    const field = wrapper.findAll('.field').find((candidate) => candidate.find('.field-label').text() === 'Format')!;
    const help = field.getComponent(InfoTooltip).props('content');
    expect(help).toContain('MP4: ' + i18n.global.t('ExportPopover.mp4Desc'));
    expect(help).toContain('WebM: ' + i18n.global.t('ExportPopover.webmDesc'));
    for (const button of field.findAll('.button-stub').filter((button) => ['MP4', 'WebM'].includes(button.text()))) {
      expect(button.attributes('data-tooltip')).toBeUndefined();
    }
  });
  it('offers the Linux GPU option while keeping standard export as the default', async () => {
    const wrapper = mountExport();
    expect(wrapper.text()).toContain(i18n.global.t('ExportPopover.experimentalFfmpeg'));
    expect(wrapper.find('.accordion-trigger').exists()).toBe(false);
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start.mock.calls[0]![0]).not.toHaveProperty('experimentalLinuxFfmpeg');
    expect(mockCapture.updatePreferences).not.toHaveBeenCalled();
  });
  it('changes the saved backend from the Linux export dialog and uses it for the next export', async () => {
    const wrapper = mountExport();
    await flushPromises();
    const toggle = wrapper.get('[role="switch"][aria-label="FFmpeg GPU (experimental)"]');
    expect(toggle.attributes('aria-checked')).toBe('false');
    await toggle.trigger('click');
    await flushPromises();
    expect(mockCapture.updatePreferences).toHaveBeenCalledWith({ extras: { videoExportBackend: 'ffmpeg-vaapi' } });
    expect(toggle.attributes('aria-checked')).toBe('true');
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ experimentalLinuxFfmpeg: true }));
  });
  it.each(['win32', 'darwin'])('ignores the saved Linux backend on %s', async (platform) => {
    mockCapture.platform = platform;
    usePreferencesStore().settings!.extras.videoExportBackend = 'ffmpeg-vaapi';
    const wrapper = mountExport();
    expect(wrapper.text()).not.toContain(i18n.global.t('ExportPopover.experimentalFfmpeg'));
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start.mock.calls[0]![0]).not.toHaveProperty('experimentalLinuxFfmpeg');
  });
  it('shows both export switches directly in French', async () => {
    await setCurrentLocale('fr');
    const wrapper = mountExport();
    expect(wrapper.get('.export-audio').text()).toContain(i18n.global.t('ExportPopover.includeAudio'));
    expect(wrapper.get('.export-range').text()).toContain('Exporter jusqu’à la tête de lecture');
    expect(wrapper.find('.accordion-trigger').exists()).toBe(false);
  });

  it('uses the saved GPU backend after reopening the dialog', async () => {
    usePreferencesStore().settings = null;
    mockCapture.getPreferences.mockResolvedValue({ extras: { videoExportBackend: 'ffmpeg-vaapi' } });
    const first = mountExport();
    await flushPromises();
    first.unmount();
    const wrapper = mountExport();
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ experimentalLinuxFfmpeg: true }));
    expect(mockCapture.getPreferences).toHaveBeenCalledOnce();
  });

  it('follows backend changes made in shared Settings without writing the preference', async () => {
    const wrapper = mountExport();
    await flushPromises();
    usePreferencesStore().settings!.extras.videoExportBackend = 'ffmpeg-vaapi';
    await nextTick();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(mockJob.start.mock.calls[0]![0]).toHaveProperty('experimentalLinuxFfmpeg', true);
    usePreferencesStore().settings!.extras.videoExportBackend = 'webcodecs';
    await nextTick();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(mockJob.start.mock.calls[1]![0]).not.toHaveProperty('experimentalLinuxFfmpeg');
    expect(mockCapture.updatePreferences).not.toHaveBeenCalled();
  });

  it('blocks export while loading the saved backend, then uses it', async () => {
    usePreferencesStore().settings = null;
    const pending = deferred<{ extras: Record<string, unknown> }>();
    mockCapture.getPreferences.mockReturnValue(pending.promise);
    const wrapper = mountExport();
    expect(exportAction(wrapper).attributes('disabled')).toBeDefined();
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start).not.toHaveBeenCalled();
    pending.resolve({ extras: { videoExportBackend: 'ffmpeg-vaapi' } });
    await flushPromises();
    expect(exportAction(wrapper).attributes('disabled')).toBeUndefined();
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ experimentalLinuxFfmpeg: true }));
  });

  it('blocks export until preferences are loaded and displays unavailable preferences', async () => {
    usePreferencesStore().settings = null;
    mockCapture.getPreferences.mockRejectedValue(new Error('preferences unavailable'));
    const wrapper = mountExport();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('preferences unavailable');
    expect(exportAction(wrapper).attributes('disabled')).toBeDefined();
    expect(mockJob.start).not.toHaveBeenCalled();
  });

  it('keeps the playhead option off by default and exports the full snapshot duration', async () => {
    const wrapper = mountExport(4);
    expect(request.createSnapshot).not.toHaveBeenCalled();
    expect(wrapper.find('.accordion-trigger').exists()).toBe(false);

    expect(playheadOption(wrapper).attributes('aria-checked')).toBe('false');
    expect(exportAction(wrapper).text()).toBe('Export');

    await exportAction(wrapper).trigger('click');

    expect(request.createSnapshot).toHaveBeenCalledOnce();
    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ duration: request.duration }),
      }),
    );
  });

  it('keeps export metadata live without creating snapshots until the user starts an export', async () => {
    const createSnapshot = vi.fn(() => snapshot);
    const source: EditorExportSource = { ...request, createSnapshot };
    const wrapper = mountExport(undefined, source);
    await flushPromises();

    expect(createSnapshot).not.toHaveBeenCalled();

    await wrapper.setProps({
      request: {
        ...source,
        projectName: 'Renamed project',
        duration: 24,
        fps: 30,
        width: 1280,
        height: 720,
      },
    });

    expect(wrapper.text()).toContain('Export');
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it('hydrates every supported saved option and leaves unsupported values at safe defaults', async () => {
    const savedOptions = [
      { format: 'mp4', preset: 'low', resolution: '720p', frameRate: 24 },
      { format: 'webm', preset: 'medium', resolution: '1080p', frameRate: 30 },
      { format: 'webm', preset: 'high', resolution: 'max', frameRate: 60 },
      { format: 'gif', preset: 'ultra', resolution: '480p', frameRate: 25 },
    ];

    for (const saved of savedOptions) {
      mockCapture.getEditorPresets.mockResolvedValueOnce({
        activePresetId: 'default',
        presets: [{ id: 'default', settings: { export: saved } }],
      });
      const wrapper = mountExport();
      await flushPromises();

      const selected = (label: string) => {
        const field = wrapper.findAll('.field').find((candidate) => candidate.find('.field-label').text() === label);
        return field
          ?.findAll('.button-stub')
          .find((button) => button.classes().includes('active'))
          ?.text();
      };
      if (saved.format === 'mp4' || saved.format === 'webm')
        expect(selected('Format')).toBe(saved.format === 'mp4' ? 'MP4' : 'WebM');
      else expect(selected('Format')).toBe('MP4');
      if (saved.preset === 'low' || saved.preset === 'medium' || saved.preset === 'high')
        expect(selected('Quality')).toBe(
          saved.preset === 'medium' ? 'Standard' : saved.preset[0]!.toUpperCase() + saved.preset.slice(1),
        );
      else expect(selected('Quality')).toBe('Standard');
      if (saved.resolution === '720p' || saved.resolution === '1080p' || saved.resolution === 'max')
        expect(selected('Resolution')).toBe(saved.resolution === 'max' ? 'Original' : saved.resolution);
      else expect(selected('Resolution')).toBe('Original');
      if (saved.frameRate === 24 || saved.frameRate === 30 || saved.frameRate === 60)
        expect(selected('Frame rate')).toBe(`${saved.frameRate} fps`);
      else expect(selected('Frame rate')).toBe('60 fps');

      wrapper.unmount();
    }
  });

  it('chooses the recommended frame rate for low and middle source rates', () => {
    const lowRate = mountExport(undefined, { ...request, fps: 24 });
    expect(
      lowRate
        .findAll('.button-stub')
        .find((button) => button.text() === '24 fps')
        ?.classes(),
    ).toContain('active');
    lowRate.unmount();

    const middleRate = mountExport(undefined, { ...request, fps: 30 });
    expect(
      middleRate
        .findAll('.button-stub')
        .find((button) => button.text() === '30 fps')
        ?.classes(),
    ).toContain('active');
    middleRate.unmount();
  });

  it('ignores preset-read failures on mount and continues using export defaults', async () => {
    mockCapture.getEditorPresets.mockRejectedValueOnce(new Error('preset store unavailable'));
    const wrapper = mountExport();
    await flushPromises();

    expect(
      wrapper
        .findAll('.button-stub')
        .find((button) => button.text() === 'MP4')
        ?.classes(),
    ).toContain('active');
    expect(
      wrapper
        .findAll('.button-stub')
        .find((button) => button.text() === 'Standard')
        ?.classes(),
    ).toContain('active');
  });

  it('exports through the live playhead with a duration label', async () => {
    const wrapper = mountExport(5.25);
    await playheadOption(wrapper).trigger('click');

    expect(exportAction(wrapper).text()).toBe('Export (5.3s)');
    expect(playheadOption(wrapper).attributes('aria-checked')).toBe('true');

    await exportAction(wrapper).trigger('click');

    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ duration: 5.25 }),
      }),
    );
  });

  it('updates the duration label live and clamps the playhead to the snapshot end', async () => {
    const wrapper = mountExport(3);
    await playheadOption(wrapper).trigger('click');

    await wrapper.setProps({ playheadSeconds: 7.5 });
    expect(exportAction(wrapper).text()).toBe('Export (7.5s)');

    await wrapper.setProps({ playheadSeconds: 99 });
    expect(exportAction(wrapper).text()).toBe('Export (12s)');
    await exportAction(wrapper).trigger('click');
    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ duration: request.duration }),
      }),
    );
  });

  it.each([0, -1, Number.NaN])(
    'disables export and does not start for invalid playhead %s',
    async (playheadSeconds) => {
      const wrapper = mountExport(playheadSeconds);
      await playheadOption(wrapper).trigger('click');

      const action = exportAction(wrapper);
      expect(action.attributes('disabled')).toBeDefined();
      await action.trigger('click');
      expect(mockJob.start).not.toHaveBeenCalled();
      expect(request.createSnapshot).not.toHaveBeenCalled();
    },
  );

  it('captures current options and one fresh snapshot before asynchronous preset persistence', async () => {
    const createSnapshot = vi.fn(() => snapshot);
    const source: EditorExportSource = { ...request, createSnapshot };
    const wrapper = mountExport(5.25, source);
    await flushPromises();

    await playheadOption(wrapper).trigger('click');
    const buttons = wrapper.findAll('.button-stub');
    await buttons.find((button) => button.text() === 'MP4')?.trigger('click');
    await buttons.find((button) => button.text() === 'High')?.trigger('click');
    await buttons.find((button) => button.text() === '720p')?.trigger('click');
    await buttons.find((button) => button.text() === '24 fps')?.trigger('click');
    const audioSwitch = wrapper
      .findAll('[role="switch"]')
      .find((toggle) => toggle.attributes('aria-label') === i18n.global.t('ExportPopover.includeAudio'))!;
    await audioSwitch.trigger('click');
    expect(wrapper.emitted('update:includeAudio')).toEqual([[false]]);
    await wrapper.setProps({ request: { ...source, includeAudio: false } });

    const save = deferred<Record<string, never>>();
    mockCapture.updateEditorPreset.mockReturnValueOnce(save.promise);

    await exportAction(wrapper).trigger('click');
    await flushPromises();

    expect(createSnapshot).toHaveBeenCalledOnce();
    expect(mockCapture.updateEditorPreset).toHaveBeenCalledOnce();
    expect(mockCapture.updateEditorPreset).toHaveBeenCalledWith('default', {
      export: { format: 'mp4', preset: 'high', resolution: '720p', frameRate: 24, includeAudio: false },
    });
    expect(mockJob.start).not.toHaveBeenCalled();

    const replacementSnapshot = vi.fn(() => snapshot);
    await wrapper.setProps({
      request: {
        ...source,
        projectName: 'Changed while saving',
        includeAudio: true,
        duration: 20,
        fps: 30,
        width: 1280,
        height: 720,
        createSnapshot: replacementSnapshot,
      },
      playheadSeconds: 10,
    });
    const updatedButtons = wrapper.findAll('.button-stub');
    await updatedButtons.find((button) => button.text() === '30 fps')?.trigger('click');
    await updatedButtons.find((button) => button.text() === '1080p')?.trigger('click');

    save.resolve({});
    await flushPromises();

    expect(mockJob.start).toHaveBeenCalledOnce();
    expect(mockJob.start).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'Demo project',
        includeAudio: false,
        format: 'mp4',
        preset: 'high',
        snapshot: expect.objectContaining({
          duration: 5.25,
          render: expect.objectContaining({ fps: 24 }),
          canvas: expect.objectContaining({ width: 1280, height: 720 }),
        }),
      }),
    );
    expect(createSnapshot).toHaveBeenCalledOnce();
    expect(replacementSnapshot).not.toHaveBeenCalled();
  });

  it('starts the export even when saving the preset fails', async () => {
    const failure = new Error('preset store unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCapture.updateEditorPreset.mockRejectedValueOnce(failure);
    const wrapper = mountExport();
    await flushPromises();

    await exportAction(wrapper).trigger('click');
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith('Unable to save export preset', failure);
    expect(mockJob.start).toHaveBeenCalledOnce();
    wrapper.unmount();
    consoleError.mockRestore();
  });

  it('remembers export choices in Default without overwriting a named template or editor settings', async () => {
    mockCapture.getEditorPresets.mockResolvedValueOnce({
      activePresetId: 'template',
      presets: [
        {
          id: 'template',
          settings: { editor: { elementText: { style: { color: '#ffffff' } } }, export: { format: 'webm' } },
        },
      ],
    });
    const wrapper = mountExport();
    await flushPromises();
    await exportAction(wrapper).trigger('click');
    await flushPromises();
    expect(mockCapture.updateEditorPreset).toHaveBeenCalledExactlyOnceWith('default', {
      export: expect.objectContaining({ format: 'webm' }),
    });
    expect(mockCapture.getEditorPresets).toHaveBeenCalledOnce();
  });
});

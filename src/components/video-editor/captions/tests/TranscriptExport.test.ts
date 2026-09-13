import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionClip, ClipComposition } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { i18n } from '~/i18n';
import Button from '~/ui/button/Button.vue';

const capture = vi.hoisted(() => ({ exportTranscript: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));

import TranscriptExport from '../TranscriptExport.vue';

type CaptionOptions = {
  id: string;
  isAiGenerated: boolean;
  customText?: string;
};

const createCaption = ({ id, isAiGenerated, customText }: CaptionOptions): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  captionLayerId: `layer-${id}`,
  timelineStartMs: 100,
  timelineDurationMs: 600,
  sourceInMs: 0,
  sourceDurationMs: 600,
  playbackRate: 1,
  enabled: true,
  order: 0,
  isAiGenerated,
  caption: {
    type: 'text',
    sentences:
      customText === undefined
        ? [
            {
              id: `sentence-${id}`,
              text: 'Recognized phrase',
              startMs: 150,
              endMs: 500,
              words: [
                { text: 'phrase', startMs: 310, endMs: 500 },
                { text: 'Recognized', startMs: 150, endMs: 300 },
              ],
            },
          ]
        : [],
    style: {
      ...createDefaultCaptionStyle(36),
      ...(customText === undefined ? {} : { customText }),
    },
  },
});

const createComposition = (...clips: CaptionClip[]): ClipComposition => ({
  schemaVersion: 14,
  assets: [],
  clips,
  keyboardCaptionSessions: [],
});

const exportButtonSelector = '.transcript-export button';

const captionCases = [
  {
    kind: 'manual',
    clip: createCaption({ id: 'manual-1', isAiGenerated: false, customText: 'Edited manually' }),
    text: 'Edited manually',
    segment: {
      clipId: 'manual-1',
      sentenceId: null,
      captionLayerId: 'layer-manual-1',
      isAiGenerated: false,
      text: 'Edited manually',
      startMs: 100,
      endMs: 700,
      words: [],
    },
  },
  {
    kind: 'AI-generated',
    clip: createCaption({ id: 'ai-1', isAiGenerated: true }),
    text: 'Recognized phrase',
    segment: {
      clipId: 'ai-1',
      sentenceId: 'sentence-ai-1',
      captionLayerId: 'layer-ai-1',
      isAiGenerated: true,
      text: 'Recognized phrase',
      startMs: 150,
      endMs: 500,
      words: [
        { text: 'Recognized', startMs: 150, endMs: 300 },
        { text: 'phrase', startMs: 310, endMs: 500 },
      ],
    },
  },
];

describe('TranscriptExport', () => {
  beforeEach(() => {
    capture.exportTranscript.mockReset();
    capture.exportTranscript.mockResolvedValue({ canceled: true });
  });

  it.each(captionCases)('exports real $kind caption content', async ({ clip, text, segment }) => {
    const composition = createComposition(clip);
    const beforeExport = structuredClone(composition);
    const wrapper = mount(TranscriptExport, {
      props: { composition, timelineDurationMs: 1000 },
    });

    const button = wrapper.get(exportButtonSelector);
    expect(button.classes()).toContain('btn-secondary');
    expect(button.attributes('disabled')).toBeUndefined();

    await button.trigger('click');
    await vi.waitFor(() => expect(capture.exportTranscript).toHaveBeenCalledOnce());

    expect(capture.exportTranscript).toHaveBeenCalledWith({
      projectName: 'Beam',
      transcript: {
        format: 'beam-transcript',
        schemaVersion: 1,
        timeUnit: 'ms',
        timelineDurationMs: 1000,
        text,
        segments: [segment],
      },
    });
    expect(composition).toEqual(beforeExport);
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    wrapper.unmount();
  });

  it('disables export when no transcript text is available', async () => {
    const wrapper = mount(TranscriptExport, {
      props: { composition: createComposition(), timelineDurationMs: 1000 },
    });

    const button = wrapper.get(exportButtonSelector);
    expect(button.attributes('disabled')).toBeDefined();
    wrapper.getComponent(Button).vm.$emit('click', new MouseEvent('click'));
    expect(capture.exportTranscript).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    wrapper.unmount();
  });

  it('uses the latest composition at click time and keeps that request snapshot while pending', async () => {
    const initial = createComposition(createCaption({ id: 'initial', isAiGenerated: false, customText: 'Initial' }));
    const latestAtClick = createComposition(
      createCaption({ id: 'latest', isAiGenerated: false, customText: 'Latest before click' }),
    );
    const latestSnapshot = structuredClone(latestAtClick);
    const changedDuringExport = createComposition(
      createCaption({ id: 'later', isAiGenerated: true, customText: 'Changed during export' }),
    );
    const changedSnapshot = structuredClone(changedDuringExport);
    let resolveExport!: (result: { canceled: false; path: string }) => void;
    capture.exportTranscript.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        }),
    );
    const wrapper = mount(TranscriptExport, {
      props: { composition: initial, timelineDurationMs: 1000 },
    });

    await wrapper.setProps({ composition: latestAtClick });
    await wrapper.get(exportButtonSelector).trigger('click');
    await vi.waitFor(() => expect(capture.exportTranscript).toHaveBeenCalledOnce());
    const submittedRequest = capture.exportTranscript.mock.calls[0]![0];
    expect(submittedRequest).toEqual({
      projectName: 'Beam',
      transcript: {
        format: 'beam-transcript',
        schemaVersion: 1,
        timeUnit: 'ms',
        timelineDurationMs: 1000,
        text: 'Latest before click',
        segments: [
          {
            clipId: 'latest',
            sentenceId: null,
            captionLayerId: 'layer-latest',
            isAiGenerated: false,
            text: 'Latest before click',
            startMs: 100,
            endMs: 700,
            words: [],
          },
        ],
      },
    });
    expect(wrapper.get(exportButtonSelector).attributes('disabled')).toBeDefined();

    await wrapper.setProps({ composition: changedDuringExport });
    wrapper.getComponent(Button).vm.$emit('click', new MouseEvent('click'));
    expect(capture.exportTranscript).toHaveBeenCalledOnce();
    expect(submittedRequest).toEqual(
      expect.objectContaining({ transcript: expect.objectContaining({ text: 'Latest before click' }) }),
    );

    resolveExport({ canceled: false, path: '/tmp/Beam.json' });
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(true));
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    expect(latestAtClick).toEqual(latestSnapshot);
    expect(changedDuringExport).toEqual(changedSnapshot);
    wrapper.unmount();
  });

  it('keeps cancellation silent', async () => {
    const wrapper = mount(TranscriptExport, {
      props: {
        composition: createComposition(createCaption({ id: 'manual', isAiGenerated: false, customText: 'Caption' })),
        timelineDurationMs: 1000,
      },
    });

    await wrapper.get(exportButtonSelector).trigger('click');
    await vi.waitFor(() => expect(capture.exportTranscript).toHaveBeenCalledOnce());
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    wrapper.unmount();
  });

  it('announces a failed export and allows retry', async () => {
    capture.exportTranscript
      .mockRejectedValueOnce(new Error('Disk full'))
      .mockResolvedValueOnce({ canceled: false, path: '/tmp/Beam.json' });
    const wrapper = mount(TranscriptExport, {
      props: {
        composition: createComposition(createCaption({ id: 'manual', isAiGenerated: false, customText: 'Caption' })),
        timelineDurationMs: 1000,
      },
    });

    await wrapper.get(exportButtonSelector).trigger('click');
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('Disk full'));
    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    await wrapper.get(exportButtonSelector).trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(true));
    expect(capture.exportTranscript).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    wrapper.unmount();
  });

  it('uses the translated alert for non-Error failures', async () => {
    capture.exportTranscript.mockRejectedValueOnce('unexpected failure');
    const wrapper = mount(TranscriptExport, {
      props: {
        composition: createComposition(createCaption({ id: 'manual', isAiGenerated: false, customText: 'Caption' })),
        timelineDurationMs: 1000,
      },
    });

    await wrapper.get(exportButtonSelector).trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true));
    expect(wrapper.get('[role="alert"]').text()).toBe(i18n.global.t('CaptionPanel.transcriptExportFailed'));
    wrapper.unmount();
  });

  it('does not start export while disabled by its parent', async () => {
    const wrapper = mount(TranscriptExport, {
      props: {
        composition: createComposition(createCaption({ id: 'manual', isAiGenerated: false, customText: 'Caption' })),
        timelineDurationMs: 1000,
        disabled: true,
      },
    });

    expect(wrapper.get(exportButtonSelector).attributes('disabled')).toBeDefined();
    wrapper.getComponent(Button).vm.$emit('click', new MouseEvent('click'));
    expect(capture.exportTranscript).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    wrapper.unmount();
  });
});

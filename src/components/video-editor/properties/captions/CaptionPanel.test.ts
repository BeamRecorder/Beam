import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionClip, CaptionSentence, ClipComposition } from '~/media/shared/composition-types';
import type { TranscriptionDiagnostics, WhisperResult } from '../../captions/whisper-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';

type MockWhisperProgress = {
  status: 'idle' | 'loading' | 'running' | 'completed' | 'error';
  message: string;
  progress?: number;
};

const capture = vi.hoisted(() => ({
  whisperModels: vi.fn(),
  downloadWhisperModel: vi.fn(),
  deleteWhisperModel: vi.fn(),
  onWhisperProgress: vi.fn(),
}));
const whisper = vi.hoisted(() => ({
  progress: undefined as { value: MockWhisperProgress } | undefined,
  diagnostics: undefined as { value: TranscriptionDiagnostics | null } | undefined,
  transcribe: vi.fn(),
  cancel: vi.fn(),
}));
const createComposition = vi.hoisted(() =>
  vi.fn((assets: ClipComposition['assets'], clips: ClipComposition['clips']): ClipComposition => ({
    schemaVersion: 6,
    keyboardCaptionSessions: [],
    assets,
    clips,
  })),
);

vi.mock('../../../../api/capture', () => ({ capture }));
vi.mock('../../captions/useWhisperTranscription', async () => {
  const { ref } = await import('vue');
  whisper.progress = ref({ status: 'idle', message: '' });
  whisper.diagnostics = ref<TranscriptionDiagnostics | null>(null);
  return {
    useWhisperTranscription: () => ({
      progress: whisper.progress!,
      diagnostics: whisper.diagnostics!,
      transcribe: whisper.transcribe,
      cancel: whisper.cancel,
    }),
  };
});
vi.mock('../../composition/engine/clip-engine', () => ({ createComposition }));

import CaptionPanel from './CaptionPanel.vue';

const Button = {
  inheritAttrs: true,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const Select = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="caption-select" @click="$emit(\'update:modelValue\', modelValue)">Select</button>',
};
const ProgressBar = { template: '<div class="progress-stub" />' };
const Throbber = {
  props: ['text'],
  template: '<span class="throbber-stub">{{ text }}</span>',
};
const CopyButton = {
  inheritAttrs: true,
  props: ['text', 'display', 'label'],
  emits: ['copied'],
  template:
    '<button v-bind="$attrs" class="copy-button-stub" :data-copy-text="text" :data-display="display" :aria-label="label" @click="$emit(\'copied\')">{{ label }}</button>',
};
const stubs = { Button, Select, ProgressBar, Throbber, CopyButton };

const audioComposition: ClipComposition = {
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [
    {
      id: 'audio-1',
      kind: 'audio',
      name: 'System audio',
      fileName: null,
      durationMs: 2000,
      width: null,
      height: null,
      src: 'audio://system',
      origin: 'session',
      sessionId: 'session-1',
    },
  ],
  clips: [
    {
      id: 'audio-clip',
      kind: 'audio',
      name: 'System audio',
      assetId: 'audio-1',
      role: 'system',
      timelineStartMs: 0,
      timelineDurationMs: 2000,
      sourceInMs: 0,
      sourceDurationMs: 2000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      volume: 1,
    },
  ],
};

const aiCaption: CaptionClip = {
  id: 'caption-old',
  kind: 'caption',
  name: 'Old AI caption',
  timelineStartMs: 0,
  timelineDurationMs: 300,
  sourceInMs: 0,
  sourceDurationMs: 300,
  playbackRate: 1,
  enabled: true,
  order: 1,
  isAiGenerated: true,
  caption: {
    type: 'text',
    sentences: [],
    style: {
      ...createDefaultCaptionStyle(36),
      color: '#fff',
      fontSize: 36,
      wrap: true,
      shadowColor: '#000',
      shadowBlur: 8,
      backdropBlur: 0,
      outlineColor: '#000',
      outlineWidth: 6,
      extrusionDepth: 4,
      placement: 'bottom',
    },
  },
};

const createDiagnostics = (overrides: Partial<TranscriptionDiagnostics> = {}): TranscriptionDiagnostics => ({
  status: 'transcribing',
  startedAt: '2026-08-15T12:00:00.000Z',
  finishedAt: null,
  elapsedMs: 0,
  model: 'Xenova/whisper-tiny',
  locale: 'en',
  requestedDurationMs: 2_000,
  audioDurationMs: 2_000,
  sampleRate: 16_000,
  sampleCount: 32_000,
  pcmBytes: 64_000,
  audioFetchMs: 20,
  audioDecodeMs: 80,
  audioResampleMs: 10,
  backend: 'wasm',
  dtype: 'q8',
  transformersVersion: '3.7.0',
  gpu: null,
  hardwareConcurrency: 8,
  crossOriginIsolated: false,
  wasmThreads: 4,
  userAgent: 'CaptionPanel.test',
  chunkLengthSeconds: 30,
  strideLengthSeconds: 5,
  completedChunks: 1,
  totalChunks: 1,
  processedAudioMs: 2_000,
  modelLoadMs: 400,
  inferenceMs: 800,
  modelWasWarm: true,
  wordCount: 4,
  sentenceCount: 1,
  error: null,
  ...overrides,
});

describe('CaptionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whisper.progress!.value = { status: 'idle', message: '', progress: undefined };
    whisper.diagnostics!.value = null;
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'missing', downloadedBytes: 0, totalBytes: 100 },
    ]);
    capture.downloadWhisperModel.mockResolvedValue(undefined);
    capture.onWhisperProgress.mockReturnValue(() => undefined);
    whisper.transcribe.mockResolvedValue({ words: [], sentences: [] });
  });

  it('loads a missing model, displays progress/errors and downloads it', async () => {
    let progressListener!: (event: { id: string; downloadedBytes: number; totalBytes: number | null }) => void;
    capture.onWhisperProgress.mockImplementation((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledOnce());
    expect(wrapper.find('.sub-group').exists()).toBe(true);
    expect(wrapper.find('button[variant="primary"]').attributes('disabled')).toBeDefined();
    await wrapper.get('button[variant="secondary"]').trigger('click');
    await vi.waitFor(() => expect(capture.downloadWhisperModel).toHaveBeenCalledWith('Xenova/whisper-tiny'));
    progressListener({ id: 'Xenova/whisper-tiny', downloadedBytes: 50, totalBytes: 100 });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.progress-block').exists()).toBe(true);

    capture.downloadWhisperModel.mockRejectedValueOnce(new Error('disk full'));
    await wrapper.get('button[variant="secondary"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.error-text').text()).toContain('disk full'));
  });

  it('prevents a second model download while the first one is pending', async () => {
    let resolveDownload!: () => void;
    capture.downloadWhisperModel.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledOnce());

    const downloadButton = wrapper.get('button[variant="secondary"]');
    await downloadButton.trigger('click');
    await vi.waitFor(() => expect(capture.downloadWhisperModel).toHaveBeenCalledOnce());
    expect(downloadButton.attributes('disabled')).toBeDefined();

    await downloadButton.trigger('click');
    expect(capture.downloadWhisperModel).toHaveBeenCalledOnce();

    resolveDownload();
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledTimes(2));
    expect(wrapper.find('button[variant="secondary"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('exposes a text CopyButton for a download error', async () => {
    capture.downloadWhisperModel.mockRejectedValueOnce(new Error('disk full'));
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledOnce());
    await wrapper.get('button[variant="secondary"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.error-text').text()).toContain('disk full'));

    const copyButton = wrapper.get('.error-block .copy-button-stub');
    expect(copyButton.attributes('data-copy-text')).toBe('disk full');
    expect(copyButton.attributes('data-display')).toBe('text');
    expect(copyButton.attributes('aria-label')).toBe('Copy error');
    await copyButton.trigger('click');
    expect(wrapper.findComponent(CopyButton).emitted('copied')).toHaveLength(1);
    wrapper.unmount();
  });

  it('exposes a diagnostics CopyButton while transcription runs and after it completes', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ]);
    let resolveTranscription!: (result: WhisperResult) => void;
    whisper.transcribe.mockImplementation(
      () =>
        new Promise<WhisperResult>((resolve) => {
          resolveTranscription = resolve;
        }),
    );
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true));
    await wrapper.get('button[variant="primary"]').trigger('click');
    await vi.waitFor(() => expect(whisper.transcribe).toHaveBeenCalledOnce());

    whisper.progress!.value = { status: 'running', message: 'Transcribing…', progress: 0.5 };
    whisper.diagnostics!.value = createDiagnostics({ status: 'transcribing', elapsedMs: 1_500 });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.transcription-throbber-row').exists()).toBe(true);
    expect(wrapper.find('.transcription-diagnostics-row').exists()).toBe(false);

    const cancelButton = wrapper.find('.cancel-transcription-btn');
    expect(cancelButton.exists()).toBe(true);

    whisper.progress!.value = { status: 'completed', message: 'Transcription complete', progress: 1 };
    whisper.diagnostics!.value = createDiagnostics({
      status: 'completed',
      elapsedMs: 2_345,
      finishedAt: '2026-08-15T12:00:02.345Z',
    });
    resolveTranscription({ words: [], sentences: [] });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.transcription-diagnostics-status').text()).toBe('Transcription complete');
    const reportButton = wrapper.get('.transcription-diagnostics-row .copy-button-stub');
    expect(reportButton.attributes('data-display')).toBe('text');
    expect(reportButton.attributes('data-copy-text')).toContain('Status: COMPLETED');
    await reportButton.trigger('click');
    expect(wrapper.findComponent(CopyButton).emitted('copied')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits progressive caption compositions with stable clip ids and selects only after the final result', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ]);
    const firstSentence: CaptionSentence = {
      id: 'sentence-1',
      text: 'Hello',
      startMs: 100,
      endMs: 200,
      words: [{ text: 'Hello', startMs: 100, endMs: 200 }],
    };
    const extendedSentence: CaptionSentence = {
      ...firstSentence,
      text: 'Hello world.',
      endMs: 500,
      words: [...firstSentence.words, { text: 'world.', startMs: 210, endMs: 500 }],
    };
    const secondSentence: CaptionSentence = {
      id: 'sentence-2',
      text: 'Next',
      startMs: 600,
      endMs: 800,
      words: [{ text: 'Next', startMs: 600, endMs: 800 }],
    };
    const firstPartial: WhisperResult = {
      words: firstSentence.words,
      sentences: [firstSentence],
    };
    const secondPartial: WhisperResult = {
      words: [...extendedSentence.words, ...secondSentence.words],
      sentences: [extendedSentence, secondSentence],
    };
    let onPartial!: (result: WhisperResult) => void;
    let resolveTranscription!: (result: WhisperResult) => void;
    whisper.transcribe.mockImplementation(
      (_src: string, _model: string, _duration: number, partial?: (result: WhisperResult) => void) => {
        onPartial = partial!;
        return new Promise<WhisperResult>((resolve) => {
          resolveTranscription = resolve;
        });
      },
    );
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true));
    await wrapper.get('button[variant="primary"]').trigger('click');
    await vi.waitFor(() => expect(whisper.transcribe).toHaveBeenCalledOnce());

    onPartial(firstPartial);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select-caption')).toBeUndefined();
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    let previews = wrapper.emitted('preview:composition') as Array<[ClipComposition]>;
    expect(previews).toHaveLength(1);
    const firstClipId = previews[0]![0].clips.find((clip) => clip.kind === 'caption')!.id;

    onPartial(secondPartial);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select-caption')).toBeUndefined();
    expect(wrapper.emitted('update:composition')).toBeUndefined();
    previews = wrapper.emitted('preview:composition') as Array<[ClipComposition]>;
    expect(previews).toHaveLength(2);
    const progressiveCaptions = previews[1]![0].clips.filter((clip) => clip.kind === 'caption');
    expect(progressiveCaptions).toHaveLength(2);
    expect(progressiveCaptions.map((clip) => clip.id)).toEqual([firstClipId, expect.any(String)]);
    expect(new Set(progressiveCaptions.map((clip) => clip.id)).size).toBe(progressiveCaptions.length);
    expect(progressiveCaptions[0]!.caption.type).toBe('text');
    if (progressiveCaptions[0]!.caption.type === 'text') {
      expect(progressiveCaptions[0]!.caption.sentences[0]!.text).toBe('Hello world.');
    }

    resolveTranscription(secondPartial);
    await vi.waitFor(() => expect(wrapper.emitted('select-caption')).toHaveLength(1));
    const updates = wrapper.emitted('update:composition') as Array<[ClipComposition]>;
    expect(updates).toHaveLength(1);
    expect(wrapper.emitted('select-caption')![0]).toEqual([firstClipId]);
    const finalCaptions = updates[0]![0].clips.filter((clip) => clip.kind === 'caption');
    expect(finalCaptions.map((clip) => clip.id)).toEqual(progressiveCaptions.map((clip) => clip.id));
    wrapper.unmount();
  });

  it('generates captions, replaces old AI captions, and exposes the edit action', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ]);
    whisper.transcribe.mockResolvedValue({
      words: [],
      sentences: [{ id: 'sentence-1', text: 'Hello', startMs: 100, endMs: 120 }],
    });
    const wrapper = mount(CaptionPanel, {
      props: {
        composition: { ...audioComposition, clips: [...audioComposition.clips, aiCaption] },
        timelineDurationMs: 2000,
      },
      global: { stubs },
    });
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true));
    expect(wrapper.text()).toContain('1 subtitle track');
    await wrapper.get('button[variant="primary"]').trigger('click');
    await vi.waitFor(() =>
      expect(whisper.transcribe).toHaveBeenCalledWith(
        'audio://system',
        'Xenova/whisper-tiny',
        2000,
        expect.any(Function),
      ),
    );
    expect(createComposition).toHaveBeenCalled();
    expect(wrapper.emitted('update:composition')).toHaveLength(1);
    expect(wrapper.emitted('select-caption')).toHaveLength(1);
    await wrapper.get('button[variant="ghost"]').trigger('click');
    expect(wrapper.emitted('select-caption')).toHaveLength(2);
  });

  it('locks caption generation while audio decoding or transcription is pending', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ]);
    let resolveTranscription!: (result: WhisperResult) => void;
    whisper.transcribe.mockImplementation(
      () =>
        new Promise<WhisperResult>((resolve) => {
          resolveTranscription = resolve;
        }),
    );
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true));
    const generateButton = wrapper.get('button[variant="primary"]');
    await generateButton.trigger('click');
    await vi.waitFor(() => expect(whisper.transcribe).toHaveBeenCalledOnce());
    expect(generateButton.attributes('disabled')).toBeDefined();

    await generateButton.trigger('click');
    expect(whisper.transcribe).toHaveBeenCalledOnce();

    resolveTranscription({ words: [], sentences: [] });
    await vi.waitFor(() => expect(wrapper.find('button[variant="primary"]').attributes('disabled')).toBeUndefined());
    wrapper.unmount();
  });

  it('does nothing when transcription returns no sentences', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ]);
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true));
    await wrapper.get('button[variant="primary"]').trigger('click');
    await vi.waitFor(() => expect(whisper.transcribe).toHaveBeenCalled());
    expect(wrapper.emitted('update:composition')).toBeUndefined();
  });

  it('deletes a downloaded model when clicking the delete button', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ]);
    capture.deleteWhisperModel.mockResolvedValue({
      id: 'Xenova/whisper-tiny',
      status: 'missing',
      downloadedBytes: 0,
      totalBytes: 100,
    });
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs },
    });
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true));
    const deleteButton = wrapper.get('button[variant="outline"]');
    expect(deleteButton.text()).toContain('Delete Model');

    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'missing', downloadedBytes: 0, totalBytes: 100 },
    ]);
    await deleteButton.trigger('click');
    await vi.waitFor(() => expect(capture.deleteWhisperModel).toHaveBeenCalledWith('Xenova/whisper-tiny'));
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(false));
    expect(wrapper.find('button[variant="secondary"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionClip, CaptionSentence, ClipComposition } from '~/media/shared/composition-types';
import type { WhisperResult } from '../../captions/whisper-types';

type MockWhisperProgress = {
  status: 'idle' | 'loading' | 'running' | 'error';
  message: string;
  progress?: number;
};

const capture = vi.hoisted(() => ({
  whisperModels: vi.fn(),
  downloadWhisperModel: vi.fn(),
  onWhisperProgress: vi.fn(),
}));
const whisper = vi.hoisted(() => ({
  progress: undefined as { value: MockWhisperProgress } | undefined,
  transcribe: vi.fn(),
}));
const createComposition = vi.hoisted(() =>
  vi.fn((assets: ClipComposition['assets'], clips: ClipComposition['clips']): ClipComposition => ({
    schemaVersion: 3,
    keyboardCaptionSessions: [],
    assets,
    clips,
  })),
);

vi.mock('../../../../api/capture', () => ({ capture }));
vi.mock('../../captions/useWhisperTranscription', async () => {
  const { ref } = await import('vue');
  whisper.progress = ref({ status: 'idle', message: '' });
  return { useWhisperTranscription: () => ({ progress: whisper.progress!, transcribe: whisper.transcribe }) };
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

const audioComposition: ClipComposition = {
  schemaVersion: 3,
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

describe('CaptionPanel', () => {
  let clipboardDescriptor: PropertyDescriptor | undefined;
  let execCommandDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
    vi.clearAllMocks();
    whisper.progress!.value = { status: 'idle', message: '', progress: undefined };
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'missing', downloadedBytes: 0, totalBytes: 100 },
    ]);
    capture.downloadWhisperModel.mockResolvedValue(undefined);
    capture.onWhisperProgress.mockReturnValue(() => undefined);
    whisper.transcribe.mockResolvedValue({ words: [], sentences: [] });
  });

  afterEach(() => {
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    else Reflect.deleteProperty(navigator, 'clipboard');
    if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor);
    else Reflect.deleteProperty(document, 'execCommand');
  });

  it('loads a missing model, displays progress/errors and downloads it', async () => {
    let progressListener!: (event: { id: string; downloadedBytes: number; totalBytes: number | null }) => void;
    capture.onWhisperProgress.mockImplementation((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs: { Button, Select, ProgressBar } },
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
      global: { stubs: { Button, Select, ProgressBar } },
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

  it('copies a download error with the clipboard API', async () => {
    capture.downloadWhisperModel.mockRejectedValueOnce(new Error('disk full'));
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs: { Button, Select, ProgressBar } },
    });
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledOnce());
    await wrapper.get('button[variant="secondary"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.error-text').text()).toContain('disk full'));

    await wrapper.get('button[variant="ghost"]').trigger('click');
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('disk full'));
    expect(wrapper.find('button[variant="ghost"]').text()).toContain('Copied');
    wrapper.unmount();
  });

  it('falls back to selecting a temporary textarea when clipboard writing fails', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('clipboard unavailable')) };
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select');
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs: { Button, Select, ProgressBar } },
    });
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledOnce());
    whisper.progress!.value = { status: 'error', message: 'transcription failed' };
    await wrapper.vm.$nextTick();
    await vi.waitFor(() => expect(wrapper.find('.error-text').text()).toContain('transcription failed'));

    await wrapper.get('button[variant="ghost"]').trigger('click');
    await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(clipboard.writeText).toHaveBeenCalledWith('transcription failed');
    expect(select).toHaveBeenCalledOnce();
    expect(document.querySelector('textarea')).toBeNull();
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
      global: { stubs: { Button, Select, ProgressBar } },
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
      global: { stubs: { Button, Select, ProgressBar } },
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
      global: { stubs: { Button, Select, ProgressBar } },
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
      global: { stubs: { Button, Select, ProgressBar } },
    });
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true));
    await wrapper.get('button[variant="primary"]').trigger('click');
    await vi.waitFor(() => expect(whisper.transcribe).toHaveBeenCalled());
    expect(wrapper.emitted('update:composition')).toBeUndefined();
  });
});

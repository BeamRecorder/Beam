import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CaptionSentence, CaptionWord } from '~/media/shared/composition-types';
import { formatTranscriptionElapsed } from './transcription-diagnostics';
import type { TranscriptionDiagnostics, WhisperModelId, WhisperProgress, WhisperResult } from './whisper-types';
import type { WhisperTranscribeRequest, WhisperWorkerEvent } from './whisper-worker-protocol';

type SentenceIdFactory = (words: CaptionWord[], index: number) => string;
type AudioPreparation = {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  fetchMs: number;
  decodeMs: number;
  resampleMs: number;
};

export const sentencesFromWords = (
  words: CaptionWord[],
  createId: SentenceIdFactory = () => crypto.randomUUID(),
): CaptionSentence[] => {
  const groups: CaptionWord[][] = [];
  let group: CaptionWord[] = [];
  for (const word of words) {
    group.push(word);
    if (/[.!?]$/.test(word.text) || group.length >= 12) {
      groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);
  const sentences = groups.map((items, index) => ({
    id: createId(items, index),
    text: items.map((word) => word.text).join(' '),
    startMs: items[0].startMs,
    endMs: items.at(-1)!.endMs,
    words: items,
  }));
  return sentences.map((sentence, index) => ({
    ...sentence,
    endMs: Math.min(sentence.endMs, sentences[index + 1]?.startMs ?? sentence.endMs),
  }));
};

const mono = async (src: string, maximumDurationMs?: number): Promise<AudioPreparation> => {
  const fetchStartedAt = performance.now();
  const response = await fetch(src);
  if (!response.ok) throw new Error('Unable to read selected audio source.');
  const encodedAudio = await response.arrayBuffer();
  const fetchMs = performance.now() - fetchStartedAt;

  const context = new AudioContext();
  const decodeStartedAt = performance.now();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(encodedAudio);
  } finally {
    await context.close();
  }
  const decodeMs = performance.now() - decodeStartedAt;
  const durationLimit = maximumDurationMs === undefined ? buffer.duration : Math.max(0, maximumDurationMs / 1_000);
  const sourceDuration = Math.min(buffer.duration, durationLimit);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('The selected audio source is empty.');

  const sampleRate = 16_000;
  const offline = new OfflineAudioContext(1, Math.ceil(sourceDuration * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const resampleStartedAt = performance.now();
  const rendered = await offline.startRendering();
  const samples = new Float32Array(rendered.length);
  rendered.copyFromChannel(samples, 0);
  return {
    samples,
    sampleRate,
    durationMs: (samples.length / sampleRate) * 1_000,
    fetchMs,
    decodeMs,
    resampleMs: performance.now() - resampleStartedAt,
  };
};

const initialDiagnostics = (
  model: WhisperModelId,
  locale: string,
  requestedDurationMs: number | undefined,
): TranscriptionDiagnostics => ({
  status: 'preparing',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  elapsedMs: 0,
  model,
  locale,
  requestedDurationMs: requestedDurationMs ?? null,
  audioDurationMs: 0,
  sampleRate: 16_000,
  sampleCount: 0,
  pcmBytes: 0,
  audioFetchMs: 0,
  audioDecodeMs: 0,
  audioResampleMs: 0,
  backend: null,
  dtype: 'q8',
  transformersVersion: null,
  gpu: null,
  hardwareConcurrency: null,
  crossOriginIsolated: globalThis.crossOriginIsolated === true,
  wasmThreads: null,
  userAgent: navigator.userAgent,
  chunkLengthSeconds: 30,
  strideLengthSeconds: 5,
  completedChunks: 0,
  totalChunks: 0,
  processedAudioMs: 0,
  modelLoadMs: 0,
  inferenceMs: 0,
  modelWasWarm: false,
  wordCount: 0,
  sentenceCount: 0,
  error: null,
});

export function useWhisperTranscription() {
  const progress = ref<WhisperProgress>({ status: 'idle', message: '' });
  const diagnostics = ref<TranscriptionDiagnostics | null>(null);
  let worker: Worker | null = null;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let activeReject: ((error: Error) => void) | null = null;
  const { locale, t } = useI18n();

  const stopElapsedTimer = () => {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  };
  const updateDiagnostics = (update: Partial<TranscriptionDiagnostics>) => {
    if (!diagnostics.value) return;
    diagnostics.value = { ...diagnostics.value, ...update };
  };
  const fail = (error: Error, update: Partial<TranscriptionDiagnostics> = {}) => {
    stopElapsedTimer();
    updateDiagnostics({
      ...update,
      status: 'failed',
      error: error.message,
      finishedAt: new Date().toISOString(),
    });
    progress.value = { status: 'error', message: error.message };
  };

  const transcribe = async (
    src: string,
    model: WhisperModelId,
    maximumDurationMs?: number,
    onPartial?: (result: WhisperResult) => void,
  ): Promise<WhisperResult> => {
    if (activeReject) throw new Error('A Whisper transcription is already running.');
    const startedAt = performance.now();
    diagnostics.value = initialDiagnostics(model, locale.value, maximumDurationMs);
    progress.value = { status: 'loading', message: t('CaptionPanel.preparingAudio'), progress: 0 };
    stopElapsedTimer();
    elapsedTimer = setInterval(() => updateDiagnostics({ elapsedMs: performance.now() - startedAt }), 1_000);

    let input: AudioPreparation;
    try {
      input = await mono(src, maximumDurationMs);
      updateDiagnostics({
        audioDurationMs: input.durationMs,
        sampleRate: input.sampleRate,
        sampleCount: input.samples.length,
        pcmBytes: input.samples.byteLength,
        audioFetchMs: input.fetchMs,
        audioDecodeMs: input.decodeMs,
        audioResampleMs: input.resampleMs,
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      fail(error, { elapsedMs: performance.now() - startedAt });
      throw error;
    }

    worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    const activeWorker = worker;
    const id = crypto.randomUUID();
    const sentenceIds = new Map<string, string>();
    const partialWords: CaptionWord[] = [];
    const resultFromWords = (words: CaptionWord[]): WhisperResult => ({
      words,
      sentences: sentencesFromWords(words, (items, index) => {
        const key = `${items[0]!.startMs}:${index}`;
        const existing = sentenceIds.get(key);
        if (existing) return existing;
        const sentenceId = crypto.randomUUID();
        sentenceIds.set(key, sentenceId);
        return sentenceId;
      }),
    });

    return new Promise((resolve, reject) => {
      activeReject = reject;
      const cleanup = () => {
        activeWorker.removeEventListener('message', onMessage);
        activeWorker.removeEventListener('error', onWorkerError);
        activeWorker.removeEventListener('messageerror', onMessageError);
        activeReject = null;
      };
      const rejectWith = (error: Error, update: Partial<TranscriptionDiagnostics> = {}) => {
        cleanup();
        fail(error, { ...update, elapsedMs: performance.now() - startedAt });
        reject(error);
      };
      const onWorkerError = (event: ErrorEvent) => rejectWith(new Error(event.message || 'Whisper worker crashed.'));
      const onMessageError = () => rejectWith(new Error('Whisper worker returned unreadable data.'));
      const onMessage = ({ data }: MessageEvent<WhisperWorkerEvent>) => {
        if (data.id !== id) return;
        if (data.type === 'progress') {
          progress.value = { status: data.status, message: data.message, progress: data.progress };
          updateDiagnostics({ status: data.status === 'loading' ? 'loading-model' : 'transcribing' });
        }
        if (data.type === 'diagnostics') updateDiagnostics(data.diagnostics);
        if (data.type === 'partial') {
          partialWords.push(...data.words);
          const partial = resultFromWords([...partialWords]);
          updateDiagnostics({ wordCount: partial.words.length, sentenceCount: partial.sentences.length });
          onPartial?.(partial);
        }
        if (data.type === 'result') {
          cleanup();
          stopElapsedTimer();
          const result = resultFromWords(data.words);
          const elapsedMs = performance.now() - startedAt;
          updateDiagnostics({
            status: 'completed',
            finishedAt: new Date().toISOString(),
            elapsedMs,
            wordCount: result.words.length,
            sentenceCount: result.sentences.length,
          });
          progress.value = {
            status: 'completed',
            message: t('CaptionPanel.transcriptionCompleted', { time: formatTranscriptionElapsed(elapsedMs) }),
            progress: 100,
          };
          resolve(result);
        }
        if (data.type === 'error') rejectWith(new Error(data.message), data.diagnostics);
      };
      activeWorker.addEventListener('message', onMessage);
      activeWorker.addEventListener('error', onWorkerError);
      activeWorker.addEventListener('messageerror', onMessageError);
      const request: WhisperTranscribeRequest = {
        type: 'transcribe',
        id,
        model,
        audio: input.samples,
        sampleRate: input.sampleRate,
        locale: locale.value,
      };
      activeWorker.postMessage(request, [input.samples.buffer]);
    });
  };

  const cancel = () => {
    stopElapsedTimer();
    if (activeReject) {
      activeReject(new Error('Whisper transcription was cancelled.'));
      activeReject = null;
    }
    if (worker) {
      worker.terminate();
      worker = null;
    }
    progress.value = { status: 'idle', message: '' };
    if (diagnostics.value && diagnostics.value.status !== 'completed') {
      diagnostics.value.status = 'failed';
      diagnostics.value.error = 'Cancelled';
      diagnostics.value.finishedAt = new Date().toISOString();
    }
  };

  onBeforeUnmount(() => {
    stopElapsedTimer();
    if (activeReject) {
      activeReject(new Error('Whisper transcription was cancelled because the panel closed.'));
      activeReject = null;
    }
    worker?.terminate();
  });
  return { progress, diagnostics, transcribe, cancel };
}

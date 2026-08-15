/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';
import type { CaptionWord } from '~/media/shared/composition-types';
import type { TranscriptionDiagnostics, WhisperGpuInfo } from './whisper-types';
import type { WhisperTranscribeRequest, WhisperWorkerEvent } from './whisper-worker-protocol';

type Chunk = { text?: string; timestamp?: [number, number] };
type TranscriptionOptions = {
  sampling_rate: number;
  return_timestamps: 'word';
  language?: string;
  task?: 'transcribe';
};
type Transcriber = {
  (audio: Float32Array, options: TranscriptionOptions): Promise<{ chunks?: Chunk[] }>;
  dispose?: () => void | Promise<void>;
};

const CHUNK_SECONDS = 30;
const STRIDE_SECONDS = 5;
const STEP_SECONDS = CHUNK_SECONDS - STRIDE_SECONDS * 2;
const DTYPE = 'q8';
const LANGUAGE_BY_LOCALE: Record<string, string> = {
  bg: 'bulgarian',
  de: 'german',
  en: 'english',
  es: 'spanish',
  fr: 'french',
  hi: 'hindi',
  it: 'italian',
  ja: 'japanese',
  ko: 'korean',
  pl: 'polish',
  'pt-BR': 'portuguese',
  ru: 'russian',
  vi: 'vietnamese',
  'zh-CN': 'chinese',
  'zh-TW': 'chinese',
};

let loadedModel = '';
let loadedBackend = '';
let transcriber: Transcriber | null = null;
let activeRequestId: string | null = null;
let runtimePromise: Promise<Partial<TranscriptionDiagnostics>> | null = null;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = 'whisper-model://models/';
env.useBrowserCache = false;

const formatTime = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};
const formatMegabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;

const messages: Record<string, Record<string, string>> = {
  en: {
    'loading.model': 'Loading {model} ({device})...',
    'loading.progress': 'Loading model: {loaded} / {total}',
    'loading.ready': 'Model ready. Preparing transcription...',
    'loading.file': 'Loading {file}',
    'loading.generic': 'Loading model...',
    transcribing: 'Transcribing segment {current}/{total}: {time} / {duration}',
    transcribed: 'Transcribed {current}/{total} segments: {time} / {duration}',
    failed: 'Whisper failed.',
    busy: 'A Whisper transcription is already running.',
    invalidAudio: 'Whisper received invalid or empty audio.',
  },
  fr: {
    'loading.model': 'Chargement de {model} ({device})...',
    'loading.progress': 'Chargement du modèle : {loaded} / {total}',
    'loading.ready': 'Modèle prêt. Préparation de la transcription...',
    'loading.file': 'Chargement de {file}',
    'loading.generic': 'Chargement du modèle...',
    transcribing: 'Transcription du segment {current}/{total} : {time} / {duration}',
    transcribed: '{current}/{total} segments transcrits : {time} / {duration}',
    failed: 'Échec de Whisper.',
    busy: 'Une transcription Whisper est déjà en cours.',
    invalidAudio: 'Whisper a reçu un audio vide ou invalide.',
  },
};

const translate = (locale: string, key: string, vars?: Record<string, string>) => {
  let message = messages[locale]?.[key] ?? messages[locale.split('-')[0]]?.[key] ?? messages.en[key] ?? key;
  if (vars) for (const [name, replacement] of Object.entries(vars)) message = message.replace(`{${name}}`, replacement);
  return message;
};

const post = (event: WhisperWorkerEvent) => self.postMessage(event);

const gpuInfo = (adapter: GPUAdapter): WhisperGpuInfo => {
  const info = adapter.info;
  return {
    vendor: info?.vendor ?? '',
    architecture: info?.architecture ?? '',
    device: info?.device ?? '',
    description: info?.description ?? '',
    features: [...adapter.features].map(String).sort(),
    limits: {
      maxBufferSize: Number(adapter.limits.maxBufferSize),
      maxComputeInvocationsPerWorkgroup: Number(adapter.limits.maxComputeInvocationsPerWorkgroup),
      maxComputeWorkgroupStorageSize: Number(adapter.limits.maxComputeWorkgroupStorageSize),
      maxStorageBufferBindingSize: Number(adapter.limits.maxStorageBufferBindingSize),
    },
  };
};

const selectRuntime = async (): Promise<Partial<TranscriptionDiagnostics>> => {
  const hardwareConcurrency = navigator.hardwareConcurrency || 1;
  const isolated = globalThis.crossOriginIsolated === true;
  const adapter = navigator.gpu
    ? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null)
    : null;
  if (adapter) {
    if (env.backends.onnx.webgpu) env.backends.onnx.webgpu.adapter = adapter;
    return {
      backend: 'webgpu',
      gpu: gpuInfo(adapter),
      hardwareConcurrency,
      crossOriginIsolated: isolated,
      wasmThreads: null,
      userAgent: navigator.userAgent,
      dtype: DTYPE,
      transformersVersion: env.version,
    };
  }
  const wasmThreads = isolated ? Math.max(1, Math.min(8, hardwareConcurrency)) : 1;
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = wasmThreads;
  return {
    backend: 'wasm',
    gpu: null,
    hardwareConcurrency,
    crossOriginIsolated: isolated,
    wasmThreads,
    userAgent: navigator.userAgent,
    dtype: DTYPE,
    transformersVersion: env.version,
  };
};

const chunkCountFor = (totalSeconds: number) =>
  totalSeconds <= CHUNK_SECONDS ? 1 : 1 + Math.ceil((totalSeconds - CHUNK_SECONDS) / STEP_SECONDS);

const validWord = (chunk: Chunk): chunk is Required<Chunk> =>
  Boolean(
    chunk.text?.trim() &&
    chunk.timestamp &&
    Number.isFinite(chunk.timestamp[0]) &&
    Number.isFinite(chunk.timestamp[1]) &&
    chunk.timestamp[0] >= 0 &&
    chunk.timestamp[1] >= chunk.timestamp[0],
  );

const acceptedWords = (
  chunks: Chunk[],
  offsetSeconds: number,
  chunkDuration: number,
  isFirst: boolean,
  isLast: boolean,
): CaptionWord[] => {
  const acceptedStart = isFirst ? 0 : STRIDE_SECONDS;
  const acceptedEnd = isLast ? chunkDuration : chunkDuration - STRIDE_SECONDS;
  const offsetMs = Math.round(offsetSeconds * 1_000);
  return chunks.filter(validWord).flatMap((chunk) => {
    const midpoint = (chunk.timestamp[0] + chunk.timestamp[1]) / 2;
    if (midpoint < acceptedStart || (!isLast && midpoint >= acceptedEnd)) return [];
    return [
      {
        text: chunk.text.trim(),
        startMs: offsetMs + Math.round(chunk.timestamp[0] * 1_000),
        endMs: offsetMs + Math.round(chunk.timestamp[1] * 1_000),
      },
    ];
  });
};

self.onmessage = async ({ data }: MessageEvent<WhisperTranscribeRequest>) => {
  if (data.type !== 'transcribe') return;
  const locale = data.locale ?? 'en';
  if (activeRequestId) {
    post({ type: 'error', id: data.id, message: translate(locale, 'busy') });
    return;
  }
  activeRequestId = data.id;
  const inferenceStartedAt = performance.now();
  let inferenceMs = 0;
  try {
    if (
      !(data.audio instanceof Float32Array) ||
      !data.audio.length ||
      !Number.isFinite(data.sampleRate) ||
      data.sampleRate <= 0
    ) {
      throw new Error(translate(locale, 'invalidAudio'));
    }
    const runtime = await (runtimePromise ??= selectRuntime());
    const backend = runtime.backend ?? 'wasm';
    const modelWasWarm = Boolean(transcriber && loadedModel === data.model && loadedBackend === backend);
    let modelLoadMs = 0;
    post({
      type: 'diagnostics',
      id: data.id,
      diagnostics: {
        ...runtime,
        status: modelWasWarm ? 'transcribing' : 'loading-model',
        chunkLengthSeconds: CHUNK_SECONDS,
        strideLengthSeconds: STRIDE_SECONDS,
        modelWasWarm,
      },
    });
    if (!modelWasWarm) {
      post({
        type: 'progress',
        id: data.id,
        status: 'loading',
        message: translate(locale, 'loading.model', { model: data.model, device: backend }),
      });
      if (transcriber?.dispose) await transcriber.dispose();
      transcriber = null;
      loadedModel = '';
      loadedBackend = '';
      const modelLoadStartedAt = performance.now();
      transcriber = (await pipeline('automatic-speech-recognition', data.model, {
        device: backend,
        dtype: DTYPE,
        progress_callback: (event: {
          progress?: number;
          status?: string;
          file?: string;
          loaded?: number;
          total?: number;
        }) => {
          const message =
            event.loaded !== undefined && event.total !== undefined
              ? translate(locale, 'loading.progress', {
                  loaded: formatMegabytes(event.loaded),
                  total: formatMegabytes(event.total),
                })
              : event.status === 'ready'
                ? translate(locale, 'loading.ready')
                : event.file
                  ? translate(locale, 'loading.file', { file: event.file })
                  : translate(locale, 'loading.generic');
          post({ type: 'progress', id: data.id, status: 'loading', message, progress: event.progress });
        },
      })) as unknown as Transcriber;
      modelLoadMs = performance.now() - modelLoadStartedAt;
      loadedModel = data.model;
      loadedBackend = backend;
    }

    const totalSeconds = data.audio.length / data.sampleRate;
    const chunkSamples = data.sampleRate * CHUNK_SECONDS;
    const stepSamples = data.sampleRate * STEP_SECONDS;
    const chunkCount = chunkCountFor(totalSeconds);
    const words: CaptionWord[] = [];
    const transcriptionOptions: TranscriptionOptions = {
      sampling_rate: data.sampleRate,
      return_timestamps: 'word',
      ...(data.model.endsWith('.en')
        ? {}
        : {
            language: LANGUAGE_BY_LOCALE[locale] ?? LANGUAGE_BY_LOCALE[locale.split('-')[0]] ?? 'english',
            task: 'transcribe',
          }),
    };
    const activeTranscriber = transcriber;
    if (!activeTranscriber) throw new Error(translate(locale, 'failed'));
    const transcriptionStartedAt = performance.now();
    let completedChunks = 0;
    for (let offset = 0; offset < data.audio.length; offset += stepSamples) {
      const chunkIndex = Math.floor(offset / stepSamples);
      const end = Math.min(data.audio.length, offset + chunkSamples);
      const isFirst = offset === 0;
      const isLast = end >= data.audio.length;
      const offsetSeconds = offset / data.sampleRate;
      const chunkDuration = (end - offset) / data.sampleRate;
      const startedProcessingSeconds = isFirst ? 0 : offsetSeconds + STRIDE_SECONDS;
      post({
        type: 'progress',
        id: data.id,
        status: 'running',
        message: translate(locale, 'transcribing', {
          current: String(chunkIndex + 1),
          total: String(chunkCount),
          time: formatTime(offsetSeconds),
          duration: formatTime(totalSeconds),
        }),
        progress: (Math.min(totalSeconds, startedProcessingSeconds) / totalSeconds) * 100,
      });
      const result = await activeTranscriber(data.audio.subarray(offset, end), transcriptionOptions);
      const partialWords = acceptedWords(result.chunks ?? [], offsetSeconds, chunkDuration, isFirst, isLast);
      words.push(...partialWords);
      completedChunks += 1;
      const processedSeconds = isLast
        ? totalSeconds
        : Math.min(totalSeconds, offsetSeconds + CHUNK_SECONDS - STRIDE_SECONDS);
      inferenceMs = performance.now() - transcriptionStartedAt;
      post({ type: 'partial', id: data.id, words: partialWords });
      post({
        type: 'diagnostics',
        id: data.id,
        diagnostics: {
          status: 'transcribing',
          modelLoadMs,
          inferenceMs,
          completedChunks,
          totalChunks: chunkCount,
          processedAudioMs: processedSeconds * 1_000,
          wordCount: words.length,
        },
      });
      post({
        type: 'progress',
        id: data.id,
        status: 'running',
        message: translate(locale, 'transcribed', {
          current: String(completedChunks),
          total: String(chunkCount),
          time: formatTime(processedSeconds),
          duration: formatTime(totalSeconds),
        }),
        progress: (processedSeconds / totalSeconds) * 100,
      });
      if (isLast) break;
    }
    post({
      type: 'diagnostics',
      id: data.id,
      diagnostics: {
        status: 'completed',
        modelLoadMs,
        inferenceMs,
        completedChunks,
        totalChunks: chunkCount,
        processedAudioMs: totalSeconds * 1_000,
        wordCount: words.length,
      },
    });
    post({ type: 'result', id: data.id, words });
  } catch (error) {
    post({
      type: 'error',
      id: data.id,
      message: error instanceof Error ? error.message : translate(locale, 'failed'),
      diagnostics: { inferenceMs: inferenceMs || performance.now() - inferenceStartedAt },
    });
  } finally {
    activeRequestId = null;
  }
};

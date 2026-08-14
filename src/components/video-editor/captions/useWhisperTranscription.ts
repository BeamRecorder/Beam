import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CaptionSentence, CaptionWord } from '~/media/shared/composition-types';
import type { WhisperModelId, WhisperProgress, WhisperResult } from './whisper-types';

export const sentencesFromWords = (words: CaptionWord[]): CaptionSentence[] => {
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
  const sentences = groups.map((items) => ({
    id: crypto.randomUUID(),
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

const mono = async (src: string, maximumDurationMs?: number) => {
  const response = await fetch(src);
  if (!response.ok) throw new Error('Unable to read selected audio source.');
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  await context.close();
  const sourceDuration = maximumDurationMs ? Math.min(buffer.duration, maximumDurationMs / 1000) : buffer.duration;
  const sampleRate = 16_000;
  const offline = new OfflineAudioContext(1, Math.ceil(sourceDuration * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return { samples: new Float32Array(rendered.getChannelData(0)), sampleRate };
};

export function useWhisperTranscription() {
  const progress = ref<WhisperProgress>({ status: 'idle', message: '' });
  let worker: Worker | null = null;
  const { locale } = useI18n();
  const transcribe = async (src: string, model: WhisperModelId, maximumDurationMs?: number): Promise<WhisperResult> => {
    const input = await mono(src, maximumDurationMs);
    worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    const activeWorker = worker;
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const onMessage = ({ data }: MessageEvent) => {
        if (data.id !== id) return;
        if (data.type === 'progress')
          progress.value = { status: data.status, message: data.message, progress: data.progress };
        if (data.type === 'result') {
          activeWorker.removeEventListener('message', onMessage);
          progress.value = { status: 'idle', message: '' };
          const words = data.words as CaptionWord[];
          resolve({ words, sentences: sentencesFromWords(words) });
        }
        if (data.type === 'error') {
          activeWorker.removeEventListener('message', onMessage);
          progress.value = { status: 'error', message: data.message };
          reject(new Error(data.message));
        }
      };
      activeWorker.addEventListener('message', onMessage);
      activeWorker.postMessage(
        { type: 'transcribe', id, model, audio: input.samples, sampleRate: input.sampleRate, locale: locale.value },
        [input.samples.buffer],
      );
    });
  };
  onBeforeUnmount(() => worker?.terminate());
  return { progress, transcribe };
}

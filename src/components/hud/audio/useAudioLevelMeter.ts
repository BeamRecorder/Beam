import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

export function useAudioLevelMeter(
  isEnabled: Ref<boolean>,
  sourceId?: Ref<string | undefined>,
  isSystemAudio = false
) {
  const level = ref(0);
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;
  let animId: number | null = null;
  let lifecycle = 0;

  const stop = () => {
    lifecycle += 1;
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close().catch(() => undefined);
      audioCtx = null;
    }
    level.value = 0;
  };

  const start = async () => {
    stop();
    if (!isEnabled.value) return;
    const requestLifecycle = lifecycle;

    try {
      let nextStream: MediaStream;
      if (isSystemAudio) {
        if (!navigator.mediaDevices?.getDisplayMedia) return;
        nextStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        nextStream.getVideoTracks().forEach((t) => t.stop());
      } else {
        if (!navigator.mediaDevices?.getUserMedia) return;
        let rawId = sourceId?.value;
        if (rawId && rawId.startsWith('microphone:chromium:')) {
          rawId = rawId.replace('microphone:chromium:', '');
        }
        const constraints: MediaStreamConstraints = {
          audio: rawId && rawId !== 'no-audio' ? { deviceId: { exact: rawId } } : true,
          video: false,
        };
        nextStream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      if (requestLifecycle !== lifecycle || !isEnabled.value || !nextStream.getAudioTracks().length) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = nextStream;

      audioCtx = new AudioContext();
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.6;
      sourceNode.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const tick = () => {
        if (!analyser || !isEnabled.value) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const targetLevel = Math.min(1, Math.max(0, avg / 50));
        level.value = level.value * 0.35 + targetLevel * 0.65;

        animId = requestAnimationFrame(tick);
      };

      tick();
    } catch {
      stop();
    }
  };

  watch(
    [isEnabled, () => sourceId?.value],
    () => {
      if (isEnabled.value) {
        void start();
      } else {
        stop();
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    stop();
  });

  return { level };
}
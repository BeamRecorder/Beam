import { onUnmounted, ref, watch } from "vue";

export interface UseCanvasVideoElementOptions {
  videoSrc: () => string;
  isPlaying: () => boolean;
  sourceTime: () => number;
  playbackRate: () => number;
  onDurationChange: (duration: number) => void;
  onRenderOnce: () => void;
}

export function useCanvasVideoElement(options: UseCanvasVideoElementOptions) {
  const videoEl = document.createElement("video");
  videoEl.muted = true;
  videoEl.preload = "auto";
  videoEl.playsInline = true;
  const videoError = ref<string | null>(null);
  const isVideoFrameReady = ref(false);
  let pendingSeekTime: number | null = null;

  const seek = (targetTime: number) => {
    if (!Number.isFinite(targetTime)) return;
    if (videoEl.seeking) { pendingSeekTime = targetTime; return; }
    if (Math.abs(videoEl.currentTime - targetTime) > .005) videoEl.currentTime = targetTime;
  };
  const onMetadata = () => {
    if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) options.onDurationChange(Math.ceil(videoEl.duration));
  };
  const onReady = () => { isVideoFrameReady.value = true; options.onRenderOnce(); };
  const onError = () => { isVideoFrameReady.value = false; videoError.value = "Unable to load this video file."; };
  const onSeeked = () => {
    if (pendingSeekTime !== null) { const next = pendingSeekTime; pendingSeekTime = null; seek(next); }
    else if (options.isPlaying() && videoEl.paused) void videoEl.play().catch(() => undefined);
    options.onRenderOnce();
  };
  const render = () => options.onRenderOnce();

  videoEl.addEventListener("loadedmetadata", onMetadata);
  videoEl.addEventListener("loadeddata", onReady);
  videoEl.addEventListener("canplay", onReady);
  videoEl.addEventListener("seeked", onSeeked);
  videoEl.addEventListener("playing", render);
  videoEl.addEventListener("pause", render);
  videoEl.addEventListener("seeking", render);
  videoEl.addEventListener("waiting", render);
  videoEl.addEventListener("error", onError);

  const load = () => {
    videoError.value = null;
    isVideoFrameReady.value = false;
    videoEl.pause();
    videoEl.src = options.videoSrc() || "";
    videoEl.load();
  };
  watch(() => options.videoSrc(), load, { immediate: true });
  watch(() => options.playbackRate(), (rate) => { videoEl.playbackRate = rate; }, { immediate: true });
  watch(() => options.isPlaying(), (playing) => {
    options.onRenderOnce();
    if (!playing) { videoEl.pause(); return; }
    seek(options.sourceTime());
    void videoEl.play().catch((error) => console.error("Failed to play video element:", error));
  });
  watch(() => options.sourceTime(), (target) => {
    const clamped = Math.max(0, Math.min(videoEl.duration || target, target));
    const drift = Math.abs(videoEl.currentTime - clamped);
    if (drift > (options.isPlaying() ? 1.5 : .005)) seek(clamped);
    options.onRenderOnce();
  });

  onUnmounted(() => {
    videoEl.pause();
    videoEl.removeEventListener("loadedmetadata", onMetadata);
    videoEl.removeEventListener("loadeddata", onReady);
    videoEl.removeEventListener("canplay", onReady);
    videoEl.removeEventListener("seeked", onSeeked);
    videoEl.removeEventListener("playing", render);
    videoEl.removeEventListener("pause", render);
    videoEl.removeEventListener("seeking", render);
    videoEl.removeEventListener("waiting", render);
    videoEl.removeEventListener("error", onError);
    videoEl.removeAttribute("src");
    videoEl.load();
  });

  return { videoEl, videoError, isVideoFrameReady, resetVideoState: load };
}

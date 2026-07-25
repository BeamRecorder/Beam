import { ref, computed, watch, onUnmounted } from "vue";
import type { ProjectEditorData } from "~/api/types/capture-session";

export interface UseCanvasVideoElementOptions {
  videoSrc: () => string;
  editorData: () => ProjectEditorData | null | undefined;
  isPlaying: () => boolean;
  currentTime: () => number;
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

  const effectiveVideoSrc = computed(
    () => options.editorData()?.videoSrc || options.videoSrc(),
  );

  const handleVideoMetadata = () => {
    if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
      options.onDurationChange(Math.ceil(videoEl.duration));
    }
  };

  const handleVideoFrameReady = () => {
    isVideoFrameReady.value = true;
    options.onRenderOnce();
  };

  const handleVideoError = () => {
    isVideoFrameReady.value = false;
    videoError.value = "Unable to load this video file.";
  };

  const handleVideoSeeked = () => {
    if (options.isPlaying() && videoEl.paused) {
      videoEl.play().catch(() => undefined);
    }
    options.onRenderOnce();
  };

  videoEl.addEventListener("loadedmetadata", handleVideoMetadata);
  videoEl.addEventListener("loadeddata", handleVideoFrameReady);
  videoEl.addEventListener("canplay", handleVideoFrameReady);
  videoEl.addEventListener("seeked", handleVideoSeeked);
  videoEl.addEventListener("error", handleVideoError);

  const loadVideo = () => {
    videoError.value = null;
    isVideoFrameReady.value = false;
    videoEl.pause();
    videoEl.currentTime = 0;
    videoEl.src = effectiveVideoSrc.value ?? "";
    videoEl.load();
  };

  watch(effectiveVideoSrc, loadVideo, { immediate: true });

  watch(
    () => options.isPlaying(),
    (playing) => {
      options.onRenderOnce();
      if (playing) {
        videoEl
          .play()
          .catch((error) =>
            console.error("Failed to play video element:", error),
          );
      } else {
        videoEl.pause();
      }
    },
  );

  watch(
    () => options.currentTime(),
    (time) => {
      const clampedTime = Math.max(0, Math.min(videoEl.duration || 0, time));
      if (Math.abs(videoEl.currentTime - clampedTime) > 0.05) {
        videoEl.currentTime = clampedTime;
      }
      options.onRenderOnce();
    },
  );

  onUnmounted(() => {
    videoEl.pause();
    videoEl.removeEventListener("loadedmetadata", handleVideoMetadata);
    videoEl.removeEventListener("loadeddata", handleVideoFrameReady);
    videoEl.removeEventListener("canplay", handleVideoFrameReady);
    videoEl.removeEventListener("seeked", handleVideoSeeked);
    videoEl.removeEventListener("error", handleVideoError);
    videoEl.src = "";
    videoEl.load();
  });

  return {
    videoEl,
    videoError,
    isVideoFrameReady,
    resetVideoState: loadVideo,
  };
}

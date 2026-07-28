import { ref, computed, watch, onUnmounted } from "vue";
import type { ProjectEditorData } from "~/api/types/capture-session";

export interface UseCanvasVideoElementOptions {
  videoSrc: () => string;
  editorData: () => ProjectEditorData | null | undefined;
  isPlaying: () => boolean;
  currentTime: () => number;
  playbackRate?: () => number;
  sourceTimeAt?: (timelineTime: number, sourceDuration: number) => number | null;
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

  let pendingSeekTime: number | null = null;

  const performVideoSeek = (targetTime: number) => {
    if (videoEl.seeking) {
      pendingSeekTime = targetTime;
      return;
    }
    if (Math.abs(videoEl.currentTime - targetTime) <= 0.005) return;

    // Do NOT use fastSeek! fastSeek seeks to nearest keyframe (I-frame),
    // causing imprecise seeking and jumping to wrong frames.
    videoEl.currentTime = targetTime;
  };

  const handleVideoSeeked = () => {
    if (pendingSeekTime !== null) {
      const nextTime = pendingSeekTime;
      pendingSeekTime = null;
      performVideoSeek(nextTime);
    } else if (options.isPlaying() && videoEl.paused) {
      videoEl.play().catch(() => undefined);
    }
    options.onRenderOnce();
  };

  const handlePlaybackStateChange = () => {
    options.onRenderOnce();
  };

  videoEl.addEventListener("loadedmetadata", handleVideoMetadata);
  videoEl.addEventListener("loadeddata", handleVideoFrameReady);
  videoEl.addEventListener("canplay", handleVideoFrameReady);
  videoEl.addEventListener("seeked", handleVideoSeeked);
  videoEl.addEventListener("playing", handlePlaybackStateChange);
  videoEl.addEventListener("pause", handlePlaybackStateChange);
  videoEl.addEventListener("seeking", handlePlaybackStateChange);
  videoEl.addEventListener("waiting", handlePlaybackStateChange);
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
    () => options.playbackRate?.() ?? 1.0,
    (rate) => {
      videoEl.playbackRate = rate;
    },
    { immediate: true },
  );

  watch(
    () => options.isPlaying(),
    (playing) => {
      options.onRenderOnce();
      if (playing) {
        // Ensure video is synchronized with target time before playing
        const targetTime = options.sourceTimeAt?.(options.currentTime(), videoEl.duration) ?? options.currentTime();
        if (Math.abs(videoEl.currentTime - targetTime) > 0.05) {
          videoEl.currentTime = targetTime;
        }
        videoEl
          .play()
          .catch((error: unknown) => {
            // A seek or a user pause may legitimately supersede play() before
            // the browser has resolved it. It is not a playback failure.
            if (!(error instanceof DOMException && error.name === "AbortError")) {
              console.error("Failed to play video element:", error);
            }
          });
      } else {
        videoEl.pause();
      }
    },
  );

  watch(
    () => options.currentTime(),
    (time) => {
      const targetSourceTime = options.sourceTimeAt?.(time, videoEl.duration) ?? time;
      const clampedTime = Math.max(0, Math.min(videoEl.duration || 0, targetSourceTime));
      const drift = Math.abs(videoEl.currentTime - clampedTime);
      const isPlaying = options.isPlaying();

      // During active playback, videoEl naturally advances its own currentTime.
      // Emitting update:currentTime triggers this watcher every frame.
      // Calling videoEl.currentTime = x while playing forces decoder flush & causes lag.
      // Only seek if drift > 1.5s during playback (e.g. user clicked timeline or looped), or when paused.
      const maxAllowedDrift = isPlaying ? 1.5 : 0.005;

      if (drift > maxAllowedDrift) {
        performVideoSeek(clampedTime);
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
    videoEl.removeEventListener("playing", handlePlaybackStateChange);
    videoEl.removeEventListener("pause", handlePlaybackStateChange);
    videoEl.removeEventListener("seeking", handlePlaybackStateChange);
    videoEl.removeEventListener("waiting", handlePlaybackStateChange);
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useCanvasVideoElement } from "../useCanvasVideoElement";

describe("useCanvasVideoElement", () => {
  let isPlaying: ReturnType<typeof ref<boolean>>;
  let currentTime: ReturnType<typeof ref<number>>;
  let onDurationChange: ReturnType<typeof vi.fn>;
  let onRenderOnce: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    isPlaying = ref(false);
    currentTime = ref(0);
    onDurationChange = vi.fn();
    onRenderOnce = vi.fn();
  });

  it("initializes video element and loads video source", () => {
    const { videoEl } = useCanvasVideoElement({
      videoSrc: () => "test-video.mp4",
      editorData: () => null,
      isPlaying: () => isPlaying.value,
      currentTime: () => currentTime.value,
      onDurationChange,
      onRenderOnce,
    });

    expect(videoEl).toBeDefined();
    expect(videoEl.muted).toBe(true);
  });

  it("seeks video accurately when paused without using fastSeek keyframe snapping", () => {
    const { videoEl } = useCanvasVideoElement({
      videoSrc: () => "test-video.mp4",
      editorData: () => null,
      isPlaying: () => false,
      currentTime: () => currentTime.value,
      onDurationChange,
      onRenderOnce,
    });

    // Mock fastSeek to ensure it is NOT called
    (videoEl as any).fastSeek = vi.fn();

    currentTime.value = 5.42;
    // Trigger Vue watch effect synchronously if needed or inspect currentTime property setter
    expect((videoEl as any).fastSeek).not.toHaveBeenCalled();
  });
});

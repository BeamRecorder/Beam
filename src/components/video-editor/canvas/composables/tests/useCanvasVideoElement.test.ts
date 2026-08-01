import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasVideoElement, type UseCanvasVideoElementOptions } from "../useCanvasVideoElement";

describe("useCanvasVideoElement", () => {
  let wrapper: VueWrapper | undefined;
  let pause: ReturnType<typeof vi.spyOn>;
  let load: ReturnType<typeof vi.spyOn>;
  let play: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  const mountComposable = (overrides: Partial<UseCanvasVideoElementOptions> = {}) => {
    const isPlaying = ref(false);
    const sourceTime = ref(0);
    const playbackRate = ref(1);
    let state: ReturnType<typeof useCanvasVideoElement>;
    const options: UseCanvasVideoElementOptions = {
      videoSrc: () => "test-video.mp4",
      isPlaying: () => isPlaying.value,
      sourceTime: () => sourceTime.value,
      playbackRate: () => playbackRate.value,
      onDurationChange: vi.fn(),
      onRenderOnce: vi.fn(),
      ...overrides,
    };
    const host = defineComponent({
      setup() {
        state = useCanvasVideoElement(options);
        return () => h("div");
      },
    });
    wrapper = mount(host);
    return { isPlaying, sourceTime, playbackRate, options, get state() { return state; } };
  };

  it("loads the source with muted inline playback and applies the playback rate", () => {
    const mounted = mountComposable();
    expect(mounted.state.videoEl.src).toContain("test-video.mp4");
    expect(mounted.state.videoEl.muted).toBe(true);
    expect(mounted.state.videoEl.playsInline).toBe(true);
    expect(mounted.state.videoEl.playbackRate).toBe(1);
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });

  it("updates duration, readiness and errors from media events", () => {
    const onDurationChange = vi.fn();
    const mounted = mountComposable({ onDurationChange });
    Object.defineProperty(mounted.state.videoEl, "duration", { configurable: true, value: 2.2 });
    mounted.state.videoEl.dispatchEvent(new Event("loadedmetadata"));
    mounted.state.videoEl.dispatchEvent(new Event("loadeddata"));
    expect(onDurationChange).toHaveBeenCalledWith(3);
    expect(mounted.state.isVideoFrameReady.value).toBe(true);
    mounted.state.videoEl.dispatchEvent(new Event("error"));
    expect(mounted.state.isVideoFrameReady.value).toBe(false);
    expect(mounted.state.videoError.value).toBe("Unable to load this video file.");
  });

  it("seeks while paused and starts playback from the source time when requested", async () => {
    const mounted = mountComposable();
    mounted.sourceTime.value = 5.42;
    await nextTick();
    expect(mounted.state.videoEl.currentTime).toBeCloseTo(5.42);
    mounted.isPlaying.value = true;
    await nextTick();
    expect(play).toHaveBeenCalled();
  });

  it("defers a seek while the element is already seeking and resumes it after seeked", async () => {
    const mounted = mountComposable();
    Object.defineProperty(mounted.state.videoEl, "seeking", { configurable: true, value: true });
    mounted.sourceTime.value = 8;
    await nextTick();
    expect(mounted.state.videoEl.currentTime).not.toBe(8);
    Object.defineProperty(mounted.state.videoEl, "seeking", { configurable: true, value: false });
    mounted.state.videoEl.dispatchEvent(new Event("seeked"));
    expect(mounted.state.videoEl.currentTime).toBe(8);
  });
});

import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompositionMedia } from "../useCompositionMedia";
import type { ClipComposition, CaptionClip, VisualClip } from "../../../composition/composition-types";

const appearance = {
  cornerRadius: "sm" as const, shadowSize: "md" as const, shadowColor: "#000", shadowDirection: "bottom" as const,
  borderEnabled: true, borderColor: "#f00", borderWidth: 2, frame: "none" as const, frameTitle: "",
  frameColor: "#c0c0c0", frameShowMenu: true, frameShowScrollbars: true,
};

const visual = (kind: "image" | "video" | "webcam", id: string, assetId: string, order: number): VisualClip => ({
  id, kind, name: id, assetId, timelineStartMs: 0, timelineDurationMs: 2_000, sourceInMs: 100,
  sourceDurationMs: 1_000, playbackRate: 1.5, enabled: true, order, transform: { x: .1, y: .2, width: .5, height: .4 },
  crop: { x: .1, y: .1, width: .8, height: .8 }, appearance, isMirrored: true,
});

const caption = (): CaptionClip => ({
  id: "caption", kind: "caption", name: "Caption", timelineStartMs: 0, timelineDurationMs: 2_000,
  sourceInMs: 0, sourceDurationMs: 2_000, playbackRate: 1, enabled: true, order: 5,
  transform: { x: .2, y: .3, width: .6, height: .2 },
  caption: {
    sentences: [{ id: "sentence", text: "Hello", startMs: 200, endMs: 900, words: [] }],
    style: { color: "#fff", fontSize: 32, shadowColor: "#000", shadowBlur: 4, placement: "center", boxColor: "#111", boxPadding: 8 },
  },
});

const composition = (): ClipComposition => ({
  schemaVersion: 1,
  assets: [
    { id: "image-asset", kind: "image", name: "Image", fileName: "image.png", durationMs: 2_000, width: 100, height: 80, src: "image.png", origin: "project" },
    { id: "video-asset", kind: "video", name: "Video", fileName: "video.mp4", durationMs: 2_000, width: 640, height: 360, src: "video.mp4", origin: "project" },
    { id: "webcam-asset", kind: "video", name: "Webcam", fileName: "camera.mp4", durationMs: 2_000, width: 320, height: 240, src: "camera.mp4", origin: "session" },
    { id: "sound-asset", kind: "audio", name: "Sound", fileName: "sound.wav", durationMs: 2_000, width: null, height: null, src: "sound.wav", origin: "project" },
  ],
  clips: [visual("image", "image", "image-asset", 1), visual("video", "video", "video-asset", 2), visual("webcam", "webcam", "webcam-asset", 3), caption()],
});

const context = () => ({
  save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), clip: vi.fn(), fill: vi.fn(),
  drawImage: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
  translate: vi.fn(), scale: vi.fn(), fillStyle: "", strokeStyle: "", lineWidth: 0, shadowColor: "", shadowBlur: 0,
  font: "", textAlign: "", textBaseline: "", lineJoin: "",
}) as unknown as CanvasRenderingContext2D;

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCompositionMedia>;

const mountComposable = (initialComposition = composition()) => {
  const compositionRef = ref(initialComposition);
  const currentTime = ref(.5);
  const isPlaying = ref(false);
  const selected = ref<VisualClip | CaptionClip | null>(null);
  const draft = ref<VisualClip["transform"] | null>(null);
  const onRenderOnce = vi.fn();
  const Harness = defineComponent({
    setup() {
      state = useCompositionMedia({
        composition: () => compositionRef.value,
        currentTime: () => currentTime.value,
        isPlaying: () => isPlaying.value,
        selectedTransformClip: () => selected.value,
        transformDraft: () => draft.value,
        isCropping: () => false,
        onRenderOnce,
      });
      return () => h("div");
    },
  });
  wrapper = mount(Harness);
  return { compositionRef, currentTime, isPlaying, selected, draft, onRenderOnce };
};

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_METADATA });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe("useCompositionMedia", () => {
  it("reconciles image/video assets, ignores audio, and disposes replaced videos", async () => {
    const mounted = mountComposable();
    expect(state.images.has("image-asset")).toBe(true);
    expect(state.videos.has("video-asset")).toBe(true);
    expect(state.videos.has("webcam-asset")).toBe(true);
    expect(state.images.has("sound-asset")).toBe(false);

    const video = state.videos.get("video-asset")!;
    const removeAttribute = vi.spyOn(video, "removeAttribute");
    mounted.compositionRef.value = {
      ...mounted.compositionRef.value,
      assets: [mounted.compositionRef.value.assets[0]],
    };
    await nextTick();
    expect(state.videos.has("video-asset")).toBe(false);
    expect(removeAttribute).toHaveBeenCalledWith("src");
    expect(video.pause).toHaveBeenCalled();

    mounted.compositionRef.value = {
      ...mounted.compositionRef.value,
      assets: [{ ...mounted.compositionRef.value.assets[0], id: "empty", src: "" }],
    };
    await nextTick();
    expect(state.images.has("empty")).toBe(false);
  });

  it("syncs active videos while paused or playing and handles pending seeks", async () => {
    const mounted = mountComposable();
    const video = state.videos.get("video-asset")!;
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 0 });
    Object.defineProperty(video, "seeking", { configurable: true, writable: true, value: false });

    mounted.currentTime.value = .51;
    await nextTick();
    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBeCloseTo(.865, 2);

    mounted.isPlaying.value = true;
    await nextTick();
    expect(video.play).toHaveBeenCalled();

    Object.defineProperty(video, "seeking", { configurable: true, writable: true, value: true });
    mounted.isPlaying.value = false;
    mounted.currentTime.value = 1;
    await nextTick();
    Object.defineProperty(video, "seeking", { configurable: true, writable: true, value: false });
    video.dispatchEvent(new Event("seeked"));
    expect(video.currentTime).toBeCloseTo(1.6, 2);

    mounted.currentTime.value = 4;
    await nextTick();
    expect(video.pause).toHaveBeenCalled();
  });

  it("draws captions, images, videos and webcams with selection drafts and crop rules", async () => {
    const mounted = mountComposable();
    const image = state.images.get("image-asset")!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 80 },
    });
    const video = state.videos.get("video-asset")!;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_METADATA },
      videoWidth: { configurable: true, value: 640 },
      videoHeight: { configurable: true, value: 360 },
      currentTime: { configurable: true, writable: true, value: .2 },
    });
    const webcam = state.videos.get("webcam-asset")!;
    Object.defineProperties(webcam, {
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_METADATA },
      videoWidth: { configurable: true, value: 320 },
      videoHeight: { configurable: true, value: 240 },
    });
    const ctx = context();
    const bounds = { dx: 10, dy: 20, dw: 800, dh: 400, scale: 1 };

    state.drawComposition(ctx, bounds, 800, "image");
    state.drawComposition(ctx, bounds, 800, "video");
    state.drawComposition(ctx, bounds, 800);
    state.drawWebcamClips(ctx, bounds);
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith("Hello", expect.any(Number), expect.any(Number), expect.any(Number));
    expect(ctx.translate).toHaveBeenCalled();

    mounted.selected.value = mounted.compositionRef.value.clips.find((clip) => clip.id === "image") as VisualClip;
    mounted.draft.value = { x: .4, y: .4, width: .2, height: .2 };
    await nextTick();
    state.drawComposition(ctx, bounds, 800, "image");
    expect(ctx.drawImage).toHaveBeenCalled();

    mounted.compositionRef.value = {
      ...mounted.compositionRef.value,
      clips: mounted.compositionRef.value.clips.filter((clip) => clip.id !== "video"),
    };
    await nextTick();
    state.drawComposition(ctx, bounds, 800, "video");
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it("renders custom captions and cleans up every media element on unmount", async () => {
    const custom = composition();
    const clip = custom.clips.find((item) => item.kind === "caption") as CaptionClip;
    clip.caption.sentences = [];
    clip.caption.style.customText = "Custom";
    clip.caption.style.boxColor = "transparent";
    clip.caption.style.shadowBlur = 0;
    mountComposable(custom);
    const ctx = context();
    state.drawComposition(ctx, { dx: 0, dy: 0, dw: 800, dh: 400 }, 800);
    expect(ctx.fillText).toHaveBeenCalledWith("Custom", expect.any(Number), expect.any(Number), expect.any(Number));
    wrapper?.unmount();
    wrapper = undefined;
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});

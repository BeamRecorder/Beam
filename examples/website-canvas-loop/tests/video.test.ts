import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  canDecode: vi.fn(),
  canvas: vi.fn(),
  track: vi.fn(),
}));
vi.mock("../src/catalog", () => ({ VIDEO: { url: "/frozen/wispysky.mp4" } }));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BufferSource: class {},
  Input: class {
    getPrimaryVideoTrack = mocks.track;
    dispose = mocks.dispose;
  },
  CanvasSink: class {
    getCanvas = mocks.canvas;
  },
}));
import { createVideoBackground } from "../src/video";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function source() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  mocks.track.mockResolvedValue({
    canDecode: mocks.canDecode,
    getCodec: async () => "avc",
  });
  mocks.canDecode.mockResolvedValue(true);
  mocks.canvas.mockResolvedValue({ canvas: { id: "frame" } });
}
describe("owned Mediabunny wallpaper", () => {
  it("returns the decoded canvas and disposes the owned input", async () => {
    source();
    const provider = await createVideoBackground();
    expect(await provider.frame(1.2)).toEqual({ id: "frame" });
    expect(mocks.canvas).toHaveBeenCalledWith(1.2);
    provider.dispose();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
  it.each([
    [-1, 0],
    [0, 0],
    [20, 7.9],
  ])("bounds source time %s", async (time, expected) => {
    source();
    const provider = await createVideoBackground();
    await provider.frame(time);
    expect(mocks.canvas).toHaveBeenCalledWith(expected);
    provider.dispose();
  });
  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite source time %s",
    async (time) => {
      source();
      const provider = await createVideoBackground();
      await expect(provider.frame(time)).rejects.toThrow("finite");
      expect(mocks.canvas).not.toHaveBeenCalled();
      provider.dispose();
    },
  );
  it.each(["missing", "unsupported", "broken"])(
    "releases input after a %s video track",
    async (kind) => {
      source();
      if (kind === "missing") mocks.track.mockResolvedValue(null);
      if (kind === "unsupported") mocks.canDecode.mockResolvedValue(false);
      if (kind === "broken")
        mocks.track.mockRejectedValue(new Error("Invalid media"));
      await expect(createVideoBackground()).rejects.toThrow();
      expect(mocks.dispose).toHaveBeenCalledOnce();
    },
  );
  it("fails explicitly when the local file does not load", async () => {
    source();
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(createVideoBackground()).rejects.toThrow("could not load");
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it("fails explicitly if decoding returns no frame", async () => {
    source();
    mocks.canvas.mockResolvedValue(null);
    const provider = await createVideoBackground();
    await expect(provider.frame(0)).rejects.toThrow("No wallpaper frame");
    provider.dispose();
  });
});

import { ALL_FORMATS, BufferSource, CanvasSink, Input } from "mediabunny";
export async function decodeVideo(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Frozen recording failed to load: ${url}`);
  const input = new Input({
    source: new BufferSource(await response.arrayBuffer()),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new Error("The frozen H.264 recording cannot be decoded.");
    const sink = new CanvasSink(track, {
      poolSize: 2,
      decoderOptions: {
        hardwareAcceleration: "prefer-software",
        optimizeForLatency: false,
      },
    });
    return {
      width: track.displayWidth,
      height: track.displayHeight,
      async frame(time: number) {
        if (!Number.isFinite(time))
          throw new RangeError("Source time must be finite.");
        const wrapped = await sink.getCanvas(Math.max(0, time));
        if (!wrapped) throw new Error(`No recorded frame at ${time}s.`);
        return wrapped.canvas;
      },
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

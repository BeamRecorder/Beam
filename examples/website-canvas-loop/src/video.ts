import { ALL_FORMATS, BufferSource, CanvasSink, Input } from 'mediabunny';
import { VIDEO } from './catalog';

export async function createVideoBackground() {
  const response = await fetch(VIDEO.url);
  if (!response.ok) throw new Error('The frozen video wallpaper could not load.');
  const input = new Input({
    source: new BufferSource(await response.arrayBuffer()),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('The video wallpaper cannot be decoded.');
    const sink = new CanvasSink(track, {
      width: 640,
      height: 400,
      fit: 'cover',
      poolSize: 2,
      // This small frozen H.264 wallpaper stays deterministic even on Linux
      // drivers which advertise a decoder but reject later packets.
      decoderOptions: {
        hardwareAcceleration: 'prefer-software',
        optimizeForLatency: false,
      },
    });
    return {
      async frame(time: number) {
        if (!Number.isFinite(time)) throw new RangeError('Wallpaper time must be finite.');
        const wrapped = await sink.getCanvas(Math.max(0, Math.min(7.9, time)));
        if (!wrapped) throw new Error('No wallpaper frame is available.');
        return wrapped.canvas;
      },
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

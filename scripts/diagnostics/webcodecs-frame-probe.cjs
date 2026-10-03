// Serialized into an isolated, sandboxed Chromium page. No Electron or Node API.
async function probeFrames(profile, input, acceleration) {
  const config = {
    codec: profile.codec,
    width: profile.width,
    height: profile.height,
    framerate: profile.framerate,
    bitrate: profile.bitrate,
    bitrateMode: profile.bitrateMode,
    hardwareAcceleration: acceleration,
    latencyMode: 'quality',
  };
  const result = {
    config,
    input,
    supported: false,
    status: 'failed',
    submittedFrames: 0,
    packets: 0,
    bytes: 0,
    frameFormat: null,
    error: null,
  };
  let encoder;
  try {
    result.supported = (await VideoEncoder.isConfigSupported(config)).supported;
    if (!result.supported) return { ...result, status: 'unsupported' };
    const canvas = new OffscreenCanvas(profile.width, profile.height);
    const context =
      input === 'cpu'
        ? canvas.getContext('2d', { willReadFrequently: true })
        : canvas.getContext('webgl2', { alpha: false, preserveDrawingBuffer: true });
    if (!context) throw new Error(`Unable to create ${input} canvas context.`);
    encoder = new VideoEncoder({
      output(chunk) {
        result.packets++;
        result.bytes += chunk.byteLength;
      },
      error(error) {
        result.error = String(error);
      },
    });
    encoder.configure(config);
    const started = performance.now();
    for (let index = 0; index < profile.frames; index++) {
      // Bound outstanding images. This is a functional probe, not a benchmark.
      while (encoder.encodeQueueSize >= 4 && encoder.state === 'configured') {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      if (input === 'cpu') {
        context.fillStyle = `rgb(${(index * 7) % 256},100,200)`;
        context.fillRect(0, 0, profile.width, profile.height);
      } else {
        context.clearColor(index / profile.frames, 0.4, 0.8, 1);
        context.clear(context.COLOR_BUFFER_BIT);
      }
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((index * 1_000_000) / profile.framerate),
        duration: Math.round(1_000_000 / profile.framerate),
      });
      try {
        if (index === 0) result.frameFormat = frame.format;
        encoder.encode(frame, { keyFrame: index === 0 });
        result.submittedFrames++;
      } finally {
        frame.close();
      }
    }
    await encoder.flush();
    result.elapsedMs = performance.now() - started;
    if (result.packets !== profile.frames || !result.bytes || result.error) {
      throw new Error(result.error ?? `Expected ${profile.frames} packets, received ${result.packets}.`);
    }
    result.status = 'encoded';
  } catch (error) {
    result.error ??= String(error);
  } finally {
    if (encoder && encoder.state !== 'closed') encoder.close();
  }
  return result;
}

module.exports = { probeFrames };

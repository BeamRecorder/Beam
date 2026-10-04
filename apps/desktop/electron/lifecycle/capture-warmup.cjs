async function prewarmCaptureCapabilities(engine, { platform = process.platform, log = () => {} } = {}) {
  // Linux capability discovery only probes Portal/PipeWire availability and
  // encoders. Start Rust's cached FFmpeg probe while Chromium loads the HUD.
  // Other platforms can involve screen-access permission UI during discovery.
  if (platform !== 'linux') return;
  try {
    await engine.request('capabilities');
  } catch (error) {
    // The HUD's normal discovery remains authoritative and can retry startup.
    log(`Capture warmup failed: ${error.message}`);
  }
}

module.exports = { prewarmCaptureCapabilities };

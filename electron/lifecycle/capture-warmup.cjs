async function prewarmCaptureCapabilities(engine, { platform = process.platform, log = () => {} } = {}) {
  // Linux capability discovery probes Portal/PipeWire availability without
  // opening the picker or starting a media producer.
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

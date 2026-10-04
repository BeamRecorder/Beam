const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createExperimentalGpuExport } = require('@beam/electron-export');
const directory = process.env.BEAM_TEST_DIRECTORY;
const format = process.env.BEAM_TEST_FORMAT || 'mp4';
app.setPath('userData', path.join(directory, 'profile'));
app.on('window-all-closed', () => {});
const request = JSON.parse(
  fs.readFileSync(process.env.BEAM_TEST_REQUEST || path.join(__dirname, 'request.json'), 'utf8'),
);
request.format = format;
request.nativeBitrate = 3_000_000;
if (process.env.BEAM_TEST_FPS) {
  const fps = Number(process.env.BEAM_TEST_FPS);
  const count = Number(process.env.BEAM_TEST_FRAMES);
  const clips = request.snapshot.composition.clips;
  request.snapshot.canvas.width = 1920;
  request.snapshot.canvas.height = 1080;
  request.snapshot.render.fps = fps;
  request.snapshot.duration = count / fps;
  // Beam clips have a 40 ms minimum; hold each color for six 60 fps frames.
  request.snapshot.composition.clips = Array.from({ length: Math.ceil((count * 10) / fps) }, (_, index) => ({
    ...clips[index % clips.length],
    id: String(index),
    trackId: String(index),
    timelineStartMs: index * 100,
    timelineDurationMs: 100,
    sourceDurationMs: 100,
  }));
}
if (process.env.BEAM_TEST_4K === '1') {
  request.snapshot.canvas.width = 3840;
  request.snapshot.canvas.height = 2160;
}
let mediaBytes;
let mediaType = 'audio/wav';
if (process.env.BEAM_TEST_VIDEO === '1') {
  mediaBytes = fs.readFileSync(path.join(directory, 'source.mp4'));
  mediaType = 'video/mp4';
  request.snapshot.canvas.width = 1920;
  request.snapshot.canvas.height = 1080;
  request.snapshot.composition.assets = [
    {
      id: 'video',
      kind: 'video',
      name: 'Video',
      fileName: null,
      durationMs: 1200,
      width: 3840,
      height: 2160,
      origin: 'project',
      src: '',
    },
  ];
  request.snapshot.composition.clips = [
    {
      ...request.snapshot.composition.clips[0],
      kind: 'video',
      assetId: 'video',
      timelineDurationMs: 1200,
      sourceDurationMs: 1200,
      isMirrored: false,
      isMirroredY: false,
      appearance: {
        cornerRadius: 'none',
        shadowSize: 'none',
        shadowBlur: 0,
        shadowMode: 'solid',
        shadowColor: '#000000',
        shadowDirection: 'all',
        borderEnabled: false,
        borderColor: '#000000',
        borderWidth: 0,
        frame: 'none',
        frameTitle: '',
        frameColor: '#c0c0c0',
        frameShowMenu: false,
        frameShowScrollbars: false,
        frameChromeScale: 1,
      },
    },
  ];
}
if (process.env.BEAM_TEST_AUDIO === '1') {
  const frames = Math.ceil(request.snapshot.duration * 48000);
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(192000, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame++) {
    wav.writeInt16LE(Math.round(6500 * Math.sin((frame * 2 * Math.PI * 440) / 48000)), 44 + frame * 4);
    wav.writeInt16LE(Math.round(3200 * Math.sin((frame * 2 * Math.PI * 660) / 48000)), 46 + frame * 4);
  }
  request.includeAudio = true;
  mediaBytes = wav;
  request.snapshot.composition.assets.push({
    id: 'tone',
    kind: 'audio',
    name: 'Tone',
    fileName: null,
    durationMs: 1200,
    width: null,
    height: null,
    origin: 'project',
    src: '',
  });
  request.snapshot.composition.clips.push({
    id: 'audio',
    kind: 'audio',
    name: 'Tone',
    assetId: 'tone',
    role: 'imported',
    volume: 100,
    enabled: true,
    order: 20,
    timelineStartMs: 0,
    timelineDurationMs: 1200,
    sourceInMs: 0,
    sourceDurationMs: 1200,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
  });
}
if (process.env.BEAM_TEST_CANCEL === '1') request.snapshot.duration = 60;
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  app.exit(2);
}, 25000);
app
  .whenReady()
  .then(async () => {
    if (mediaBytes) {
      const server = http.createServer((_request, response) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Content-Type', mediaType);
        response.setHeader('Content-Length', mediaBytes.length);
        response.end(mediaBytes);
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      request.snapshot.composition.assets[0].src = `http://127.0.0.1:${server.address().port}/media`;
    }
    const service = createExperimentalGpuExport({
      ipcMain,
      BrowserWindow,
      nativeDirectory: path.resolve(__dirname, '../../../build/native/ffmpeg-export'),
      renderer: {
        url:
          process.env.BEAM_TEST_RENDERER_PAGE ||
          `${process.env.BEAM_TEST_RENDERER_URL || 'http://localhost:6500'}/html/export-gpu.html`,
      },
    });
    const job = { id: 'hardware-test', temporaryPath: path.join(directory, `result.${format}`) };
    const owner = {
      send: (_channel, event) => {
        if (process.env.BEAM_TEST_CANCEL === '1' && event.progress.completedImages > 0) job.cancel();
      },
    };
    try {
      const result = await service.run(owner, job, request);
      fs.writeFileSync(path.join(directory, 'diagnostics.json'), JSON.stringify(result));
      console.log('BEAM_HARDWARE_TEST_OK');
      app.exit(0);
    } catch (error) {
      console.error(error.message);
      app.exit(process.env.BEAM_TEST_CANCEL === '1' && /cancelled/.test(error.message) ? 0 : 1);
    } finally {
      if (!timedOut) clearTimeout(timer);
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

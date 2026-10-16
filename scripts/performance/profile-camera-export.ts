import { createServer, build as buildBrowser } from 'vite';
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { chromiumExecutable } from '../../apps/cli/src/chromium-install';
import { chromiumSettings } from '../../apps/cli/src/chromium-settings';

const [directory, label = 'trial', mode = 'orbit', repetitions = '1'] = process.argv.slice(2);
if (!directory || !['orbit', 'flat'].includes(mode))
  throw new Error('Usage: bun scripts/performance/profile-camera-export.ts OUTPUT LABEL orbit|flat [REPEATS]');
const root = process.cwd();
await mkdir(directory, { recursive: true });
const bundlePath = process.env.BEAM_PROFILE_BUNDLE ?? resolve(directory, `${label}-bundle.js`);
if (!process.env.BEAM_PROFILE_BUNDLE) {
  const entry = 'virtual:beam-export-profile';
  const built = await buildBrowser({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'profile-bundle',
        resolveId(id) {
          if (id === entry) return entry;
        },
        load(id) {
          if (id === entry)
            return "export {createRenderDocument} from '@beam/engine/document/render-document';export {createDefaultClipAppearance} from '@beam/engine/shared/composition-defaults';export {ORBIT_PRESETS} from '@beam/engine/zoom/orbit-settings';export {openExportAssets} from '@beam/encoder/mediabunny/export-worker-assets';export {renderExportVideo} from '@beam/encoder/mediabunny/export-worker-pipelines';export {selectVideoEncoder} from '@beam/encoder/mediabunny/video-encoder-selection';export {Output,BufferTarget,Mp4OutputFormat,CanvasSource} from 'mediabunny';";
        },
      },
    ],
    build: {
      write: false,
      target: 'esnext',
      minify: false,
      rolldownOptions: {
        input: entry,
        preserveEntrySignatures: 'strict',
        output: { format: 'es', codeSplitting: false },
      },
    },
  });
  const output = Array.isArray(built) ? built[0] : built;
  if (!output || !('output' in output)) throw new Error('Profiling bundle was not produced.');
  const chunk = output.output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
  if (!chunk || chunk.type !== 'chunk') throw new Error('Profiling entry chunk unavailable.');
  await writeFile(bundlePath, chunk.code);
}
await mkdir(resolve(homedir(), '.cache'), { recursive: true });
const temporary = await mkdtemp(resolve(homedir(), '.cache/beam-export-profile-'));
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(temporary, 'vite'),
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'profile-page',
      resolveId(id) {
        if (id === '/beam-profile-bundle.js') return id;
      },
      load(id) {
        if (id === '/beam-profile-bundle.js') return readFile(bundlePath, 'utf8');
      },
      configureServer(server) {
        server.middlewares.use('/beam-profile', (_req, res, next) => {
          if (_req.url !== '' && _req.url !== '/') {
            next();
            return;
          }
          res.setHeader('Content-Type', 'text/html');
          res.end('<!doctype html><title>Beam export profile</title>');
        });
      },
    },
  ],
});
await server.listen();
const address = server.httpServer!.address();
if (!address || typeof address === 'string') throw new Error('No profiling server port.');
const { DISPLAY: _display, WAYLAND_DISPLAY: _wayland, ...environment } = process.env;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
try {
  browser = await puppeteer.launch({
    executablePath: await chromiumExecutable(),
    headless: true,
    pipe: true,
    env: { ...environment, TMPDIR: temporary },
    userDataDir: resolve(temporary, 'profile'),
    args: chromiumSettings().args,
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/beam-profile`);
  const session = await page.createCDPSession();
  const results = [];
  for (let trial = 0; trial < Number(repetitions); trial++) {
    await session.send('Profiler.enable');
    await session.send('Profiler.start');
    const result = await page.evaluate(
      async ({ mode, withCursor }) => {
        const load = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>;
        const { createRenderDocument } = (await load(
          '/beam-profile-bundle.js',
        )) as typeof import('../../packages/engine/src/document/render-document');
        const { createDefaultClipAppearance } = (await load(
          '/beam-profile-bundle.js',
        )) as typeof import('../../packages/engine/src/shared/composition-defaults');
        const { ORBIT_PRESETS } = (await load(
          '/beam-profile-bundle.js',
        )) as typeof import('../../packages/engine/src/zoom/orbit-settings');
        const { openExportAssets } = (await load(
          '/beam-profile-bundle.js',
        )) as typeof import('../../packages/encoder/src/mediabunny/export-worker-assets');
        const { renderExportVideo } = (await load(
          '/beam-profile-bundle.js',
        )) as typeof import('../../packages/encoder/src/mediabunny/export-worker-pipelines');
        const { selectVideoEncoder } = (await load(
          '/beam-profile-bundle.js',
        )) as typeof import('../../packages/encoder/src/mediabunny/video-encoder-selection');
        const { Output, BufferTarget, Mp4OutputFormat, CanvasSource } = (await load(
          '/beam-profile-bundle.js',
        )) as typeof import('mediabunny');
        const snapshot = createRenderDocument(undefined, 1280, 720, 30);
        snapshot.duration = 4;
        snapshot.canvas.showBackground = true;
        snapshot.canvas.watermark!.enabled = false;
        snapshot.background = { kind: 'color', color: '#dae2ec' };
        snapshot.composition.assets = [
          {
            id: 'source',
            kind: 'video',
            name: 'Screen',
            fileName: 'screen.mp4',
            src: '/examples/website-studio-loop/assets/screen-recording.mp4',
            origin: 'project',
            width: 3072,
            height: 1862,
            durationMs: 18116,
          },
        ];
        snapshot.composition.clips = [
          {
            id: 'screen',
            assetId: 'source',
            kind: 'screen',
            name: 'Screen',
            timelineStartMs: 0,
            timelineDurationMs: 4000,
            sourceInMs: 2000,
            sourceDurationMs: 4000,
            playbackRate: 1,
            order: 0,
            enabled: true,
            isMirrored: false,
            isMirroredY: false,
            transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
            appearance: {
              ...createDefaultClipAppearance('screen'),
              shadowSize: 'custom',
              shadowBlur: 32,
              cornerRadius: 18,
              shadowDirection: 'bottom',
              frame: 'safari',
            },
          },
        ];
        snapshot.zooms = [
          {
            id: 'camera',
            sessionId: 'manual',
            startMs: 1000,
            endMs: 2200,
            focus: { cx: 0.5, cy: 0.5 },
            depth: 2,
            mode: 'auto',
            enabled: true,
            effect: 'camera',
            projection: mode === 'orbit' ? 'orbit' : '2d',
            tiltIntensity: 1,
            transition: 'cinematic',
            orbitSettings: { ...ORBIT_PRESETS.find((p) => p.id === 'dynamic')!.settings },
          },
        ];
        snapshot.cursor.telemetry = Array.from({ length: 241 }, (_, i) => ({
          timeMs: (i * 1000) / 60,
          cx: 0.5 + 0.35 * Math.sin(i / 19),
          cy: 0.5 + 0.3 * Math.cos(i / 31),
        }));
        snapshot.zoomMotionBlur = { enabled: true, intensity: 0.8 };
        const cursors = new Map<string, ImageBitmap>();
        if (withCursor) {
          snapshot.cursor.available = true;
          snapshot.cursorSettings.enabled = true;
          snapshot.cursorSettings.motion = { ...snapshot.cursorSettings.motion, model3d: true, motionBlur: 0.8 };
          snapshot.cursorPack = {
            id: 'builtin:macos',
            name: 'macOS',
            source: 'builtin',
            colorMode: 'original',
            defaultCursorId: 'default',
            automaticMap: { default: 'default' },
            cursors: [
              {
                id: 'default',
                label: 'macOS Default',
                url: '/macOsSvgCursors/default.svg',
                format: 'svg',
                intrinsicSize: { width: 32, height: 32 },
                nominalSize: 32,
                hotspot: { x: 10, y: 7 },
              },
            ],
          };
          snapshot.cursor.events = snapshot.cursor.telemetry.map((point) => ({
            event: 'move',
            sessionNs: (point.timeMs + 2000) * 1000000,
            cursorId: 'default',
            pixelX: point.cx * 3072,
            pixelY: point.cy * 1862,
            normalizedX: point.cx,
            normalizedY: point.cy,
            visible: true,
          }));
          const artwork = new Image();
          artwork.src = snapshot.cursorPack.cursors[0]!.url;
          await artwork.decode();
          cursors.set('default', await createImageBitmap(artwork));
        }
        const request = {
          projectName: 'Camera export profile',
          snapshot,
          format: 'mp4' as const,
          preset: 'medium' as const,
          includeAudio: false,
        };
        const controller = new AbortController();
        const start = performance.now();
        const assets = await openExportAssets(request, controller.signal, () => {});
        const canvas = new OffscreenCanvas(1280, 720),
          context = canvas.getContext('2d')!;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        const selection = await selectVideoEncoder({
          format: 'mp4',
          width: 1280,
          height: 720,
          frameRate: 30,
          bitrate: 4000000,
        });
        const target = new BufferTarget(),
          output = new Output({ target, format: new Mp4OutputFormat() });
        let encodedPackets = 0;
        const video = new CanvasSource(canvas, {
          codec: selection.codec,
          quality: selection.quality,
          hardwareAcceleration: selection.hardwareAcceleration,
          latencyMode: 'quality',
          onEncodedPacket: () => {
            encodedPackets++;
          },
        });
        output.addVideoTrack(video, { frameRate: 30 });
        const setupMs = performance.now() - start;
        let count = 0;
        try {
          await output.start();
          const stats = await renderExportVideo(
            request,
            assets,
            new Map(),
            cursors,
            context,
            { addVideo: (time, duration) => video.add(time, duration), closeVideo: () => video.close() },
            controller.signal,
            () => {
              count++;
            },
          );
          const finalizationStart = performance.now();
          await output.finalize();
          const completed = {
            mode,
            withCursor,
            count,
            encodedPackets,
            setupMs,
            stats,
            finalizationMs: performance.now() - finalizationStart,
            totalMs: performance.now() - start,
            bytes: target.buffer?.byteLength,
            selection,
            ua: navigator.userAgent,
          };
          const mp4 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]!);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(new Blob([target.buffer!]));
          });
          return { ...completed, mp4 };
        } finally {
          assets.dispose();
          for (const image of cursors.values()) image.close();
          canvas.width = canvas.height = 0;
        }
      },
      { mode, withCursor: process.env.BEAM_PROFILE_CURSOR === '1' },
    );
    const { profile } = await session.send('Profiler.stop');
    await writeFile(resolve(directory, `${label}-${trial}.cpuprofile`), JSON.stringify(profile));
    const { mp4, ...measurement } = result;
    await writeFile(resolve(directory, `${label}-${trial}.mp4`), Buffer.from(mp4, 'base64'));
    results.push(measurement);
    await writeFile(
      resolve(directory, `${label}.json`),
      JSON.stringify({ browser: await browser.version(), backend: chromiumSettings().args, results }, null, 2),
    );
    process.stdout.write(`${label} ${trial}: ${JSON.stringify(measurement)}\n`);
  }
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await server.close();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

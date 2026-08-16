import type {
  ExportDiagnostics,
  ExportEnvironmentDiagnostics,
  ExportRuntimeDiagnostics,
} from './export-diagnostics-types';
import type { ExportProgress, ExportRequest } from './export-types';
import { bitrateFor } from './export-presets';

type ReportStatus = 'running' | 'completed' | 'failed' | 'cancelled';

const finite = (value: number | null | undefined, suffix = ' ms') =>
  value === null || value === undefined || !Number.isFinite(value) ? 'Unknown' : `${Math.round(value)}${suffix}`;

const duration = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unknown';
  const milliseconds = Math.max(0, Math.round(value));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const millis = milliseconds % 1_000;
  return `${hours ? `${hours.toString().padStart(2, '0')}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
};

const bytes = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unknown';
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KiB`;
  return `${(value / 1_048_576).toFixed(1)} MiB`;
};

const safeFilename = (path: string | undefined) => path?.split(/[/\\]/).pop() || 'Unknown';
const cleanedError = (error: string | undefined) =>
  error
    ? error
        .replace(/file:\/\/\S+/gi, '[redacted-path]')
        .replace(/(?:[A-Za-z]:\\|\/(?:home|Users|tmp)\/)[^\s;]+/g, '[redacted-path]')
    : null;

const dominantBottleneck = (runtime: ExportRuntimeDiagnostics | null) => {
  if (!runtime) return 'Unknown';
  const candidates = [
    ['Video decode', runtime.decodeMs],
    ['Canvas render', runtime.renderMs],
    ['Encoder/backpressure', runtime.encoderBackpressureMs],
    ['IPC/disk wait', runtime.ipcWriteWaitMs],
    ['Audio pipeline', runtime.audioPipelineMs ?? 0],
    ['Asset validation', runtime.validationMs ?? 0],
    ['Asset loading', runtime.assetLoadingMs ?? 0],
    ['Mux finalization', runtime.muxFinalizationMs ?? 0],
    ['Native file sync', runtime.nativeFinalizationMs ?? 0],
  ] as const;
  return candidates.reduce((largest, candidate) => (candidate[1] > largest[1] ? candidate : largest))[0];
};

const webglRenderer = () => {
  try {
    if (typeof WebGLRenderingContext === 'undefined' || navigator.userAgent.includes('jsdom')) return null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!(context instanceof WebGLRenderingContext)) return null;
    const extension = context.getExtension('WEBGL_debug_renderer_info');
    return extension ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null;
  } catch {
    return null;
  }
};

export async function collectExportEnvironment(): Promise<ExportEnvironmentDiagnostics> {
  const getUpdateState = window.capture?.getUpdateState;
  const update = getUpdateState ? await getUpdateState().catch(() => null) : null;
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  return {
    appVersion: update?.currentVersion ?? null,
    platform: window.capture?.platform ?? 'web',
    navigatorPlatform: navigator.platform || 'Unknown',
    userAgent: navigator.userAgent || 'Unknown',
    language: navigator.language || 'Unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    webgpuAvailable: Boolean(nav.gpu),
    webglRenderer: webglRenderer(),
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    videoEncoder: typeof VideoEncoder !== 'undefined',
    videoDecoder: typeof VideoDecoder !== 'undefined',
    audioEncoder: typeof AudioEncoder !== 'undefined',
    audioDecoder: typeof AudioDecoder !== 'undefined',
    hardwareAcceleration: null,
  };
}

export function buildBeamExportReport(options: {
  request: Omit<ExportRequest, 'format' | 'preset'> & Partial<Pick<ExportRequest, 'format' | 'preset'>>;
  format: ExportRequest['format'];
  preset: ExportRequest['preset'];
  status: ReportStatus;
  progress: ExportProgress | null;
  diagnostics: ExportDiagnostics | null;
  outputPath?: string;
  error?: string;
}) {
  const { request, progress, diagnostics } = options;
  const runtime = progress?.diagnostics ?? diagnostics?.runtime ?? null;
  const environment = diagnostics?.environment ?? null;
  const width = request.snapshot.canvas.width;
  const height = request.snapshot.canvas.height;
  const fps = request.snapshot.render.fps;
  const totalFrames = progress?.totalImages ?? Math.max(1, Math.ceil(request.snapshot.duration * fps));
  const completedFrames = progress?.completedImages ?? (options.status === 'completed' ? totalFrames : 0);
  const elapsedMs = runtime?.elapsedMs ?? 0;
  const timelineMs = request.snapshot.duration * 1_000;
  const realtimeSpeed = elapsedMs > 0 ? timelineMs / elapsedMs : null;
  const videoBitrate = bitrateFor(options.preset, width, height, fps);
  const clips = request.snapshot.composition?.clips ?? [];
  const visualClips = clips.filter((clip) => ['screen', 'video', 'image', 'webcam'].includes(clip.kind)).length;
  const audioEnabled = request.includeAudio !== false;
  const audioClips = audioEnabled
    ? clips.filter((clip) => clip.kind === 'audio' && clip.enabled && clip.timelineDurationMs > 0).length
    : 0;
  const audioProgress =
    progress?.audioProgress ?? (options.status === 'completed' ? (audioClips ? 1 : null) : undefined);

  return [
    '=== Beam Export ===',
    `Report Version: 1`,
    `Status: ${options.status}`,
    `Started: ${diagnostics?.startedAt ?? 'Unknown'}`,
    `Completed: ${diagnostics?.completedAt ?? '—'}`,
    `Output File: ${safeFilename(options.outputPath)}`,
    '',
    '--- Application & System ---',
    `Beam Version: ${environment?.appVersion ?? 'Unknown'}`,
    `Platform: ${environment?.platform ?? window.capture?.platform ?? 'Unknown'}`,
    `Navigator Platform: ${environment?.navigatorPlatform ?? navigator.platform ?? 'Unknown'}`,
    `User Agent: ${environment?.userAgent ?? navigator.userAgent ?? 'Unknown'}`,
    `Language: ${environment?.language ?? navigator.language ?? 'Unknown'}`,
    `Timezone: ${environment?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Unknown'}`,
    `CPU Logical Cores: ${environment?.hardwareConcurrency ?? navigator.hardwareConcurrency ?? 'Unknown'}`,
    `Device Memory: ${environment?.deviceMemoryGb ? `${environment.deviceMemoryGb} GiB` : 'Unknown'}`,
    `Screen: ${environment?.screen ?? 'Unknown'}`,
    `Viewport: ${environment?.viewport ?? 'Unknown'}`,
    `Device Pixel Ratio: ${environment?.devicePixelRatio ?? window.devicePixelRatio}`,
    `WebGL Renderer: ${environment?.webglRenderer ?? 'Unknown'}`,
    `WebGPU Available: ${environment?.webgpuAvailable ?? false}`,
    `Hardware Acceleration Used: Unknown (not exposed by Chromium/WebCodecs)`,
    `OffscreenCanvas: ${environment?.offscreenCanvas ?? typeof OffscreenCanvas !== 'undefined'}`,
    `VideoEncoder / VideoDecoder: ${environment?.videoEncoder ?? typeof VideoEncoder !== 'undefined'} / ${environment?.videoDecoder ?? typeof VideoDecoder !== 'undefined'}`,
    `AudioEncoder / AudioDecoder: ${environment?.audioEncoder ?? typeof AudioEncoder !== 'undefined'} / ${environment?.audioDecoder ?? typeof AudioDecoder !== 'undefined'}`,
    '',
    '--- Export Configuration ---',
    `Project: ${request.projectName}`,
    `Container: ${options.format.toUpperCase()}`,
    `Preset: ${options.preset}`,
    `Resolution: ${width}x${height}`,
    `Frame Rate: ${fps} fps`,
    `Video Bitrate Target: ${(videoBitrate / 1_000_000).toFixed(2)} Mbps`,
    `Audio: ${audioEnabled ? (audioClips ? '48 kHz stereo, 128 kbps' : 'None') : 'Disabled from export'}`,
    `Timeline Duration: ${duration(timelineMs)}`,
    `Visual Clips: ${visualClips}`,
    `Audio Clips: ${audioClips}`,
    `Output Video Codec: ${runtime?.videoCodec ?? 'Unknown'}`,
    `Encoder Codec String: ${runtime?.encoderCodec ?? 'Unknown'}`,
    `Hardware Acceleration Request: ${runtime?.hardwareAcceleration ?? 'Unknown'} (actual implementation not exposed)`,
    `Encoder Bitrate: ${runtime?.encoderBitrate ? `${(runtime.encoderBitrate / 1_000_000).toFixed(2)} Mbps` : 'Unknown'}`,
    `Output Audio Codec: ${runtime?.audioCodec ?? (audioClips ? 'Unknown' : 'None')}`,
    `Audio Encoder: ${
      runtime?.audioEncoderImplementation === 'mediabunny-aac'
        ? 'Mediabunny AAC-LC (WASM)'
        : runtime?.audioEncoderImplementation === 'webcodecs'
          ? 'Native WebCodecs'
          : audioClips
            ? 'Unknown'
            : 'None'
    }`,
    `Input Video Codecs: ${runtime?.inputVideoCodecs.join(', ') || 'Unknown'}`,
    `Input Audio Codecs: ${runtime?.inputAudioCodecs.join(', ') || (audioClips ? 'Unknown' : 'None')}`,
    '',
    '--- Progress ---',
    `Phase: ${progress?.stage ?? runtime?.phase ?? (options.status === 'completed' ? 'finalizing' : 'Unknown')}`,
    `Video Frames: ${completedFrames} / ${totalFrames}`,
    `Video Progress: ${((completedFrames / totalFrames) * 100).toFixed(1)}%`,
    `Audio Progress: ${audioProgress === null ? 'None' : audioProgress === undefined ? 'Unknown' : `${(audioProgress * 100).toFixed(1)}%`}`,
    `Timeline Position: ${duration(progress?.currentTimeMs ?? (options.status === 'completed' ? timelineMs : 0))} / ${duration(timelineMs)}`,
    '',
    '--- Performance ---',
    `Destination Dialog: ${finite(diagnostics?.destinationDialogMs)}`,
    `Asset Validation: ${finite(runtime?.validationMs)}`,
    `Asset Loading: ${finite(runtime?.assetLoadingMs)}`,
    `Encoder Setup: ${finite(runtime?.outputSetupMs)}`,
    `Video Pipeline: ${finite(runtime?.videoPipelineMs)}`,
    `  Decode: ${finite(runtime?.decodeMs)}`,
    `  Canvas Render: ${finite(runtime?.renderMs)}`,
    `  Encoder / Backpressure: ${finite(runtime?.encoderBackpressureMs)}`,
    `Audio Pipeline: ${finite(runtime?.audioPipelineMs)}`,
    `Mux Finalization: ${finite(runtime?.muxFinalizationMs)}`,
    `Native File Sync / Rename: ${finite(runtime?.nativeFinalizationMs)}`,
    `IPC / Disk Wait: ${finite(runtime?.ipcWriteWaitMs)}`,
    `Total Export Time: ${duration(elapsedMs)}`,
    `Encoding Throughput: ${runtime?.encodedFps === null || runtime?.encodedFps === undefined ? 'Unknown' : `${runtime.encodedFps.toFixed(2)} frames/s`}`,
    `Export Speed vs Realtime: ${realtimeSpeed === null ? 'Unknown' : `${realtimeSpeed.toFixed(2)}x`}`,
    `Audio Mix Speed vs Realtime: ${runtime?.audioRealtimeSpeed === null || runtime?.audioRealtimeSpeed === undefined ? 'Unknown' : `${runtime.audioRealtimeSpeed.toFixed(2)}x`}`,
    `Chunks Written: ${runtime?.chunkCount ?? 0}`,
    `Bytes Written: ${bytes(runtime?.bytesWritten)}`,
    `Encoded Video Packets: ${runtime?.encodedPacketCount ?? 'Unknown'}`,
    `Video Key Frames: ${runtime?.keyFrameCount ?? 'Unknown'}`,
    `Encoded Video Bytes: ${bytes(runtime?.encodedVideoBytes)}`,
    `Dominant Measured Bottleneck: ${dominantBottleneck(runtime)}`,
    ...(cleanedError(options.error) ? ['', '--- Error ---', cleanedError(options.error)!] : []),
    '===================',
  ].join('\n');
}

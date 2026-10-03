import type { ExportEnvironmentDiagnostics } from '@beam/encoder/export-diagnostics-types';

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

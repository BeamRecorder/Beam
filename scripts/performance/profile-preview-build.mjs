// Instrument only a temporary production build; never expose probes in shipped renderers.
import { build, loadConfigFromFile } from 'vite';
import { cpSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MagicString } from 'vue/compiler-sfc';

const root = path.resolve(
  process.env.BEAM_PREVIEW_PROFILE_BUILD_ROOT || fileURLToPath(new URL('../..', import.meta.url)),
);
const argument = process.argv[2];
const output = argument ? path.resolve(argument) : null;
if (!argument || !path.isAbsolute(argument) || output === root || output.startsWith(root + path.sep))
  throw new Error('Provide an absolute temporary output directory outside the repository.');
if (existsSync(output))
  throw new Error('Use a fresh output directory; profiling builds never overwrite existing files.');
const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, path.join(root, 'vite.config.ts'));
const probe = {
  name: 'preview-profile-probes',
  enforce: 'pre',
  transform(source, id) {
    const code = new MagicString(source);
    const replace = (needle, replacement) => {
      const start = source.indexOf(needle);
      if (start < 0 || start !== source.lastIndexOf(needle))
        throw new Error(`Missing or ambiguous probe in ${id}: ${needle}`);
      code.overwrite(start, start + needle.length, replacement);
    };
    if (id.endsWith('/composables/useVideoEditor.ts')) {
      code.prepend(
        "import { GpuSceneRenderer as ProfileGpuScene } from '@beam/runtime/gpu/gpu-scene-renderer';\nimport { EngineMetrics as ProfileEngineMetrics } from '@beam/runtime/performance/engine-metrics';\n",
      );
      replace(
        '  return {\n    activeTab,',
        `
      window.__beamGpuScene = ProfileGpuScene; window.__beamEngineMetrics = ProfileEngineMetrics;
      window.__beamPreview = { player, composition: compositionState.composition, compositionState, zoomState, outputCanvas,
        createExportSnapshot, exportVideo: async snapshot => {
          const { exportWithMediabunny } = await import('../../export/mediabunny/exporter');
          return exportWithMediabunny({ projectName:'Beam performance', format:'mp4', preset:'high', includeAudio:true, snapshot },
            () => {}, new AbortController().signal);
        } };
      return {\n    activeTab,`,
      );
    } else if (id.endsWith('/canvas/EditorCanvas.vue')) {
      replace('const renderCanvas = () => {', 'const renderCanvas = () => { const profileStart = performance.now();');
      replace(
        '  clipToggleTransition.blendPreviousFrame(ctx, logicalSize.value.width, logicalSize.value.height);',
        `
          clipToggleTransition.blendPreviousFrame(ctx, logicalSize.value.width, logicalSize.value.height);
          window.__beamCanvasQuality = () => { renderCanvas(); return ctx.getImageData(0,0,canvas.width,canvas.height); };
          (window.__beamPreviewDraws ??= []).push(performance.now() - profileStart);`,
      );
    } else if (id.endsWith('/composition/effects/blur-effect.ts')) {
      code.append(
        '\nif (typeof window !== "undefined") { window.__beamBlurEffect = applyBlurEffect; window.__beamDisposeBlurEffect = disposeBlurEffect; window.__beamGpuBlurGroup = withGpuBlurGroup; window.__beamPlanGpuEffect = planGpuEffect; }',
      );
    } else if (id.endsWith('/composition/appearance/render-decorated-media.ts')) {
      code.append('\nif (typeof window !== "undefined") window.__beamDecoratedMedia = drawDecoratedMedia;');
    } else if (
      id.endsWith('/composition/appearance/adaptive-shadow.ts') &&
      source.includes('primeAdaptiveShadowColors')
    ) {
      code.append('\nif (typeof window !== "undefined") window.__beamPrepareShadows = primeAdaptiveShadowColors;');
      replace(
        '  const cached = sampledColors.get(source, key);',
        '  const cached = typeof window !== "undefined" && window.__beamBypassShadowCache ? undefined : sampledColors.get(source, key);',
      );
    } else if (id.endsWith('/composition/shape/render-shape-clip.ts')) {
      code.append('\nif (typeof window !== "undefined") window.__beamShapeClip = drawShapeClip;');
    } else if (id.endsWith('/composition/shape/gpu-shape-plan.ts')) {
      replace(
        '  const key = paint?.key ?? JSON.stringify([viewport, m.a, m.d, m.e, m.f, ctx.canvas.width, ctx.canvas.height]);',
        '  const key = (paint?.key ?? JSON.stringify([viewport, m.a, m.d, m.e, m.f, ctx.canvas.width, ctx.canvas.height])) + "|" + Boolean(typeof window !== "undefined" && window.__beamBypassShapeCulling);',
      );
      replace(
        '    if (\n      w > 0 &&\n      h > 0 &&',
        '    if (\n      !(typeof window !== "undefined" && window.__beamBypassShapeCulling) && w > 0 &&\n      h > 0 &&',
      );
    } else if (id.endsWith('/composition/shape/ordered-gpu-shapes.ts')) {
      code.append(
        '\nif (typeof window !== "undefined") window.__beamOrderedShapes = { render: withOrderedGpuShapes, dispose: disposeGpuShapes };',
      );
      replace(
        '    const commands = gpuShapePlan(this.ctx, clip, viewport, transform, this.paint!);',
        '    if (typeof window !== "undefined" && window.__beamBypassGpuShapes) return false;\n    const commands = gpuShapePlan(this.ctx, clip, viewport, transform, this.paint!);',
      );
    } else if (id.endsWith('/composition/appearance/media-shadow-cache.ts')) {
      replace(
        'export function drawCachedMediaShadow(ctx: Canvas2DContext, options: MediaShadowOptions): boolean {',
        'export function drawCachedMediaShadow(ctx: Canvas2DContext, options: MediaShadowOptions): boolean { if (typeof window !== "undefined" && window.__beamBypassRasterCache) return false;',
      );
    } else if (id.endsWith('/waveform/BlickWaveformCanvas.vue')) {
      replace(
        '<div ref="container" class="blick-waveform">',
        '<div ref="container" class="blick-waveform" :data-profile-waveform="JSON.stringify({ deferred: props.deferDraw, bars: props.bars.length, bands: props.bands.length, generation: drawGeneration, frames: animationFrame, painted: hasPainted, error })">',
      );
      replace(
        '  const height = bounds.height;',
        '  const height = bounds.height; container.value.dataset.profileWaveformBounds = JSON.stringify({ width, height, layers: layers.value.length, canvases: canvases.value.length });',
      );
    } else if (id.endsWith('/timeline/shape-timeline-preview.ts')) {
      replace(
        '  const width = canvas.width * clip.transform.width;',
        '  window.__beamShapeRenders = (window.__beamShapeRenders ?? 0) + 1;\n  const width = canvas.width * clip.transform.width;',
      );
    } else {
      return undefined;
    }
    return {
      code: code.toString(),
      map: code.generateMap({ source: id, includeContent: true, hires: true }),
    };
  },
};
await build({
  ...loaded.config,
  root: loaded.config.root,
  configFile: false,
  plugins: [probe, ...loaded.config.plugins],
  build: {
    ...loaded.config.build,
    outDir: path.join(output, 'dist'),
    sourcemap: true,
  },
});
mkdirSync(output, { recursive: true });
cpSync(path.join(root, 'apps/desktop/electron'), path.join(output, 'apps/desktop/electron'), {
  recursive: true,
});
cpSync(path.join(root, 'package.json'), path.join(output, 'package.json'));
symlinkSync(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'dir');
symlinkSync(path.join(root, 'packages'), path.join(output, 'packages'), 'dir');

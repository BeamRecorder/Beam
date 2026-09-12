import { capture } from '~/api/capture';
import type { QuickSnipRenderTask } from '~/api/types/quick-snip';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import { compositionDurationMs } from '~/media/shared';
import { synchronizeRecordingClips } from '../video-editor/composition/session-clips';
import {
  applyFreshPresentationDefaults,
  normalizeEditorPreferenceDefaults,
} from '../video-editor/composables/editor-defaults';
import { buildAutomaticZoomElements, ZOOM_ALGORITHM_VERSION } from '../video-editor/zoom/zoom-suggestions';
import {
  BACKGROUND_MEDIA,
  findMatchingBackgroundMedia,
  normalizeBackgroundValue,
  type BackgroundMedia,
} from '../video-editor/composables/backgroundCatalog';
import { orderedCursorPacks } from '../video-editor/properties/cursor/cursor-packs';
import { createCompositionSnapshot } from '../export/composition/snapshot';
import { exportWithMediabunny } from '../export/mediabunny/exporter';
import type { ExportRequest } from '../export/export-types';

export function quickSnipExportRequest(
  task: QuickSnipRenderTask,
  backgrounds: BackgroundMedia[],
  packs: CursorPackDescriptor[],
) {
  const { configuration: config, editorData } = task;
  const screen = editorData.tracks.find((track) => track.kind === 'screen');
  if (
    !screen ||
    screen.status === 'failed' ||
    !screen.assets.some((asset) => asset.complete && asset.exists && asset.src)
  ) {
    const reason = screen?.terminationReason || 'The recording contains no usable video.';
    throw new Error(`Quick Snip video capture failed: ${reason}`);
  }
  const defaults = normalizeEditorPreferenceDefaults(config.preset.settings.editor);
  const state = applyFreshPresentationDefaults(structuredClone(task.editorState), defaults);
  state.composition = synchronizeRecordingClips(state.composition, editorData, defaults);
  if (!state.composition.clips.some((clip) => clip.kind === 'screen' && clip.enabled && clip.timelineDurationMs > 0))
    throw new Error('Quick Snip has no active screen video to export.');
  const durationMs = compositionDurationMs(state.composition);
  state.zoom.elements = editorData.cursor.available
    ? buildAutomaticZoomElements({
        telemetry: editorData.cursor.telemetry,
        sessionId: editorData.sessionId,
        durationMs,
        reserved: [],
      }).map((zoom) => ({ ...zoom, enabled: config.automaticZoom }))
    : [];
  state.zoom.generatedSessions = [
    {
      sessionId: editorData.sessionId,
      algorithmVersion: ZOOM_ALGORITHM_VERSION,
      generatedAt: new Date().toISOString(),
    },
  ];
  state.zoom.motionBlur = defaults.zoomMotionBlur ?? state.zoom.motionBlur;
  const presentation = state.presentation;
  const background =
    normalizeBackgroundValue(presentation.background) ??
    findMatchingBackgroundMedia([...backgrounds, ...BACKGROUND_MEDIA], presentation.selectedBackgroundId);
  const settings = config.preset.settings.export;
  const fps = [24, 30, 60].includes(Number(settings.frameRate))
    ? Number(settings.frameRate)
    : Number(screen.format.frameRate ?? screen.format.fps) || 30;
  const snapshot = createCompositionSnapshot({
    duration: durationMs / 1000,
    fps,
    canvas: presentation.canvas,
    background,
    blurPercent: presentation.blurPercent ?? 0,
    editorData,
    zooms: state.zoom.elements,
    zoomMotionBlur: state.zoom.motionBlur,
    composition: state.composition,
    cursorSettings: presentation.cursor,
    cursorPack: orderedCursorPacks(packs).find((pack) => pack.id === presentation.cursor.selection.packId) ?? null,
  });
  const height =
    settings.resolution === '720p'
      ? Math.min(720, snapshot.canvas.height)
      : settings.resolution === '1080p'
        ? Math.min(1080, snapshot.canvas.height)
        : snapshot.canvas.height;
  snapshot.canvas = {
    ...snapshot.canvas,
    width: Math.max(2, Math.round((height * snapshot.canvas.width) / snapshot.canvas.height) & ~1),
    height: Math.max(2, Math.round(height) & ~1),
  };
  return {
    state,
    request: {
      projectName: config.name,
      format: config.format,
      preset: settings.preset === 'low' || settings.preset === 'high' ? settings.preset : 'medium',
      includeAudio: settings.includeAudio !== false,
      preview: true,
      snapshot,
    } satisfies ExportRequest,
  };
}

export async function renderQuickSnip(task: QuickSnipRenderTask, signal: AbortSignal) {
  const [backgrounds, packs] = await Promise.all([capture.listBackgroundLibrary(), capture.listCursorPacks()]);
  if (signal.aborted) return;
  const { state, request } = quickSnipExportRequest(task, backgrounds, packs);
  await capture.saveQuickSnipRenderState(task.id, state);
  const result = await exportWithMediabunny(
    request,
    (progress) => {
      void capture
        .reportQuickSnipRender({
          id: task.id,
          type: 'progress',
          progress: progress.overallProgress,
          preview: progress.preview,
        })
        .catch(() => undefined);
    },
    signal,
  );
  await capture.reportQuickSnipRender({ id: task.id, type: 'completed', path: result.path });
}

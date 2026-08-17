<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import EditorCanvas from '~/components/video-editor/canvas/EditorCanvas.vue';
import CanvasToolbar from '~/components/video-editor/canvas/CanvasToolbar.vue';
import EditorTimeline from '~/components/video-editor/timeline/EditorTimeline.vue';
import TimelineToolbar from '~/components/video-editor/timeline/TimelineToolbar.vue';
import {
  DEFAULT_OUTPUT_CANVAS,
  OUTPUT_CANVAS_PRESETS,
  type OutputCanvasPreset,
} from '~/components/video-editor/canvas/output-canvas';
import {
  moveClip,
  reorderClip,
  setClipEnabled,
  splitClip,
  trimClip,
  updateClip as updateCompositionClip,
} from '~/components/video-editor/composition/engine/clip-engine';
import { compositionPlaybackSignature } from '~/components/video-editor/composables/composition-playback-signature';
import { MACOS_CURSOR_PACK } from '~/components/video-editor/properties/cursor/cursor-packs';
import type { ZoomElement } from '~/components/video-editor/zoom/zoom-types';
import { createDefaultCursorClickEffects, createDefaultCursorMotionSettings } from '~/api/types/cursor-settings';
import {
  emptyComposition,
  isBlurClip,
  isCaptionClip,
  isVisualClip,
  type NormalizedCrop,
  type NormalizedTransform,
} from '~/media/shared/composition-types';
import { useWebsiteDemoPlayer } from '@website/composables/useWebsiteDemoPlayer';
import { addDemoCaption, demoMedia } from '@website/demo/website-demo-fixture';
import WebsiteDemoProjectMissing from '@website/components/WebsiteDemoProjectMissing.vue';
import {
  loadWebsiteDemoProject,
  WEBSITE_DEMO_FILES,
  type WebsiteDemoFileIssue,
} from '@website/demo/website-demo-project';
import type { ProjectEditorData } from '~/api/types/capture-session';
import { useI18n } from 'vue-i18n';

const editorCanvasRef = ref<InstanceType<typeof EditorCanvas> | null>(null);
const { t } = useI18n();
const fallbackVideoRef = ref<HTMLVideoElement | null>(null);
const timelineZoomLevel = ref(100);
const isSnappingEnabled = ref(true);
const isCropping = ref(false);
const isGridVisible = ref(false);
const selectedClipId = ref<string | null>(null);
const selectedZoomId = ref<string | null>(null);
const composition = ref(emptyComposition());
const zoomElements = ref<ZoomElement[]>([]);
const editorData = ref<ProjectEditorData | null>(null);
const demoDurationMs = ref(0);
const projectStatus = ref<'loading' | 'incomplete' | 'ready'>('loading');
const projectIssues = ref<WebsiteDemoFileIssue[]>([]);
const outputCanvas = ref({ ...DEFAULT_OUTPUT_CANVAS });
const cursorClickEffects = createDefaultCursorClickEffects();
const cursorMotion = createDefaultCursorMotionSettings();
const player = useWebsiteDemoPlayer();
const notice = ref(t('Website.editor.checking'));
let generatedId = 0;

const websiteCursorPack = {
  ...MACOS_CURSOR_PACK,
  cursors: MACOS_CURSOR_PACK.cursors.map((cursor) =>
    cursor.id === 'default' ? { ...cursor, url: demoMedia.defaultCursorUrl } : cursor,
  ),
};

const supportsEditorPlayback =
  typeof globalThis.Worker !== 'undefined' &&
  typeof globalThis.VideoDecoder !== 'undefined' &&
  typeof globalThis.VideoFrame !== 'undefined';
const duration = computed(() => player.duration.value || demoDurationMs.value / 1_000);
const selectedClip = computed(() => composition.value.clips.find((clip) => clip.id === selectedClipId.value) ?? null);
const selectedTransformClip = computed(() => {
  const clip = selectedClip.value;
  return clip && (isVisualClip(clip) || isBlurClip(clip) || isCaptionClip(clip)) ? clip : null;
});
const selectedZoom = computed(() => zoomElements.value.find((zoom) => zoom.id === selectedZoomId.value) ?? null);
const activeTab = computed(() => (selectedZoom.value ? 'zoom' : selectedTransformClip.value ? 'clip' : 'canvas'));
const playbackUnavailable = computed(() => !supportsEditorPlayback || Boolean(player.playbackError.value));

const reportError = (message: string, error: unknown) => {
  notice.value = message;
  console.error(`[Beam homepage editor] ${message}`, error);
};

watch(
  () => compositionPlaybackSignature(composition.value),
  async () => {
    if (projectStatus.value !== 'ready') return;
    if (!supportsEditorPlayback) {
      notice.value = t('Website.editor.webCodecsUnavailable');
      return;
    }
    try {
      await player.loadComposition(composition.value);
      notice.value = t('Website.editor.ready');
    } catch (error) {
      reportError(t('Website.editor.decodeFailed'), error);
    }
  },
  { immediate: true },
);

onMounted(async () => {
  const result = await loadWebsiteDemoProject();
  if (result.status === 'incomplete') {
    projectIssues.value = result.issues;
    projectStatus.value = 'incomplete';
    notice.value = t('Website.editor.filesMissing', { count: result.issues.length }, result.issues.length);
    return;
  }
  const demo = result.project;
  composition.value = demo.composition;
  zoomElements.value = demo.zoomElements;
  editorData.value = demo.editorData;
  demoDurationMs.value = demo.durationMs;
  selectedClipId.value = demo.composition.clips.find((clip) => clip.kind === 'screen')?.id ?? null;
  selectedZoomId.value = demo.zoomElements[0]?.id ?? null;
  projectStatus.value = 'ready';
});

const updateComposition = (operation: () => typeof composition.value) => {
  try {
    composition.value = operation();
  } catch (error) {
    reportError(t('Website.editor.invalidEdit'), error);
  }
};

const handlePlayingIntent = async (playing: boolean) => {
  try {
    if (playbackUnavailable.value) {
      const video = fallbackVideoRef.value;
      if (!video) return;
      if (playing) await video.play();
      else video.pause();
      return;
    }
    await player.setPlaying(playing);
  } catch (error) {
    reportError(t('Website.editor.playbackFailed'), error);
  }
};

const handleSeekIntent = async (time: number, mode: 'seek' | 'scrub' = 'seek') => {
  try {
    if (playbackUnavailable.value) {
      const target = Math.max(0, Math.min(time, duration.value));
      player.currentTime.value = target;
      if (fallbackVideoRef.value) fallbackVideoRef.value.currentTime = target;
      return;
    }
    await player.seek(time, mode);
  } catch (error) {
    reportError(t('Website.editor.frameFailed'), error);
  }
};

const selectClip = (clipId: string) => {
  selectedClipId.value = clipId;
  selectedZoomId.value = null;
  isCropping.value = false;
};

const selectZoom = (zoomId: string) => {
  selectedZoomId.value = zoomId;
  selectedClipId.value = null;
  isCropping.value = false;
};

const selectCanvas = () => {
  selectedClipId.value = null;
  selectedZoomId.value = null;
  isCropping.value = false;
};

const updateZoom = (value: ZoomElement) => {
  zoomElements.value = zoomElements.value.map((zoom) => (zoom.id === value.id ? value : zoom));
};

const patchZoom = (id: string, patch: Partial<ZoomElement>) => {
  const zoom = zoomElements.value.find((entry) => entry.id === id);
  if (zoom) updateZoom({ ...zoom, ...patch });
};

const addZoom = (timeMs: number) => {
  const startMs = Math.min(Math.max(0, demoDurationMs.value - 1_500), Math.max(0, timeMs));
  const zoom: ZoomElement = {
    id: `homepage-zoom-${++generatedId}`,
    sessionId: 'homepage-demo',
    startMs,
    endMs: startMs + 1_500,
    focus: { cx: 0.5, cy: 0.5 },
    depth: 2,
    mode: 'manual',
  };
  zoomElements.value = [...zoomElements.value, zoom];
  selectZoom(zoom.id);
};

const addCaption = (timeMs: number) => {
  composition.value = addDemoCaption(composition.value, timeMs, demoDurationMs.value);
  selectClip(composition.value.clips.at(-1)?.id ?? '');
};

const addTimelineElement = (type: 'video' | 'image' | 'sound' | 'caption' | 'blur') => {
  if (type === 'caption') {
    addCaption(Math.round(player.currentTime.value * 1_000));
    return;
  }
  const typeLabel = t(`TimelineToolbar.${type}`);
  notice.value = t('Website.editor.importDisabled', { type: typeLabel });
};

const splitSelectedClip = () => {
  const clip = selectedClip.value;
  const timeMs = Math.round(player.currentTime.value * 1_000);
  if (!clip || timeMs <= clip.timelineStartMs || timeMs >= clip.timelineStartMs + clip.timelineDurationMs) {
    notice.value = t('Website.editor.splitHint');
    return;
  }
  updateComposition(() => splitClip(composition.value, clip.id, timeMs, () => `homepage-split-${++generatedId}`));
};

const updateSelectedTransform = (transform: NormalizedTransform) => {
  const clipId = selectedClipId.value;
  if (!clipId) return;
  updateComposition(() =>
    updateCompositionClip(composition.value, clipId, (clip) => (isVisualClip(clip) ? { ...clip, transform } : clip)),
  );
};

const updateSelectedCrop = (crop: NormalizedCrop) => {
  const clipId = selectedClipId.value;
  if (!clipId) return;
  updateComposition(() =>
    updateCompositionClip(composition.value, clipId, (clip) => (isVisualClip(clip) ? { ...clip, crop } : clip)),
  );
};

const selectOutputPreset = (preset: Exclude<OutputCanvasPreset, 'custom'>) => {
  outputCanvas.value = { ...OUTPUT_CANVAS_PRESETS[preset] };
};

const play = async () => {
  await nextTick();
  if (projectStatus.value !== 'ready') return;
  if (playbackUnavailable.value) {
    await fallbackVideoRef.value?.play();
    return;
  }
  await handlePlayingIntent(true);
};

defineExpose({ play });
</script>

<template>
  <section class="editor-preview" :aria-label="t('Website.editor.aria')">
    <header>
      <div>
        <h3>{{ t('Website.editor.title') }}</h3>
      </div>
      <p class="status" aria-live="polite">{{ notice }}</p>
    </header>

    <WebsiteDemoProjectMissing
      v-if="projectStatus !== 'ready'"
      :loading="projectStatus === 'loading'"
      :issues="
        projectStatus === 'loading' ? WEBSITE_DEMO_FILES.map((file) => ({ ...file, reason: 'missing' })) : projectIssues
      "
    />

    <div v-else class="editor-shell">
      <template v-if="!playbackUnavailable">
        <CanvasToolbar
          :preset="outputCanvas.preset"
          :can-crop="Boolean(selectedTransformClip && isVisualClip(selectedTransformClip))"
          :is-cropping="isCropping"
          :is-grid-visible="isGridVisible"
          :zoom-percent="editorCanvasRef?.viewportZoom.zoomPercent.value ?? 100"
          :is-zoomed-or-panned="editorCanvasRef?.viewportZoom.isZoomedOrPanned.value ?? false"
          @select:preset="selectOutputPreset"
          @toggle:crop="isCropping = !isCropping"
          @toggle:grid="isGridVisible = !isGridVisible"
          @zoom:in="editorCanvasRef?.viewportZoom.zoomIn()"
          @zoom:out="editorCanvasRef?.viewportZoom.zoomOut()"
          @reset:zoom="editorCanvasRef?.viewportZoom.resetZoom()"
        />

        <div class="canvas-shell">
          <EditorCanvas
            ref="editorCanvasRef"
            :is-playing="player.isPlaying.value"
            :current-time="player.currentTime.value"
            :cursor-selection="{ packId: 'builtin:macos', mode: 'automatic', cursorId: null }"
            :cursor-pack="websiteCursorPack"
            :cursor-size="45"
            cursor-color="#000000"
            enable-shadow
            :shadow-blur="6"
            shadow-color="#000000"
            shadow-direction="bottom"
            :click-effects="cursorClickEffects"
            :motion="cursorMotion"
            :selected-background="null"
            :background-blur-percent="0"
            :frame-for="player.frameFor"
            :frame-version="player.frameVersion.value"
            :playback-state="player.playbackState.value"
            :playback-error="player.playbackError.value"
            :editor-data="editorData"
            :zoom-elements="zoomElements"
            :selected-zoom="selectedZoom"
            :composition="composition"
            :output-canvas="outputCanvas"
            :active-tab="activeTab"
            :selected-transform-clip="selectedTransformClip"
            :is-cropping="isCropping"
            :is-grid-visible="isGridVisible"
            @update:zoom="updateZoom"
            @preview:zoom="updateZoom"
            @select:clip="selectClip"
            @select:canvas="selectCanvas"
            @deselect:transform-clip="selectedClipId = null"
            @deselect:zoom="selectedZoomId = null"
            @update:clip-transform="updateSelectedTransform"
            @update:clip-crop="updateSelectedCrop"
            @done:crop="isCropping = false"
          />
        </div>
      </template>

      <div v-else class="fallback-player">
        <p>{{ t('Website.editor.fallback') }}</p>
        <video
          ref="fallbackVideoRef"
          :src="WEBSITE_DEMO_FILES.find((file) => file.key === 'video')?.path"
          :poster="demoMedia.thumbnailUrl"
          controls
          playsinline
          @loadedmetadata="player.duration.value = fallbackVideoRef?.duration || demoDurationMs / 1_000"
          @timeupdate="player.currentTime.value = fallbackVideoRef?.currentTime ?? 0"
          @play="player.isPlaying.value = true"
          @pause="player.isPlaying.value = false"
          @ended="player.isPlaying.value = false"
        >
          {{ t('Website.editor.mp4Unsupported') }}
        </video>
      </div>

      <div class="toolbar-shell">
        <TimelineToolbar
          :current-time="player.currentTime.value"
          :duration="duration"
          :is-playing="player.isPlaying.value"
          v-model:zoom-level="timelineZoomLevel"
          v-model:is-snapping-enabled="isSnappingEnabled"
          :can-split="Boolean(selectedClip)"
          @update:is-playing="handlePlayingIntent"
          @update:current-time="handleSeekIntent"
          @add:element="addTimelineElement"
          @split="splitSelectedClip"
        />
      </div>

      <div class="timeline-shell">
        <EditorTimeline
          :current-time="player.currentTime.value"
          :duration="duration"
          :is-playing="player.isPlaying.value"
          v-model:zoom-level="timelineZoomLevel"
          :zoom-elements="zoomElements"
          :selected-zoom-id="selectedZoomId"
          :composition="composition"
          :selected-clip-id="selectedClipId"
          :is-snapping-enabled="isSnappingEnabled"
          @update:current-time="handleSeekIntent($event, 'scrub')"
          @update:is-playing="handlePlayingIntent"
          @select:zoom="selectZoom"
          @select:clip="selectClip"
          @toggle:clip="
            updateComposition(() =>
              setClipEnabled(composition, $event, !composition.clips.find((clip) => clip.id === $event)?.enabled),
            )
          "
          @trim:clip="updateComposition(() => trimClip(composition, $event.id, $event.edge, $event.timeMs))"
          @move:clip="updateComposition(() => moveClip(composition, $event.id, $event.startMs))"
          @trim:zoom="patchZoom($event.id, { [$event.edge === 'start' ? 'startMs' : 'endMs']: $event.timeMs })"
          @move:zoom="patchZoom($event.id, { startMs: $event.startMs, endMs: $event.endMs })"
          @add:zoom="addZoom"
          @add:caption="addCaption"
          @reorder:clip="updateComposition(() => reorderClip(composition, $event.id, $event.targetIndex))"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor-preview {
  display: grid;
  gap: 18px;
}
header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-sm);
}
h3 {
  font-size: 22px;
}
.status {
  max-width: 500px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: right;
}
.editor-shell {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
}
.canvas-shell {
  height: clamp(360px, 54vw, 660px);
  min-height: 0;
  padding: 0 12px 12px;
  background: #171612;
}
.fallback-player {
  display: grid;
  gap: 12px;
  padding: 16px;
  color: var(--text-muted);
  font-size: 13px;
}
.fallback-player video {
  display: block;
  width: 100%;
  max-height: min(64vh, 680px);
  background: #11100e;
  object-fit: contain;
  aspect-ratio: 16 / 9;
}
.toolbar-shell {
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-element);
}
.timeline-shell {
  height: 320px;
  min-width: 0;
  padding: 10px;
}
@media (max-width: 700px) {
  header {
    align-items: start;
    flex-direction: column;
  }
  .status {
    text-align: left;
  }
  .canvas-shell {
    height: 360px;
  }
  .timeline-shell {
    height: 260px;
    overflow-x: auto;
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import EditorTimeline from '~/components/video-editor/timeline/EditorTimeline.vue';
import TimelineToolbar from '~/components/video-editor/timeline/TimelineToolbar.vue';
import type { Clip } from '~/media/shared/composition-types';
import type { ZoomElement } from '~/components/video-editor/zoom/zoom-types';
import {
  addDemoCaption,
  createDemoComposition,
  createDemoZooms,
  DEMO_DURATION_MS,
  demoMedia,
  updateClip,
} from '@website/demo/website-demo-fixture';

const videoRef = ref<HTMLVideoElement | null>(null);
const currentTime = ref(0);
const duration = ref(DEMO_DURATION_MS / 1_000);
const isPlaying = ref(false);
const zoomLevel = ref(100);
const isSnappingEnabled = ref(true);
const selectedClipId = ref<string | null>('beam-demo-screen');
const selectedZoomId = ref<string | null>(null);
const composition = ref(createDemoComposition());
const zoomElements = ref(createDemoZooms());
const notice = ref('The player and timeline use the repository’s real BeamDemo.webm file.');

const selectedClip = computed(() => composition.value.clips.find((clip) => clip.id === selectedClipId.value) ?? null);

const syncVideoTime = (value: number) => {
  const video = videoRef.value;
  if (!video || Math.abs(video.currentTime - value) < 0.08) return;
  video.currentTime = value;
};

watch(currentTime, syncVideoTime);
watch(isPlaying, async (playing) => {
  const video = videoRef.value;
  if (!video) return;
  if (!playing) {
    video.pause();
    return;
  }
  try {
    await video.play();
  } catch {
    isPlaying.value = false;
    notice.value = 'Your browser prevented autoplay. Press play directly in the video.';
  }
});

const onLoadedMetadata = () => {
  const video = videoRef.value;
  if (video?.duration && Number.isFinite(video.duration)) duration.value = video.duration;
};

const toggleClip = (clipId: string) => {
  composition.value = updateClip(composition.value, clipId, (clip) => ({ ...clip, enabled: !clip.enabled }));
};

const moveClip = ({ id, startMs }: { id: string; startMs: number }) => {
  composition.value = updateClip(composition.value, id, (clip) => ({ ...clip, timelineStartMs: startMs }));
};

const trimClip = ({ id, edge, timeMs }: { id: string; edge: 'start' | 'end'; timeMs: number }) => {
  composition.value = updateClip(composition.value, id, (clip): Clip => {
    const endMs = clip.timelineStartMs + clip.timelineDurationMs;
    if (edge === 'start') {
      const nextStart = Math.min(endMs - 100, Math.max(0, timeMs));
      const delta = nextStart - clip.timelineStartMs;
      return {
        ...clip,
        timelineStartMs: nextStart,
        timelineDurationMs: clip.timelineDurationMs - delta,
        sourceInMs: clip.sourceInMs + delta * clip.playbackRate,
      };
    }
    return { ...clip, timelineDurationMs: Math.max(100, timeMs - clip.timelineStartMs) };
  });
};

const updateZoom = (id: string, updater: (zoom: ZoomElement) => ZoomElement) => {
  zoomElements.value = zoomElements.value.map((zoom) => (zoom.id === id ? updater(zoom) : zoom));
};

const addZoom = (timeMs: number) => {
  const startMs = Math.min(DEMO_DURATION_MS - 1_500, Math.max(0, timeMs));
  const zoom: ZoomElement = {
    id: `homepage-zoom-${zoomElements.value.length}`,
    sessionId: 'homepage-demo',
    startMs,
    endMs: startMs + 1_500,
    focus: { cx: 0.5, cy: 0.5 },
    depth: 2,
    mode: 'manual',
  };
  zoomElements.value = [...zoomElements.value, zoom];
  selectedZoomId.value = zoom.id;
};

const addCaption = (timeMs: number) => {
  composition.value = addDemoCaption(composition.value, timeMs);
  selectedClipId.value = composition.value.clips.at(-1)?.id ?? null;
};

const announceUnavailableAction = (type: string) => {
  notice.value = `${type} is available in the desktop app; this browser demo keeps native file access disabled.`;
};

const play = async () => {
  await nextTick();
  isPlaying.value = true;
};

defineExpose({ play });
</script>

<template>
  <section class="editor-preview" aria-label="Interactive Beam editor demo">
    <header>
      <div>
        <p class="eyebrow">Real Beam editor components · demo project data</p>
        <h3>Try the playback and timeline controls</h3>
      </div>
      <p class="status" aria-live="polite">{{ notice }}</p>
    </header>

    <div class="editor-shell">
      <video
        ref="videoRef"
        :src="demoMedia.videoUrl"
        :poster="demoMedia.thumbnailUrl"
        controls
        playsinline
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="currentTime = videoRef?.currentTime ?? 0"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="isPlaying = false"
      >
        Your browser does not support WebM video playback.
      </video>

      <div class="toolbar-shell">
        <TimelineToolbar
          v-model:current-time="currentTime"
          v-model:is-playing="isPlaying"
          v-model:zoom-level="zoomLevel"
          v-model:is-snapping-enabled="isSnappingEnabled"
          :duration="duration"
          :can-split="Boolean(selectedClip)"
          @add:element="announceUnavailableAction"
          @split="announceUnavailableAction('Split')"
        />
      </div>

      <div class="timeline-shell">
        <EditorTimeline
          v-model:current-time="currentTime"
          v-model:is-playing="isPlaying"
          v-model:zoom-level="zoomLevel"
          :duration="duration"
          :zoom-elements="zoomElements"
          :selected-zoom-id="selectedZoomId"
          :composition="composition"
          :selected-clip-id="selectedClipId"
          :is-snapping-enabled="isSnappingEnabled"
          @select:zoom="selectedZoomId = $event"
          @select:clip="selectedClipId = $event"
          @toggle:clip="toggleClip"
          @trim:clip="trimClip"
          @move:clip="moveClip"
          @trim:zoom="
            updateZoom($event.id, (zoom) => ({
              ...zoom,
              [$event.edge === 'start' ? 'startMs' : 'endMs']: $event.timeMs,
            }))
          "
          @move:zoom="updateZoom($event.id, (zoom) => ({ ...zoom, startMs: $event.startMs, endMs: $event.endMs }))"
          @add:zoom="addZoom"
          @add:caption="addCaption"
          @reorder:clip="announceUnavailableAction('Track reordering')"
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
}
.eyebrow {
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
h3 {
  margin-top: 3px;
  font-size: 22px;
}
.status {
  max-width: 460px;
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
video {
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
  .timeline-shell {
    height: 260px;
    overflow-x: auto;
  }
}
</style>

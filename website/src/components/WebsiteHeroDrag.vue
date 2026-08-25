<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Code2, Download, Play } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import EditorCanvas from '~/components/video-editor/canvas/EditorCanvas.vue';
import { DEFAULT_OUTPUT_CANVAS } from '~/components/video-editor/canvas/output-canvas';
import { MACOS_CURSOR_PACK } from '~/components/video-editor/properties/cursor/cursor-packs';
import type { ZoomElement } from '~/components/video-editor/zoom/zoom-types';
import {
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
} from '~/api/types/cursor-settings';
import type { ProjectEditorData } from '~/api/types/capture-session';
import { emptyComposition } from '~/media/shared/composition-types';
import { useWebsiteDemoPlayer } from '@website/composables/useWebsiteDemoPlayer';
import { demoMedia } from '@website/demo/website-demo-fixture';
import { loadWebsiteDemoProject, type WebsiteDemoFileIssue } from '@website/demo/website-demo-project';
import {
  HERO_CURSOR_HOTSPOTS,
  HERO_DRAG_DURATION_MS,
  clamp01,
  heroDragFrame,
  type HeroCursorKind,
} from '@website/demo/hero-drag';
import defaultCursorUrl from '../../../public/macOsSvgCursors/default.svg';
import handOpenCursorUrl from '../../../public/macOsSvgCursors/handopen.svg';
import handGrabbingCursorUrl from '../../../public/macOsSvgCursors/handgrabbing.svg';

const emit = defineEmits<{ explore: [] }>();
const { t } = useI18n();

const CURSOR_URLS: Record<Exclude<HeroCursorKind, null>, string> = {
  pointer: defaultCursorUrl,
  hand: handOpenCursorUrl,
  grabbing: handGrabbingCursorUrl,
};

const player = useWebsiteDemoPlayer();
const clientReady = ref(false);
const projectStatus = ref<'loading' | 'incomplete' | 'ready'>('loading');
const projectIssues = ref<WebsiteDemoFileIssue[]>([]);
const composition = ref(emptyComposition());
const zoomElements = ref<ZoomElement[]>([]);
const editorData = ref<ProjectEditorData | null>(null);
const outputCanvas = ref({ ...DEFAULT_OUTPUT_CANVAS });
const reducedMotion = ref(false);
const entrance = ref(0);

let entranceStarted = false;
let entranceFrameId = 0;
let entranceStartedAt = 0;
let entranceTimer: ReturnType<typeof setTimeout> | null = null;

const cursorClickEffects = createDefaultCursorClickEffects();
const cursorMotion = createDefaultCursorMotionSettings();
const cursorAutoHide = createDefaultCursorAutoHideSettings();
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
const playbackUnavailable = computed(() => !supportsEditorPlayback || Boolean(player.playbackError.value));
const showCanvas = computed(() => clientReady.value && projectStatus.value === 'ready' && !playbackUnavailable.value);
const showFallbackVideo = computed(
  () => clientReady.value && (projectStatus.value === 'incomplete' || playbackUnavailable.value),
);

const frame = computed(() => heroDragFrame(entrance.value));
const cursorUrl = computed(() => (frame.value.cursorKind ? CURSOR_URLS[frame.value.cursorKind] : defaultCursorUrl));

const playerStyle = computed(() => ({
  transform: `translateY(${frame.value.playerTranslateY}%) scale(${frame.value.playerScale})`,
}));

const cursorStyle = computed(() => {
  const kind = frame.value.cursorKind;
  if (!kind || frame.value.cursorOpacity <= 0.01) return { opacity: 0, left: '0%', top: '0%' };
  const hotspot = HERO_CURSOR_HOTSPOTS[kind];
  const unit = 40 / 32;
  return {
    opacity: frame.value.cursorOpacity,
    left: `${frame.value.cursorX}%`,
    top: `${frame.value.cursorY}%`,
    transform: `translate(${-hotspot.x * unit}px, ${-hotspot.y * unit}px)`,
  };
});

const tickEntrance = () => {
  const elapsed = performance.now() - entranceStartedAt;
  const progress = clamp01(elapsed / HERO_DRAG_DURATION_MS);
  entrance.value = progress;
  if (progress < 1) entranceFrameId = requestAnimationFrame(tickEntrance);
};

const startEntrance = () => {
  if (entranceStarted || reducedMotion.value) return;
  entranceStarted = true;
  entranceStartedAt = performance.now();
  tickEntrance();
};

const scheduleEntrance = () => {
  if (entranceStarted || reducedMotion.value || entranceTimer) return;
  entranceTimer = setTimeout(startEntrance, 700);
};

watch(
  () => player.isPlaying.value,
  (playing) => {
    if (playing) scheduleEntrance();
  },
);

onMounted(async () => {
  if (typeof window === 'undefined') return;
  clientReady.value = true;
  reducedMotion.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (!supportsEditorPlayback) return;
  const result = await loadWebsiteDemoProject();
  if (result.status === 'incomplete') {
    projectStatus.value = 'incomplete';
    projectIssues.value = result.issues;
    return;
  }
  const demo = result.project;
  composition.value = demo.composition;
  zoomElements.value = demo.zoomElements;
  editorData.value = demo.editorData;
  projectStatus.value = 'ready';
  await player.loadComposition(demo.composition);
  await player.setPlaying(true);
});

onBeforeUnmount(() => {
  if (entranceTimer) clearTimeout(entranceTimer);
  if (entranceFrameId) cancelAnimationFrame(entranceFrameId);
});
</script>

<template>
  <section class="hero-drag" aria-labelledby="hero-title">
    <div class="hero-drag__copy">
      <p class="hero-eyebrow">{{ t('Website.home.heroEyebrow') }}</p>
      <h1 id="hero-title">{{ t('Website.home.heroLine1') }}</h1>
      <p class="lede">{{ t('Website.home.lede') }}</p>
      <div class="hero-actions">
        <a class="hero-primary-action" href="/install">
          <Download aria-hidden="true" /> {{ t('Website.home.downloadFree') }}
        </a>
        <a class="secondary-action" href="https://github.com/BeamRecorder/Beam" target="_blank" rel="noreferrer">
          <Code2 aria-hidden="true" /> {{ t('Website.home.viewGitHub') }}
        </a>
        <button class="secondary-action hero-drag__explore" type="button" @click="emit('explore')">
          <Play aria-hidden="true" /> {{ t('Website.home.openDemo') }}
        </button>
      </div>
    </div>

    <div class="hero-drag__media">
      <div class="hero-drag__player" :style="playerStyle">
        <EditorCanvas
          v-if="showCanvas"
          :is-playing="player.isPlaying.value"
          :current-time="player.currentTime.value"
          :duration="player.duration.value"
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
          :auto-hide="cursorAutoHide"
          :selected-background="null"
          :background-blur-percent="0"
          :frame-for="player.frameFor"
          :frame-version="player.frameVersion.value"
          preview-quality="full"
          :playback-state="player.playbackState.value"
          :playback-error="player.playbackError.value"
          :editor-data="editorData"
          :zoom-elements="zoomElements"
          :selected-zoom="null"
          :composition="composition"
          :output-canvas="outputCanvas"
          active-tab="canvas"
          :selected-transform-clip="null"
        />
        <video
          v-else-if="showFallbackVideo"
          class="hero-drag__fallback"
          :src="demoMedia.heroVideoUrl"
          :aria-label="t('Website.home.demoAlt')"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          @play="scheduleEntrance"
        />
        <img v-else class="hero-drag__poster" :src="demoMedia.thumbnailUrl" :alt="t('Website.home.demoAlt')" />
      </div>
      <img
        v-if="frame.cursorKind && frame.cursorOpacity > 0.01"
        class="hero-drag__cursor"
        :src="cursorUrl"
        :style="cursorStyle"
        alt=""
        aria-hidden="true"
      />
    </div>
  </section>
</template>

<style scoped>
.hero-drag {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  align-items: center;
  gap: clamp(40px, 6vw, 80px);
  min-height: calc(100dvh - 72px);
  padding: 88px 0 48px;
}

.hero-drag__copy {
  max-width: 620px;
}

.hero-drag__copy h1 {
  word-spacing: 0.12em;
}

.hero-drag__media {
  position: relative;
}

.hero-drag__player {
  display: flex;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--color-border-strong);
  border-radius: 22px;
  background: var(--color-media-surface);
  box-shadow: var(--shadow-lg);
  will-change: transform;
}

.hero-drag__fallback,
.hero-drag__poster {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-drag__fallback {
  background: #11100e;
}

.hero-drag__cursor {
  position: absolute;
  z-index: 2;
  width: 40px;
  height: 40px;
  pointer-events: none;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
  will-change: transform, opacity;
}

.hero-drag__explore {
  cursor: pointer;
}

@media (max-width: 900px) {
  .hero-drag {
    grid-template-columns: 1fr;
    gap: 32px;
    padding: 64px 0 40px;
  }
}

@media (max-width: 700px) {
  .hero-drag {
    padding: 56px 0 32px;
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  Camera,
  Captions,
  Film,
  Image as ImageIcon,
  Layers,
  Monitor,
  Palette,
  Pause,
  Play,
  Shapes,
  Volume2,
} from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import Slider from '~/components/ui/slider/Slider.vue';
import BlickWaveformCanvas from './timeline/waveform/BlickWaveformCanvas.vue';
import type { Clip, ClipKind, MediaAsset } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import { useLinkedClipPreviewWaveform } from './useLinkedClipPreviewWaveform';

const props = defineProps<{ clip: Clip; asset?: MediaAsset | null }>();
const { t } = useTranslate('LinkedClipsDeleteDialog');
const { t: tTimeline } = useTranslate('TimelineToolbar');
const { t: tTracks } = useTranslate('TimelineTracks');
const mediaElement = ref<HTMLMediaElement | null>(null);
const ready = ref(false);
const playing = ref(false);
const progressSeconds = ref(0);
const error = ref(false);
const sourceStartSeconds = computed(() => props.clip.sourceInMs / 1_000);
const durationSeconds = computed(() => props.clip.timelineDurationMs / 1_000);
const sourceEndSeconds = computed(() => (props.clip.sourceInMs + props.clip.sourceDurationMs) / 1_000);
const progressPercent = computed(() =>
  durationSeconds.value > 0 ? Math.max(0, Math.min(100, (progressSeconds.value / durationSeconds.value) * 100)) : 0,
);
const waveformZoom = computed(() => Math.min(4, Math.max(1, durationSeconds.value / 20)));
const waveformOffsetPercent = computed(() =>
  Math.min(Math.max(0, (waveformZoom.value - 1) * 100), Math.max(0, progressPercent.value * waveformZoom.value - 40)),
);
const isAudio = computed(() => props.clip.kind === 'audio');
const isVideo = computed(() => !isAudio.value && props.asset?.kind === 'video');
const isImage = computed(() => !isAudio.value && props.asset?.kind === 'image');
const playable = computed(() => Boolean(props.asset?.src) && (isAudio.value || isVideo.value));
const {
  bars,
  bands,
  loadingSegments,
  sourceDurationSeconds,
  status: waveformStatus,
} = useLinkedClipPreviewWaveform(
  computed(() => props.clip),
  computed(() => props.asset),
);
const kindIcons: Record<ClipKind, typeof Film> = {
  screen: Monitor,
  video: Film,
  image: ImageIcon,
  webcam: Camera,
  color: Palette,
  shape: Shapes,
  blur: Layers,
  audio: Volume2,
  caption: Captions,
};

const formatTime = (seconds: number) => {
  const whole = Math.floor(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

let progressFrame = 0;
const stopProgressFrame = () => {
  cancelAnimationFrame(progressFrame);
  progressFrame = 0;
};
const reset = () => {
  stopProgressFrame();
  mediaElement.value?.pause();
  ready.value = false;
  playing.value = false;
  progressSeconds.value = 0;
  error.value = false;
};
watch(() => [props.clip.id, props.asset?.src], reset);
onBeforeUnmount(reset);

const onLoadedMetadata = (event: Event) => {
  const media = event.currentTarget as HTMLMediaElement;
  if (Number.isFinite(media.duration) && sourceStartSeconds.value >= media.duration) {
    error.value = true;
    return;
  }
  media.playbackRate = props.clip.playbackRate;
  media.muted = false;
  media.volume = 1;
  media.currentTime = sourceStartSeconds.value;
  ready.value = true;
  error.value = false;
};
const syncProgress = (media: HTMLMediaElement) => {
  if (media.currentTime < sourceStartSeconds.value) media.currentTime = sourceStartSeconds.value;
  if (media.currentTime >= sourceEndSeconds.value - 0.05) {
    stopProgressFrame();
    media.pause();
    media.currentTime = sourceStartSeconds.value;
    progressSeconds.value = 0;
    return;
  }
  progressSeconds.value = Math.max(0, (media.currentTime - sourceStartSeconds.value) / props.clip.playbackRate);
};
const onTimeUpdate = (event: Event) => syncProgress(event.currentTarget as HTMLMediaElement);
const updateProgressFrame = () => {
  progressFrame = 0;
  const media = mediaElement.value;
  if (!media || media.paused) return;
  syncProgress(media);
  if (!media.paused && playing.value) progressFrame = requestAnimationFrame(updateProgressFrame);
};
const onPlay = () => {
  playing.value = true;
  if (!progressFrame) progressFrame = requestAnimationFrame(updateProgressFrame);
};
const onPause = () => {
  playing.value = false;
  stopProgressFrame();
};
const seekTo = (seconds: number) => {
  const media = mediaElement.value;
  if (!media || !ready.value) return;
  progressSeconds.value = Math.min(durationSeconds.value, Math.max(0, seconds));
  media.currentTime = sourceStartSeconds.value + progressSeconds.value * props.clip.playbackRate;
};
const seekWaveform = (event: PointerEvent) => {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (bounds.width <= 0) return;
  const viewportPercent = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
  seekTo(((viewportPercent + waveformOffsetPercent.value) / (waveformZoom.value * 100)) * durationSeconds.value);
};
const togglePlayback = async () => {
  const media = mediaElement.value;
  if (!media || !ready.value) return;
  if (!media.paused) {
    media.pause();
    return;
  }
  if (media.currentTime >= sourceEndSeconds.value - 0.05) media.currentTime = sourceStartSeconds.value;
  media.muted = false;
  try {
    await media.play();
    error.value = false;
  } catch {
    playing.value = false;
    error.value = true;
  }
};
const onMediaError = () => {
  stopProgressFrame();
  playing.value = false;
  ready.value = false;
  error.value = true;
};
const onEnded = (event: Event) => {
  stopProgressFrame();
  const media = event.currentTarget as HTMLMediaElement;
  media.currentTime = sourceStartSeconds.value;
  progressSeconds.value = 0;
  playing.value = false;
};
</script>

<template>
  <section class="linked-preview-player" :aria-label="t('preview')">
    <div class="preview-stage">
      <video
        v-if="isVideo"
        :key="`${clip.id}:${asset?.src}`"
        ref="mediaElement"
        class="linked-preview-video"
        :src="asset?.src"
        preload="metadata"
        playsinline
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @play="onPlay"
        @pause="onPause"
        @ended="onEnded"
        @error="onMediaError"
      />
      <img v-else-if="isImage" class="linked-preview-image" :src="asset?.src" :alt="clip.name" />
      <template v-else-if="isAudio">
        <div class="audio-waveform-stage">
          <span class="audio-clip-icon" aria-hidden="true"><Volume2 :size="16" /></span>
          <div class="audio-waveform-surface" aria-hidden="true" @pointerdown="seekWaveform">
            <div
              class="waveform-track"
              :style="{
                width: `${waveformZoom * 100}%`,
                transform: `translate3d(-${waveformOffsetPercent / waveformZoom}%, 0, 0)`,
              }"
            >
              <span class="waveform-progress-fill" :style="{ width: `${progressPercent}%` }" />
              <template v-if="bars.length">
                <BlickWaveformCanvas
                  class="waveform-layer waveform-base"
                  :bars="bars"
                  :bands="bands"
                  :source-duration-seconds="sourceDurationSeconds"
                  :loading-segments="loadingSegments"
                />
                <BlickWaveformCanvas
                  class="waveform-layer waveform-played"
                  :style="{ clipPath: `inset(0 ${100 - progressPercent}% 0 0)` }"
                  :bars="bars"
                  :bands="bands"
                  :source-duration-seconds="sourceDurationSeconds"
                  :loading-segments="loadingSegments"
                />
              </template>
              <span class="waveform-playhead" :style="{ left: `${progressPercent}%` }" />
            </div>
            <span v-if="waveformStatus === 'error'" class="waveform-unavailable">{{
              tTracks('waveformUnavailable')
            }}</span>
            <span v-else-if="waveformStatus === 'loading' && !bars.length" class="waveform-loading" />
          </div>
        </div>
        <audio
          v-if="asset?.src"
          :key="`${clip.id}:${asset.src}`"
          ref="mediaElement"
          class="linked-preview-audio"
          :src="asset.src"
          preload="metadata"
          @loadedmetadata="onLoadedMetadata"
          @timeupdate="onTimeUpdate"
          @play="onPlay"
          @pause="onPause"
          @ended="onEnded"
          @error="onMediaError"
        />
      </template>
      <div v-else class="generated-preview" aria-hidden="true">
        <component :is="kindIcons[clip.kind]" :size="38" />
      </div>
    </div>
    <div class="preview-meta">
      <span class="preview-name">{{ clip.name }}</span>
      <span class="preview-source">{{ asset?.sessionPath ?? asset?.fileName ?? asset?.name ?? '' }}</span>
    </div>
    <div class="preview-controls" :class="{ 'is-inactive': !playable }">
      <Button
        class="preview-play-button"
        variant="secondary"
        size="sm"
        icon-only
        :icon="playing ? Pause : Play"
        :disabled="!ready || error"
        :aria-label="playing ? tTimeline('pause') : tTimeline('play')"
        @click="togglePlayback"
      />
      <Slider
        class="preview-progress"
        size="compact"
        :show-value="false"
        :label="t('seekPreview')"
        :model-value="progressSeconds"
        :min="0"
        :max="durationSeconds"
        :step="0.1"
        :disabled="!ready || error"
        @update:model-value="seekTo"
      />
      <span class="preview-time">{{ formatTime(progressSeconds) }} / {{ formatTime(durationSeconds) }}</span>
    </div>
    <p class="preview-status" role="status">
      <span v-if="error || !asset?.src" class="preview-error">{{ t('previewUnavailable') }}</span>
    </p>
  </section>
</template>

<style scoped>
.linked-preview-player {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}
.preview-stage {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-bg-app);
}
.linked-preview-video,
.linked-preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.linked-preview-audio {
  display: none;
}
.generated-preview {
  display: grid;
  place-items: center;
  color: var(--color-primary);
}
.audio-waveform-stage {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 22px;
}
.audio-clip-icon {
  color: var(--color-primary);
}
.audio-waveform-surface {
  position: relative;
  width: 100%;
  height: 100px;
  min-height: 80px;
  overflow: hidden;
  cursor: pointer;
}
.waveform-track {
  position: absolute;
  inset: 0 auto 0 0;
  will-change: transform;
}
.waveform-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-primary-light);
}
.waveform-layer {
  position: absolute;
  inset: 0;
}
.waveform-base {
  opacity: 0.42;
}
.waveform-played {
  opacity: 1;
}
.waveform-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-primary);
  pointer-events: none;
}
.waveform-loading {
  position: absolute;
  inset: 20% 0;
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface-hover);
  opacity: 0.6;
}
.waveform-unavailable {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 12px;
}
.preview-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.preview-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-source {
  overflow: hidden;
  min-height: 1em;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.preview-controls.is-inactive {
  visibility: hidden;
}
.preview-progress {
  flex: 1;
  min-width: 0;
}
.preview-time {
  flex: none;
  color: var(--text-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.preview-status {
  margin: 0;
  min-height: 30px;
}
.preview-error {
  color: var(--color-error);
  font-size: 12px;
}
</style>

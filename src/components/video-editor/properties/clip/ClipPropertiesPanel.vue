<script setup lang="ts">
import type { ClipPropertiesEmits } from './clip-properties-types';
import { computed } from 'vue';
import CropControls from './CropControls.vue';
import ClipAppearanceControls from './ClipAppearanceControls.vue';
import type { SelectedClipProperties } from '../properties-panel-types';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import Divider from '~/ui/divider/Divider.vue';
import TimelineClickEmptyState from '~/components/video-editor/properties/clip/TimelineClickEmptyState.vue';
import { Unlink, RotateCcw } from '@lucide/vue';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import CameraLayoutPanel from '../camera/CameraLayoutPanel.vue';
import { isSplitCameraLayout } from '~/media/shared/camera-layout-types';
const { t } = useTranslate('ClipPropertiesPanel');
const props = defineProps<{
  selectedClip: SelectedClipProperties | null;
}>();
const emit = defineEmits<ClipPropertiesEmits>();
const isVisual = computed(
  () => !!props.selectedClip && ['screen', 'video', 'image', 'webcam'].includes(props.selectedClip.kind),
);
const speedPresets = [0.5, 1.0, 1.5, 2.0, 3.0];

const currentPlaybackRate = computed(() => {
  return Math.round((props.selectedClip?.playbackRate ?? 1.0) * 100) / 100;
});
const clipTransform = computed(() => props.selectedClip?.clipTransform);
const updatePlacement = (patch: Partial<NormalizedTransform>) => {
  const current = clipTransform.value;
  if (!current) return;
  const width = Math.min(4, Math.max(0.02, patch.width ?? current.width));
  let height = Math.min(4, Math.max(0.02, patch.height ?? current.height));
  if (patch.width !== undefined && patch.height === undefined && current.width > 0) {
    height = Math.min(4, Math.max(0.02, (current.height * width) / current.width));
  }
  emit('update:clipTransform', {
    x: Math.min(3, Math.max(-3, patch.x ?? current.x)),
    y: Math.min(3, Math.max(-3, patch.y ?? current.y)),
    width,
    height,
  });
};
</script>

<template>
  <div class="clip-properties">
    <TimelineClickEmptyState v-if="!selectedClip" />

    <div v-else class="options-group">
      <CameraLayoutPanel
        v-if="['screen', 'video', 'image', 'webcam'].includes(selectedClip.kind)"
        :layout="selectedClip.cameraLayoutPreset ?? 'custom'"
        :framing="selectedClip.cameraFramingPreset ?? 'custom'"
        :has-linked-screen="selectedClip.hasLinkedScreen ?? false"
        :split-ratio="selectedClip.cameraSplitRatio ?? 0.5"
        :split-padding="selectedClip.cameraSplitPadding ?? 0"
        :react-to-zoom="selectedClip.reactToZoom ?? true"
        :supports-split-layouts="selectedClip.kind === 'webcam'"
        @update:layout="emit('update:cameraLayout', $event)"
        @update:framing="emit('update:cameraFraming', $event)"
        @update:split-ratio="emit('update:cameraSplitRatio', $event)"
        @update:split-padding="emit('update:cameraSplitPadding', $event)"
        @update:react-to-zoom="emit('update:reactToZoom', $event)"
      />
      <Divider v-if="['screen', 'video', 'image', 'webcam'].includes(selectedClip.kind)" spacing="xs" />

      <!-- Placement Section -->
      <div
        v-if="clipTransform && !isSplitCameraLayout(selectedClip.cameraLayoutPreset ?? 'custom')"
        class="section-block"
      >
        <div class="section-header">
          <span class="section-title">{{ t('placement') }}</span>
          <Button
            variant="ghost"
            size="xs"
            :icon="RotateCcw"
            :aria-label="t('resetClipPlacement')"
            @click="emit('reset:clipTransform')"
            >{{ t('reset') }}</Button
          >
        </div>
        <div class="sliders-stack">
          <BigSlider
            :model-value="clipTransform.x * 100"
            :min="-300"
            :max="300"
            :step="1"
            :label="t('horizontal')"
            :format-value="(value) => `${Math.round(value)}%`"
            @update:modelValue="updatePlacement({ x: $event / 100 })"
          />
          <BigSlider
            :model-value="clipTransform.y * 100"
            :min="-300"
            :max="300"
            :step="1"
            :label="t('vertical')"
            :format-value="(value) => `${Math.round(value)}%`"
            @update:modelValue="updatePlacement({ y: $event / 100 })"
          />
          <BigSlider
            :model-value="clipTransform.width * 100"
            :min="2"
            :max="400"
            :step="1"
            :label="t('size')"
            :format-value="(value) => `${Math.round(value)}%`"
            @update:modelValue="updatePlacement({ width: $event / 100 })"
          />
        </div>
      </div>

      <!-- Divider -->
      <Divider
        v-if="clipTransform && ['screen', 'video', 'image', 'webcam'].includes(selectedClip.kind)"
        spacing="xs"
      />

      <div v-if="isVisual" class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('crop') }}</span>
        </div>
        <CropControls
          :key="selectedClip.id"
          :clip="selectedClip"
          @update="emit('update:crop', $event)"
          @preview="emit('preview:crop', $event)"
        />
      </div>
      <Divider v-if="isVisual" spacing="xs" />
      <ClipAppearanceControls
        v-if="isVisual"
        :selected-clip="selectedClip"
        @update:is-mirrored="emit('update:isMirrored', $event)"
        @update:is-mirrored-y="emit('update:isMirroredY', $event)"
        @update:corner-radius="emit('update:cornerRadius', $event)"
        @corner-radius-interaction="emit('corner-radius-interaction', $event)"
        @update:shadow="emit('update:shadow', $event)"
        @update:appearance="emit('update:appearance', $event)"
      />

      <!-- Divider -->
      <Divider v-if="['screen', 'video', 'webcam'].includes(selectedClip.kind)" spacing="xs" />

      <!-- Speed Boost / Rate Controls -->
      <div v-if="['screen', 'video', 'webcam'].includes(selectedClip.kind)" class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('speedBoost') }}</span>
        </div>
        <BigSlider
          :model-value="currentPlaybackRate"
          :default-value="1.0"
          :min="0.25"
          :max="4.0"
          :step="0.05"
          :label="t('playbackSpeed')"
          :format-value="(val) => `${val.toFixed(2)}×`"
          @update:modelValue="emit('update:playbackRate', $event)"
        />
        <div class="preset-pills">
          <button
            v-for="preset in speedPresets"
            :key="preset"
            type="button"
            class="preset-pill"
            :class="{ active: Math.abs(currentPlaybackRate - preset) < 0.04 }"
            @click="emit('update:playbackRate', preset)"
          >
            {{ preset }}×
          </button>
        </div>
      </div>

      <!-- Divider -->
      <Divider v-if="selectedClip.isLinked" spacing="xs" />

      <!-- Controls & Link -->
      <div v-if="selectedClip.isLinked" class="section-block">
        <div class="prop-row">
          <div class="link-label">
            <Unlink :size="14" />
            <span>{{ t('sidecarLink') }}</span>
          </div>
          <Button variant="outline" size="sm" @click="emit('unlink')"> Unlink </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ClipPropertiesPanel.css"></style>

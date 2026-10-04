<script setup lang="ts">
import type { ClipPropertiesEmits } from './clip-properties-types';
import { computed, ref } from 'vue';
import CropControls from './CropControls.vue';
import ClipAppearanceControls from './ClipAppearanceControls.vue';
import TransformControls from '../shared/TransformControls.vue';
import type { SelectedClipProperties } from '../properties-panel-types';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import TimelineClickEmptyState from './TimelineClickEmptyState.vue';
import { RotateCcw } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import CameraLayoutPanel from '../camera/CameraLayoutPanel.vue';
import { isSplitCameraLayout } from '@beam/engine/shared/camera-layout-types';
const { t } = useTranslate('ClipPropertiesPanel');
const { t: layoutText } = useTranslate('CameraLayoutPanel');
const props = defineProps<{
  canvasSize: { width: number; height: number };
  hideLayout?: boolean;
  hideCrop?: boolean;
  selectedClip: SelectedClipProperties | null;
}>();
const emit = defineEmits<ClipPropertiesEmits>();
const sections = ref({ placement: true, layout: false, crop: false, speed: false });
const isVisual = computed(
  () => !!props.selectedClip && ['screen', 'video', 'image', 'webcam'].includes(props.selectedClip.kind),
);
const hasPlacement = computed(
  () => !!props.selectedClip?.clipTransform && !isSplitCameraLayout(props.selectedClip.cameraLayoutPreset ?? 'custom'),
);
const speedPresets = [0.5, 1, 1.5, 2, 3];
const currentPlaybackRate = computed(() => Math.round((props.selectedClip?.playbackRate ?? 1) * 100) / 100);
</script>

<template>
  <div class="clip-properties">
    <TimelineClickEmptyState v-if="!selectedClip" />
    <div v-else class="options-group">
      <Accordion
        v-if="hasPlacement && selectedClip.clipTransform"
        v-model="sections.placement"
        appearance="inspector"
        :title="t('placement')"
        data-clip-section="placement"
      >
        <div class="section-block">
          <TransformControls
            :model-value="selectedClip.clipTransform"
            :canvas-size="canvasSize"
            :mirrored="selectedClip.isMirrored"
            :mirrored-y="selectedClip.isMirroredY"
            :rotation="selectedClip.rotation"
            :show-mirroring="isVisual"
            @update:model-value="emit('update:clipTransform', $event)"
            @update:mirrored="emit('update:isMirrored', $event)"
            @update:mirrored-y="emit('update:isMirroredY', $event)"
            @update:rotation="emit('update:rotation', $event)"
          />
          <div class="section-actions">
            <Button
              variant="ghost"
              size="xs"
              :icon="RotateCcw"
              :aria-label="t('resetClipPlacement')"
              @click="emit('reset:clipTransform')"
              >{{ t('reset') }}</Button
            >
          </div>
        </div>
      </Accordion>
      <Accordion
        v-if="isVisual && !hideLayout"
        v-model="sections.layout"
        appearance="inspector"
        :title="layoutText(selectedClip.kind === 'webcam' ? 'title' : 'visualTitle')"
        data-clip-section="layout"
      >
        <CameraLayoutPanel
          hide-heading
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
      </Accordion>
      <Accordion
        v-if="isVisual && !hideCrop"
        v-model="sections.crop"
        appearance="inspector"
        :title="t('crop')"
        data-clip-section="crop"
      >
        <CropControls
          :key="selectedClip.id"
          :clip="selectedClip"
          @update="emit('update:crop', $event)"
          @preview="emit('preview:crop', $event)"
        />
      </Accordion>
      <ClipAppearanceControls
        v-if="isVisual"
        :selected-clip="selectedClip"
        :hide-mirroring="hasPlacement"
        @update:is-mirrored="emit('update:isMirrored', $event)"
        @update:is-mirrored-y="emit('update:isMirroredY', $event)"
        @update:rotation="emit('update:rotation', $event)"
        @update:corner-radius="emit('update:cornerRadius', $event)"
        @corner-radius-interaction="emit('corner-radius-interaction', $event)"
        @update:shadow="emit('update:shadow', $event)"
        @update:appearance="emit('update:appearance', $event)"
      />
      <Accordion
        v-if="['screen', 'video', 'webcam'].includes(selectedClip.kind)"
        v-model="sections.speed"
        appearance="inspector"
        :title="t('playbackSpeed')"
        data-clip-section="speed"
      >
        <div class="section-block">
          <BigSlider
            :model-value="currentPlaybackRate"
            :default-value="1"
            :min="0.25"
            :max="4"
            :step="0.05"
            :label="t('playbackSpeed')"
            :format-value="(value) => `${value.toFixed(2)}×`"
            @update:model-value="emit('update:playbackRate', $event)"
          />
          <ButtonGroup full variant="neutral" size="xs">
            <Button
              v-for="preset in speedPresets"
              :key="preset"
              class="preset-pill"
              :variant="Math.abs(currentPlaybackRate - preset) < 0.04 ? 'selected' : 'ghost'"
              size="xs"
              @click="emit('update:playbackRate', preset)"
              >{{ preset }}×</Button
            >
          </ButtonGroup>
        </div>
      </Accordion>
      <slot name="sidecars" />
    </div>
  </div>
</template>
<style scoped src="./ClipPropertiesPanel.css"></style>

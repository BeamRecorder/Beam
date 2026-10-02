<script setup lang="ts">
import { Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import ColorInput from '~/ui/input/ColorInput.vue';
import Select from '~/ui/select/Select.vue';
import { useGradient } from './composables/useGradient';
import type { GradientValue, GradientPreset } from '~/components/ui/Gradient/gradient-types';

const uiText = {
  editStop: 'Edit Stop',
  color: 'Color',
  opacity: 'Opacity',
  position: 'Position',
  presets: 'Presets',
  type: 'Type',
  angle: 'Angle',
  removeStop: 'Remove Stop',
  dragUpToDelete: 'Drag up to delete',
  dragDownToDelete: 'Drag down to delete',
};

const props = withDefaults(
  defineProps<{
    modelValue: GradientValue | null | undefined;
    presets?: GradientPreset[];
    minStops?: number;
    maxStops?: number;
    showAngle?: boolean;
  }>(),
  {
    showAngle: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: GradientValue): void;
}>();

const {
  stops,
  selectedStop,
  selectedStopId,
  draggingStopId,
  dragDeleteDirection,
  isOverTrash,
  isPopoverOpen,
  gradientPreviewStyle,
  gradientType,
  gradientAngle,
  trackRef,
  effectiveMinStops,
  addStop,
  removeStop,
  updateStop,
  onTrackClick,
  startDragging,
  handleStopClick,
  updateGradientType,
  updateGradientAngle,
  updateSelectedStopAlpha,
  updateSelectedStopPosition,
  hexToRgb,
  effectiveMaxStops,
} = useGradient(props, emit);
void trackRef;
void addStop;

const gradientTypeOptions = [
  { label: 'Linear', value: 'linear' },
  { label: 'Radial', value: 'radial' },
];
</script>

<template>
  <div class="gradient-editor">
    <div v-if="showAngle" class="gradient-options">
      <div class="option-row">
        <label>{{ uiText.type }}</label>
        <Select :model-value="gradientType" :options="gradientTypeOptions" @update:model-value="updateGradientType" />
      </div>
      <div v-if="gradientType === 'linear'" class="angle-row">
        <BigSlider
          label="Angle"
          :model-value="gradientAngle"
          :min="0"
          :max="360"
          :step="1"
          :format-value="(val: number) => `${val}°`"
          @update:model-value="updateGradientAngle"
        />
      </div>
    </div>
    <div class="gradient-visual-container">
      <div
        class="delete-zone delete-zone--top"
        :class="{
          'is-visible': isOverTrash && dragDeleteDirection === 'top',
          'is-active': isOverTrash && dragDeleteDirection === 'top',
        }"
      >
        <Trash2 :size="12" />
        <span>{{ uiText.dragUpToDelete }}</span>
      </div>
      <div
        ref="trackRef"
        class="gradient-track"
        :class="{ 'is-locked': stops.length >= effectiveMaxStops }"
        @pointerdown="onTrackClick"
      >
        <!-- Checkerboard background for alpha visibility -->
        <div class="checkerboard"></div>
        <!-- Gradient preview -->
        <div class="gradient-fill" :style="gradientPreviewStyle"></div>

        <!-- Interaction markers -->
        <div
          v-for="stop in stops"
          :key="stop.id"
          class="stop-handle"
          :class="{
            active: selectedStopId === stop.id,
            dragging: draggingStopId === stop.id,
            'over-trash': draggingStopId === stop.id && isOverTrash,
          }"
          :style="{ left: `${stop.position * 100}%` }"
          @pointerdown="startDragging($event, stop.id)"
          @click="handleStopClick($event, stop.id)"
        >
          <div
            class="stop-marker"
            :style="{
              backgroundColor: `rgba(${hexToRgb(stop.color).r}, ${hexToRgb(stop.color).g}, ${hexToRgb(stop.color).b}, ${stop.alpha ?? 1})`,
            }"
          ></div>
          <div v-if="draggingStopId === stop.id && isOverTrash" class="trash-indicator">
            <Trash2 :size="14" />
          </div>
        </div>
      </div>
      <div
        class="delete-zone delete-zone--bottom"
        :class="{
          'is-visible': isOverTrash && dragDeleteDirection === 'bottom',
          'is-active': isOverTrash && dragDeleteDirection === 'bottom',
        }"
      >
        <Trash2 :size="12" />
        <span>{{ uiText.dragDownToDelete }}</span>
      </div>
    </div>

    <!-- Stop Editor Inline Panel -->
    <Transition name="slide-fade">
      <div v-if="selectedStop && isPopoverOpen" class="stop-edit-form">
        <div class="form-header">
          <span class="form-title">{{ uiText.editStop }}</span>
          <Button
            variant="danger"
            size="sm"
            icon-only
            tooltip="Remove Stop"
            :disabled="stops.length <= effectiveMinStops"
            @click="removeStop(selectedStop!.id)"
          >
            <Trash2 :size="14" />
          </Button>
        </div>

        <ColorInput
          :label="uiText.color"
          :model-value="selectedStop.color"
          @update:model-value="updateStop(selectedStop.id, { color: $event })"
        />

        <BigSlider
          label="Opacity"
          suffix="%"
          :model-value="Math.round((selectedStop.alpha ?? 1) * 100)"
          :min="0"
          :max="100"
          :step="1"
          :format-value="(val: number) => `${val}%`"
          @update:model-value="updateSelectedStopAlpha($event / 100)"
        />

        <BigSlider
          label="Position"
          suffix="%"
          :model-value="Math.round(selectedStop.position * 100)"
          :min="0"
          :max="100"
          :step="1"
          :format-value="(val: number) => `${val}%`"
          @update:model-value="updateSelectedStopPosition($event / 100)"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped src="./Gradient.css" />

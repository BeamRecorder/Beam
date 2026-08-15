<script setup lang="ts">
import { Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import ColorInput from '~/ui/input/ColorInput.vue';
import Select from '~/ui/select/Select.vue';
import { useGradient, type GradientValue, type GradientPreset } from './composables/useGradient';

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

<style scoped>
.gradient-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  user-select: none;
}

.gradient-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gradient-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.option-row label {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-color-secondary, #9ca3af);
}

.gradient-count {
  font-size: 0.75rem;
  color: var(--text-color-secondary, #9ca3af);
  font-weight: 500;
}

.gradient-visual-container {
  padding: 4px 0 12px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.delete-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 18px;
  border-radius: 6px;
  border: 1px dashed rgba(156, 163, 175, 0.35);
  background: rgba(15, 23, 42, 0.25);
  color: var(--text-color-secondary, #9ca3af);
  font-size: 0.66rem;
  opacity: 0;
  transform: scale(0.98);
  transition: all 0.15s ease;
  pointer-events: none;
}

.delete-zone.is-visible {
  opacity: 0.8;
}

.delete-zone.is-active {
  opacity: 1;
  border-color: rgba(239, 68, 68, 0.75);
  color: var(--error-color, #ef4444);
  background: rgba(127, 29, 29, 0.22);
  transform: scale(1);
}

.gradient-track {
  position: relative;
  width: 100%;
  height: 28px;
  border-radius: 8px;
  cursor: crosshair;
  background: #000;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  overflow: visible;
  transition: opacity 0.2s;
  touch-action: manipulation;
}

.gradient-track.is-locked {
  cursor: default;
}

.checkerboard {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background-color: #ffffff;
  background-image:
    linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
  background-size: 8px 8px;
  background-position:
    0 0,
    0 4px,
    4px -4px,
    -4px 0px;
}

.gradient-fill {
  position: absolute;
  inset: 0;
  border-radius: 8px;
}

.stop-handle {
  position: absolute;
  top: 28px;
  width: 14px;
  height: 18px;
  transform: translateX(-50%);
  cursor: grab;
  z-index: 10;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  touch-action: none;
}

.stop-handle:active {
  cursor: grabbing;
}

.stop-handle.active {
  z-index: 12;
}

.stop-handle.dragging {
  z-index: 13;
  transition: none;
  /* Disable transition while dragging for responsiveness */
}

.angle-row {
  width: 100%;
}

.stop-handle::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid var(--color-border-dark);
}

.stop-handle.active::before {
  border-bottom-color: var(--color-primary);
}

.stop-marker {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  border: 2px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
  background-color: var(--color-bg-surface);
}

.stop-handle.active .stop-marker {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.trash-indicator {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--error-color, #ef4444);
  animation: bounce 0.5s infinite alternate;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

@keyframes bounce {
  from {
    transform: translateX(-50%) translateY(0);
  }

  to {
    transform: translateX(-50%) translateY(-4px);
  }
}

.stop-handle.over-trash .stop-marker {
  border-color: var(--error-color, #ef4444);
  opacity: 0.5;
  transform: scale(0.8);
}

.gradient-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.preset-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface-color-light, #374151);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 4px 10px 4px 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-chip:hover {
  background: var(--surface-color-lighter, #4b5563);
  border-color: var(--primary-color, #55b2e2);
}

.preset-preview {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.preset-chip span {
  font-size: 0.72rem;
  color: var(--text-color, #e5e7eb);
  font-weight: 500;
}

/* Popover Styles */
.stop-edit-form {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.stop-edit-form :deep(.color-picker-wrapper) {
  width: 100% !important;
  gap: 0;
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.form-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-color-secondary, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row label {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-color-secondary, #9ca3af);
}

.color-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.color-input-wrapper input[type='color'] {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: none;
  padding: 0;
  cursor: pointer;
}

.hex-value {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  color: var(--text-color, #fff);
}

.range-group {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.value-label {
  font-size: 0.7rem;
  min-width: 36px;
  text-align: right;
  color: var(--text-color, #fff);
}

.form-actions.merged-actions {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  width: 100%;
}

.flex-spacer {
  flex: 1;
}

/* Presets Library */
.presets-library {
  width: 260px;
  max-width: calc(100vw - 32px);
  max-height: 320px;
  overflow-y: auto;
  padding: var(--space-2);
  background: transparent;
}

.preset-toggle-btn {
  width: var(--size-control);
  height: var(--size-control);
  padding: 0 !important;
}

.presets-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}

.presets-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  letter-spacing: 0.05em;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.preset-card {
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xs);
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-card:hover {
  background: var(--color-hover);
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.preset-preview-large {
  width: 100%;
  height: 24px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.preset-name {
  font-size: 0.65rem;
  color: var(--color-text);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 480px) {
  .gradient-visual-container {
    padding: 10px 0 26px;
  }

  .gradient-track {
    height: 34px;
    border-radius: 9px;
  }

  .checkerboard,
  .gradient-fill {
    border-radius: 9px;
  }

  .stop-handle {
    top: 34px;
    width: 22px;
    height: 24px;
  }

  .stop-handle::before {
    top: -8px;
    border-left-width: 8px;
    border-right-width: 8px;
    border-bottom-width: 8px;
  }

  .stop-edit-form {
    width: min(260px, calc(100vw - 32px));
  }

  .presets-library {
    width: min(300px, calc(100vw - 32px));
    max-height: min(340px, calc(100vh - 160px));
  }
}

/* Slide fade transition for stop editor inline panel */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition:
    opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>

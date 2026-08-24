<script setup lang="ts">
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import Popover from '~/ui/popover/Popover.vue';
import ZoomClickEmptyState from '~/components/video-editor/properties/zoom/ZoomClickEmptyState.vue';
import { MousePointer, SlidersHorizontal, Sparkles } from '@lucide/vue';
import type {
  ZoomDepth,
  ZoomElement,
  ZoomMotionBlurSettings,
  ZoomTiltPreset,
} from '~/components/video-editor/zoom/zoom-types';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_INTENSITY,
  DEFAULT_ZOOM_TILT_VERTICAL,
  normalizeZoomProjection,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  normalizeZoomTiltPreset,
  ZOOM_TILT_PRESET_INTENSITIES,
} from '~/components/video-editor/zoom/zoom-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('ZoomPanel');

const props = defineProps<{
  selectedZoom: ZoomElement | null;
  canGenerate: boolean;
  hasAutomaticZooms: boolean;
  motionBlur: ZoomMotionBlurSettings;
}>();

const emit = defineEmits<{
  (event: 'update', value: ZoomElement): void;
  (event: 'delete'): void;
  (event: 'generate'): void;
  (event: 'update:motionBlur', value: ZoomMotionBlurSettings): void;
}>();

const magnificationValues = [1.25, 1.5, 1.8, 2.2, 3.5, 5.0];
const tiltPresets: ZoomTiltPreset[] = ['small', 'medium', 'large', 'custom'];
const tiltPresetLabels: Record<ZoomTiltPreset, string> = {
  small: 'tiltPresetSmall',
  medium: 'tiltPresetMedium',
  large: 'tiltPresetLarge',
  custom: 'tiltPresetCustom',
};

const updateDepth = (depth: number) => {
  if (!props.selectedZoom) return;
  const clamped = Math.max(1, Math.min(6, Math.round(depth))) as ZoomDepth;
  emit('update', { ...props.selectedZoom, depth: clamped });
};

const setMode = (mode: ZoomElement['mode']) => {
  if (!props.selectedZoom || props.selectedZoom.mode === mode) return;
  emit('update', {
    ...props.selectedZoom,
    mode,
  });
};

const setProjection = (projection: '2d' | '3d') => {
  if (!props.selectedZoom || normalizeZoomProjection(props.selectedZoom.projection) === projection) return;
  emit('update', {
    ...props.selectedZoom,
    projection,
    tiltIntensity: normalizeZoomTiltIntensity(props.selectedZoom.tiltIntensity),
    tiltHorizontal: normalizeZoomTiltAxis(props.selectedZoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
    tiltVertical: normalizeZoomTiltAxis(props.selectedZoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
    tiltPreset:
      projection === '3d' && props.selectedZoom.mode === 'auto'
        ? 'custom'
        : normalizeZoomTiltPreset(props.selectedZoom.tiltPreset, props.selectedZoom.tiltIntensity),
  });
};

const setTiltPreset = (preset: ZoomTiltPreset) => {
  if (!props.selectedZoom) return;
  emit('update', {
    ...props.selectedZoom,
    tiltPreset: preset,
    ...(preset === 'custom' ? {} : { tiltIntensity: ZOOM_TILT_PRESET_INTENSITIES[preset] }),
  });
};

const updateTiltIntensity = (value: number) => {
  if (!props.selectedZoom) return;
  emit('update', {
    ...props.selectedZoom,
    tiltIntensity: Math.min(1, Math.max(0, value / 100)),
    tiltPreset: 'custom',
  });
};

const updateTiltAxis = (axis: 'tiltHorizontal' | 'tiltVertical', value: number) => {
  if (!props.selectedZoom) return;
  emit('update', {
    ...props.selectedZoom,
    [axis]: Math.min(1, Math.max(-1, value / 100)),
    tiltPreset: 'custom',
  });
};

const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}%`;

const updateMotionBlur = (patch: Partial<ZoomMotionBlurSettings>) => {
  emit('update:motionBlur', { ...props.motionBlur, ...patch });
};
</script>

<template>
  <div class="zoom-panel">
    <!-- Top Action Header -->
    <div class="header-action">
      <Button
        v-if="!hasAutomaticZooms"
        variant="primary"
        size="sm"
        :icon="Sparkles"
        :disabled="!canGenerate"
        block
        @click="emit('generate')"
      >
        {{ t('generateAutoZooms') }}
      </Button>
      <Popover v-else block>
        <template #trigger>
          <Button variant="outline" size="sm" :icon="Sparkles" :disabled="!canGenerate" block>
            {{ t('regenerateAutoZooms') }}
          </Button>
        </template>
        <template #default="{ close }">
          <div class="refresh-confirmation">
            <p>{{ t('regenerateConfirm') }}</p>
            <div class="refresh-actions">
              <Button variant="ghost" size="xs" @click="close">{{ t('cancel') }}</Button>
              <Button
                variant="danger"
                size="xs"
                @click="
                  emit('generate');
                  close();
                "
              >
                {{ t('regenerate') }}
              </Button>
            </div>
          </div>
        </template>
      </Popover>
    </div>

    <div class="section-block motion-blur-settings">
      <div class="section-header">
        <div class="motion-blur-copy">
          <span class="section-title">{{ t('motionBlur') }}</span>
          <span class="section-description">{{ t('motionBlurDesc') }}</span>
        </div>
        <Switch
          :model-value="motionBlur.enabled"
          :aria-label="t('motionBlur')"
          @update:model-value="updateMotionBlur({ enabled: $event })"
        />
      </div>
      <BigSlider
        v-if="motionBlur.enabled"
        :model-value="motionBlur.intensity * 100"
        :min="0"
        :max="100"
        :step="1"
        :default-value="55"
        :label="t('motionBlurIntensity')"
        :format-value="(value) => `${Math.round(value)}%`"
        @update:model-value="updateMotionBlur({ intensity: $event / 100 })"
      />
    </div>

    <!-- Active Zoom Block Inspector -->
    <div v-if="selectedZoom" class="options-group">
      <!-- Mode Toggle -->
      <div class="section-block">
        <span class="section-title">{{ t('mode') }}</span>
        <ButtonGroup full>
          <Button size="xs" :variant="selectedZoom.mode === 'auto' ? 'primary' : 'ghost'" @click="setMode('auto')">
            {{ t('autoCursor') }}
          </Button>
          <Button size="xs" :variant="selectedZoom.mode === 'manual' ? 'primary' : 'ghost'" @click="setMode('manual')">
            {{ t('manualFocus') }}
          </Button>
        </ButtonGroup>
        <div class="hint-card">
          <MousePointer :size="13" class="hint-icon" />
          <span>
            {{ selectedZoom.mode === 'manual' ? t('manualHint') : t('autoHint') }}
          </span>
        </div>
      </div>

      <div class="section-block">
        <span class="section-title">{{ t('projection') }}</span>
        <ButtonGroup full>
          <Button
            size="xs"
            :variant="normalizeZoomProjection(selectedZoom.projection) === '2d' ? 'primary' : 'ghost'"
            @click="setProjection('2d')"
          >
            {{ t('projection2d') }}
          </Button>
          <Button
            size="xs"
            :variant="normalizeZoomProjection(selectedZoom.projection) === '3d' ? 'primary' : 'ghost'"
            @click="setProjection('3d')"
          >
            {{ t('projection3d') }}
          </Button>
        </ButtonGroup>
        <template v-if="normalizeZoomProjection(selectedZoom.projection) === '3d'">
          <span class="section-title">{{ t('tiltPreset') }}</span>
          <ButtonGroup full>
            <Button
              v-for="preset in tiltPresets"
              :key="preset"
              size="xs"
              :variant="
                normalizeZoomTiltPreset(selectedZoom.tiltPreset, selectedZoom.tiltIntensity) === preset
                  ? 'primary'
                  : 'ghost'
              "
              :icon="preset === 'custom' ? SlidersHorizontal : undefined"
              :icon-only="preset === 'custom'"
              :aria-label="preset === 'custom' ? t(tiltPresetLabels[preset]) : undefined"
              :tooltip="preset === 'custom' ? t(tiltPresetLabels[preset]) : ''"
              @click="setTiltPreset(preset)"
            >
              <template v-if="preset !== 'custom'">
                {{ t(tiltPresetLabels[preset]) }}
              </template>
            </Button>
          </ButtonGroup>
        </template>
        <BigSlider
          v-if="normalizeZoomProjection(selectedZoom.projection) === '3d'"
          :model-value="normalizeZoomTiltIntensity(selectedZoom.tiltIntensity) * 100"
          :min="0"
          :max="100"
          :step="1"
          :default-value="DEFAULT_ZOOM_TILT_INTENSITY * 100"
          :label="t('tiltIntensity')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="updateTiltIntensity"
        />
        <BigSlider
          v-if="normalizeZoomProjection(selectedZoom.projection) === '3d'"
          :model-value="normalizeZoomTiltAxis(selectedZoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL) * 100"
          :min="-100"
          :max="100"
          :step="1"
          :default-value="DEFAULT_ZOOM_TILT_HORIZONTAL * 100"
          :label="t('tiltHorizontal')"
          :format-value="formatSignedPercent"
          @update:model-value="updateTiltAxis('tiltHorizontal', $event)"
        />
        <BigSlider
          v-if="normalizeZoomProjection(selectedZoom.projection) === '3d'"
          :model-value="normalizeZoomTiltAxis(selectedZoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL) * 100"
          :min="-100"
          :max="100"
          :step="1"
          :default-value="DEFAULT_ZOOM_TILT_VERTICAL * 100"
          :label="t('tiltVertical')"
          :format-value="formatSignedPercent"
          @update:model-value="updateTiltAxis('tiltVertical', $event)"
        />
        <span class="section-description">{{ t('projectionDesc') }}</span>
      </div>

      <!-- Zoom Level / Depth -->
      <div class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('magnification') }}</span>
          <span class="depth-badge">{{ magnificationValues[selectedZoom.depth - 1]?.toFixed(2) }}×</span>
        </div>

        <BigSlider
          :model-value="selectedZoom.depth"
          :min="1"
          :max="6"
          :step="1"
          :default-value="2"
          :label="t('zoomLevel')"
          :format-value="(val) => `${magnificationValues[Math.round(val) - 1]?.toFixed(2)}×`"
          @update:model-value="updateDepth"
        />

        <div class="depth-presets">
          <button
            v-for="(val, idx) in magnificationValues"
            :key="idx"
            type="button"
            class="preset-pill"
            :class="{ active: selectedZoom.depth === idx + 1 }"
            @click="updateDepth(idx + 1)"
          >
            {{ val }}×
          </button>
        </div>
      </div>
    </div>

    <!-- Empty Selection State -->
    <ZoomClickEmptyState v-else />
  </div>
</template>

<style scoped>
.zoom-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 100%;
}

.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.motion-blur-copy {
  display: grid;
  gap: 3px;
}

.section-description {
  max-width: 220px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
}

.depth-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
}

.hint-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: var(--color-bg-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}

.hint-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--color-primary);
}

.depth-presets {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.preset-pill {
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--fast) ease;
}

.preset-pill:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.preset-pill.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.danger-zone {
  margin-top: auto;
  padding-top: 16px;
  width: 100%;
}

.danger-zone :deep(.btn-container),
.danger-zone :deep(.delete-item-btn) {
  width: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
  background: var(--color-bg-element);
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border-strong);
}

.empty-icon {
  color: var(--text-muted);
  margin-bottom: 8px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.empty-desc {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.refresh-confirmation {
  width: 240px;
  padding: 10px;
}

.refresh-confirmation p {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.refresh-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>

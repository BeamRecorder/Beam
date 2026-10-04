<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Info, Sparkles } from '@lucide/vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import ConfirmDialog from '~/ui/dialog/ConfirmDialog.vue';
import ZoomClickEmptyState from './ZoomClickEmptyState.vue';
import ZoomAutoFollowControls from './ZoomAutoFollowControls.vue';
import ZoomTiltControls from './ZoomTiltControls.vue';
import GlassHighlightControls from './GlassHighlightControls.vue';
import ZoomFocusControls from './ZoomFocusControls.vue';
import type { ZoomPanelProps, ZoomPanelEmits } from './zoom-panel-types';
import {
  DEFAULT_ZOOM_AUTO_FOLLOW,
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  normalizeZoomProjection,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  normalizeZoomTiltPreset,
  ZOOM_DEPTH_SCALES,
  type ZoomDepth,
  type ZoomMotionBlurSettings,
  type ZoomStyle,
} from '@beam/engine/zoom/zoom-types';
import { createGlassHighlight } from '@beam/engine/zoom/glass-highlight';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('ZoomPanel');
const { t: glassText } = useTranslate('GlassHighlight');
const props = withDefaults(defineProps<ZoomPanelProps>(), { autoFollow: () => ({ ...DEFAULT_ZOOM_AUTO_FOLLOW }) });
const emit = defineEmits<ZoomPanelEmits>();
const sections = ref({
  style: true,
  placement: true,
  magnification: true,
  camera: false,
  animation: false,
  automatic: false,
});
const magnificationValues = Object.values(ZOOM_DEPTH_SCALES);
const generationStyle = ref<ZoomStyle>('2d');
const confirmingGeneration = ref(false);
const confirmGeneration = () => {
  confirmingGeneration.value = false;
  if (props.canGenerate) emit('generate', style.value);
};
watch(
  () => props.canGenerate,
  (available) => {
    if (!available) confirmingGeneration.value = false;
  },
);
const style = computed(() =>
  props.selectedZoom
    ? props.selectedZoom.effect === 'glass'
      ? 'glass'
      : normalizeZoomProjection(props.selectedZoom.projection)
    : generationStyle.value,
);
const updateDepth = (depth: number) => {
  if (!props.selectedZoom || props.selectedZoom.locked) return;
  emit('update', { ...props.selectedZoom, depth: Math.max(1, Math.min(6, Math.round(depth))) as ZoomDepth });
};
const setMode = (mode: 'auto' | 'manual') => {
  if (!props.selectedZoom || props.selectedZoom.locked || props.selectedZoom.mode === mode) return;
  emit('update', { ...props.selectedZoom, mode });
};
const setStyle = (value: '2d' | '3d' | 'glass') => {
  const zoom = props.selectedZoom;
  if (!zoom) {
    generationStyle.value = value;
    return;
  }
  if (zoom.locked || style.value === value) return;
  if (value === 'glass') {
    emit('update', {
      ...zoom,
      effect: 'glass',
      mode: 'manual',
      focus: { cx: Math.min(1, Math.max(0, zoom.focus.cx)), cy: Math.min(1, Math.max(0, zoom.focus.cy)) },
      depth: zoom.glass ? zoom.depth : 4,
      glass: zoom.glass ?? createGlassHighlight(),
    });
    return;
  }
  emit('update', {
    ...zoom,
    ...(zoom.effect ? { effect: 'camera' as const } : {}),
    projection: value,
    tiltIntensity: normalizeZoomTiltIntensity(zoom.tiltIntensity),
    tiltHorizontal: normalizeZoomTiltAxis(zoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
    tiltVertical: normalizeZoomTiltAxis(zoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
    tiltPreset:
      value === '3d' && zoom.mode === 'auto' ? 'custom' : normalizeZoomTiltPreset(zoom.tiltPreset, zoom.tiltIntensity),
  });
};
const updateMotionBlur = (patch: Partial<ZoomMotionBlurSettings>) =>
  emit('update:motionBlur', { ...props.motionBlur, ...patch });
</script>

<template>
  <div class="zoom-panel">
    <template v-if="selectedZoom || !still">
      <Accordion v-model="sections.style" :title="glassText('style')" appearance="inspector">
        <div class="section-block">
          <ButtonGroup
            class="zoom-projection-options"
            full
            size="xs"
            variant="neutral"
            :selection="{ count: 3, index: style === 'glass' ? 2 : style === '3d' ? 1 : 0 }"
          >
            <Button
              v-for="value in ['2d', '3d', 'glass'] as const"
              :key="value"
              size="xs"
              :variant="style === value ? 'selected' : 'ghost'"
              :disabled="selectedZoom?.locked"
              @click="setStyle(value)"
              >{{
                value === 'glass' ? glassText('loupe') : t(value === '2d' ? 'projection2d' : 'projection3d')
              }}</Button
            >
          </ButtonGroup>
          <p v-if="style === 'glass'" class="section-description">{{ glassText('description') }}</p>
        </div>
      </Accordion>
      <GlassHighlightControls
        v-if="selectedZoom && style === 'glass'"
        :zoom="selectedZoom"
        :canvas-size="canvasSize"
        :still="still"
        @update="emit('update', $event)"
      />
      <Accordion
        v-else-if="selectedZoom"
        v-model="sections.placement"
        :title="glassText('placement')"
        appearance="inspector"
      >
        <div class="section-block">
          <ButtonGroup
            v-if="!still"
            class="zoom-mode-options"
            full
            size="xs"
            variant="neutral"
            :selection="{ count: 2, index: selectedZoom.mode === 'auto' ? 0 : 1 }"
          >
            <Button
              size="xs"
              :variant="selectedZoom.mode === 'auto' ? 'selected' : 'ghost'"
              :disabled="selectedZoom.locked"
              @click="setMode('auto')"
              >{{ t('autoCursor') }}</Button
            >
            <Button
              size="xs"
              :variant="selectedZoom.mode === 'manual' ? 'selected' : 'ghost'"
              :disabled="selectedZoom.locked"
              @click="setMode('manual')"
              >{{ t('manualFocus') }}</Button
            >
          </ButtonGroup>
          <ZoomFocusControls
            v-if="selectedZoom.mode === 'manual'"
            :zoom="selectedZoom"
            :canvas-size="canvasSize"
            @update="emit('update', $event)"
          />
          <p class="hint">{{ selectedZoom.mode === 'manual' ? t('manualHint') : t('autoHint') }}</p>
          <div class="projection-heading">
            <span class="section-title">{{ t('projection') }}</span>
            <Button
              class="projection-info"
              variant="ghost"
              size="xs"
              :icon="Info"
              icon-only
              :aria-label="t('projection')"
              :tooltip="t('projectionDesc')"
              tooltip-position="bottom"
            />
          </div>
          <ZoomTiltControls v-if="style === '3d'" :zoom="selectedZoom" @update="emit('update', $event)" />
        </div>
      </Accordion>
      <Accordion
        v-if="selectedZoom"
        v-model="sections.magnification"
        :title="t('magnification')"
        appearance="inspector"
      >
        <div class="section-block">
          <BigSlider
            :model-value="selectedZoom.depth"
            :min="1"
            :max="6"
            :step="1"
            :default-value="2"
            :disabled="selectedZoom.locked"
            :label="t('zoomLevel')"
            :format-value="(value) => `${magnificationValues[Math.round(value) - 1]}×`"
            @update:model-value="updateDepth"
          />
          <div class="depth-presets">
            <Button
              v-for="(value, index) in magnificationValues"
              :key="index"
              class="preset-pill"
              :class="{ active: selectedZoom.depth === index + 1 }"
              size="xs"
              :variant="selectedZoom.depth === index + 1 ? 'secondary' : 'ghost'"
              :disabled="selectedZoom.locked"
              @click="updateDepth(index + 1)"
              >{{ value }}×</Button
            >
          </div>
        </div>
      </Accordion>
    </template>
    <ZoomClickEmptyState v-if="!selectedZoom" />
    <template v-if="!still && style !== 'glass'">
      <Accordion v-model="sections.camera" :title="t('cameraFollow')" appearance="inspector">
        <ZoomAutoFollowControls :model-value="autoFollow" @update:model-value="emit('update:autoFollow', $event)" />
      </Accordion>
      <Accordion v-model="sections.animation" :title="t('motionBlur')" appearance="inspector">
        <div class="section-block motion-blur-settings">
          <div class="section-header">
            <span class="section-description">{{ t('motionBlurDesc') }}</span>
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
      </Accordion>
    </template>
    <Accordion v-if="!still" v-model="sections.automatic" :title="glassText('automatic')" appearance="inspector">
      <div class="header-action section-block">
        <p class="hint">{{ glassText('automaticHint') }}</p>
        <Button
          variant="secondary"
          size="sm"
          :icon="Sparkles"
          :disabled="!canGenerate"
          block
          @click="confirmingGeneration = true"
          >{{ t(hasAutomaticZooms ? 'regenerateAutoZooms' : 'generateAutoZooms') }}</Button
        >
      </div>
    </Accordion>
    <ConfirmDialog
      :is-open="confirmingGeneration"
      :title="t(hasAutomaticZooms ? 'regenerateAutoZooms' : 'generateAutoZooms')"
      :description="t('regenerateConfirm')"
      :confirm-label="t('regenerate')"
      :cancel-label="t('cancel')"
      @close="confirmingGeneration = false"
      @confirm="confirmGeneration"
    />
  </div>
</template>

<style scoped>
.zoom-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100%;
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
  gap: 12px;
}
.projection-heading {
  display: flex;
  align-items: center;
  gap: 4px;
}
.section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--weight-title);
  color: var(--text-secondary);
}
.hint,
.section-description {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.45;
  color: var(--text-muted);
}
.depth-presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}
</style>

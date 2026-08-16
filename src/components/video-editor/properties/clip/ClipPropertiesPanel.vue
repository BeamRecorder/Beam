<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import ShadowDirectionGroup from '~/components/video-editor/properties/cursor/ShadowDirectionGroup.vue';
import BorderAndFrameControls from '~/components/video-editor/properties/clip/BorderAndFrameControls.vue';
import Divider from '~/ui/divider/Divider.vue';
import TimelineClickEmptyState from '~/components/video-editor/properties/clip/TimelineClickEmptyState.vue';
import type { ShadowDirection } from '../cursor/shadow-types';
import { Unlink, RotateCcw, FlipHorizontal, FlipVertical } from '@lucide/vue';
import type { ClipFrame, ClipShadowMode, ClipShadowSize, NormalizedTransform } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('ClipPropertiesPanel');

const props = defineProps<{
  selectedClip: {
    id: string;
    kind: string;
    name?: string;
    timelineStartMs: number;
    timelineDurationMs: number;
    playbackRate?: number;
    enabled?: boolean;
    isLinked?: boolean;
    shadowSize?: string;
    shadowBlur?: number;
    shadowMode?: ClipShadowMode;
    shadowColor?: string;
    shadowDirection?: string;
    cornerRadius?: string | number;
    borderEnabled?: boolean;
    borderColor?: string;
    borderWidth?: number;
    frame?: ClipFrame;
    frameTitle?: string;
    frameColor?: string;
    frameShowMenu?: boolean;
    frameShowScrollbars?: boolean;
    frameChromeScale?: number;
    clipTransform?: NormalizedTransform;
    isMirrored?: boolean;
    isMirroredY?: boolean;
  } | null;
}>();

const emit = defineEmits<{
  (e: 'update:playbackRate', rate: number): void;
  (e: 'update:isMirrored', isMirrored: boolean): void;
  (e: 'update:isMirroredY', isMirroredY: boolean): void;
  (e: 'update:cornerRadius', radius: string): void;
  (
    e: 'update:shadow',
    shadow: { size: ClipShadowSize; blur?: number; mode?: ClipShadowMode; color?: string; direction?: string },
  ): void;
  (
    e: 'update:appearance',
    appearance: {
      borderEnabled?: boolean;
      borderColor?: string;
      borderWidth?: number;
      frame?: ClipFrame;
      frameTitle?: string;
      frameColor?: string;
      frameShowMenu?: boolean;
      frameShowScrollbars?: boolean;
      frameChromeScale?: number;
    },
  ): void;
  (e: 'update:clipTransform', transform: NormalizedTransform): void;
  (e: 'reset:clipTransform'): void;
  (e: 'unlink'): void;
  (e: 'delete'): void;
  (e: 'split'): void;
}>();

const speedPresets = [0.5, 1.0, 1.5, 2.0, 3.0];

const radiusPresets = computed(() => [
  { id: 'none', label: t('none') },
  { id: 'sm', label: '8px' },
  { id: 'md', label: '16px' },
  { id: 'lg', label: '24px' },
  { id: 'custom', label: t('custom') },
]);

const shadowPresets = computed(() => [
  { id: 'none', label: t('none') },
  { id: 'sm', label: t('soft') },
  { id: 'md', label: t('medium') },
  { id: 'lg', label: t('strong') },
  { id: 'custom', label: t('custom') },
]);

const NAMED_RADII = ['none', 'sm', 'md', 'lg', 'full'];

const selectedRadius = ref<string>('md');
const customRadiusValue = ref<number>(32);
const selectedShadowSize = ref<ClipShadowSize>((props.selectedClip?.shadowSize as ClipShadowSize | undefined) ?? 'md');
const customShadowBlur = ref(props.selectedClip?.shadowBlur ?? 40);
const selectedShadowMode = ref<ClipShadowMode>(props.selectedClip?.shadowMode ?? 'solid');
const selectedShadowColor = ref(props.selectedClip?.shadowColor ?? '#000000');
const selectedShadowDirection = ref<ShadowDirection>(
  (props.selectedClip?.shadowDirection as ShadowDirection | undefined) ?? 'all',
);

watch(
  () => props.selectedClip,
  (clip) => {
    const r = clip?.cornerRadius ?? 'sm';
    if (typeof r === 'number') {
      selectedRadius.value = 'custom';
      customRadiusValue.value = r;
    } else if (NAMED_RADII.includes(String(r))) {
      // map "full" (old data) -> "custom" at 9999
      if (r === 'full') {
        selectedRadius.value = 'custom';
        customRadiusValue.value = 9999;
      } else {
        selectedRadius.value = String(r);
      }
    } else {
      selectedRadius.value = 'custom';
      customRadiusValue.value = parseFloat(String(r)) || 32;
    }
    selectedShadowSize.value = (clip?.shadowSize as ClipShadowSize | undefined) ?? 'md';
    customShadowBlur.value = clip?.shadowBlur ?? 40;
    selectedShadowMode.value = clip?.shadowMode ?? 'solid';
    selectedShadowColor.value = clip?.shadowColor ?? '#000000';
    selectedShadowDirection.value = (clip?.shadowDirection as ShadowDirection | undefined) ?? 'all';
  },
  { immediate: true },
);

const handleRadiusChange = (radiusId: string) => {
  selectedRadius.value = radiusId;
  if (radiusId === 'custom') {
    // emit the numeric value in px when switching to custom
    emit('update:cornerRadius', String(customRadiusValue.value));
  } else {
    emit('update:cornerRadius', radiusId);
  }
};

const handleCustomRadiusChange = (value: number) => {
  customRadiusValue.value = value;
  emit('update:cornerRadius', String(value));
};

const handleShadowPresetChange = (sizeId: string) => {
  selectedShadowSize.value = sizeId as ClipShadowSize;
  emit('update:shadow', {
    size: selectedShadowSize.value,
    blur: customShadowBlur.value,
    mode: selectedShadowMode.value,
    color: selectedShadowColor.value,
    direction: selectedShadowDirection.value,
  });
};

const handleShadowModeChange = (mode: ClipShadowMode) => {
  selectedShadowMode.value = mode;
  emit('update:shadow', {
    size: selectedShadowSize.value,
    blur: customShadowBlur.value,
    mode,
    color: selectedShadowColor.value,
    direction: selectedShadowDirection.value,
  });
};

const handleCustomShadowBlurChange = (blur: number) => {
  customShadowBlur.value = blur;
  emit('update:shadow', {
    size: 'custom',
    blur,
    mode: selectedShadowMode.value,
    color: selectedShadowColor.value,
    direction: selectedShadowDirection.value,
  });
};

const handleShadowDirectionChange = (directionId: ShadowDirection) => {
  selectedShadowDirection.value = directionId;
  emit('update:shadow', {
    size: selectedShadowSize.value,
    blur: customShadowBlur.value,
    mode: selectedShadowMode.value,
    color: selectedShadowColor.value,
    direction: directionId,
  });
};

const handleShadowColorChange = (color: string) => {
  selectedShadowColor.value = color;
  emit('update:shadow', {
    size: selectedShadowSize.value,
    blur: customShadowBlur.value,
    mode: selectedShadowMode.value,
    color,
    direction: selectedShadowDirection.value,
  });
};

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
      <!-- Placement Section -->
      <div v-if="clipTransform" class="section-block">
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

      <!-- Appearance Section (Corner Radius, Shadow & Mirror) -->
      <div v-if="['screen', 'video', 'image', 'webcam'].includes(selectedClip.kind)" class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('cornerRadius') }}</span>
        </div>
        <ButtonGroup full>
          <Button
            v-for="item in radiusPresets"
            :key="item.id"
            :variant="selectedRadius === item.id ? 'primary' : 'ghost'"
            size="xs"
            @click="handleRadiusChange(item.id)"
          >
            {{ item.label }}
          </Button>
        </ButtonGroup>
        <BigSlider
          v-if="selectedRadius === 'custom'"
          :model-value="customRadiusValue"
          :min="0"
          :max="200"
          :step="1"
          :label="t('radius')"
          :default-value="32"
          :format-value="(v) => `${Math.round(v)}px`"
          @update:modelValue="handleCustomRadiusChange"
        />

        <Divider spacing="xs" />

        <div class="section-header">
          <span class="section-title">{{ t('dropShadow') }}</span>
        </div>
        <ButtonGroup full>
          <Button
            v-for="item in shadowPresets"
            :key="item.id"
            :variant="selectedShadowSize === item.id ? 'primary' : 'ghost'"
            size="xs"
            @click="handleShadowPresetChange(item.id)"
          >
            {{ item.label }}
          </Button>
        </ButtonGroup>

        <div class="sub-group margin-top-sm">
          <span class="sub-label">{{ t('shadowStyle') }}</span>
          <ButtonGroup full>
            <Button
              :variant="selectedShadowMode === 'solid' ? 'primary' : 'ghost'"
              size="xs"
              @click="handleShadowModeChange('solid')"
            >
              {{ t('solid') }}
            </Button>
            <Button
              :variant="selectedShadowMode === 'adaptive' ? 'primary' : 'ghost'"
              size="xs"
              @click="handleShadowModeChange('adaptive')"
            >
              {{ t('adaptive') }}
            </Button>
          </ButtonGroup>
          <span v-if="selectedShadowMode === 'adaptive'" class="shadow-hint">
            {{ t('adaptiveShadowDescription') }}
          </span>
        </div>

        <BigSlider
          v-if="selectedShadowSize === 'custom'"
          :model-value="customShadowBlur"
          :min="4"
          :max="96"
          :step="1"
          :label="t('shadowBlur')"
          :default-value="40"
          :format-value="(value) => `${Math.round(value)}px`"
          @update:modelValue="handleCustomShadowBlurChange"
        />

        <div v-if="selectedShadowSize !== 'none'" class="sub-group margin-top-sm">
          <span class="sub-label">{{ t('direction') }}</span>
          <ShadowDirectionGroup
            :model-value="selectedShadowDirection"
            @update:model-value="handleShadowDirectionChange"
          />
        </div>

        <div v-if="selectedShadowSize !== 'none' && selectedShadowMode === 'solid'" class="sub-group margin-top-sm">
          <span class="sub-label">{{ t('shadowColor') }}</span>
          <ColorPicker
            :model-value="selectedShadowColor"
            :show-label="false"
            @update:modelValue="handleShadowColorChange"
          />
        </div>

        <Divider spacing="xs" />

        <div class="section-header">
          <span class="section-title">{{ t('mirroring') }}</span>
        </div>
        <ButtonGroup full>
          <Button
            :variant="selectedClip.isMirrored ? 'primary' : 'ghost'"
            size="xs"
            :icon="FlipHorizontal"
            @click="emit('update:isMirrored', !selectedClip.isMirrored)"
          >
            {{ t('horizontal') }}
          </Button>
          <Button
            :variant="selectedClip.isMirroredY ? 'primary' : 'ghost'"
            size="xs"
            :icon="FlipVertical"
            @click="emit('update:isMirroredY', !selectedClip.isMirroredY)"
          >
            {{ t('vertical') }}
          </Button>
        </ButtonGroup>
        <BorderAndFrameControls
          :border-enabled="selectedClip.borderEnabled"
          :border-color="selectedClip.borderColor"
          :border-width="selectedClip.borderWidth"
          :frame="selectedClip.frame"
          :frame-title="selectedClip.frameTitle"
          :frame-color="selectedClip.frameColor"
          :frame-show-menu="selectedClip.frameShowMenu"
          :frame-show-scrollbars="selectedClip.frameShowScrollbars"
          :frame-chrome-scale="selectedClip.frameChromeScale"
          @update="emit('update:appearance', $event)"
        />
      </div>

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

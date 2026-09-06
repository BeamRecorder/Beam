<script setup lang="ts">
import type { ClipAppearanceEmits } from './clip-properties-types';
import { computed, ref, watch } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Divider from '~/ui/divider/Divider.vue';
import ShadowDirectionGroup from '../cursor/ShadowDirectionGroup.vue';
import BorderAndFrameControls from './BorderAndFrameControls.vue';
import { FlipHorizontal, FlipVertical, SlidersHorizontal } from '@lucide/vue';
import type { ShadowDirection } from '../cursor/shadow-types';
import type { ClipShadowMode, ClipShadowSize } from '~/media/shared/composition-types';
import type { SelectedClipProperties } from '../properties-panel-types';
import { useClipCornerRadius } from './useClipCornerRadius';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('ClipPropertiesPanel');
const props = defineProps<{ selectedClip: SelectedClipProperties }>();
const emit = defineEmits<ClipAppearanceEmits>();
const radiusPresets = computed(() => [
  { id: 'none', label: t('none') },
  { id: 'sm', label: '8px' },
  { id: 'md', label: '16px' },
  { id: 'lg', label: '24px' },
  { id: 'custom', icon: SlidersHorizontal, tooltip: t('custom') },
]);

const shadowPresets = computed(() => [
  { id: 'none', label: t('none') },
  { id: 'sm', label: t('soft') },
  { id: 'md', label: t('medium') },
  { id: 'lg', label: t('strong') },
  { id: 'custom', icon: SlidersHorizontal, tooltip: t('custom') },
]);

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
    selectedShadowSize.value = (clip?.shadowSize as ClipShadowSize | undefined) ?? 'md';
    customShadowBlur.value = clip?.shadowBlur ?? 40;
    selectedShadowMode.value = clip?.shadowMode ?? 'solid';
    selectedShadowColor.value = clip?.shadowColor ?? '#000000';
    selectedShadowDirection.value = (clip?.shadowDirection as ShadowDirection | undefined) ?? 'all';
  },
  { immediate: true },
);

const {
  selectedRadius,
  customRadiusValue,
  handleRadiusChange,
  handleCustomRadiusChange,
  beginRadiusInteraction,
  endRadiusInteraction,
} = useClipCornerRadius({
  selectedClip: () => props.selectedClip,
  onUpdate: (radius) => emit('update:cornerRadius', radius),
  onInteractionChange: (interacting) => emit('corner-radius-interaction', interacting),
});

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
</script>
<template>
  <div class="section-block">
    <div class="section-header">
      <span class="section-title">{{ t('cornerRadius') }}</span>
    </div>
    <ButtonGroup full>
      <Button
        v-for="item in radiusPresets"
        :key="item.id"
        :variant="selectedRadius === item.id ? 'primary' : 'ghost'"
        size="xs"
        :icon="item.icon"
        :icon-only="!!item.icon"
        :tooltip="item.tooltip"
        :aria-label="item.tooltip || item.label"
        @click="handleRadiusChange(item.id)"
      >
        <span v-if="item.label">{{ item.label }}</span>
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
      @interaction-start="beginRadiusInteraction"
      @interaction-end="endRadiusInteraction"
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
        :icon="item.icon"
        :icon-only="!!item.icon"
        :tooltip="item.tooltip"
        :aria-label="item.tooltip || item.label"
        @click="handleShadowPresetChange(item.id)"
      >
        <span v-if="item.label">{{ item.label }}</span>
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
      <ShadowDirectionGroup :model-value="selectedShadowDirection" @update:model-value="handleShadowDirectionChange" />
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
      :phone-frame-fill="selectedClip.phoneFrameFill"
      @update="emit('update:appearance', $event)"
    />
  </div>
</template>
<style scoped src="./ClipPropertiesPanel.css"></style>

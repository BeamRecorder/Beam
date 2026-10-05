<script setup lang="ts">
import type { ClipAppearanceEmits } from './clip-properties-types';
import { computed, ref, watch } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import ShadowDirectionGroup from '../cursor/ShadowDirectionGroup.vue';
import BorderAndFrameControls from './BorderAndFrameControls.vue';
import MediaOrientationControls from '../shared/MediaOrientationControls.vue';
import { SlidersHorizontal } from '@lucide/vue';
import type { ShadowDirection } from '@beam/runtime/cursor/shadow-types';
import type { ClipShadowMode, ClipShadowSize } from '@beam/engine/shared/composition-types';
import type { SelectedClipProperties } from '../properties-panel-types';
import { useClipCornerRadius } from './useClipCornerRadius';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('ClipPropertiesPanel');
const { t: transformText } = useTranslate('TransformControls');
const props = defineProps<{ selectedClip: SelectedClipProperties; hideMirroring?: boolean }>();
const emit = defineEmits<ClipAppearanceEmits>();
const sections = ref({ radius: false, shadow: false, mirroring: false });
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
  <div class="appearance-sections">
    <Accordion v-model="sections.radius" appearance="inspector" :title="t('cornerRadius')" data-clip-section="radius">
      <div class="section-block">
        <ButtonGroup full variant="neutral" size="xs">
          <Button
            v-for="item in radiusPresets"
            :key="item.id"
            :variant="selectedRadius === item.id ? 'selected' : 'ghost'"
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
      </div>
    </Accordion>
    <Accordion v-model="sections.shadow" appearance="inspector" :title="t('dropShadow')" data-clip-section="shadow">
      <div class="section-block">
        <ButtonGroup full variant="neutral" size="xs">
          <Button
            v-for="item in shadowPresets"
            :key="item.id"
            :variant="selectedShadowSize === item.id ? 'selected' : 'ghost'"
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
          <span class="sub-label shadow-style-label"
            >{{ t('shadowStyle') }}<InfoTooltip :content="t('shadowStyleDescription')"
          /></span>
          <ButtonGroup full variant="neutral" size="xs">
            <Button
              :variant="selectedShadowMode === 'solid' ? 'selected' : 'ghost'"
              size="xs"
              @click="handleShadowModeChange('solid')"
            >
              {{ t('solid') }}
            </Button>
            <Button
              :variant="selectedShadowMode === 'adaptive' ? 'selected' : 'ghost'"
              size="xs"
              @click="handleShadowModeChange('adaptive')"
            >
              {{ t('adaptive') }}
            </Button>
          </ButtonGroup>
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
      </div>
    </Accordion>
    <Accordion
      v-if="!hideMirroring"
      v-model="sections.mirroring"
      appearance="inspector"
      :title="transformText('orientation')"
      data-clip-section="mirroring"
    >
      <MediaOrientationControls
        :mirrored="selectedClip.isMirrored"
        :mirrored-y="selectedClip.isMirroredY"
        :rotation="selectedClip.rotation"
        @update:mirrored="emit('update:isMirrored', $event)"
        @update:mirrored-y="emit('update:isMirroredY', $event)"
        @update:rotation="emit('update:rotation', $event)"
      />
    </Accordion>
    <BorderAndFrameControls
      :border-enabled="selectedClip.borderEnabled"
      :border-color="selectedClip.borderColor"
      :border-width="selectedClip.borderWidth"
      :frame="selectedClip.frame"
      :frame-title="selectedClip.frameTitle"
      :frame-color="selectedClip.frameColor"
      :frame-theme="selectedClip.frameTheme"
      :frame-show-menu="selectedClip.frameShowMenu"
      :frame-show-scrollbars="selectedClip.frameShowScrollbars"
      :frame-chrome-scale="selectedClip.frameChromeScale"
      :phone-frame-fill="selectedClip.phoneFrameFill"
      :animated-frame="selectedClip.animatedFrame"
      @update="emit('update:appearance', $event)"
    />
  </div>
</template>
<style scoped src="./ClipPropertiesPanel.css"></style>

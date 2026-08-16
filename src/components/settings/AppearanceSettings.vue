<script setup lang="ts">
import { computed, ref } from 'vue';
import { RotateCcw, Sparkles, Palette, Check, Shapes } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Slider from '~/ui/slider/Slider.vue';
import Select from '~/ui/select/Select.vue';
import Divider from '~/ui/divider/Divider.vue';
import { useThemeStore } from '~/stores/theme';
import { useTranslate } from '~/i18n/useTranslate';
import {
  COLOR_PRESETS,
  RADIUS_PRESETS,
  SECONDARY_COLOR_PRESETS,
  THEME_PRESETS,
  type SurfaceTone,
  type ThemePreset,
} from '~/types/appearance';

const { t, locale } = useTranslate('AppearanceSettings');
const themeStore = useThemeStore();

withDefaults(
  defineProps<{
    showTitle?: boolean;
    compact?: boolean;
  }>(),
  {
    showTitle: true,
    compact: false,
  },
);

const isCurrentPreset = (preset: ThemePreset) => {
  return (
    themeStore.activePresetId === preset.id ||
    (themeStore.primaryColor.toLowerCase() === preset.primaryColor.toLowerCase() &&
      themeStore.secondaryColor.toLowerCase() === preset.secondaryColor.toLowerCase() &&
      themeStore.radiusPx === preset.radiusPx &&
      themeStore.isPillRadius === Boolean(preset.isPillRadius) &&
      themeStore.surfaceTone === preset.surfaceTone)
  );
};

const getPresetName = (preset: ThemePreset) => {
  return locale.value === 'fr' ? preset.nameFr : preset.name;
};

const isCurrentRadiusPreset = (item: (typeof RADIUS_PRESETS)[number]) => {
  if (item.isCustom) return customRadiusSelected.value;
  return !customRadiusSelected.value && themeStore.radiusPx === item.radiusPx;
};

const handlePresetClick = (preset: ThemePreset) => {
  themeStore.applyPreset(preset);
};

const handleColorSelect = (color: string) => {
  themeStore.setPrimaryColor(color);
};

const handleSecondaryColorSelect = (color: string) => {
  themeStore.setSecondaryColor(color);
};

const handleRadiusPresetClick = (item: (typeof RADIUS_PRESETS)[number]) => {
  customRadiusSelected.value = Boolean(item.isCustom);
  themeStore.setRadius(item.isCustom ? themeStore.radiusPx : item.radiusPx, false);
};

const handleSliderRadius = (val: number) => {
  themeStore.setRadius(val, false);
};

const surfaceToneOptions: Array<{ id: SurfaceTone; labelKey: string }> = [
  { id: 'default', labelKey: 'toneDefault' },
  { id: 'neutral', labelKey: 'toneNeutral' },
  { id: 'slate', labelKey: 'toneSlate' },
  { id: 'deep', labelKey: 'toneDeep' },
];

const themeModeOptions = computed(() => [
  { value: 'light', label: t('light') },
  { value: 'dark', label: t('dark') },
  { value: 'system', label: t('system') },
]);
const customRadiusSelected = ref(themeStore.isPillRadius);

const handleThemeMode = (value: string | number) => {
  if (value === 'light' || value === 'dark' || value === 'system') themeStore.theme = value;
};

const isCustomPrimaryColor = computed(() => {
  return !COLOR_PRESETS.some((p) => p.color.toLowerCase() === themeStore.primaryColor.toLowerCase());
});

const isCustomSecondaryColor = computed(() => {
  return !SECONDARY_COLOR_PRESETS.some((p) => p.color.toLowerCase() === themeStore.secondaryColor.toLowerCase());
});
</script>

<template>
  <div class="appearance-settings" :class="{ 'is-compact': compact }">
    <!-- Header with optional Title & Reset button -->
    <div v-if="showTitle" class="appearance-header">
      <div class="header-info">
        <h3 class="appearance-title">{{ t('title') }}</h3>
        <p class="appearance-subtitle">{{ t('subtitle') }}</p>
      </div>
      <Button
        variant="ghost"
        size="xs"
        :icon="RotateCcw"
        :tooltip="t('resetDefault')"
        @click="themeStore.resetToDefault"
      >
        {{ t('resetDefault') }}
      </Button>
    </div>

    <!-- Theme Mode (Light / Dark / System) -->
    <div class="setting-row">
      <div class="row-label-group">
        <span class="row-label">{{ t('themeMode') }}</span>
      </div>
      <Select
        class="theme-mode-select"
        :model-value="themeStore.theme"
        :options="themeModeOptions"
        size="sm"
        @update:model-value="handleThemeMode"
      />
    </div>

    <Divider spacing="xs" />

    <!-- Theme Presets Gallery -->
    <div class="setting-section">
      <div class="section-title-row">
        <div class="title-with-icon">
          <Sparkles class="section-icon" :size="15" />
          <span class="row-label">{{ t('themePresets') }}</span>
        </div>
      </div>
      <div class="presets-grid">
        <button
          v-for="preset in THEME_PRESETS"
          :key="preset.id"
          type="button"
          class="preset-card"
          :class="{ active: isCurrentPreset(preset) }"
          @click="handlePresetClick(preset)"
        >
          <div class="preset-preview-pill">
            <span class="color-dot primary-dot" :style="{ backgroundColor: preset.primaryColor }"></span>
            <span class="color-dot secondary-dot" :style="{ backgroundColor: preset.secondaryColor }"></span>
          </div>
          <span class="preset-name">{{ getPresetName(preset) }}</span>
          <Check v-if="isCurrentPreset(preset)" class="preset-check" :size="14" />
        </button>
      </div>
    </div>

    <Divider spacing="xs" />

    <!-- Primary Color Swatches & Custom Picker -->
    <div class="setting-section">
      <div class="section-title-row">
        <div class="title-with-icon">
          <Palette class="section-icon" :size="15" />
          <span class="row-label">{{ t('primaryColor') }}</span>
        </div>
      </div>
      <div class="color-controls-row">
        <div class="swatches-wrap">
          <button
            v-for="item in COLOR_PRESETS"
            :key="item.id"
            type="button"
            class="swatch-btn"
            :class="{ active: themeStore.primaryColor.toLowerCase() === item.color.toLowerCase() }"
            :style="{ backgroundColor: item.color }"
            :title="item.label"
            @click="handleColorSelect(item.color)"
          >
            <Check
              v-if="themeStore.primaryColor.toLowerCase() === item.color.toLowerCase()"
              class="swatch-check"
              :size="13"
            />
          </button>
        </div>
        <div class="custom-picker-wrap">
          <ColorPicker
            :model-value="themeStore.primaryColor"
            :show-label="false"
            :class="{ 'is-custom-selected': isCustomPrimaryColor }"
            @update:model-value="handleColorSelect"
          />
        </div>
      </div>
    </div>

    <Divider spacing="xs" />

    <!-- Secondary Color Swatches & Custom Picker -->
    <div class="setting-section">
      <div class="section-title-row">
        <span class="row-label">{{ t('secondaryColor') }}</span>
      </div>
      <div class="color-controls-row">
        <div class="swatches-wrap">
          <button
            v-for="item in SECONDARY_COLOR_PRESETS"
            :key="item.id"
            type="button"
            class="swatch-btn"
            :class="{ active: themeStore.secondaryColor.toLowerCase() === item.color.toLowerCase() }"
            :style="{ backgroundColor: item.color }"
            :title="item.label"
            @click="handleSecondaryColorSelect(item.color)"
          >
            <Check
              v-if="themeStore.secondaryColor.toLowerCase() === item.color.toLowerCase()"
              class="swatch-check"
              :size="13"
            />
          </button>
        </div>
        <div class="custom-picker-wrap">
          <ColorPicker
            :model-value="themeStore.secondaryColor"
            :show-label="false"
            :class="{ 'is-custom-selected': isCustomSecondaryColor }"
            @update:model-value="handleSecondaryColorSelect"
          />
        </div>
      </div>
    </div>

    <Divider spacing="xs" />

    <!-- Corner Radius (Presets + Fine Slider) -->
    <div class="setting-section">
      <div class="section-title-row">
        <div class="title-with-icon">
          <Shapes class="section-icon" :size="15" />
          <span class="row-label">{{ t('cornerRadius') }}</span>
        </div>
        <span class="radius-live-badge">
          {{ customRadiusSelected ? t('custom') : `${themeStore.radiusPx}px` }}
        </span>
      </div>

      <!-- Quick Preset Buttons -->
      <ButtonGroup class="radius-presets-group">
        <Button
          v-for="item in RADIUS_PRESETS"
          :key="item.id"
          variant="tab"
          size="xs"
          :class="{ active: isCurrentRadiusPreset(item) }"
          @click="handleRadiusPresetClick(item)"
        >
          {{ item.isCustom ? t('custom') : item.label }}
        </Button>
      </ButtonGroup>

      <!-- Custom fine-tuning Slider -->
      <div v-if="customRadiusSelected" class="radius-slider-wrap">
        <Slider
          :model-value="themeStore.radiusPx"
          :min="0"
          :max="32"
          :step="1"
          @update:model-value="handleSliderRadius"
        />
      </div>
    </div>

    <Divider spacing="xs" />

    <!-- Surface Tone (Panels background tint) -->
    <div class="setting-section">
      <div class="section-title-row">
        <span class="row-label">{{ t('surfaceTone') }}</span>
      </div>
      <ButtonGroup class="surface-tones-group">
        <Button
          v-for="tone in surfaceToneOptions"
          :key="tone.id"
          variant="tab"
          size="xs"
          :class="{ active: themeStore.surfaceTone === tone.id }"
          @click="themeStore.setSurfaceTone(tone.id)"
        >
          {{ t(tone.labelKey) }}
        </Button>
      </ButtonGroup>
    </div>
  </div>
</template>

<style scoped src="./appearance-settings.css"></style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, Maximize2, Palette, RotateCcw, Shapes, SlidersHorizontal, Sparkles } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Select from '~/ui/select/Select.vue';
import Slider from '~/ui/slider/Slider.vue';
import Divider from '~/ui/divider/Divider.vue';
import { useThemeStore } from '~/stores/theme';
import { useTranslate } from '~/i18n/useTranslate';
import {
  COLOR_PRESETS,
  RADIUS_PRESETS,
  SECONDARY_COLOR_PRESETS,
  THEME_PRESETS,
  UI_SCALE_PRESETS,
  type SurfaceTone,
  type ThemePreset,
  type UiScalePercent,
  type UiScaleRegion,
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

const surfaceToneOptions = computed<Array<{ value: SurfaceTone; label: string }>>(() => [
  { value: 'default', label: t('toneDefault') },
  { value: 'neutral', label: t('toneNeutral') },
  { value: 'slate', label: t('toneSlate') },
  { value: 'deep', label: t('toneDeep') },
]);

const themeModeOptions = computed(() => [
  { value: 'light', label: t('light') },
  { value: 'dark', label: t('dark') },
  { value: 'system', label: t('system') },
]);
const customRadiusSelected = ref(themeStore.isPillRadius);
const advancedOpen = ref(false);
const uiScaleDraft = ref<number>(themeStore.uiScaleGlobal);
const uiScaleOverrideDrafts = ref<Record<UiScaleRegion, number>>({
  topbar: themeStore.resolvedUiScale('topbar'),
  sidebar: themeStore.resolvedUiScale('sidebar'),
  properties: themeStore.resolvedUiScale('properties'),
  canvasControls: themeStore.resolvedUiScale('canvasControls'),
  timeline: themeStore.resolvedUiScale('timeline'),
});

const uiScaleRegions = computed<Array<{ id: UiScaleRegion; label: string }>>(() => [
  { id: 'topbar', label: t('scaleTopbar') },
  { id: 'sidebar', label: t('scaleSidebar') },
  { id: 'properties', label: t('scaleProperties') },
  { id: 'canvasControls', label: t('scaleCanvasControls') },
  { id: 'timeline', label: t('scaleTimeline') },
]);

const commitUiScale = (value: number) => {
  if (UI_SCALE_PRESETS.includes(value as UiScalePercent)) themeStore.setUiScale(value as UiScalePercent);
};

const commitUiScaleOverride = (region: UiScaleRegion, value: number) => {
  if (UI_SCALE_PRESETS.includes(value as UiScalePercent)) {
    themeStore.setUiScaleOverride(region, value as UiScalePercent);
  }
};

const toggleUiScaleOverride = (region: UiScaleRegion) => {
  const current = themeStore.uiScaleOverrides[region];
  themeStore.setUiScaleOverride(region, current === null ? themeStore.uiScaleGlobal : null);
  uiScaleOverrideDrafts.value[region] = current === null ? themeStore.uiScaleGlobal : themeStore.uiScaleGlobal;
};

watch(
  [() => themeStore.uiScaleGlobal, () => themeStore.uiScaleOverrides],
  () => {
    uiScaleDraft.value = themeStore.uiScaleGlobal;
    for (const region of Object.keys(uiScaleOverrideDrafts.value) as UiScaleRegion[]) {
      uiScaleOverrideDrafts.value[region] = themeStore.resolvedUiScale(region);
    }
  },
  { deep: true },
);

const handleThemeMode = (value: string | number) => {
  if (value === 'light' || value === 'dark' || value === 'system') themeStore.theme = value;
};

const handleSurfaceTone = (value: string | number) => {
  if (value === 'default' || value === 'neutral' || value === 'slate' || value === 'deep') {
    themeStore.setSurfaceTone(value);
  }
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
    <div v-if="showTitle" class="appearance-header">
      <div class="header-info">
        <h3 class="appearance-title">{{ t('title') }}</h3>
        <p class="appearance-subtitle">{{ t('subtitle') }}</p>
      </div>
    </div>

    <div class="theme-mode-setting">
      <span class="row-label">{{ t('themeMode') }}</span>
      <ButtonGroup full :columns="3" size="xs" class="theme-mode-group">
        <Button
          v-for="mode in themeModeOptions"
          :key="mode.value"
          variant="tab"
          size="xs"
          :class="{ active: themeStore.theme === mode.value }"
          :aria-pressed="themeStore.theme === mode.value"
          @click="handleThemeMode(mode.value)"
        >
          {{ mode.label }}
        </Button>
      </ButtonGroup>
      <div class="advanced-toggle-row">
        <AdvancedButton
          :open="advancedOpen"
          controls="appearance-advanced-panel"
          :label="t('advanced')"
          @update:open="advancedOpen = $event"
        />
      </div>
    </div>

    <div v-if="advancedOpen" id="appearance-advanced-panel" class="appearance-advanced-panel">
      <section class="advanced-category ui-scale-setting setting-section">
        <h4 class="advanced-category-title">{{ t('scalingCategory') }}</h4>
        <div class="section-title-row">
          <div class="title-with-icon">
            <Maximize2 class="section-icon" :size="15" />
            <span class="row-label">{{ t('uiScale') }}</span>
          </div>
          <span class="scale-live-badge">{{ themeStore.uiScaleGlobal }}%</span>
        </div>
        <p class="setting-hint">{{ t('uiScaleHint') }}</p>
        <div class="ui-scale-slider-wrap">
          <Slider
            class="ui-scale-slider"
            :model-value="uiScaleDraft"
            :min="50"
            :max="125"
            :step="25"
            value-suffix="%"
            @update:model-value="uiScaleDraft = $event"
            @commit="commitUiScale"
          />
          <div class="ui-scale-ticks" aria-hidden="true">
            <span v-for="scale in UI_SCALE_PRESETS" :key="scale">{{ scale }}%</span>
          </div>
        </div>

        <div class="ui-scale-advanced">
          <div class="scale-overrides">
            <div v-for="region in uiScaleRegions" :key="region.id" class="scale-override-row">
              <div class="scale-override-heading">
                <span>{{ region.label }}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  :class="{ active: themeStore.uiScaleOverrides[region.id] === null }"
                  :aria-pressed="themeStore.uiScaleOverrides[region.id] === null"
                  @click="toggleUiScaleOverride(region.id)"
                >
                  {{ t('useGlobal') }}
                </Button>
              </div>
              <Slider
                class="scale-override-slider"
                :model-value="uiScaleOverrideDrafts[region.id]"
                :min="50"
                :max="125"
                :step="25"
                size="compact"
                value-suffix="%"
                :disabled="themeStore.uiScaleOverrides[region.id] === null"
                @update:model-value="uiScaleOverrideDrafts[region.id] = $event"
                @commit="commitUiScaleOverride(region.id, $event)"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="advanced-category theme-customization-section">
        <h4 class="advanced-category-title">{{ t('themeCustomization') }}</h4>
        <div id="appearance-customization-panel" class="customization-panel">
          <div class="customization-actions">
            <Button
              class="appearance-reset-button"
              variant="ghost"
              size="xs"
              block
              :icon="RotateCcw"
              @click="themeStore.resetToDefault"
            >
              {{ t('resetDefault') }}
            </Button>
          </div>
          <Divider spacing="xs" />

          <div class="setting-section theme-presets-section">
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

          <div class="setting-section primary-color-section">
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

          <div class="setting-section secondary-color-section">
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
            <ButtonGroup full size="xs" class="radius-presets-group">
              <Button
                v-for="item in RADIUS_PRESETS"
                :key="item.id"
                :variant="isCurrentRadiusPreset(item) ? 'primary' : 'ghost'"
                size="xs"
                :icon="item.isCustom ? SlidersHorizontal : undefined"
                :icon-only="Boolean(item.isCustom)"
                :tooltip="item.isCustom ? t('custom') : undefined"
                :aria-label="item.isCustom ? t('custom') : item.label"
                @click="handleRadiusPresetClick(item)"
              >
                <span v-if="!item.isCustom">{{ item.label }}</span>
              </Button>
            </ButtonGroup>
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

          <div class="setting-section">
            <div class="section-title-row">
              <span class="row-label">{{ t('surfaceTone') }}</span>
            </div>
            <Select
              class="surface-tone-select"
              :model-value="themeStore.surfaceTone"
              :options="surfaceToneOptions"
              size="sm"
              @update:model-value="handleSurfaceTone"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped src="./appearance-settings.css"></style>

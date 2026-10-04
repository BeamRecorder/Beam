<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { Maximize2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import Slider from '~/ui/slider/Slider.vue';
import { useThemeStore } from '~/stores/theme';
import { useTranslate } from '~/i18n/useTranslate';
import { UI_SCALE_PRESETS, type UiScalePercent, type UiScaleRegion } from '~/types/appearance';
const { t } = useTranslate('AppearanceSettings');
const themeStore = useThemeStore();
const overridesOpen = ref(false);
const overridesId = useId();
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
  uiScaleOverrideDrafts.value[region] = themeStore.uiScaleGlobal;
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
</script>
<template>
  <section class="scaling-settings">
    <div class="section-title-row">
      <span class="row-label">{{ t('scalingCategory') }}</span>
      <AdvancedButton
        :open="overridesOpen"
        :controls="overridesId"
        :label="t('advanced')"
        @update:open="overridesOpen = $event"
      />
    </div>
    <div class="scaling-panel ui-scale-setting setting-section">
      <div class="section-title-row">
        <div class="title-with-icon">
          <Maximize2 class="section-icon" :size="15" />
          <span class="row-label">{{ t('uiScaleGlobal') }}</span>
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

      <RafRevealTransition>
        <div v-if="overridesOpen" :id="overridesId" class="ui-scale-advanced">
          <div class="scale-overrides">
            <div v-for="region in uiScaleRegions" :key="region.id" class="scale-override-row">
              <div class="scale-override-heading">
                <span>{{ region.label }}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  :class="{
                    active: themeStore.uiScaleOverrides[region.id] === null,
                  }"
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
      </RafRevealTransition>
    </div>
  </section>
</template>
<style scoped>
.scaling-settings {
  display: grid;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}
.scaling-panel {
  display: grid;
  gap: 10px;
}
.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title-with-icon {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.section-icon {
  color: var(--text-secondary);
}

.row-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.setting-hint {
  margin: -0.15rem 0 0;
  color: var(--text-muted);
  font-size: 0.725rem;
  line-height: 1.4;
}

.scale-live-badge,
.radius-live-badge {
  color: var(--text-muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.ui-scale-advanced {
  margin-top: 0.15rem;
}

.ui-scale-slider-wrap {
  padding: 0.55rem 0.15rem 0;
}

.ui-scale-slider {
  width: 100%;
}

.ui-scale-ticks {
  display: flex;
  justify-content: space-between;
  margin-right: 3.5rem;
  padding-top: 0.4rem;
  color: var(--text-muted);
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
}

.scale-overrides {
  display: grid;
  gap: 0.55rem;
}

.scale-override-row {
  display: grid;
  gap: 0.4rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.scale-override-row:last-child {
  border-bottom: 0;
}

.scale-override-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
}

.scale-override-heading .active {
  color: var(--color-primary);
  background: var(--color-primary-light);
}

.scale-override-slider {
  width: 100%;
}
</style>

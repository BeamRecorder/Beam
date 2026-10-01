<script setup lang="ts">
import CursorAppearanceControls from './CursorAppearanceControls.vue';
import { computed, ref, watch } from 'vue';
import { CircleDot, Radio, Sparkles } from '@lucide/vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import Select from '~/ui/select/Select.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import CursorClickEffectsPanel from './CursorClickEffectsPanel.vue';
import type { CursorAutoHideSettings, CursorMotionPreset, CursorMotionSettings } from '~/api/types/cursor-settings';
import type { CursorPanelProps, CursorPanelEmits, GlobalRippleStyle } from './cursor-panel-types';
import {
  CURSOR_AUTO_HIDE_DELAY_DEFAULT,
  CURSOR_AUTO_HIDE_DELAY_MAX,
  CURSOR_AUTO_HIDE_DELAY_MIN,
  CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
  CURSOR_AUTO_HIDE_FADE_DURATION_MAX,
  CURSOR_AUTO_HIDE_FADE_DURATION_MIN,
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
  cursorMotionPreset,
  normalizeCursorAutoHideSettings,
} from '../../../../api/types/cursor-settings';
import { useTranslate } from '~/i18n/useTranslate';
import { CURSOR_SIZE_DEFAULT } from './cursor-size';

const { t } = useTranslate('CursorPanel');
const clickAdvancedOpen = ref(false);

const props = defineProps<CursorPanelProps>();
const motionAdvancedOpen = ref(props.motion.preset === 'custom');
watch(
  () => props.motion.preset,
  (preset) => {
    if (preset === 'custom') motionAdvancedOpen.value = true;
  },
);

const emit = defineEmits<CursorPanelEmits>();

const ripplePresets = computed(() => [
  { id: 'single' as const, label: t('presetSingle'), icon: CircleDot },
  { id: 'double' as const, label: t('presetDouble'), icon: Radio },
  { id: 'solid' as const, label: t('presetSolid'), icon: Sparkles },
]);

const currentRipplePreset = computed<GlobalRippleStyle>(() => {
  const left = props.clickEffects.left;
  const right = props.clickEffects.right;
  const configured = [left.rippleStyle, right.rippleStyle].find(
    (style): style is GlobalRippleStyle => style === 'single' || style === 'double' || style === 'solid',
  );
  return configured ?? 'single';
});

const selectRipplePreset = (preset: GlobalRippleStyle) =>
  emit('update:clickEffects', {
    left: { ...props.clickEffects.left, rippleStyle: preset },
    right: { ...props.clickEffects.right, rippleStyle: preset },
  });

const reset = () => {
  emit('update:selection', { packId: props.selection.packId, mode: 'automatic', cursorId: null });
  emit('update:cursorSize', CURSOR_SIZE_DEFAULT);
  emit('update:cursorColor', '#000000');
  emit('update:enableShadow', true);
  emit('update:shadowBlur', 6);
  emit('update:shadowColor', '#000000');
  emit('update:shadowDirection', 'bottom');
  emit('update:clickEffects', createDefaultCursorClickEffects());
  emit('update:motion', createDefaultCursorMotionSettings());
  emit('update:autoHide', createDefaultCursorAutoHideSettings());
};

const motionPresetOptions = computed(() => [
  { value: 'focused', label: t('focusedPreset') },
  { value: 'smooth', label: t('smoothPreset') },
  { value: 'custom', label: t('customPreset') },
]);
const updateMotion = (patch: Partial<CursorMotionSettings>) =>
  emit('update:motion', {
    ...props.motion,
    ...patch,
    preset: patch.preset ?? 'custom',
  });
const updateAutoHide = (patch: Partial<CursorAutoHideSettings>) =>
  emit('update:autoHide', normalizeCursorAutoHideSettings({ ...props.autoHide, ...patch }));
const selectMotionPreset = (preset: CursorMotionPreset) => {
  motionAdvancedOpen.value = preset === 'custom';
  emit('update:motion', preset === 'custom' ? { ...props.motion, preset } : cursorMotionPreset(preset));
};
</script>

<template>
  <div class="cursor-panel">
    <CursorAppearanceControls
      :selection="selection"
      :packs="packs"
      :cursor-size="cursorSize"
      :cursor-color="cursorColor"
      :enable-shadow="enableShadow"
      :shadow-blur="shadowBlur"
      :shadow-color="shadowColor"
      :shadow-direction="shadowDirection"
      @update:selection="emit('update:selection', $event)"
      @preview:selection="emit('preview:selection', $event)"
      @update:cursor-size="emit('update:cursorSize', $event)"
      @update:cursor-color="emit('update:cursorColor', $event)"
      @update:enable-shadow="emit('update:enableShadow', $event)"
      @update:shadow-blur="emit('update:shadowBlur', $event)"
      @update:shadow-color="emit('update:shadowColor', $event)"
      @update:shadow-direction="emit('update:shadowDirection', $event)"
    />
    <section class="cursor-section motion-options" :aria-label="t('cursorMotion')">
      <div class="section-control-heading">
        <h3 class="section-title">{{ t('cursorMotion') }}</h3>
        <AdvancedButton
          :open="motionAdvancedOpen"
          controls="cursor-motion-advanced-panel"
          :label="t('advanced')"
          @update:open="motionAdvancedOpen = $event"
        />
      </div>
      <div class="prop-item">
        <label class="prop-label">{{ t('motionPreset') }}</label>
        <Select
          :aria-label="t('motionPreset')"
          :model-value="motion.preset"
          :options="motionPresetOptions"
          @update:model-value="selectMotionPreset($event as CursorMotionPreset)"
        />
      </div>
      <RafRevealTransition>
        <div v-if="motionAdvancedOpen" id="cursor-motion-advanced-panel" class="advanced-options">
          <BigSlider
            :model-value="motion.smoothing"
            :min="0"
            :max="1"
            :step="0.01"
            :label="t('cursorSmoothing')"
            :format-value="(value) => `${Math.round(value * 100)}%`"
            @update:model-value="updateMotion({ smoothing: $event })"
          />
          <BigSlider
            :model-value="motion.springMassMultiplier"
            :min="0.5"
            :max="2"
            :step="0.01"
            :label="t('springMassMultiplier')"
            :format-value="(value) => value.toFixed(2)"
            @update:model-value="updateMotion({ springMassMultiplier: $event })"
          />
          <div class="prop-row">
            <span class="prop-label">{{ t('stopSpring') }}</span>
            <Switch
              :model-value="motion.stopSpringEnabled"
              :aria-label="t('stopSpring')"
              @update:model-value="updateMotion({ stopSpringEnabled: $event })"
            />
          </div>
          <RafRevealTransition>
            <div v-if="motion.stopSpringEnabled" class="nested-options">
              <BigSlider
                :model-value="motion.stopSpringStrength"
                :default-value="createDefaultCursorMotionSettings().stopSpringStrength"
                :min="0"
                :max="1"
                :step="0.01"
                :label="t('stopSpringStrength')"
                :format-value="(value) => `${Math.round(value * 100)}%`"
                @update:model-value="updateMotion({ stopSpringStrength: $event })"
              />
            </div>
          </RafRevealTransition>
          <BigSlider
            :model-value="motion.motionBlur"
            :min="0"
            :max="1"
            :step="0.01"
            :label="t('motionBlur')"
            :format-value="(value) => `${Math.round(value * 100)}%`"
            @update:model-value="updateMotion({ motionBlur: $event })"
          />
        </div>
      </RafRevealTransition>
    </section>

    <section class="cursor-section click-effects-control" :aria-label="t('clicks')">
      <div class="section-control-heading">
        <h3 class="section-title">{{ t('clicks') }}</h3>
        <AdvancedButton
          :open="clickAdvancedOpen"
          controls="click-effects-advanced-panel"
          :label="t('advanced')"
          @update:open="clickAdvancedOpen = $event"
        />
      </div>
      <div class="prop-item">
        <span class="prop-label">{{ t('rippleStyle') }}</span>
        <ButtonGroup
          full
          :selection="{
            index: ripplePresets.findIndex((preset) => preset.id === currentRipplePreset),
            count: ripplePresets.length,
          }"
        >
          <Button
            v-for="preset in ripplePresets"
            :key="preset.id"
            variant="tab"
            size="sm"
            block
            :class="{ active: currentRipplePreset === preset.id }"
            :tooltip="preset.label"
            :aria-label="preset.label"
            :icon="preset.icon"
            icon-only
            @click="selectRipplePreset(preset.id)"
          />
        </ButtonGroup>
      </div>
      <RafRevealTransition>
        <div v-if="clickAdvancedOpen" id="click-effects-advanced-panel" class="advanced-options">
          <CursorClickEffectsPanel
            :model-value="clickEffects"
            @update:model-value="emit('update:clickEffects', $event)"
          />
        </div>
      </RafRevealTransition>
    </section>

    <section class="cursor-section visibility-options" :aria-label="t('autoHideCursor')">
      <div class="prop-row">
        <span class="prop-label">{{ t('autoHideCursor') }}</span>
        <Switch
          :model-value="autoHide.enabled"
          :aria-label="t('autoHideCursor')"
          @update:model-value="updateAutoHide({ enabled: $event })"
        />
      </div>
      <RafRevealTransition>
        <div v-if="autoHide.enabled" class="nested-options">
          <BigSlider
            :model-value="autoHide.delaySeconds"
            :default-value="CURSOR_AUTO_HIDE_DELAY_DEFAULT"
            :min="CURSOR_AUTO_HIDE_DELAY_MIN"
            :max="CURSOR_AUTO_HIDE_DELAY_MAX"
            :step="0.5"
            :label="t('autoHideDelay')"
            :format-value="(value) => t('secondsValue', { value: value.toFixed(1) })"
            @update:model-value="updateAutoHide({ delaySeconds: $event })"
          />
          <BigSlider
            :model-value="autoHide.fadeDurationMs"
            :default-value="CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT"
            :min="CURSOR_AUTO_HIDE_FADE_DURATION_MIN"
            :max="CURSOR_AUTO_HIDE_FADE_DURATION_MAX"
            :step="50"
            :label="t('autoHideFadeDuration')"
            :format-value="(value) => t('millisecondsValue', { value })"
            @update:model-value="updateAutoHide({ fadeDurationMs: $event })"
          />
        </div>
      </RafRevealTransition>
    </section>

    <Button class="reset-automatic-button" size="sm" variant="ghost" block @click="reset">
      {{ t('resetAutomaticDefaults') }}
    </Button>
  </div>
</template>

<style scoped src="./cursor-panel.css"></style>

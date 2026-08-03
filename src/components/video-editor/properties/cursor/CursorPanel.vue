<script setup lang="ts">
import BigSlider from "~/ui/slider/BigSlider.vue";
import Switch from "~/ui/switch/Switch.vue";
import Select from "~/ui/select/Select.vue";
import ColorInput from "~/ui/input/ColorInput.vue";
import ShadowDirectionGroup from "~/components/video-editor/properties/cursor/ShadowDirectionGroup.vue";
import CursorClickEffectsPanel from "~/components/video-editor/properties/cursor/CursorClickEffectsPanel.vue";
import Divider from "~/ui/divider/Divider.vue";
import type { ShadowDirection } from "./shadow-types";
import { cursorOptions, type CursorType } from "./useCursorReplacer";
import type { CursorClickEffects } from "../../../../api/types/cursor-settings";
import { cursorMotionPreset, type CursorMotionPreset, type CursorMotionSettings } from "../../../../api/types/cursor-settings";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("CursorPanel");

const props = defineProps<{
  selectedCursor: CursorType;
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
}>();

const emit = defineEmits<{
  (e: "update:selectedCursor", value: CursorType): void;
  (e: "update:cursorSize", value: number): void;
  (e: "update:cursorColor", value: string): void;
  (e: "update:enableShadow", value: boolean): void;
  (e: "update:shadowBlur", value: number): void;
  (e: "update:shadowColor", value: string): void;
  (e: "update:shadowDirection", value: ShadowDirection): void;
  (e: "update:clickEffects", value: CursorClickEffects): void;
  (e: "update:motion", value: CursorMotionSettings): void;
}>();

const motionPresetOptions: Array<{ value: CursorMotionPreset; label: string }> = [
  { value: "focused", label: t("focusedPreset") },
  { value: "smooth", label: t("smoothPreset") },
  { value: "custom", label: t("customPreset") },
];

const updateMotion = (patch: Partial<CursorMotionSettings>) => {
  emit("update:motion", {
    ...props.motion,
    ...patch,
    preset: patch.preset ?? "custom",
  });
};

const selectMotionPreset = (preset: CursorMotionPreset) => {
  emit("update:motion", preset === "custom" ? { ...props.motion, preset } : cursorMotionPreset(preset));
};
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <label class="prop-label">{{ t("cursorStyle") }}</label>
      <Select
        :model-value="selectedCursor"
        :options="cursorOptions"
        :preview-on-hover="true"
        @update:modelValue="emit('update:selectedCursor', $event)"
      />
    </div>

    <div class="prop-item">
      <BigSlider
        :model-value="cursorSize"
        :default-value="24"
        :min="16"
        :max="128"
        :label="t('cursorSize')"
        :format-value="(val) => `${val}px`"
        @update:modelValue="emit('update:cursorSize', $event)"
      />
    </div>

    <ColorInput
      :label="t('cursorColor')"
      :model-value="cursorColor"
      @update:modelValue="emit('update:cursorColor', $event)"
    />

    <Divider spacing="none" />

    <div class="prop-row">
      <span class="prop-label">{{ t("dropShadow") }}</span>
      <Switch
        :model-value="enableShadow"
        @update:modelValue="emit('update:enableShadow', $event)"
      />
    </div>

    <Transition name="slide-fade">
      <div v-if="enableShadow" class="nested-options">
        <div class="prop-item">
          <BigSlider
            :model-value="shadowBlur"
            :min="1"
            :max="24"
            :label="t('shadowBlur')"
            :format-value="(val) => `${val}px`"
            @update:modelValue="emit('update:shadowBlur', $event)"
          />
        </div>

        <ColorInput
          :label="t('shadowColor')"
          :model-value="shadowColor"
          @update:modelValue="emit('update:shadowColor', $event)"
        />

        <div class="prop-item">
          <span class="sub-label">{{ t("direction") }}</span>
          <ShadowDirectionGroup
            :model-value="shadowDirection"
            @update:model-value="emit('update:shadowDirection', $event)"
          />
        </div>
      </div>
    </Transition>

    <Divider spacing="none" />

    <section class="motion-options" aria-labelledby="cursor-motion-title">
      <div class="section-heading">
        <span id="cursor-motion-title" class="section-title">{{ t("cursorMotion") }}</span>
        <span class="section-description">{{ t("cursorMotionDescription") }}</span>
      </div>

      <div class="prop-item">
        <label class="prop-label">{{ t("motionPreset") }}</label>
        <Select
          :model-value="motion.preset"
          :options="motionPresetOptions"
          @update:modelValue="selectMotionPreset($event as CursorMotionPreset)"
        />
      </div>

      <BigSlider
        :model-value="motion.smoothing"
        :min="0"
        :max="1"
        :step="0.01"
        :label="t('cursorSmoothing')"
        :format-value="(value) => `${Math.round(value * 100)}%`"
        @update:modelValue="updateMotion({ smoothing: $event })"
      />
      <BigSlider
        :model-value="motion.springMassMultiplier"
        :min="0.5"
        :max="2"
        :step="0.01"
        :label="t('springMassMultiplier')"
        :format-value="(value) => value.toFixed(2)"
        @update:modelValue="updateMotion({ springMassMultiplier: $event })"
      />
      <BigSlider
        :model-value="motion.motionBlur"
        :min="0"
        :max="1"
        :step="0.01"
        :label="t('motionBlur')"
        :format-value="(value) => `${Math.round(value * 100)}%`"
        @update:modelValue="updateMotion({ motionBlur: $event })"
      />
    </section>

    <Divider spacing="none" />

    <CursorClickEffectsPanel
      :model-value="clickEffects"
      @update:model-value="emit('update:clickEffects', $event)"
    />
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nested-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 0 0;
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.sub-label {
  color: var(--text-muted);
  font-size: 11px;
}

.motion-options,
.section-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-heading {
  gap: 3px;
}

.section-title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.section-description {
  color: var(--text-muted);
  font-size: 10px;
}

/* Slide fade transition for switch toggling */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 250px;
  overflow: hidden;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
  border-color: transparent;
}
</style>

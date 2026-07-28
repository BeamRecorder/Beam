<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RotateCcw, Scissors, Trash2, Unlink } from "@lucide/vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Button from "~/ui/button/Button.vue";
import ButtonGroup from "~/ui/button/ButtonGroup.vue";
import Switch from "~/ui/switch/Switch.vue";
import ColorPicker from "~/ui/ColorPicker/ColorPicker.vue";
import ShadowDirectionGroup from "../ShadowDirectionGroup.vue";
import BorderAndFrameControls from "./BorderAndFrameControls.vue";
import type { ClipFrame, NormalizedTransform } from "../../composition/composition-types";
import type { ShadowDirection } from "../shadow-types";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("ClipPropertiesPanel");
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
    clipTransform?: NormalizedTransform;
    isMirrored?: boolean;
  } | null;
}>();
const emit = defineEmits<{
  (event: "update:playbackRate", rate: number): void;
  (event: "update:enabled", enabled: boolean): void;
  (event: "update:isMirrored", isMirrored: boolean): void;
  (event: "update:cornerRadius", radius: string): void;
  (event: "update:shadow", shadow: { size: string; color?: string; direction?: string }): void;
  (event: "update:appearance", appearance: { borderEnabled?: boolean; borderColor?: string; borderWidth?: number; frame?: ClipFrame; frameTitle?: string; frameColor?: string; frameShowMenu?: boolean; frameShowScrollbars?: boolean }): void;
  (event: "update:clipTransform", transform: NormalizedTransform): void;
  (event: "reset:clipTransform"): void;
  (event: "unlink"): void;
  (event: "delete"): void;
  (event: "split"): void;
}>();

const speedPresets = [0.5, 1, 1.5, 2, 3];
const radiusPresets = computed(() => [
  { id: "none", label: t("none") },
  { id: "sm", label: "8px" },
  { id: "md", label: "16px" },
  { id: "lg", label: "24px" },
  { id: "custom", label: t("custom") },
]);
const shadowPresets = computed(() => [
  { id: "none", label: t("none") },
  { id: "sm", label: t("soft") },
  { id: "md", label: t("medium") },
  { id: "lg", label: t("strong") },
]);
const selectedRadius = ref("sm");
const customRadiusValue = ref(32);
const selectedShadowSize = ref("md");
const selectedShadowColor = ref("#000000");
const selectedShadowDirection = ref<ShadowDirection>("bottom");
watch(() => props.selectedClip, (clip) => {
  const radius = clip?.cornerRadius ?? "sm";
  if (typeof radius === "number" || !["none", "sm", "md", "lg"].includes(String(radius))) {
    selectedRadius.value = "custom";
    customRadiusValue.value = typeof radius === "number" ? radius : radius === "full" ? 200 : Number.parseFloat(String(radius)) || 32;
  } else selectedRadius.value = String(radius);
  selectedShadowSize.value = clip?.shadowSize ?? "md";
  selectedShadowColor.value = clip?.shadowColor ?? "#000000";
  selectedShadowDirection.value = (clip?.shadowDirection as ShadowDirection | undefined) ?? "bottom";
}, { immediate: true });

const currentPlaybackRate = computed(() => Math.round((props.selectedClip?.playbackRate ?? 1) * 100) / 100);
const clipTransform = computed(() => props.selectedClip?.clipTransform);
const updatePlacement = (patch: Partial<NormalizedTransform>) => {
  const current = clipTransform.value;
  if (!current) return;
  const width = Math.min(4, Math.max(.02, patch.width ?? current.width));
  const height = patch.width !== undefined && patch.height === undefined && current.width > 0
    ? Math.min(4, Math.max(.02, current.height * width / current.width))
    : Math.min(4, Math.max(.02, patch.height ?? current.height));
  emit("update:clipTransform", {
    x: Math.min(3, Math.max(-3, patch.x ?? current.x)),
    y: Math.min(3, Math.max(-3, patch.y ?? current.y)),
    width,
    height,
  });
};
const updateRadiusPreset = (radius: string) => {
  selectedRadius.value = radius;
  emit("update:cornerRadius", radius === "custom" ? String(customRadiusValue.value) : radius);
};
const updateCustomRadius = (value: number) => {
  customRadiusValue.value = value;
  emit("update:cornerRadius", String(value));
};
const emitShadow = (patch: { size?: string; color?: string; direction?: ShadowDirection }) => {
  selectedShadowSize.value = patch.size ?? selectedShadowSize.value;
  selectedShadowColor.value = patch.color ?? selectedShadowColor.value;
  selectedShadowDirection.value = patch.direction ?? selectedShadowDirection.value;
  emit("update:shadow", { size: selectedShadowSize.value, color: selectedShadowColor.value, direction: selectedShadowDirection.value });
};
</script>

<template>
  <div class="clip-properties">
    <div v-if="!selectedClip" class="empty-state">
      <div class="empty-icon">🎬</div>
      <p class="empty-title">{{ t('noClipSelected') }}</p>
      <p class="empty-desc">{{ t('noClipSelectedDesc') }}</p>
    </div>
    <div v-else class="options-group">
      <div v-if="clipTransform" class="section-block">
        <div class="section-header"><span class="section-title">{{ t('placement') }}</span><Button variant="ghost" size="xs" :icon="RotateCcw" :aria-label="t('resetClipPlacement')" @click="emit('reset:clipTransform')">{{ t('reset') }}</Button></div>
        <div class="sliders-stack">
          <BigSlider :model-value="clipTransform.x * 100" :min="-300" :max="300" :step="1" :label="t('horizontal')" :format-value="(value) => `${Math.round(value)}%`" @update:model-value="updatePlacement({ x: $event / 100 })" />
          <BigSlider :model-value="clipTransform.y * 100" :min="-300" :max="300" :step="1" :label="t('vertical')" :format-value="(value) => `${Math.round(value)}%`" @update:model-value="updatePlacement({ y: $event / 100 })" />
          <BigSlider :model-value="clipTransform.width * 100" :min="2" :max="400" :step="1" :label="t('size')" :format-value="(value) => `${Math.round(value)}%`" @update:model-value="updatePlacement({ width: $event / 100 })" />
        </div>
      </div>

      <div v-if="['video', 'image', 'webcam'].includes(selectedClip.kind)" class="section-block">
        <div class="section-header"><span class="section-title">{{ t('cornerRadius') }}</span></div>
        <ButtonGroup full><Button v-for="item in radiusPresets" :key="item.id" :variant="selectedRadius === item.id ? 'primary' : 'ghost'" size="xs" @click="updateRadiusPreset(item.id)">{{ item.label }}</Button></ButtonGroup>
        <BigSlider v-if="selectedRadius === 'custom'" :model-value="customRadiusValue" :min="0" :max="200" :step="1" :label="t('radius')" :default-value="32" :format-value="(value) => `${Math.round(value)}px`" @update:model-value="updateCustomRadius" />

        <div class="section-header margin-top-md"><span class="section-title">{{ t('dropShadow') }}</span></div>
        <ButtonGroup full><Button v-for="item in shadowPresets" :key="item.id" :variant="selectedShadowSize === item.id ? 'primary' : 'ghost'" size="xs" @click="emitShadow({ size: item.id })">{{ item.label }}</Button></ButtonGroup>
        <div v-if="selectedShadowSize !== 'none'" class="sub-group margin-top-sm"><span class="sub-label">{{ t('direction') }}</span><ShadowDirectionGroup :model-value="selectedShadowDirection" @update:model-value="emitShadow({ direction: $event })" /></div>
        <div v-if="selectedShadowSize !== 'none'" class="sub-group margin-top-sm"><span class="sub-label">{{ t('shadowColor') }}</span><ColorPicker :model-value="selectedShadowColor" :show-label="false" @update:model-value="emitShadow({ color: $event })" /></div>
        <div class="prop-row margin-top-md"><span class="prop-label">{{ t('mirrorHorizontally') }}</span><Switch :model-value="selectedClip.isMirrored ?? false" @update:model-value="emit('update:isMirrored', $event)" /></div>
        <BorderAndFrameControls
          :border-enabled="selectedClip.borderEnabled"
          :border-color="selectedClip.borderColor"
          :border-width="selectedClip.borderWidth"
          :frame="selectedClip.frame"
          :frame-title="selectedClip.frameTitle"
          :frame-color="selectedClip.frameColor"
          :frame-show-menu="selectedClip.frameShowMenu"
          :frame-show-scrollbars="selectedClip.frameShowScrollbars"
          @update="emit('update:appearance', $event)"
        />
      </div>

      <div v-if="selectedClip.kind === 'video' || selectedClip.kind === 'webcam'" class="section-block">
        <div class="section-header"><span class="section-title">{{ t('speedBoost') }}</span></div>
        <BigSlider :model-value="currentPlaybackRate" :default-value="1" :min=".25" :max="4" :step=".05" :label="t('playbackSpeed')" :format-value="(value) => `${value.toFixed(2)}×`" @update:model-value="emit('update:playbackRate', $event)" />
        <div class="preset-pills"><button v-for="preset in speedPresets" :key="preset" type="button" class="preset-pill" :class="{ active: Math.abs(currentPlaybackRate - preset) < .04 }" @click="emit('update:playbackRate', preset)">{{ preset }}×</button></div>
      </div>

      <div class="section-block">
        <div class="prop-row"><span class="prop-label">{{ t('enabled') }}</span><Switch :model-value="selectedClip.enabled ?? true" @update:model-value="emit('update:enabled', $event)" /></div>
        <div v-if="selectedClip.isLinked" class="prop-row"><div class="link-label"><Unlink :size="14" /><span>{{ t('sidecarLink') }}</span></div><Button variant="outline" size="sm" @click="emit('unlink')">Unlink</Button></div>
        <Button v-if="selectedClip.kind !== 'image'" variant="outline" size="sm" :icon="Scissors" block @click="emit('split')">Split Clip</Button>
      </div>

      <div class="danger-zone"><Button variant="danger" size="sm" :icon="Trash2" block @click="emit('delete')">Delete Clip</Button></div>
    </div>
  </div>
</template>

<style scoped>
.clip-properties { display: flex; flex-direction: column; flex: 1; min-height: 100%; }.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 16px; text-align: center; background: var(--color-bg-element); border-radius: var(--radius-md); border: 1px dashed var(--color-border-strong); }.empty-icon { font-size: 28px; margin-bottom: 8px; }.empty-title { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-primary); }.empty-desc { margin: 6px 0 0; font-size: 11px; color: var(--text-muted); line-height: 1.4; }.options-group { display: flex; flex-direction: column; gap: 16px; flex: 1; }.section-block { display: flex; flex-direction: column; gap: 10px; }.section-header { display: flex; align-items: center; justify-content: space-between; min-height: 20px; }.section-title { font-size: 11px; font-weight: 600; color: var(--text-secondary); }.sub-group { display: flex; flex-direction: column; gap: 6px; }.sub-label { font-size: 10px; font-weight: 500; color: var(--text-muted); }.margin-top-sm { margin-top: 4px; }.margin-top-md { margin-top: 8px; }.sliders-stack { display: flex; flex-direction: column; gap: 8px; }.preset-pills { display: flex; gap: 6px; }.preset-pill { flex: 1; height: 24px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-surface); color: var(--text-secondary); font-size: 10px; font-weight: 700; cursor: pointer; transition: all var(--fast) ease; }.preset-pill:hover { border-color: var(--color-primary); color: var(--color-primary); }.preset-pill.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }.prop-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.prop-label, .link-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--text-primary); }.danger-zone { margin-top: auto; position: sticky; bottom: 0; padding-top: 12px; background: var(--color-bg-element); z-index: 10; }.sub-group :deep(.color-picker-trigger-container) { width: 100%; }
</style>

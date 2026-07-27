<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Button from "~/ui/button/Button.vue";
import ButtonGroup from "~/ui/button/ButtonGroup.vue";
import Switch from "~/ui/switch/Switch.vue";
import ColorPicker from "~/ui/ColorPicker/ColorPicker.vue";
import ShadowDirectionGroup from "../ShadowDirectionGroup.vue";
import BorderAndFrameControls from "./BorderAndFrameControls.vue";
import type { ShadowDirection } from "../shadow-types";
import {
  Unlink,
  Trash2,
  RotateCcw,
} from "@lucide/vue";
import type { NormalizedTransform } from "../../composition/composition-types";
import type { ClipFrame } from "../../composition/composition-types";

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
  (e: "update:playbackRate", rate: number): void;
  (e: "update:enabled", enabled: boolean): void;
  (e: "update:isMirrored", isMirrored: boolean): void;
  (e: "update:cornerRadius", radius: string): void;
  (
    e: "update:shadow",
    shadow: { size: string; color?: string; direction?: string },
  ): void;
  (e: "update:appearance", appearance: { borderEnabled?: boolean; borderColor?: string; borderWidth?: number; frame?: ClipFrame; frameTitle?: string; frameColor?: string; frameShowMenu?: boolean; frameShowScrollbars?: boolean }): void;
  (e: "update:clipTransform", transform: NormalizedTransform): void;
  (e: "reset:clipTransform"): void;
  (e: "unlink"): void;
  (e: "delete"): void;
  (e: "split"): void;
}>();

const speedPresets = [0.5, 1.0, 1.5, 2.0, 3.0];

const radiusPresets = [
  { id: "none", label: "None" },
  { id: "sm", label: "8px" },
  { id: "md", label: "16px" },
  { id: "lg", label: "24px" },
  { id: "custom", label: "Custom" },
];

const shadowPresets = [
  { id: "none", label: "None" },
  { id: "sm", label: "Soft" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Strong" },
];

const NAMED_RADII = ["none", "sm", "md", "lg", "full"];

const selectedRadius = ref<string>("md");
const customRadiusValue = ref<number>(32);
const selectedShadowSize = ref(props.selectedClip?.shadowSize ?? "md");
const selectedShadowColor = ref(props.selectedClip?.shadowColor ?? "#000000");
const selectedShadowDirection = ref<ShadowDirection>(
  (props.selectedClip?.shadowDirection as ShadowDirection | undefined) ?? "all",
);

watch(
  () => props.selectedClip,
  (clip) => {
    const r = clip?.cornerRadius ?? "sm";
    if (typeof r === "number") {
      selectedRadius.value = "custom";
      customRadiusValue.value = r;
    } else if (NAMED_RADII.includes(String(r))) {
      // map "full" (old data) -> "custom" at 9999
      if (r === "full") {
        selectedRadius.value = "custom";
        customRadiusValue.value = 9999;
      } else {
        selectedRadius.value = String(r);
      }
    } else {
      selectedRadius.value = "custom";
      customRadiusValue.value = parseFloat(String(r)) || 32;
    }
    selectedShadowSize.value = clip?.shadowSize ?? "md";
    selectedShadowColor.value = clip?.shadowColor ?? "#000000";
    selectedShadowDirection.value = (clip?.shadowDirection as ShadowDirection | undefined) ?? "bottom";
  },
  { immediate: true },
);

const handleRadiusChange = (radiusId: string) => {
  selectedRadius.value = radiusId;
  if (radiusId === "custom") {
    // emit the numeric value in px when switching to custom
    emit("update:cornerRadius", String(customRadiusValue.value));
  } else {
    emit("update:cornerRadius", radiusId);
  }
};

const handleCustomRadiusChange = (value: number) => {
  customRadiusValue.value = value;
  emit("update:cornerRadius", String(value));
};

const handleShadowPresetChange = (sizeId: string) => {
  selectedShadowSize.value = sizeId;
  emit("update:shadow", {
    size: sizeId,
    color: selectedShadowColor.value,
    direction: selectedShadowDirection.value,
  });
};

const handleShadowDirectionChange = (directionId: ShadowDirection) => {
  selectedShadowDirection.value = directionId;
  emit("update:shadow", {
    size: selectedShadowSize.value,
    color: selectedShadowColor.value,
    direction: directionId,
  });
};

const handleShadowColorChange = (color: string) => {
  selectedShadowColor.value = color;
  emit("update:shadow", {
    size: selectedShadowSize.value,
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
  emit("update:clipTransform", {
    x: Math.min(3, Math.max(-3, patch.x ?? current.x)),
    y: Math.min(3, Math.max(-3, patch.y ?? current.y)),
    width,
    height,
  });
};
</script>

<template>
  <div class="clip-properties">
    <div v-if="!selectedClip" class="empty-state">
      <div class="empty-icon">🎬</div>
      <p class="empty-title">No clip selected</p>
      <p class="empty-desc">
        Click a clip on the timeline to inspect and edit its properties.
      </p>
    </div>

    <div v-else class="options-group">
      <!-- Placement Section -->
      <div v-if="clipTransform" class="section-block">
        <div class="section-header">
          <span class="section-title">Placement</span>
          <Button variant="ghost" size="xs" :icon="RotateCcw" aria-label="Reset clip placement" @click="emit('reset:clipTransform')">Reset</Button>
        </div>
        <div class="sliders-stack">
          <BigSlider
            :model-value="clipTransform.x * 100"
            :min="-300"
            :max="300"
            :step="1"
            label="Horizontal"
            :format-value="(value) => `${Math.round(value)}%`"
            @update:modelValue="updatePlacement({ x: $event / 100 })"
          />
          <BigSlider
            :model-value="clipTransform.y * 100"
            :min="-300"
            :max="300"
            :step="1"
            label="Vertical"
            :format-value="(value) => `${Math.round(value)}%`"
            @update:modelValue="updatePlacement({ y: $event / 100 })"
          />
          <BigSlider
            :model-value="clipTransform.width * 100"
            :min="2"
            :max="400"
            :step="1"
            label="Size"
            :format-value="(value) => `${Math.round(value)}%`"
            @update:modelValue="updatePlacement({ width: $event / 100 })"
          />
        </div>
      </div>

      <!-- Appearance Section (Corner Radius, Shadow & Mirror) -->
      <div v-if="['video', 'image', 'webcam'].includes(selectedClip.kind)" class="section-block">
        <div class="section-header">
          <span class="section-title">Corner Radius</span>
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
          label="Radius"
          :default-value="32"
          :format-value="(v) => `${Math.round(v)}px`"
          @update:modelValue="handleCustomRadiusChange"
        />

        <div class="section-header margin-top-md">
          <span class="section-title">Drop Shadow</span>
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

        <div v-if="selectedShadowSize !== 'none'" class="sub-group margin-top-sm">
          <span class="sub-label">Direction</span>
          <ShadowDirectionGroup
            :model-value="selectedShadowDirection"
            @update:model-value="handleShadowDirectionChange"
          />
        </div>

        <div v-if="selectedShadowSize !== 'none'" class="sub-group margin-top-sm">
          <span class="sub-label">Shadow Color</span>
          <ColorPicker
            :model-value="selectedShadowColor"
            :show-label="false"
            @update:modelValue="handleShadowColorChange"
          />
        </div>

        <div class="prop-row margin-top-md">
          <span class="prop-label">Mirror horizontally</span>
          <Switch
            :model-value="selectedClip.isMirrored ?? false"
            @update:modelValue="emit('update:isMirrored', $event)"
          />
        </div>
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

      <!-- Speed Boost / Rate Controls -->
      <div v-if="selectedClip.kind === 'video' || selectedClip.kind === 'webcam'" class="section-block">
        <div class="section-header">
          <span class="section-title">Speed Boost</span>
        </div>
        <BigSlider
          :model-value="currentPlaybackRate"
          :default-value="1.0"
          :min="0.25"
          :max="4.0"
          :step="0.05"
          label="Playback Speed"
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

      <!-- Controls & Link -->
      <div class="section-block">
        <div class="prop-row">
          <span class="prop-label">Enabled</span>
          <Switch
            :model-value="selectedClip.enabled ?? true"
            @update:modelValue="emit('update:enabled', $event)"
          />
        </div>

        <div v-if="selectedClip.isLinked" class="prop-row">
          <div class="link-label">
            <Unlink :size="14" />
            <span>Sidecar Link</span>
          </div>
          <Button variant="outline" size="sm" @click="emit('unlink')">
            Unlink
          </Button>
        </div>
      </div>

      <!-- Danger Delete Button -->
      <div class="danger-zone">
        <Button
          variant="danger"
          size="sm"
          :icon="Trash2"
          block
          @click="emit('delete')"
        >
          Delete Clip
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clip-properties {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
  background: var(--color-bg-element);
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border-strong);
}

.empty-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.empty-desc {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
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
  min-height: 20px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.sub-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
}

.margin-top-sm {
  margin-top: 4px;
}

.margin-top-md {
  margin-top: 8px;
}

.sliders-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-pills {
  display: flex;
  gap: 6px;
}

.preset-pill {
  flex: 1;
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--fast) ease;
}

.preset-pill:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.preset-pill.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.prop-label,
.link-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.danger-zone {
  margin-top: auto;
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  background: var(--color-bg-element);
  z-index: 10;
}

.sub-group :deep(.color-picker-trigger-container) {
  width: 100%;
}
</style>

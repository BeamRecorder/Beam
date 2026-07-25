<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Button from "~/ui/button/Button.vue";
import ButtonGroup from "~/ui/button/ButtonGroup.vue";
import Switch from "~/ui/switch/Switch.vue";
import ColorPicker from "~/ui/ColorPicker/ColorPicker.vue";
import {
  Unlink,
  Trash2,
  Gauge,
  Square,
  Sun,
  MoveDown,
  MoveDownRight,
  MoveUpLeft,
  CircleDot,
  RotateCcw,
  FlipHorizontal,
} from "@lucide/vue";
import type { NormalizedTransform } from "../../composition/composition-types";

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
    cornerRadius?: string;
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
  (e: "update:clipTransform", transform: NormalizedTransform): void;
  (e: "reset:clipTransform"): void;
  (e: "unlink"): void;
  (e: "delete"): void;
}>();

const speedPresets = [0.5, 1.0, 1.5, 2.0, 3.0];

const radiusPresets = [
  { id: "none", label: "None" },
  { id: "sm", label: "8px" },
  { id: "md", label: "16px" },
  { id: "lg", label: "24px" },
  { id: "full", label: "Full" },
];

const shadowPresets = [
  { id: "none", label: "None" },
  { id: "sm", label: "Soft" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Strong" },
  { id: "glow", label: "Glow" },
];

const shadowDirections = [
  { id: "all", label: "Around", icon: CircleDot },
  { id: "bottom", label: "Bottom", icon: MoveDown },
  { id: "bottom-right", label: "Bottom-Right", icon: MoveDownRight },
  { id: "top-left", label: "Top-Left", icon: MoveUpLeft },
];

const selectedRadius = ref(props.selectedClip?.cornerRadius ?? "md");
const selectedShadowSize = ref(props.selectedClip?.shadowSize ?? "md");
const selectedShadowColor = ref(props.selectedClip?.shadowColor ?? "#000000");
const selectedShadowDirection = ref(
  props.selectedClip?.shadowDirection ?? "all",
);

watch(
  () => props.selectedClip,
  (clip) => {
    selectedRadius.value = clip?.cornerRadius ?? "sm";
    selectedShadowSize.value = clip?.shadowSize ?? "md";
    selectedShadowColor.value = clip?.shadowColor ?? "#000000";
    selectedShadowDirection.value = clip?.shadowDirection ?? "bottom";
  },
  { immediate: true },
);

const handleRadiusChange = (radiusId: string) => {
  selectedRadius.value = radiusId;
  emit("update:cornerRadius", radiusId);
};

const handleShadowPresetChange = (sizeId: string) => {
  selectedShadowSize.value = sizeId;
  emit("update:shadow", {
    size: sizeId,
    color: selectedShadowColor.value,
    direction: selectedShadowDirection.value,
  });
};

const handleShadowDirectionChange = (directionId: string) => {
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
      <div class="clip-header">
        <span class="clip-type-badge">{{
          selectedClip.kind.toUpperCase()
        }}</span>
        <h4 class="clip-name">{{ selectedClip.name || selectedClip.id }}</h4>
      </div>

      <div v-if="clipTransform" class="property-card">
        <div class="card-header">
          <Square :size="14" class="card-icon" /><span class="card-title"
            >Clip placement</span
          >
          <Button variant="ghost" size="xs" :icon="RotateCcw" aria-label="Reset clip placement" @click="emit('reset:clipTransform')">Reset</Button>
        </div>
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

      <!-- Mirror / Flip Horizontally for Video / Image / Webcam -->
      <div
        v-if="['video', 'image', 'webcam'].includes(selectedClip.kind)"
        class="property-card"
      >
        <div class="prop-row">
          <div class="prop-label">
            <FlipHorizontal :size="14" class="card-icon" />
            <span>Mirror horizontally</span>
          </div>
          <Switch
            :model-value="selectedClip.isMirrored ?? false"
            @update:modelValue="emit('update:isMirrored', $event)"
          />
        </div>
      </div>

      <!-- Speed Boost / Rate Controls -->
      <div v-if="selectedClip.kind === 'video' || selectedClip.kind === 'webcam'" class="property-card">
        <div class="card-header">
          <Gauge :size="14" class="card-icon" />
          <span class="card-title">Speed Boost</span>
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

      <!-- Corner Radius Presets for Video / Image / Webcam -->
      <div
        v-if="['video', 'image', 'webcam'].includes(selectedClip.kind)"
        class="property-card"
      >
        <div class="card-header">
          <Square :size="14" class="card-icon" />
          <span class="card-title">Corner Radius</span>
        </div>
        <ButtonGroup>
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
      </div>

      <!-- Shadow Settings & Directions for Video / Image / Webcam -->
      <div
        v-if="['video', 'image', 'webcam'].includes(selectedClip.kind)"
        class="property-card"
      >
        <div class="card-header">
          <Sun :size="14" class="card-icon" />
          <span class="card-title">Drop Shadow</span>
        </div>

        <div class="sub-group">
          <span class="sub-label">Preset</span>
          <ButtonGroup>
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
        </div>

        <div v-if="selectedShadowSize !== 'none'" class="sub-group margin-top">
          <span class="sub-label">Direction</span>
          <ButtonGroup>
            <Button
              v-for="dir in shadowDirections"
              :key="dir.id"
              :variant="
                selectedShadowDirection === dir.id ? 'primary' : 'ghost'
              "
              size="xs"
              :icon="dir.icon"
              icon-only
              :tooltip="dir.label"
              @click="handleShadowDirectionChange(dir.id)"
            />
          </ButtonGroup>
        </div>

        <div v-if="selectedShadowSize !== 'none'" class="prop-row margin-top">
          <span class="prop-label">Shadow Color</span>
          <ColorPicker
            :model-value="selectedShadowColor"
            @update:modelValue="handleShadowColorChange"
          />
        </div>
      </div>

      <!-- Link & Visibility Controls -->
      <div class="property-card">
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
  gap: 16px;
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
  gap: 14px;
}

.clip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.clip-type-badge {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-light);
  color: var(--color-primary);
  letter-spacing: 0.05em;
}

.clip-name {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-card {
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}

.card-icon {
  color: var(--color-primary);
}

.card-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sub-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
}

.margin-top {
  margin-top: 6px;
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
  font-weight: 600;
  color: var(--text-primary);
}

.danger-zone {
  margin-top: 4px;
}
</style>

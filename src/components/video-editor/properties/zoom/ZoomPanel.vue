<script setup lang="ts">
import Button from "~/ui/button/Button.vue";
import ButtonGroup from "~/ui/button/ButtonGroup.vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Popover from "~/ui/popover/Popover.vue";
import DeleteItem from "~/ui/button/DeleteItem.vue";
import ZoomClickEmptyState from "~/components/video-editor/properties/zoom/ZoomClickEmptyState.vue";
import { MousePointer, Sparkles, ZoomIn } from "@lucide/vue";
import type { ZoomElement } from "~/components/video-editor/zoom/zoom-types";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("ZoomPanel");

const props = defineProps<{
  selectedZoom: ZoomElement | null;
  canGenerate: boolean;
  hasAutomaticZooms: boolean;
}>();

const emit = defineEmits<{
  (event: "update", value: ZoomElement): void;
  (event: "delete"): void;
  (event: "generate"): void;
}>();

const magnificationValues = [1.25, 1.5, 1.8, 2.2, 3.5, 5.0];

const updateDepth = (depth: number) => {
  if (!props.selectedZoom) return;
  const clamped = Math.max(1, Math.min(6, Math.round(depth)));
  emit("update", { ...props.selectedZoom, depth: clamped });
};

const setMode = (mode: ZoomElement["mode"]) => {
  if (!props.selectedZoom || props.selectedZoom.mode === mode) return;
  emit("update", {
    ...props.selectedZoom,
    mode,
  });
};
</script>

<template>
  <div class="zoom-panel">
    <!-- Top Action Header -->
    <div class="header-action">
      <Button
        v-if="!hasAutomaticZooms"
        variant="primary"
        size="sm"
        :icon="Sparkles"
        :disabled="!canGenerate"
        block
        @click="emit('generate')"
      >
        Generate Auto Zooms
      </Button>
      <Popover v-else block>
        <template #trigger>
          <Button
            variant="outline"
            size="sm"
            :icon="Sparkles"
            :disabled="!canGenerate"
            block
          >
            Regenerate Auto Zooms
          </Button>
        </template>
        <template #default="{ close }">
          <div class="refresh-confirmation">
            <p>{{ t('regenerateConfirm') }}</p>
            <div class="refresh-actions">
              <Button variant="ghost" size="xs" @click="close">{{ t('cancel') }}</Button>
              <Button
                variant="danger"
                size="xs"
                @click="
                  emit('generate');
                  close();
                "
              >
                Regenerate
              </Button>
            </div>
          </div>
        </template>
      </Popover>
    </div>

    <!-- Active Zoom Block Inspector -->
    <div v-if="selectedZoom" class="options-group">
      <!-- Mode Toggle -->
      <div class="section-block">
        <span class="section-title">{{ t('mode') }}</span>
        <ButtonGroup full>
          <Button
            size="xs"
            :variant="selectedZoom.mode === 'auto' ? 'primary' : 'ghost'"
            @click="setMode('auto')"
          >
            Auto (Cursor)
          </Button>
          <Button
            size="xs"
            :variant="selectedZoom.mode === 'manual' ? 'primary' : 'ghost'"
            @click="setMode('manual')"
          >
            Manual Focus
          </Button>
        </ButtonGroup>
        <div class="hint-card">
          <MousePointer :size="13" class="hint-icon" />
          <span>
            {{ selectedZoom.mode === "manual" ? t('manualHint') : t('autoHint') }}
          </span>
        </div>
      </div>

      <!-- Zoom Level / Depth -->
      <div class="section-block">
        <div class="section-header">
          <span class="section-title">{{ t('magnification') }}</span>
          <span class="depth-badge">{{ magnificationValues[selectedZoom.depth - 1]?.toFixed(2) }}×</span>
        </div>

        <BigSlider
          :model-value="selectedZoom.depth"
          :min="1"
          :max="6"
          :step="1"
          :default-value="2"
          :label="t('zoomLevel')"
          :format-value="(val) => `${magnificationValues[Math.round(val) - 1]?.toFixed(2)}×`"
          @update:model-value="updateDepth"
        />

        <div class="depth-presets">
          <button
            v-for="(val, idx) in magnificationValues"
            :key="idx"
            type="button"
            class="preset-pill"
            :class="{ active: selectedZoom.depth === idx + 1 }"
            @click="updateDepth(idx + 1)"
          >
            {{ val }}×
          </button>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="danger-zone">
        <DeleteItem :label="t('deleteZoom')" @click="emit('delete')" />
      </div>
    </div>

    <!-- Empty Selection State -->
    <ZoomClickEmptyState v-else />
  </div>
</template>

<style scoped>
.zoom-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 100%;
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

.depth-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
}

.hint-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: var(--color-bg-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
}

.hint-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--color-primary);
}

.depth-presets {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.preset-pill {
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

.danger-zone {
  margin-top: auto;
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  background: var(--color-bg-element);
  z-index: 10;
  width: 100%;
}

.danger-zone :deep(.btn-container),
.danger-zone :deep(.delete-item-btn) {
  width: 100%;
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
  color: var(--text-muted);
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

.refresh-confirmation {
  width: 240px;
  padding: 10px;
}

.refresh-confirmation p {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.refresh-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>

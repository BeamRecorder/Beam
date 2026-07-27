<script setup lang="ts">
import { computed } from "vue";
import { Trash2 } from "@lucide/vue";
import BigSlider from "~/ui/slider/BigSlider.vue";
import Button from "~/ui/button/Button.vue";
import Switch from "~/ui/switch/Switch.vue";

const props = defineProps<{
  clip: { name?: string; enabled?: boolean; volume?: number } | null;
}>();

const emit = defineEmits<{
  (e: "update:volume", value: number): void;
  (e: "update:enabled", value: boolean): void;
  (e: "delete"): void;
}>();

const volume = computed(() => props.clip?.volume ?? 100);
</script>

<template>
  <div class="audio-clip-properties">
    <div v-if="!clip" class="empty-state">
      <p class="empty-title">No audio clip selected</p>
      <p class="empty-desc">Select an imported audio clip in the timeline.</p>
    </div>
    <div v-else class="options-group">
      <div class="section-block">
        <span class="section-title">{{ clip.name || "Audio clip" }}</span>
        <BigSlider
          :model-value="volume"
          :default-value="100"
          :min="0"
          :max="200"
          :step="1"
          label="Volume"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="emit('update:volume', $event)"
        />
      </div>
      <div class="section-block">
        <div class="prop-row">
          <span class="prop-label">Enabled</span>
          <Switch
            :model-value="clip.enabled ?? true"
            @update:model-value="emit('update:enabled', $event)"
          />
        </div>
      </div>
      <div class="danger-zone">
        <Button variant="danger" size="sm" :icon="Trash2" block @click="emit('delete')">
          Delete Audio Clip
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-clip-properties { display: flex; flex: 1; flex-direction: column; }
.options-group { display: grid; gap: 14px; }
.section-block { display: grid; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--color-border); }
.section-title { color: var(--text-primary); font-size: 12px; font-weight: 700; }
.prop-row { display: flex; align-items: center; justify-content: space-between; }
.prop-label, .empty-desc { color: var(--text-secondary); font-size: 12px; }
.empty-title { margin: 0 0 6px; color: var(--text-primary); font-weight: 700; }
.empty-desc { margin: 0; }
</style>

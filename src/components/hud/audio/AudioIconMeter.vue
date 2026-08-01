<script setup lang="ts">
import { computed } from "vue";
import { Mic, MicOff, Volume2, VolumeX } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    enabled: boolean;
    level: number;
    kind: "mic" | "system";
    size?: "sm" | "md";
  }>(),
  {
    size: "md",
  }
);

const percent = computed(() =>
  Math.min(100, Math.max(0, Math.round(props.level * 100)))
);

const meterColor = computed(() => {
  const lvl = props.level;
  if (lvl > 0.75) return "var(--color-error, #ef4444)";
  if (lvl > 0.4) return "var(--color-warning, #f59e0b)";
  return "var(--color-success, #10b981)";
});
</script>

<template>
  <div
    class="audio-icon-meter"
    :class="{
      enabled,
      'is-active': enabled && level > 0.02,
      [`size-${size}`]: true,
    }"
  >
    <!-- Dynamic volume fill background -->
    <div
      v-if="enabled"
      class="level-bar-fill"
      :style="{
        height: `${Math.max(10, percent)}%`,
        background: meterColor,
      }"
    />

    <!-- Icon -->
    <component
      :is="
        kind === 'mic'
          ? (enabled ? Mic : MicOff)
          : (enabled ? Volume2 : VolumeX)
      "
      class="meter-icon"
      :class="{ 'is-disabled': !enabled }"
    />
  </div>
</template>

<style scoped>
.audio-icon-meter {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm, 6px);
  overflow: hidden;
}
.audio-icon-meter.size-md {
  width: 24px;
  height: 24px;
}
.audio-icon-meter.size-sm {
  width: 20px;
  height: 20px;
}

.level-bar-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  opacity: 0.25;
  border-radius: 2px;
  transition: height 0.06s ease-out, background 0.15s ease;
  pointer-events: none;
}

.audio-icon-meter.is-active .level-bar-fill {
  opacity: 0.45;
}

.meter-icon {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  transition: color 0.15s ease, transform 0.08s ease;
}
.meter-icon.is-disabled {
  color: var(--text-muted, #71717a);
  opacity: 0.55;
}
.audio-icon-meter.enabled .meter-icon {
  color: var(--text-primary, #f4f4f5);
}
</style>

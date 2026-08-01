<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { capture } from "../../../api/capture";

const state = ref({ shadowSize: "md", cornerRadius: "md" });
let unsubscribe: (() => void) | null = null;

onMounted(async () => {
  unsubscribe = capture.onCameraShadow((next) => {
    state.value = next;
  });
  try {
    const saved = await capture.getCameraOverlayState();
    if (saved) {
      state.value = {
        shadowSize: saved.shadowSize || "md",
        cornerRadius: saved.cornerRadius || "md",
      };
    }
  } catch {
    // fallback to initial defaults
  }
});

onBeforeUnmount(() => unsubscribe?.());
</script>

<template>
  <div
    class="shadow"
    :class="[`shadow-${state.shadowSize}`, `radius-${state.cornerRadius}`]"
  />
</template>

<style scoped>
:global(html),
:global(body) {
  margin: 0;
  background: transparent;
  overflow: hidden;
}
.shadow {
  position: fixed;
  inset: var(--padding);
  --padding: 32px;
  --radius: 14px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.45);
  transition: all 0.2s ease;
}
.shadow-none {
  --padding: 0;
  box-shadow: none;
  background: transparent;
}
.shadow-sm {
  --padding: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45), 0 1px 4px rgba(0, 0, 0, 0.3);
}
.shadow-md {
  --padding: 32px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.35);
}
.shadow-lg {
  --padding: 52px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.72), 0 4px 14px rgba(0, 0, 0, 0.4);
}
.radius-none {
  --radius: 0;
}
.radius-sm {
  --radius: 8px;
}
.radius-md {
  --radius: 14px;
}
.radius-lg {
  --radius: 22px;
}
.radius-full {
  --radius: 50%;
}
</style>

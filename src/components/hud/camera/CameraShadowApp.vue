<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const state = ref({ shadowSize: "md", cornerRadius: "md" });
let unsubscribe: (() => void) | null = null;
onMounted(() => {
  unsubscribe = window.capture?.onCameraShadow((next) => {
    state.value = next;
  }) ?? null;
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
}
.shadow-none {
  --padding: 0;
  box-shadow: none;
}
.shadow-sm {
  --padding: 16px;
  box-shadow: 0 3px 10px -4px rgba(0, 0, 0, 0.28);
}
.shadow-md {
  --padding: 32px;
  box-shadow: 0 7px 20px -8px rgba(0, 0, 0, 0.42);
}
.shadow-lg {
  --padding: 52px;
  box-shadow: 0 12px 34px -12px rgba(0, 0, 0, 0.58);
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

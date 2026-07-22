<script setup lang="ts">
import {
  Monitor,
  Film,
  ZoomIn,
  MousePointer,
  Volume2,
  Settings,
} from "@lucide/vue";

defineProps<{
  activeTab: string;
}>();

const emit = defineEmits<{
  (e: "select-tab", tab: string): void;
}>();

const menuItems = [
  { id: "canvas", label: "Canvas", icon: Monitor },
  { id: "clip", label: "Clip", icon: Film },
  { id: "zoom", label: "Zoom", icon: ZoomIn },
  { id: "cursor", label: "Cursor", icon: MousePointer },
  { id: "audio", label: "Audio", icon: Volume2 },
];
</script>

<template>
  <aside class="sidebar-island">
    <div class="logo-area">
      <img src="/brand/DemoRecorderIcon.webp" class="brand-logo" alt="Logo" />
    </div>

    <nav class="nav-menu">
      <button
        v-for="item in menuItems"
        :key="item.id"
        class="nav-btn"
        :class="{ active: activeTab === item.id }"
        @click="emit('select-tab', item.id)"
        :title="item.label"
      >
        <component :is="item.icon" class="nav-icon" />
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <button
        class="nav-btn footer-btn"
        :class="{ active: activeTab === 'settings' }"
        @click="emit('select-tab', 'settings')"
        title="Settings"
      >
        <Settings class="nav-icon animate-cog" />
        <span class="nav-label">Settings</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-island {
  width: 72px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 16px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.logo-area {
  display: flex;
  justify-content: center;
  align-items: center;
}

.brand-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.sidebar-footer {
  margin-top: auto;
  width: 100%;
}

.nav-btn {
  width: 100%;
  height: 52px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.nav-btn.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.nav-btn:hover .animate-cog {
  transform: rotate(45deg);
}

.nav-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease;
}

.nav-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.2px;
}
</style>

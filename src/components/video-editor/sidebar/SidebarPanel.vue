<script setup lang="ts">
import { MousePointer, Scissors, Volume2, Sparkles } from '@lucide/vue'

defineProps<{
  activeTab: string
}>()

const emit = defineEmits<{
  (e: 'select-tab', tab: string): void
}>()

const menuItems = [
  { id: 'cursor', label: 'Cursor', icon: MousePointer },
  { id: 'trim', label: 'Trim', icon: Scissors },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'effects', label: 'Effects', icon: Sparkles },
]
</script>

<template>
  <aside class="sidebar-island">
    <div class="logo-area">
      <div class="logo-ring">
        <div class="logo-core"></div>
      </div>
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
  </aside>
</template>

<style scoped>
.sidebar-island {
  width: 72px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
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

.logo-ring {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--color-orange);
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-core {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-orange);
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  background: var(--color-light-blue-hover);
  color: var(--text-primary);
}

.nav-btn.active {
  background: var(--color-orange-light);
  color: var(--color-orange);
}

.nav-icon {
  width: 18px;
  height: 18px;
}

.nav-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.2px;
}
</style>

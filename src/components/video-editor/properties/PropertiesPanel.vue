<script setup lang="ts">
import type { CursorType } from '../composables/useCursorReplacer'
import type { BackgroundMediaGroup } from '../composables/backgroundMedia'
import CursorPanel from './CursorPanel.vue'
import CanvasPanel from './CanvasPanel.vue'
import TrimPanel from './TrimPanel.vue'
import AudioPanel from './AudioPanel.vue'

defineProps<{
  activeTab: string
  
  // Cursor properties
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean

  // Audio properties
  volume: number
  isVideoEnabled: boolean
  isSystemAudioEnabled: boolean
  isMicAudioEnabled: boolean

  // Background properties
  selectedBackground: string | null
  backgroundGroups: BackgroundMediaGroup[]
}>()

const emit = defineEmits<{
  (e: 'update:selectedCursor', value: CursorType): void
  (e: 'update:cursorSize', value: number): void
  (e: 'update:cursorColor', value: string): void
  (e: 'update:enableShadow', value: boolean): void
  (e: 'update:enableRipple', value: boolean): void
  (e: 'update:volume', value: number): void
  (e: 'update:isVideoEnabled', value: boolean): void
  (e: 'update:isSystemAudioEnabled', value: boolean): void
  (e: 'update:isMicAudioEnabled', value: boolean): void
  (e: 'update:selectedBackground', value: string): void
}>()
</script>

<template>
  <div class="properties-island">
    <div class="panel-header">
      <h3 class="panel-title">Properties</h3>
      <span class="panel-subtitle">{{ activeTab.toUpperCase() }} OPTIONS</span>
    </div>

    <div class="panel-content">
      <CursorPanel 
        v-if="activeTab === 'cursor'"
        :selectedCursor="selectedCursor"
        :cursorSize="cursorSize"
        :cursorColor="cursorColor"
        :enableShadow="enableShadow"
        :enableRipple="enableRipple"
        @update:selectedCursor="emit('update:selectedCursor', $event)"
        @update:cursorSize="emit('update:cursorSize', $event)"
        @update:cursorColor="emit('update:cursorColor', $event)"
        @update:enableShadow="emit('update:enableShadow', $event)"
        @update:enableRipple="emit('update:enableRipple', $event)"
      />

      <CanvasPanel 
        v-else-if="activeTab === 'canvas'"
        :selected-background="selectedBackground"
        :background-groups="backgroundGroups"
        @update:selectedBackground="emit('update:selectedBackground', $event)"
      />

      <TrimPanel 
        v-else-if="activeTab === 'trim'"
      />

      <AudioPanel 
        v-else-if="activeTab === 'audio'"
        :volume="volume"
        :isSystemAudioEnabled="isSystemAudioEnabled"
        :isMicAudioEnabled="isMicAudioEnabled"
        @update:volume="emit('update:volume', $event)"
        @update:isSystemAudioEnabled="emit('update:isSystemAudioEnabled', $event)"
        @update:isMicAudioEnabled="emit('update:isMicAudioEnabled', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.properties-island {
  width: 260px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-subtitle {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>

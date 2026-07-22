<script setup lang="ts">
import type { CursorType } from '../composables/useCursorReplacer'
import type { BackgroundMedia, BackgroundMediaGroup } from '../composables/backgroundMedia'
import CursorPanel from './CursorPanel.vue'
import CanvasPanel from './CanvasPanel.vue'
import TrimPanel from './TrimPanel.vue'
import AudioPanel from './AudioPanel.vue'
import ZoomPanel from './ZoomPanel.vue'
import SettingsPanel from './SettingsPanel.vue'
import ClipPropertiesPanel from './ClipPropertiesPanel.vue'
import type { ZoomElement } from '../zoom/zoom-types'
import CaptionPanel from './CaptionPanel.vue'
import type { CaptionCompositionLayer, ProjectComposition } from '../composition/composition-types'
import type { ProjectEditorData } from '../../../api/types/capture-api'

defineProps<{
  activeTab: string
  
  // Selected clip for clip tab
  selectedClip?: {
    id: string
    kind: string
    name?: string
    timelineStartMs: number
    timelineDurationMs: number
    playbackRate?: number
    enabled?: boolean
    isLinked?: boolean
    shadowSize?: string
    shadowColor?: string
    shadowDirection?: string
    cornerRadius?: string
  } | null

  // Cursor properties
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean
  shadowBlur: number
  shadowColor: string
  rippleColor: string
  rippleSize: number

  // Audio properties
  volume: number
  isVideoEnabled: boolean
  isSystemAudioEnabled: boolean
  isMicAudioEnabled: boolean
  systemVolume?: number
  micVolume?: number

  // Background properties
  selectedBackground: string | null
  backgroundGroups: BackgroundMediaGroup[]
  selectedZoom: ZoomElement | null
  canGenerateZooms: boolean
  hasAutomaticZooms: boolean
  selectedCompositionLayer: CaptionCompositionLayer | null
  composition: ProjectComposition
  editorData?: ProjectEditorData | null
  projectId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:selectedCursor', value: CursorType): void
  (e: 'update:cursorSize', value: number): void
  (e: 'update:cursorColor', value: string): void
  (e: 'update:enableShadow', value: boolean): void
  (e: 'update:enableRipple', value: boolean): void
  (e: 'update:shadowBlur', value: number): void
  (e: 'update:shadowColor', value: string): void
  (e: 'update:rippleColor', value: string): void
  (e: 'update:rippleSize', value: number): void
  (e: 'update:volume', value: number): void
  (e: 'update:isSystemAudioEnabled', value: boolean): void
  (e: 'update:isMicAudioEnabled', value: boolean): void
  (e: 'update:systemVolume', value: number): void
  (e: 'update:micVolume', value: number): void
  (e: 'update:selectedBackground', value: string): void
  (e: 'import:background', value: BackgroundMedia): void
  (e: 'update:zoom', value: ZoomElement): void
  (e: 'delete:zoom'): void
  (e: 'generate:zooms'): void
  (e: 'update:caption', value: CaptionCompositionLayer): void
  (e: 'update:clip-rate', rate: number): void
  (e: 'update:clip-enabled', enabled: boolean): void
  (e: 'update:clip-corner-radius', radius: string): void
  (e: 'update:clip-shadow', shadow: { size: string; color?: string; direction?: string }): void
  (e: 'unlink-clip'): void
  (e: 'delete-clip'): void
  (e: 'split-clip'): void
}>()
</script>

<template>
  <div class="properties-island">
    <div class="panel-header">
      <h3 class="panel-title">Properties</h3>
      <span class="panel-subtitle">{{ activeTab.toUpperCase() }} OPTIONS</span>
    </div>

    <div class="panel-content">
      <CanvasPanel 
        v-if="activeTab === 'canvas'"
        :selected-background="selectedBackground"
        :background-groups="backgroundGroups"
        :project-id="projectId"
        @update:selectedBackground="emit('update:selectedBackground', $event)"
        @import:background="emit('import:background', $event)"
      />

      <ClipPropertiesPanel 
        v-else-if="activeTab === 'clip'"
        :selected-clip="selectedClip || null"
        @update:playback-rate="emit('update:clip-rate', $event)"
        @update:enabled="emit('update:clip-enabled', $event)"
        @update:corner-radius="emit('update:clip-corner-radius', $event)"
        @update:shadow="emit('update:clip-shadow', $event)"
        @unlink="emit('unlink-clip')"
        @delete="emit('delete-clip')"
        @split="emit('split-clip')"
      />

      <CursorPanel 
        v-else-if="activeTab === 'cursor'"
        :selectedCursor="selectedCursor"
        :cursorSize="cursorSize"
        :cursorColor="cursorColor"
        :enableShadow="enableShadow"
        :enableRipple="enableRipple"
        :shadowBlur="shadowBlur"
        :shadowColor="shadowColor"
        :rippleColor="rippleColor"
        :rippleSize="rippleSize"
        @update:selectedCursor="emit('update:selectedCursor', $event)"
        @update:cursorSize="emit('update:cursorSize', $event)"
        @update:cursorColor="emit('update:cursorColor', $event)"
        @update:enableShadow="emit('update:enableShadow', $event)"
        @update:enableRipple="emit('update:enableRipple', $event)"
        @update:shadowBlur="emit('update:shadowBlur', $event)"
        @update:shadowColor="emit('update:shadowColor', $event)"
        @update:rippleColor="emit('update:rippleColor', $event)"
        @update:rippleSize="emit('update:rippleSize', $event)"
      />

      <TrimPanel 
        v-else-if="activeTab === 'trim'"
      />

      <AudioPanel 
        v-else-if="activeTab === 'audio'"
        :volume="volume"
        :isSystemAudioEnabled="isSystemAudioEnabled"
        :isMicAudioEnabled="isMicAudioEnabled"
        :systemVolume="systemVolume"
        :micVolume="micVolume"
        @update:volume="emit('update:volume', $event)"
        @update:isSystemAudioEnabled="emit('update:isSystemAudioEnabled', $event)"
        @update:isMicAudioEnabled="emit('update:isMicAudioEnabled', $event)"
        @update:systemVolume="emit('update:systemVolume', $event)"
        @update:micVolume="emit('update:micVolume', $event)"
      />

      <ZoomPanel
        v-else-if="activeTab === 'zoom'"
        :selected-zoom="selectedZoom"
        :can-generate="canGenerateZooms"
        :has-automatic-zooms="hasAutomaticZooms"
        @update="emit('update:zoom', $event)"
        @delete="emit('delete:zoom')"
        @generate="emit('generate:zooms')"
      />

      <CaptionPanel
        v-else-if="activeTab === 'caption'"
        :layer="selectedCompositionLayer"
        :composition="composition"
        :editor-data="editorData"
        @update="emit('update:caption', $event)"
      />

      <SettingsPanel
        v-else-if="activeTab === 'settings'"
      />
    </div>
  </div>
</template>

<style scoped>
.properties-island {
  width: 320px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
  box-sizing: border-box;
}

.panel-header {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 12px;
  margin-right: 20px;
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
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 20px;
  box-sizing: border-box;
}
</style>

<script setup lang="ts">
import { Camera, CameraOff, Mic, MicOff, Pause, Play, Square, Volume2, VolumeX } from '@lucide/vue'
import { onBeforeUnmount } from 'vue'
import Tooltip from '~/ui/tooltip/Tooltip.vue'
import type { RecordingPhase } from './recording-types'

defineProps<{ phase: RecordingPhase; secondsRemaining: number; recordingTime: string; cameraEnabled: boolean; microphoneEnabled: boolean; systemAudioEnabled: boolean; visibility: 'always' | 'auto-fade' }>()
const emit = defineEmits<{ stop: []; pause: []; camera: []; microphone: []; systemAudio: [] }>()
const drag = () => window.capture?.drag()
const stopDrag = () => {
  window.removeEventListener('mousemove', drag)
  window.removeEventListener('mouseup', stopDrag)
}
const startDrag = () => {
  window.capture?.dragStart()
  window.addEventListener('mousemove', drag)
  window.addEventListener('mouseup', stopDrag, { once: true })
}
const showTooltips = () => window.capture?.setRecorderTooltip(true)
const hideTooltips = () => window.capture?.setRecorderTooltip(false)
onBeforeUnmount(stopDrag)
</script>

<template>
  <aside class="recorder-bar" :class="{ 'auto-fade': visibility === 'auto-fade' }" aria-label="Recording controls" @mousedown="startDrag" @mouseenter="showTooltips" @mouseleave="hideTooltips">
    <p class="recording-time" :class="{ countdown: phase === 'countdown' }" aria-live="polite">{{ phase === 'countdown' ? 'Ready' : recordingTime }}</p>
    <Tooltip :content="phase === 'paused' ? 'Resume recording' : 'Pause recording'" position="left"><button class="control" :aria-label="phase === 'paused' ? 'Resume recording' : 'Pause recording'" :disabled="phase === 'countdown'" @mousedown.stop @click="emit('pause')"><Play v-if="phase === 'paused'" /><Pause v-else /></button></Tooltip>
    <Tooltip content="Stop recording" position="left"><button class="control stop" aria-label="Stop recording" @mousedown.stop @click="emit('stop')"><Square /></button></Tooltip>
    <Tooltip :content="microphoneEnabled ? 'Turn microphone off' : 'Turn microphone on'" position="left"><button class="control" :aria-label="microphoneEnabled ? 'Turn microphone off' : 'Turn microphone on'" :disabled="phase === 'countdown'" @mousedown.stop @click="emit('microphone')"><Mic v-if="microphoneEnabled" /><MicOff v-else /></button></Tooltip>
    <Tooltip :content="cameraEnabled ? 'Turn camera off' : 'Turn camera on'" position="left"><button class="control" :aria-label="cameraEnabled ? 'Turn camera off' : 'Turn camera on'" :disabled="phase === 'countdown'" @mousedown.stop @click="emit('camera')"><Camera v-if="cameraEnabled" /><CameraOff v-else /></button></Tooltip>
    <Tooltip :content="systemAudioEnabled ? 'Turn system audio off' : 'Turn system audio on'" position="left"><button class="control" :aria-label="systemAudioEnabled ? 'Turn system audio off' : 'Turn system audio on'" :disabled="phase === 'countdown'" @mousedown.stop @click="emit('systemAudio')"><Volume2 v-if="systemAudioEnabled" /><VolumeX v-else /></button></Tooltip>
  </aside>
</template>

<style scoped>
.recorder-bar { width: 56px; margin-left: auto; min-height: 296px; display: flex; flex-direction: column; align-items: center; justify-content: space-evenly; padding: 8px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-surface); -webkit-app-region: drag; transition: opacity .18s ease; }
.recorder-bar.auto-fade { opacity: .15; }.recorder-bar.auto-fade:hover, .recorder-bar.auto-fade:focus-within { opacity: 1; }
.control { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--text-primary); cursor: pointer; -webkit-app-region: no-drag; }.control:hover:not(:disabled) { background: var(--color-bg-element); }.control:disabled { opacity: .45; cursor: not-allowed; }.control.stop { color: var(--color-error); }.control :deep(svg) { width: 20px; height: 20px; }.recording-time { margin: 0; font-size: 11px; line-height: 24px; font-variant-numeric: tabular-nums; font-weight: 700; }.countdown { color: var(--text-muted); }
</style>

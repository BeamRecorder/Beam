<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CaptureCatalog, CaptureSource } from '../../capture-api'
import Button from '~/ui/button/Button.vue'
import Select from '~/ui/select/Select.vue'
import Badge from '~/ui/badge/Badge.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import WindowSelect from '~/ui/select/WindowSelect.vue'
import Skeleton from '~/ui/skeleton/Skeleton.vue'
import Switch from '~/ui/switch/Switch.vue'
import { Monitor, Layout, X, Minus, Settings, ChevronLeft, ArrowUpRight, Sun, Moon } from '@lucide/vue'
import { useThemeStore } from '~/stores/theme'

const emit = defineEmits(['start-recording', 'stop-recording'])

const themeStore = useThemeStore()

// Window state
const activeTab = ref<'screen' | 'window'>('screen')
const isRecording = ref(false)
const isBusy = ref(false)
const errorMessage = ref('')
const sources = ref<CaptureSource[]>([])

// View State (Main vs Settings)
const showSettings = ref(false)

// Preference settings
const recordHighQuality = ref(true)
const countdownSeconds = ref(3) // 0 for Off, 3, 5, 10

// Previews
const previews = ref<any[]>([])
const selectedSourceId = ref<string | null>(null)

// Sources lists (Camera / Microphone)
const cameraOptions = computed(() => [
  ...sources.value
    .filter((source) => source.kind === 'camera')
    .map((source) => ({ value: source.id, label: source.label })),
  { value: 'off', label: 'Camera Off' },
])
const selectedCameraId = ref('off')

const micOptions = computed(() => [
  ...sources.value
    .filter((source) => source.kind === 'microphone')
    .map((source) => ({ value: source.id, label: source.label })),
  { value: 'no-audio', label: 'No Audio' },
])
const selectedMicId = ref('no-audio')

// Timer / Duration simulation
const recordingTime = ref('00:00')
let timerInterval: ReturnType<typeof setInterval> | null = null
const secondsElapsed = ref(0)

const startTimer = () => {
  secondsElapsed.value = 0
  recordingTime.value = '00:00'
  timerInterval = setInterval(() => {
    secondsElapsed.value++
    const mins = Math.floor(secondsElapsed.value / 60).toString().padStart(2, '0')
    const secs = (secondsElapsed.value % 60).toString().padStart(2, '0')
    recordingTime.value = `${mins}:${secs}`
  }, 1000)
}

const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// Previews loading
const loadPreviews = async () => {
  try {
    const type = activeTab.value === 'screen' ? 'screen' : 'window'
    const results = await window.capture.getSources([type])
    previews.value = results
    
    // Auto-select first source if none or invalid is selected
    if (results.length > 0) {
      if (!selectedSourceId.value || !results.some(r => r.id === selectedSourceId.value)) {
        selectedSourceId.value = results[0].id
      }
    } else {
      selectedSourceId.value = null
    }
  } catch (err) {
    console.error('Failed to load window/screen previews:', err)
  }
}

const activeDropdowns = ref(0)

const updateWindowSize = () => {
  const isDropdownOpen = activeDropdowns.value > 0
  if (activeTab.value === 'window') {
    window.capture.setSize(320, isDropdownOpen ? 580 : 420)
  } else {
    window.capture.setSize(320, isDropdownOpen ? 520 : 360)
  }
}

const handleDropdownToggle = (isOpen: boolean) => {
  if (isOpen) {
    activeDropdowns.value++
  } else {
    activeDropdowns.value = Math.max(0, activeDropdowns.value - 1)
  }
  updateWindowSize()
}

// Watch tab change to reload previews and resize window
watch(activeTab, () => {
  previews.value = []
  updateWindowSize()
  void loadPreviews()
})

// Control functions
const toggleRecording = async () => {
  if (isBusy.value) return
  isBusy.value = true
  errorMessage.value = ''
  try {
    if (!isRecording.value) {
      // Find matching Rust catalog ID for the selected preview source
      let rustScreenId: string | undefined = undefined
      if (selectedSourceId.value) {
        if (activeTab.value === 'window') {
          // Electron window ID: "window:12345"
          const hwndDec = Number(selectedSourceId.value.replace('window:', ''))
          const hwndHex = hwndDec.toString(16).toLowerCase()
          const match = sources.value.find(s => s.kind === 'window' && s.id.toLowerCase().includes(hwndHex))
          rustScreenId = match ? match.id : undefined
        } else {
          // Electron screen ID: "screen:0:0"
          const screenIndexStr = selectedSourceId.value.split(':')[1] || '0'
          const screenIndex = parseInt(screenIndexStr, 10)
          const rustScreens = sources.value.filter(s => s.kind === 'display')
          rustScreenId = rustScreens[screenIndex]?.id ?? rustScreens[0]?.id ?? undefined
        }
      }

      const session = await window.capture.startRecording({
        screenKind: activeTab.value === 'window' ? 'window' : 'display',
        screenId: rustScreenId,
        microphoneId: selectedMicId.value === 'no-audio' ? null : selectedMicId.value,
        cameraId: selectedCameraId.value === 'off' ? null : selectedCameraId.value,
        systemAudio: true,
        cursor: true,
        targetFps: recordHighQuality.value ? 60 : 30,
      })
      isRecording.value = session.state === 'recording' || session.state === 'degraded'
      if (!isRecording.value) throw new Error(`État inattendu après démarrage : ${session.state}`)
      startTimer()
      emit('start-recording', session)
    } else {
      const session = await window.capture.stop()
      stopTimer()
      isRecording.value = false
      emit('stop-recording', session)
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    isBusy.value = false
  }
}

const discoverSources = async () => {
  isBusy.value = true
  errorMessage.value = ''
  try {
    const catalog = await window.capture.discover() as CaptureCatalog
    sources.value = Array.isArray(catalog.sources) ? catalog.sources : []
    const defaultCamera = sources.value.find((source) => source.kind === 'camera' && source.isDefault)
      ?? sources.value.find((source) => source.kind === 'camera')
    const defaultMic = sources.value.find((source) => source.kind === 'microphone' && source.isDefault)
      ?? sources.value.find((source) => source.kind === 'microphone')
    selectedCameraId.value = defaultCamera?.id ?? 'off'
    selectedMicId.value = defaultMic?.id ?? 'no-audio'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    isBusy.value = false
  }
}

onMounted(async () => {
  updateWindowSize()
  await discoverSources()
  await loadPreviews()
  // Periodically refresh window previews when settings is not open and not recording
  setInterval(() => {
    if (!showSettings.value && !isRecording.value && activeTab.value === 'window') {
      void loadPreviews()
    }
  }, 5000)
})

onBeforeUnmount(stopTimer)

const closeApp = () => {
  window.capture.close()
}

const minimizeApp = () => {
  window.capture.minimize()
}
</script>

<template>
  <div class="hud-wrapper" :class="[activeTab, { 'settings-open': showSettings }]">
    <!-- Header -->
    <header class="hud-header">
      <div class="logo-section">
        <template v-if="showSettings">
          <div style="-webkit-app-region: no-drag; display: inline-flex; align-items: center;">
            <Button variant="ghost" size="sm" class="back-btn" @click="showSettings = false">
              <template #icon><ChevronLeft class="btn-icon" /></template>
            </Button>
          </div>
          <span class="logo-text">Preferences</span>
        </template>
        <template v-else>
          <div class="logo-ring">
            <div class="logo-core"></div>
          </div>
          <span class="logo-text">DemoRecorder</span>
          <Badge v-if="isRecording" variant="error" class="rec-badge">REC</Badge>
        </template>
      </div>

      <div class="window-actions" @mousedown.stop>
        <Button variant="ghost" size="sm" @click="minimizeApp">
          <template #icon><Minus class="btn-icon" /></template>
        </Button>
        <Button 
          v-if="!showSettings"
          variant="ghost" 
          size="sm" 
          @click="showSettings = true"
        >
          <template #icon><Settings class="btn-icon" /></template>
        </Button>
        <Button variant="ghost" size="sm" class="close-btn-override" @click="closeApp">
          <template #icon><X class="btn-icon" /></template>
        </Button>
      </div>
    </header>

    <!-- Settings Overlay View -->
    <div v-if="showSettings" class="settings-body animate-fade-in">
      <div class="settings-list">
        <div class="settings-item">
          <div class="item-label-group">
            <span class="item-title">Shortcuts</span>
            <span class="item-desc">Alt + Shift + R to record</span>
          </div>
        </div>
        <div class="settings-item">
          <div class="item-label-group">
            <span class="item-title">High Quality</span>
            <span class="item-desc">Record in 60fps HD</span>
          </div>
          <div style="-webkit-app-region: no-drag;">
            <Switch v-model="recordHighQuality" />
          </div>
        </div>
        <div class="settings-item">
          <div class="item-label-group">
            <span class="item-title">Countdown</span>
            <span class="item-desc">Select delay before start</span>
          </div>
          <div style="width: 80px; -webkit-app-region: no-drag;">
            <Select 
              v-model="countdownSeconds"
              :options="[
                { value: 0, label: 'Off' },
                { value: 3, label: '3s' },
                { value: 5, label: '5s' },
                { value: 10, label: '10s' }
              ]"
              direction="up"
            />
          </div>
        </div>
        <div class="settings-item">
          <div class="item-label-group">
            <span class="item-title">Theme</span>
            <span class="item-desc">Choose color mode</span>
          </div>
          <ButtonGroup style="width: auto; max-width: 140px; -webkit-app-region: no-drag;">
            <Button 
              :class="{ active: themeStore.theme === 'light' }"
              variant="tab"
              size="sm"
              @click="themeStore.theme = 'light'"
            >
              <template #icon><Sun class="btn-icon" /></template>
            </Button>
            <Button 
              :class="{ active: themeStore.theme === 'dark' }"
              variant="tab"
              size="sm"
              @click="themeStore.theme = 'dark'"
            >
              <template #icon><Moon class="btn-icon" /></template>
            </Button>
            <Button 
              :class="{ active: themeStore.theme === 'system' }"
              variant="tab"
              size="sm"
              @click="themeStore.theme = 'system'"
            >
              <template #icon><Monitor class="btn-icon" /></template>
            </Button>
          </ButtonGroup>
        </div>
      </div>
      <div class="settings-footer">
        <Button variant="primary" size="md" class="return-btn" @click="showSettings = false">
          Return to HUD
        </Button>
      </div>
    </div>

    <!-- Main HUD Form -->
    <div v-else class="hud-body">
      <!-- Tabs (Screen / Window) -->
      <ButtonGroup class="mode-tabs">
        <Button 
          :class="{ active: activeTab === 'screen' }"
          variant="tab"
          @click="activeTab = 'screen'"
        >
          <template #icon><Monitor class="btn-icon" /></template>
          Screen
        </Button>
        <Button 
          :class="{ active: activeTab === 'window' }"
          variant="tab"
          @click="activeTab = 'window'"
        >
          <template #icon><Layout class="btn-icon" /></template>
          Window
        </Button>
      </ButtonGroup>

      <div class="form-inputs-area">
        <Transition name="fade-slide" mode="out-in">
          <div :key="activeTab" class="tab-content-container">
            <!-- Window Selection (Only for Window mode) -->
            <template v-if="activeTab === 'window'">
              <div v-if="isBusy && previews.length === 0" class="selector-field">
                <span class="field-label-text">Select Window</span>
                <Skeleton variant="linear" height="2.75rem" radius="var(--radius-md)" />
              </div>
              <div v-else class="selector-field">
                <span class="field-label-text">Select Window</span>
                <WindowSelect 
                  v-model="selectedSourceId"
                  :options="previews"
                  :disabled="isRecording || isBusy"
                  @toggle="handleDropdownToggle"
                />
              </div>
            </template>

            <!-- Selectors: Camera & Mic stacked and centered -->
            <div class="selectors-stack">
              <div class="selector-field">
                <span class="field-label-text">Camera</span>
                <div v-if="isBusy && sources.length === 0">
                  <Skeleton variant="radial" height="2.75rem" radius="var(--radius-md)" />
                </div>
                <Select 
                  v-else
                  v-model="selectedCameraId" 
                  :options="cameraOptions" 
                  :disabled="isRecording || isBusy"
                  @toggle="handleDropdownToggle"
                />
              </div>

              <div class="selector-field">
                <span class="field-label-text">Microphone</span>
                <div v-if="isBusy && sources.length === 0">
                  <Skeleton variant="linear" height="2.75rem" radius="var(--radius-md)" />
                </div>
                <Select 
                  v-else
                  v-model="selectedMicId" 
                  :options="micOptions" 
                  :disabled="isRecording || isBusy"
                  @toggle="handleDropdownToggle"
                />
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <p v-if="errorMessage" class="capture-error" role="alert">{{ errorMessage }}</p>

      <!-- Action Button (Centered Capsule) -->
      <div class="action-section">
        <Button 
          :variant="isRecording ? 'outline' : 'primary'"
          size="md"
          :block="true"
          class="record-btn-override"
          :class="{ 'recording': isRecording }"
          :disabled="isBusy"
          @click="toggleRecording"
        >
          <template #icon>
            <span class="pulse-dot" v-if="isRecording"></span>
          </template>
          {{ isBusy ? 'Please wait…' : isRecording ? `Stop (${recordingTime})` : 'Start Recording' }}
        </Button>
      </div>

      <!-- Web Link (Subtle style) -->
      <div class="web-link-container">
        <a href="#" class="web-link-text">
          <span>Open DemoRecorder on Web</span>
          <ArrowUpRight class="web-link-icon" />
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud-wrapper {
  width: 100%;
  background: var(--color-bg-card); /* Solid opaque background to avoid transparency rendering issues */
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: visible; /* Let popovers overflow the card! */
  transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.hud-wrapper.screen, .hud-wrapper.settings-open {
  height: 360px;
}

.hud-wrapper.window {
  height: 420px;
}

.hud-header {
  height: 60px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn {
  -webkit-app-region: no-drag;
  margin-right: 4px;
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

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-dark-blue);
  letter-spacing: -0.5px;
}

.rec-badge {
  font-size: 0.6rem;
  padding: 1px 5px;
}

.window-actions {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

/* Override default button layout to ensure centering of the icons */
.window-actions :deep(.btn) {
  padding: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.btn-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.close-btn-override:hover {
  color: var(--color-error) !important;
}

.hud-body {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: visible; /* Prevent clipping of dropdown popovers */
}

.settings-body {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

/* Tabs */
.tabs-container {
  background: var(--color-light-blue-hover);
  border-radius: var(--radius-md);
  padding: 4px;
  display: flex;
  gap: 4px;
  border: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background: white;
  color: var(--color-orange);
  box-shadow: var(--shadow-sm);
}

.tab-icon {
  width: 14px;
  height: 14px;
}

/* Previews Grid */
.form-inputs-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.tab-content-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* Tab transition animation */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.previews-container {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-light-blue);
}

.previews-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: var(--text-muted);
}

.previews-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px;
}

.preview-card {
  border: 2px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: white;
  transition: all 0.15s ease-in-out;
  display: flex;
  flex-direction: column;
}

.preview-card:hover {
  border-color: var(--color-dark-blue-lighter);
}

.preview-card.is-selected {
  border-color: var(--color-orange);
  box-shadow: 0 0 0 2px var(--color-orange-light);
}

.thumbnail-wrapper {
  position: relative;
  aspect-ratio: 16/10;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-icon {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 4px;
  padding: 2px;
  box-shadow: var(--shadow-sm);
}

.preview-name {
  font-size: 10px;
  padding: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
  font-weight: 600;
  background: #ffffff;
  border-top: 1px solid var(--color-border);
}

/* Selectors Stack */
.selectors-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.selector-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.field-label-text {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Record Button (Full-width Style) */
.action-section {
  display: flex;
  width: 100%;
  margin-top: auto;
}

.record-btn-override {
  width: 100% !important;
  border-radius: var(--radius-md) !important;
  padding: 0.75rem 1.5rem !important;
  font-size: 0.95rem !important;
  box-shadow: var(--shadow-md);
}

.capture-error {
  margin: 0;
  color: var(--color-error);
  font-size: 11px;
  line-height: 1.3;
  text-align: center;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--color-error);
  border-radius: 50%;
  animation: pulse-animation 1.5s infinite;
  display: inline-block;
  margin-right: 6px;
}

@keyframes pulse-animation {
  0% { transform: scale(0.9); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.5; }
  100% { transform: scale(0.9); opacity: 1; }
}

/* Web Link */
.web-link-container {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.web-link-text {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: color 0.15s ease;
}

.web-link-text:hover {
  color: var(--color-orange);
}

.web-link-icon {
  width: 12px;
  height: 12px;
}

/* Settings View Styling */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.item-label-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.item-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.custom-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-orange);
  cursor: pointer;
}

.settings-footer {
  display: flex;
  justify-content: center;
}

.return-btn {
  width: 100%;
  border-radius: var(--radius-md);
}

/* Animations */
.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

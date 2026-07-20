<script setup lang="ts">
import { ref } from 'vue'
import Button from '~/ui/button/Button.vue'
import Popover from '~/ui/popover/Popover.vue'
import Select from '~/ui/select/Select.vue'
import Dialog from '~/ui/dialog/Dialog.vue'
import ToastProvider from '~/ui/toast/ToastProvider.vue'
import Input from '~/ui/input/Input.vue'
import Switch from '~/ui/switch/Switch.vue'
import Slider from '~/ui/slider/Slider.vue'
import Badge from '~/ui/badge/Badge.vue'
import { useToastStore } from '~/ui/toast/toastStore'
import { Video, Settings, Volume2, Shield } from '@lucide/vue'

const toastStore = useToastStore()

// Video state
const selectedVideoFormat = ref<string>('mp4')
const formatOptions = [
  { value: 'mp4', label: 'MP4 (H.264 / AAC)' },
  { value: 'webm', label: 'WebM (VP9 / Opus)' },
  { value: 'gif', label: 'GIF (Animated)' }
]

// Recording state
const isRecording = ref(false)
const recordingName = ref('my-screen-recording')
const captureMic = ref(true)
const captureSystemSound = ref(false)
const audioVolume = ref(80)

// Settings Modal state
const isSettingsOpen = ref(false)

const toggleRecording = () => {
  isRecording.value = !isRecording.value
  if (isRecording.value) {
    toastStore.success(`Recording started: "${recordingName.value}.${selectedVideoFormat.value}"`)
  } else {
    toastStore.info('Recording saved successfully to drafts.')
  }
}
</script>

<template>
  <div class="app-wrapper">
    <!-- Header -->
    <header class="app-header">
      <div class="header-container">
        <div class="logo">
          <Video class="logo-icon" />
          <h1>DemoRecorder</h1>
          <Badge v-if="isRecording" variant="error" class="pulse-badge">REC</Badge>
          <Badge v-else variant="outline">Idle</Badge>
        </div>
        <div class="header-actions">
          <Button variant="ghost" tooltip="Settings Options" tooltipPosition="bottom" @click="isSettingsOpen = true">
            <template #icon><Settings class="header-icon" /></template>
          </Button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container">
      <div class="showcase-layout">
        <!-- Top Hero Control Card -->
        <section class="card hero-card">
          <div class="hero-content">
            <div class="hero-header-row">
              <h2 class="hero-title">Start Capturing Your Screen</h2>
              <Badge variant="secondary">V1.0.0</Badge>
            </div>
            <p class="hero-subtitle">Premium recording controls. Configure title, format, audio levels, and toggles before recording.</p>
            
            <div class="setup-grid">
              <div class="setup-field">
                <label class="field-label">Recording Name</label>
                <Input v-model="recordingName" placeholder="Enter file name" :disabled="isRecording">
                  <template #prefix><Video class="field-icon" /></template>
                  <template #suffix><span class="field-suffix">.{{ selectedVideoFormat }}</span></template>
                </Input>
              </div>

              <div class="setup-field">
                <label class="field-label">Output Format</label>
                <Select 
                  v-model="selectedVideoFormat" 
                  :options="formatOptions" 
                  :disabled="isRecording"
                />
              </div>
            </div>

            <div class="toggles-row">
              <Switch v-model="captureMic" label="Capture Microphone Audio" :disabled="isRecording" />
              <Switch v-model="captureSystemSound" label="Capture System Audio" :disabled="isRecording" />
            </div>

            <div v-if="captureMic" class="volume-slider-row">
              <span class="volume-label">
                <Volume2 class="volume-icon" />
                Mic Input Level
              </span>
              <Slider v-model="audioVolume" :min="0" :max="100" :disabled="isRecording" />
            </div>

            <div class="controls-row">
              <Button 
                :variant="isRecording ? 'secondary' : 'primary'"
                size="lg"
                :tooltip="isRecording ? 'Stop Screen Capture' : 'Start Screen Capture'"
                @click="toggleRecording"
              >
                {{ isRecording ? 'Stop Recording' : 'Start Recording' }}
              </Button>
            </div>
          </div>
        </section>

        <!-- UI Showcase Grid -->
        <section class="grid">
          <!-- Button Variants Card -->
          <div class="card">
            <h3 class="card-title">Buttons & Badges</h3>
            <p class="section-description">A set of premium button variants accompanied by state badges.</p>
            <div class="buttons-grid">
              <Button variant="primary" tooltip="Primary action">Primary</Button>
              <Button variant="secondary" tooltip="Secondary action">Secondary</Button>
              <Button variant="outline" tooltip="Outline action">Outline</Button>
              <Button variant="ghost" tooltip="Ghost style">Ghost</Button>
              <Button variant="link" tooltip="Link style">Link</Button>
            </div>
            <div class="badges-row">
              <Badge variant="primary">Active</Badge>
              <Badge variant="secondary">Draft</Badge>
              <Badge variant="success">HD 1080p</Badge>
              <Badge variant="error">Alert</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </div>

          <!-- Toasts Trigger Card -->
          <div class="card">
            <h3 class="card-title">Toast Notifications</h3>
            <p class="section-description">Trigger dynamic floating alerts via global Pinia store.</p>
            <div class="buttons-grid">
              <Button variant="outline" @click="toastStore.success('Successfully uploaded to the cloud!')">
                Success Toast
              </Button>
              <Button variant="outline" @click="toastStore.error('Failed to capture audio source.')">
                Error Toast
              </Button>
              <Button variant="outline" @click="toastStore.info('Updates are available.')">
                Info Toast
              </Button>
            </div>
          </div>

          <!-- Popover Card -->
          <div class="card">
            <h3 class="card-title">Popovers & Dialogs</h3>
            <p class="section-description">Click-triggered floating overlays and full-screen modals.</p>
            <div class="popover-row">
              <Popover align="center">
                <template #trigger>
                  <Button variant="outline">
                    Toggle Popover Menu
                  </Button>
                </template>
                <template #default="{ close }">
                  <div class="popover-inner">
                    <h4 class="popover-heading">Quick Actions</h4>
                    <p class="popover-text">Modify current configuration layout.</p>
                    <div class="popover-buttons">
                      <Button size="sm" variant="primary" @click="close(); toastStore.success('Action complete!')">Apply</Button>
                      <Button size="sm" variant="ghost" @click="close">Cancel</Button>
                    </div>
                  </div>
                </template>
              </Popover>

              <Button variant="outline" @click="isSettingsOpen = true">
                Open Settings Modal
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>

    <!-- Settings Dialog -->
    <Dialog :isOpen="isSettingsOpen" title="Recorder Settings" size="md" @close="isSettingsOpen = false">
      <div class="settings-dialog-content">
        <p class="settings-info">Configure your global preferences for screen recording, audio inputs, and privacy.</p>
        
        <div class="settings-field">
          <label class="dialog-field-label">Output Directory</label>
          <Input modelValue="C:/Users/binos/Videos/DemoRecorder" disabled>
            <template #prefix><Shield class="field-icon" /></template>
          </Input>
        </div>

        <div class="settings-field">
          <label class="dialog-field-label">Audio Input Source</label>
          <Select 
            modelValue="mic" 
            :options="[{ value: 'mic', label: 'Default Microphone (Realtek)' }]"
          />
        </div>

        <div class="settings-field toggle-field">
          <Switch v-model="captureMic" label="Enable microphone capture by default" />
        </div>
      </div>
      
      <template #footer="{ close }">
        <Button variant="ghost" @click="close">Cancel</Button>
        <Button variant="primary" @click="close(); toastStore.success('Settings saved successfully!')">Save changes</Button>
      </template>
    </Dialog>

    <!-- Global Toast Provider -->
    <ToastProvider />
  </div>
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background-color: white;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 2rem;
  height: 2rem;
  color: var(--color-orange);
}

.logo h1 {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-dark-blue);
  letter-spacing: -0.5px;
}

.header-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--text-secondary);
}

.showcase-layout {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.hero-card {
  background: linear-gradient(135deg, white 0%, var(--color-light-blue) 100%);
  border-left: 4px solid var(--color-orange);
}

.hero-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 0.5rem;
}

.hero-title {
  font-size: 2rem;
  color: var(--color-dark-blue);
}

.hero-subtitle {
  color: var(--text-secondary);
  margin-bottom: 1.75rem;
}

.setup-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
}

@media (max-width: 768px) {
  .setup-grid {
    grid-template-columns: 1fr;
  }
}

.setup-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label, .dialog-field-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-dark-blue-light);
}

.field-icon {
  width: 1.2rem;
  height: 1.2rem;
  color: var(--text-muted);
}

.field-suffix {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-muted);
}

.toggles-row {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.volume-slider-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
  margin-bottom: 1.75rem;
  background-color: white;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.volume-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-dark-blue-light);
}

.volume-icon {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--color-orange);
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.section-description {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-bottom: 1.25rem;
}

.buttons-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.popover-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.popover-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.popover-heading {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-dark-blue);
}

.popover-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.popover-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

/* Settings Dialog style */
.settings-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.settings-info {
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toggle-field {
  margin-top: 6px;
}

/* REC Animation */
@keyframes pulse {
  0% { opacity: 0.4; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0.4; transform: scale(0.95); }
}

.pulse-badge {
  animation: pulse 1.5s infinite ease-in-out;
}
</style>

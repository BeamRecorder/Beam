<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Select from '~/ui/select/Select.vue'
import Popover from '~/ui/popover/Popover.vue'
import HUD from '~/components/hud/HUD.vue'
import { Sun, Moon, Monitor, Code, Video, Copy, Check } from '@lucide/vue'
import { useThemeStore } from '~/stores/theme'
import { useLocaleStore } from '~/stores/locale'
import { useTranslate } from '~/i18n/useTranslate'
import { capture } from '~/api/capture'
import UpdateControls from '~/components/updates/UpdateControls.vue'

const { t } = useTranslate('SettingsPanel')
const themeStore = useThemeStore()
const localeStore = useLocaleStore()

const emit = defineEmits<{
  (e: 'back-to-hud'): void
  (e: 'open-recorder'): void
  (e: 'start-recording', config: any): void
}>()

const isDevModeEnabled = ref(localStorage.getItem('dev_mode_enabled') === 'true')
watch(isDevModeEnabled, (value) => {
  localStorage.setItem('dev_mode_enabled', String(value))
})

const handleStartRecordingFromPopover = (config: any, closePopover: () => void) => {
  closePopover()
  emit('start-recording', config)
}

const isCopiedSysInfo = ref(false)
let copyTimeout: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (copyTimeout) clearTimeout(copyTimeout)
})

const copySystemInfo = async () => {
  let appVersion = 'Inconnue'
  try {
    const updateState = await capture.getUpdateState()
    if (updateState?.currentVersion) {
      appVersion = updateState.currentVersion
    }
  } catch {
    // Fail-safe if capture API is not available
  }

  const infoLines = [
    `=== Beam System Info ===`,
    `App Version: ${appVersion}`,
    `Platform: ${navigator.platform || 'Unknown'}`,
    `User Agent: ${navigator.userAgent}`,
    `Language: ${navigator.language}`,
    `Screen Resolution: ${window.screen.width}x${window.screen.height} (DPR: ${window.devicePixelRatio})`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `Date: ${new Date().toISOString()}`,
    `================================`,
  ].join('\n')

  try {
    await navigator.clipboard.writeText(infoLines)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = infoLines
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  isCopiedSysInfo.value = true
  if (copyTimeout) clearTimeout(copyTimeout)
  copyTimeout = setTimeout(() => {
    isCopiedSysInfo.value = false
  }, 2000)
}

const localeOptions = [
  { value: 'en', label: 'EN - English - Anglais' },
  { value: 'fr', label: 'FR - French - Français' },
]
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <span class="prop-label">{{ t('themeMode') }}</span>
      <ButtonGroup class="theme-button-group">
        <Button 
          :class="{ active: themeStore.theme === 'light' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'light'"
        >
          <template #icon><Sun class="btn-icon" /></template>
          {{ t('light') }}
        </Button>
        <Button 
          :class="{ active: themeStore.theme === 'dark' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'dark'"
        >
          <template #icon><Moon class="btn-icon" /></template>
          {{ t('dark') }}
        </Button>
        <Button 
          :class="{ active: themeStore.theme === 'system' }"
          variant="tab"
          size="sm"
          @click="themeStore.theme = 'system'"
        >
          <template #icon><Monitor class="btn-icon" /></template>
          {{ t('system') }}
        </Button>
      </ButtonGroup>
    </div>

    <div class="prop-item">
      <span class="prop-label">{{ t('language') }}</span>
      <Select
        :model-value="localeStore.locale"
        :options="localeOptions"
        direction="up"
        @update:model-value="localeStore.setLocale($event)"
      />
    </div>

    <div class="prop-item">
      <UpdateControls />
    </div>

    <!-- Dev Mode Toggle & Framed Options -->
    <div class="prop-item dev-mode-section">
      <div class="dev-toggle-row">
        <div class="dev-toggle-info">
          <span class="prop-label">{{ t('devMode') }}</span>
          <span class="prop-desc">{{ t('devModeDesc') }}</span>
        </div>
        <button
          type="button"
          class="dev-switch"
          :class="{ active: isDevModeEnabled }"
          :aria-pressed="isDevModeEnabled"
          @click="isDevModeEnabled = !isDevModeEnabled"
        >
          <span class="switch-thumb" />
        </button>
      </div>

      <Transition name="dev-frame-fade">
        <div v-if="isDevModeEnabled" class="dev-frame">
          <div class="dev-frame-header">
            <Code class="dev-header-icon" />
            <span class="dev-frame-title">{{ t('devOptionsTitle') }}</span>
          </div>

          <!-- Video Recorder Card -->
          <div class="dev-option-card">
            <div class="dev-option-info">
              <span class="dev-option-label">{{ t('recorderTool') }}</span>
              <span class="dev-option-desc">{{ t('recorderDesc') }}</span>
            </div>
            <Popover align="right" direction="up" :match-trigger-width="false" flush>
              <template #trigger>
                <Button
                  variant="secondary"
                  size="sm"
                  class="dev-action-btn"
                >
                  <template #icon><Video class="btn-icon" /></template>
                  {{ t('launchRecorder') }}
                </Button>
              </template>
              <template #default="{ close }">
                <div class="hud-popover-content" @click.stop>
                  <HUD
                    embedded
                    @start-recording="(config: any) => handleStartRecordingFromPopover(config, close)"
                  />
                </div>
              </template>
            </Popover>
          </div>

          <!-- System Info Copy Card -->
          <div class="dev-option-card">
            <div class="dev-option-info">
              <span class="dev-option-label">{{ t('sysInfoTool') }}</span>
              <span class="dev-option-desc">{{ t('sysInfoDesc') }}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              class="dev-action-btn"
              @click="copySystemInfo"
            >
              <template #icon>
                <Check v-if="isCopiedSysInfo" class="btn-icon text-success" />
                <Copy v-else class="btn-icon" />
              </template>
              {{ isCopiedSysInfo ? t('copied') : t('copySysInfo') }}
            </Button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.prop-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.theme-button-group {
  width: 100%;
}

.theme-button-group :deep(.btn) {
  flex: 1;
  justify-content: center;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

/* Dev Mode Styles */
.dev-mode-section {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
  margin-top: 4px;
}

.dev-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dev-switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-bg-surface-hover);
  border: 1px solid var(--color-border-strong);
  cursor: pointer;
  padding: 2px;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
}

.dev-switch.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.switch-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dev-switch.active .switch-thumb {
  transform: translateX(16px);
}

.dev-frame {
  margin-top: 12px;
  padding: 12px;
  background: var(--color-bg-surface);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dev-frame-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dev-header-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}

.dev-frame-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.dev-option-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.dev-option-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dev-option-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.dev-option-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.dev-action-btn {
  width: 100%;
  justify-content: center;
}

.text-success {
  color: var(--color-success) !important;
}

.hud-popover-content {
  width: 336px;
  max-height: 540px;
  overflow-y: auto;
  padding: 4px;
}

.hud-popover-content :deep(.hud-wrapper) {
  width: 100% !important;
  margin: 0 !important;
}

.dev-frame-fade-enter-active,
.dev-frame-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dev-frame-fade-enter-from,
.dev-frame-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

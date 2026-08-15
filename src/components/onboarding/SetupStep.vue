<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Mic,
  Monitor,
  Moon,
  MousePointer,
  RefreshCw,
  ShieldCheck,
  Sun,
} from '@lucide/vue';
import { useThemeStore } from '~/stores/theme';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import Badge from '~/ui/badge/Badge.vue';
import type { InputAccessStatus } from '~/api/types/capture-api';

const { t } = useTranslate('Onboarding');
const themeStore = useThemeStore();

const inputStatus = ref<InputAccessStatus>({
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
});
const isRequestingAccess = ref(false);

const themes = [
  { id: 'dark', labelKey: 'themeDark', icon: Moon },
  { id: 'light', labelKey: 'themeLight', icon: Sun },
  { id: 'system', labelKey: 'themeSystem', icon: Monitor },
] as const;

const checkPermissions = async () => {
  try {
    const status = await capture.inputAccessStatus();
    inputStatus.value = status;
  } catch {
    // Fallback
  }
};

const handleRequestAccess = async () => {
  isRequestingAccess.value = true;
  try {
    const result = await capture.requestInputAccess();
    inputStatus.value = result;
  } catch {
    // Error
  } finally {
    isRequestingAccess.value = false;
  }
};

onMounted(() => {
  // Read-only check, does NOT prompt the user
  void checkPermissions();
});
</script>

<template>
  <div class="setup-step">
    <!-- Header -->
    <div
      v-motion
      :initial="{ opacity: 0, y: -10 }"
      :enter="{ opacity: 1, y: 0, transition: { duration: 300 } }"
      class="setup-header"
    >
      <h2 class="setup-title">{{ t('setupTitle') }}</h2>
      <p class="setup-subtitle">{{ t('setupSubtitle') }}</p>
    </div>

    <div class="setup-cards-stack">
      <!-- 1. Theme Selection Box -->
      <div
        v-motion
        :initial="{ opacity: 0, y: 12 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 100, duration: 350 } }"
        class="frosted-setup-box"
      >
        <div class="box-main-row">
          <div class="box-info">
            <span class="box-title">{{ t('themeTitle') }}</span>
            <span class="box-desc">{{ t('themeDesc') }}</span>
          </div>

          <div class="theme-chips-group">
            <button
              v-for="opt in themes"
              :key="opt.id"
              type="button"
              class="theme-chip"
              :class="{ selected: themeStore.theme === opt.id }"
              @click="themeStore.theme = opt.id"
            >
              <component :is="opt.icon" class="chip-icon" />
              <span>{{ t(opt.labelKey) }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Hardware Devices Box (Microphone & Camera) -->
      <div
        v-motion
        :initial="{ opacity: 0, y: 12 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 180, duration: 350 } }"
        class="frosted-setup-box"
      >
        <div class="box-main-row">
          <div class="box-info">
            <div class="title-with-icons">
              <span class="box-title">{{ t('devicesTitle') }}</span>
              <div class="device-mini-icons">
                <Mic class="dev-icon" />
                <Camera class="dev-icon" />
              </div>
            </div>
            <span class="box-desc">{{ t('devicesDesc') }}</span>
          </div>

          <div class="box-action-area">
            <Badge variant="outline" class="status-badge-ok">
              <CheckCircle class="badge-mini-icon" />
              {{ t('upToDate') }}
            </Badge>
          </div>
        </div>
      </div>

      <!-- 3. Interaction Permissions Box -->
      <div
        v-motion
        :initial="{ opacity: 0, y: 12 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 260, duration: 350 } }"
        class="frosted-setup-box"
      >
        <div class="box-main-row">
          <div class="box-info">
            <div class="title-with-icons">
              <span class="box-title">{{ t('linuxInputTitle') }}</span>
              <MousePointer class="dev-icon" />
            </div>
            <span class="box-desc">{{ t('linuxInputDesc') }}</span>
          </div>

          <div class="box-action-area">
            <Badge v-if="inputStatus.state === 'available'" variant="outline" class="status-badge-ok">
              <CheckCircle class="badge-mini-icon" />
              {{ t('linuxInputAuthorized') }}
            </Badge>
            <div v-else class="not-auth-group">
              <Badge variant="outline" class="status-badge-warn">
                <AlertCircle class="badge-mini-icon" />
                {{ inputStatus.state }}
              </Badge>
              <Button
                v-if="inputStatus.canRequest"
                variant="primary"
                size="xs"
                :disabled="isRequestingAccess"
                @click="handleRequestAccess"
              >
                <template #icon>
                  <RefreshCw v-if="isRequestingAccess" class="spin-icon button-icon" />
                  <ShieldCheck v-else class="button-icon" />
                </template>
                {{ isRequestingAccess ? t('linuxInputChecking') : t('linuxInputAuthorize') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: 10px 24px;
  box-sizing: border-box;
  gap: 14px;
}

.setup-header {
  text-align: center;
}

.setup-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.setup-subtitle {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.setup-cards-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 580px;
}

.frosted-setup-box {
  background: color-mix(in srgb, var(--color-bg-surface) 60%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.frosted-setup-box:hover {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-bg-surface) 72%, transparent);
}

.box-main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.box-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title-with-icons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.box-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.device-mini-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-primary);
}

.dev-icon {
  width: 13px;
  height: 13px;
  color: var(--color-primary);
}

.box-desc {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.35;
}

.theme-chips-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.theme-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-bg-element) 80%, transparent);
  border: 1px solid var(--color-border);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.theme-chip:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
  border-color: var(--color-border-strong);
}

.theme-chip.selected {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 700;
}

.chip-icon {
  width: 13px;
  height: 13px;
}

.box-action-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.not-auth-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge-ok {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 98px;
  gap: 5px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-success, #10b981);
  background: color-mix(in srgb, var(--color-success, #10b981) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-success, #10b981) 30%, transparent);
  border-radius: 9999px;
  box-sizing: border-box;
}

.status-badge-warn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 98px;
  gap: 5px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-warning, #f59e0b);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent);
  border-radius: 9999px;
  box-sizing: border-box;
}

.badge-mini-icon {
  width: 12px;
  height: 12px;
}

.button-icon {
  width: 13px;
  height: 13px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

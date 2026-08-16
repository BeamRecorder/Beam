<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Minus, X } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import WelcomeStep from './components/onboarding/WelcomeStep.vue';
import TourStep from './components/onboarding/TourStep.vue';
import SetupStep from './components/onboarding/SetupStep.vue';
import CommunityStep from './components/onboarding/CommunityStep.vue';
import OnboardingBackdrop from './components/onboarding/OnboardingBackdrop.vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const { t } = useTranslate('Onboarding');

const currentStep = ref(1);
const totalSteps = 4;

const steps = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'Tour' },
  { id: 3, label: 'Setup' },
  { id: 4, label: 'Launch' },
];

const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value += 1;
  } else {
    completeOnboarding();
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value -= 1;
  }
};

const goToStep = (step: number) => {
  currentStep.value = step;
};

// Only show floating camera overlay on Step 2 (Interactive HUD Tour)
watch(
  currentStep,
  (step) => {
    if (step === 2) {
      capture.setCameraOverlayActive(true);
    } else {
      capture.setCameraOverlayActive(false);
    }
  },
  { immediate: true },
);

const handleDismiss = () => {
  capture.setCameraOverlayActive(true);
  void capture.closeOnboarding();
};

const completeOnboarding = () => {
  capture.setCameraOverlayActive(true);
  void capture.completeOnboarding();
};

const handleMinimize = () => {
  capture.minimize();
};

const handleClose = () => {
  capture.setCameraOverlayActive(true);
  void capture.closeOnboarding();
};

const handleMouseNav = (e: MouseEvent) => {
  if (e.button === 3) {
    e.preventDefault();
    if (currentStep.value > 1) {
      prevStep();
    }
  } else if (e.button === 4) {
    e.preventDefault();
    if (currentStep.value < totalSteps) {
      nextStep();
    }
  }
};

onMounted(() => {
  window.addEventListener('mouseup', handleMouseNav);
});

onUnmounted(() => {
  capture.setCameraOverlayActive(true);
  window.removeEventListener('mouseup', handleMouseNav);
});
</script>

<template>
  <div class="onboarding-app">
    <OnboardingBackdrop />

    <!-- Custom Native Titlebar -->
    <header class="onboarding-titlebar">
      <div class="titlebar-brand">
        <img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" alt="Beam" class="titlebar-logo" />
        <span class="titlebar-title">{{ t('titlebarTitle') }}</span>
      </div>

      <div class="titlebar-drag-spacer"></div>

      <div class="titlebar-actions">
        <button type="button" class="dismiss-btn" @click="handleDismiss">
          {{ t('dismiss') }}
        </button>

        <div class="window-controls">
          <button type="button" class="win-btn win-min" :title="t('minimize')" @click="handleMinimize">
            <Minus class="win-icon" />
          </button>
          <button type="button" class="win-btn win-close" :title="t('close')" @click="handleClose">
            <X class="win-icon" />
          </button>
        </div>
      </div>
    </header>

    <!-- Main Step Body Container -->
    <main class="onboarding-body">
      <Transition name="page-slide" mode="out-in">
        <div :key="currentStep" class="step-wrapper">
          <WelcomeStep v-if="currentStep === 1" @next="nextStep" />
          <TourStep v-else-if="currentStep === 2" />
          <SetupStep v-else-if="currentStep === 3" />
          <CommunityStep v-else-if="currentStep === 4" @complete="completeOnboarding" />
        </div>
      </Transition>
    </main>

    <!-- Bottom Navigation Bar (Shown on Steps 2 & 3) -->
    <footer v-if="currentStep > 1 && currentStep < 4" class="onboarding-footer">
      <Button variant="secondary" size="sm" class="nav-btn" :icon="ChevronLeft" @click="prevStep">
        <span>{{ t('back') }}</span>
      </Button>

      <!-- Step Indicator Dots -->
      <div class="steps-indicator">
        <button
          v-for="step in steps"
          :key="step.id"
          type="button"
          class="step-dot"
          :class="{ active: currentStep === step.id, completed: currentStep > step.id }"
          @click="goToStep(step.id)"
        >
          <span class="dot-inner"></span>
        </button>
      </div>

      <Button variant="primary" size="sm" class="nav-btn" @click="nextStep">
        <span class="nav-next-flex">
          <span>{{ t('next') }}</span>
          <ChevronRight class="btn-icon" />
        </span>
      </Button>
    </footer>
  </div>
</template>

<style scoped>
.onboarding-app {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  background: var(--color-bg-app, #141310);
  color: var(--text-primary);
}

.onboarding-titlebar {
  position: relative;
  z-index: 10;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
  background: color-mix(in srgb, var(--color-bg-surface) 60%, transparent);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(16px);
  -webkit-app-region: drag;
}

.titlebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.titlebar-logo {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.titlebar-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.titlebar-drag-spacer {
  flex: 1;
  height: 100%;
}

.titlebar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  -webkit-app-region: no-drag;
}

.dismiss-btn {
  background: transparent;
  border: none;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.dismiss-btn:hover {
  color: var(--text-primary);
  background: var(--color-bg-surface-hover);
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.win-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.win-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.win-close:hover {
  background: #e11d48;
  color: #ffffff;
}

.win-icon {
  width: 13px;
  height: 13px;
}

.onboarding-body {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

.step-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.onboarding-footer {
  position: relative;
  z-index: 10;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.nav-btn {
  width: 104px;
  min-width: 104px;
  max-width: 104px;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.nav-next-flex {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  line-height: 1;
}

.btn-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  display: inline-block;
  vertical-align: middle;
}

.steps-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-dot {
  width: 22px;
  height: 6px;
  padding: 0;
  background: var(--color-border-strong);
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.step-dot:hover {
  opacity: 0.9;
}

.step-dot.active {
  width: 34px;
  background: var(--color-primary);
  opacity: 1;
}

.step-dot.completed {
  background: var(--color-primary);
  opacity: 0.55;
}

/* Page transitions */
.page-slide-enter-active,
.page-slide-leave-active {
  transition:
    opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.page-slide-enter-from {
  opacity: 0;
  transform: translateX(18px) scale(0.99);
}

.page-slide-leave-to {
  opacity: 0;
  transform: translateX(-18px) scale(0.99);
}
</style>

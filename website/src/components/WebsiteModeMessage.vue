<script setup lang="ts">
import type { WebsiteModeId } from '@website/types/website-modes';

withDefaults(
  defineProps<{
    mode: WebsiteModeId;
    title: readonly string[];
    description: string;
    headingId: string;
    heading?: 'h1' | 'h2';
  }>(),
  { heading: 'h2' },
);
</script>

<template>
  <div class="mode-message-shell" aria-live="polite" aria-atomic="true">
    <Transition name="mode-message" mode="out-in">
      <div :key="mode" class="mode-message">
        <component :is="heading" :id="headingId" class="mode-message__heading">
          <template v-for="(phrase, index) in title" :key="phrase">
            <span class="mode-message__phrase" :class="{ 'is-accent': index === title.length - 1 }">
              {{ phrase }}
            </span>
            {{ index < title.length - 1 ? ' ' : '' }}
          </template>
        </component>
        <p class="mode-message__description">{{ description }}</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mode-message-shell {
  width: 100%;
  min-height: var(--mode-message-min-height, 220px);
}

.mode-message {
  display: grid;
  min-width: 0;
  justify-items: var(--mode-message-alignment, center);
}

.mode-message__heading {
  width: min(100%, var(--mode-message-heading-width, 1000px));
  margin: var(--mode-message-heading-margin, 34px 0 0);
  color: var(--text-primary, #171716);
  font-family: var(--font-headline);
  font-size: var(--mode-message-heading-size, clamp(44px, 6vw, 82px));
  font-weight: var(--mode-message-heading-weight, 620);
  letter-spacing: -0.06em;
  line-height: 0.94;
}

.mode-message__phrase {
  position: relative;
  display: inline-block;
  white-space: nowrap;
}

.mode-message__phrase + .mode-message__phrase {
  margin-left: 0.12em;
}

.mode-message__phrase::after {
  position: absolute;
  top: 51%;
  right: -0.03em;
  left: -0.03em;
  height: 0.055em;
  border-radius: 999px;
  background: var(--mode-accent, #7557e8);
  content: '';
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left;
}

.mode-message__phrase.is-accent {
  color: var(--mode-accent, #7557e8);
}

.mode-message__description {
  width: min(100%, var(--mode-message-description-width, 720px));
  margin: var(--mode-message-description-margin, 22px auto 0);
  color: var(--text-secondary);
  font-size: var(--mode-message-description-size, clamp(18px, 2vw, 22px));
  line-height: 1.55;
  text-align: var(--mode-message-text-align, center);
}

.mode-message-leave-active {
  animation: message-leave 480ms cubic-bezier(0.58, 0, 0.28, 1) both;
}

.mode-message-leave-active .mode-message__phrase::after {
  animation: title-strike 360ms cubic-bezier(0.65, 0, 0.2, 1) both;
}

.mode-message-enter-active {
  animation: message-enter 460ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes title-strike {
  0% {
    opacity: 0;
    transform: scaleX(0);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@keyframes message-leave {
  0%,
  68% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-12px);
  }
}

@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mode-message-enter-active,
  .mode-message-leave-active,
  .mode-message-leave-active .mode-message__phrase::after {
    animation: none;
  }
}

@media (max-width: 700px) {
  .mode-message__heading {
    letter-spacing: -0.055em;
  }
}
</style>

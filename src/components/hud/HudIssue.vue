<script setup lang="ts">
import { computed } from 'vue';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
import type { HudIssueModel } from './hud-issue-types';

const props = defineProps<{ issue: HudIssueModel }>();
const emit = defineEmits<{ action: [id: string] }>();

const icon = computed(() => {
  if (props.issue.tone === 'error') return AlertCircle;
  if (props.issue.tone === 'warning') return AlertTriangle;
  if (props.issue.tone === 'success') return CheckCircle2;
  return Info;
});
</script>

<template>
  <article
    class="hud-issue"
    :class="`hud-issue-${issue.tone}`"
    :role="issue.tone === 'error' ? 'alert' : 'status'"
    :aria-live="issue.tone === 'error' ? 'assertive' : 'polite'"
  >
    <component :is="icon" class="hud-issue-icon" aria-hidden="true" />
    <div class="hud-issue-content">
      <p class="hud-issue-title">{{ issue.title }}</p>
      <ul v-if="issue.details.length > 0" class="hud-issue-details">
        <li v-for="detail in issue.details" :key="detail">{{ detail }}</li>
      </ul>
    </div>
    <slot name="action">
      <CopyButton
        v-if="issue.copyText"
        :text="issue.copyText"
        display="icon"
        variant="secondary"
        size="xs"
        class="hud-issue-action"
        :label="issue.copyLabel"
        :copied-label="issue.copiedLabel"
      />
      <Button
        v-else-if="issue.actionLabel"
        variant="secondary"
        size="xs"
        class="hud-issue-action"
        :loading="issue.actionLoading"
        :disabled="issue.actionDisabled"
        @click="emit('action', issue.id)"
      >
        {{ issue.actionLabel }}
      </Button>
    </slot>
  </article>
</template>

<style scoped>
.hud-issue {
  --issue-color: var(--color-info);
  --issue-background: var(--color-info-light);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--issue-color) 42%, transparent);
  border-radius: var(--radius-md);
  background: var(--issue-background);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  -webkit-app-region: no-drag;
}

.hud-issue-error {
  --issue-color: var(--color-error);
  --issue-background: var(--color-error-light);
}

.hud-issue-warning {
  --issue-color: var(--color-warning);
  --issue-background: var(--color-warning-light);
}

.hud-issue-success {
  --issue-color: var(--color-success);
  --issue-background: var(--color-success-light);
}

.hud-issue-icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  color: var(--issue-color);
}

.hud-issue-success .hud-issue-icon {
  animation: hud-issue-confirm 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.hud-issue-content {
  flex: 1;
  min-width: 0;
}

.hud-issue-title {
  margin: 0;
  color: var(--issue-color);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
}

.hud-issue-details {
  margin: 3px 0 0;
  padding-left: 14px;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.hud-issue-action {
  flex: 0 0 auto;
  align-self: center;
  white-space: nowrap;
}

@keyframes hud-issue-confirm {
  from {
    opacity: 0;
    transform: scale(0.7);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hud-issue-success .hud-issue-icon {
    animation: none;
  }
}
</style>

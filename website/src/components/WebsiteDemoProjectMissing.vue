<script setup lang="ts">
import { FileWarning } from '@lucide/vue';
import type { WebsiteDemoFileIssue } from '@website/demo/website-demo-project';
import { useI18n } from 'vue-i18n';

defineProps<{ issues: WebsiteDemoFileIssue[]; loading?: boolean }>();
const { t } = useI18n();
</script>

<template>
  <div class="missing-project" role="status" aria-live="polite">
    <div class="missing-project__heading">
      <FileWarning aria-hidden="true" />
      <div>
        <h4>{{ t(`Website.missing.${loading ? 'checking' : 'title'}`) }}</h4>
      </div>
    </div>
    <p v-if="!loading">
      {{ t('Website.missing.instructions') }}
    </p>
    <ul v-if="!loading" class="missing-project__files">
      <li v-for="issue in issues" :key="issue.key">
        <span>{{ t(`Website.missing.${issue.reason}`) }} · {{ t(`Website.missing.${issue.key}`) }}</span>
        <code>website/public{{ issue.path }}</code>
        <small v-if="issue.detail">{{ issue.detail }}</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.missing-project {
  display: grid;
  min-height: 420px;
  align-content: center;
  gap: 22px;
  padding: clamp(24px, 5vw, 64px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  color: var(--text-secondary);
  box-shadow: var(--shadow-sm);
}
.missing-project__heading {
  display: flex;
  align-items: center;
  gap: 16px;
}
.missing-project__heading > svg {
  width: 30px;
  height: 30px;
  color: var(--color-primary);
}
h4 {
  margin-top: 4px;
  color: var(--text-primary);
  font-size: clamp(20px, 3vw, 28px);
}
.missing-project__files {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.missing-project__files li {
  display: grid;
  gap: 5px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}
.missing-project__files span {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 650;
}
code {
  overflow-wrap: anywhere;
  color: var(--color-primary);
  font-size: 12px;
}
small {
  font-size: 11px;
}
</style>

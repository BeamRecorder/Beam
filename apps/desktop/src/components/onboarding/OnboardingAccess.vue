<script setup lang="ts">
import { onMounted, onScopeDispose, ref } from 'vue';
import { CheckCircle2, MousePointer2, RefreshCw } from '@lucide/vue';
import { capture } from '~/api/capture';
import type { InteractionAccessViewState } from '../hud/interactions/interaction-access-types';
import InteractionAccessError from '../hud/interactions/InteractionAccessError.vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';

defineProps<{ disabled: boolean }>();
const { t } = useTranslate('Onboarding');
const status = ref<InteractionAccessViewState>({
  state: 'checking',
  canRequest: false,
  clicks: false,
  shortcuts: false,
  recordsText: false,
});
const pending = ref(false);
let disposed = false;
onScopeDispose(() => {
  disposed = true;
});
const check = async (request = false) => {
  if (pending.value || disposed) return;
  pending.value = true;
  try {
    const next = await (request ? capture.requestInputAccess() : capture.inputAccessStatus());
    if (!disposed) status.value = next;
  } catch (reason) {
    if (!disposed)
      status.value = {
        state: 'unavailable',
        canRequest: false,
        clicks: false,
        shortcuts: false,
        recordsText: false,
        error: { code: 'input-access-failed', message: reason instanceof Error ? reason.message : t('accessError') },
      };
  } finally {
    if (!disposed) pending.value = false;
  }
};
onMounted(() => {
  void check();
});
</script>

<template>
  <section class="access" :aria-busy="pending">
    <div class="access-heading">
      <MousePointer2 :size="18" aria-hidden="true" /><strong>{{ t('accessTitle') }}</strong>
      <span class="optional">{{ t('optional') }}</span>
    </div>
    <p>{{ t('accessDescription') }}</p>
    <div class="access-status">
      <span v-if="status.state === 'checking'">{{ t('checking') }}</span>
      <span v-else-if="status.state === 'available'" class="available"
        ><CheckCircle2 :size="15" aria-hidden="true" />{{ t('accessReady') }}</span
      >
      <template v-else>
        <span>{{ t('accessLater') }}</span>
        <Button
          v-if="status.canRequest"
          size="sm"
          variant="secondary"
          :loading="pending"
          :disabled="disabled"
          @click="check(true)"
          >{{ t('authorize') }}</Button
        >
        <Button
          v-else
          size="sm"
          variant="ghost"
          :icon="RefreshCw"
          :loading="pending"
          :disabled="disabled"
          @click="check()"
          >{{ t('retry') }}</Button
        >
      </template>
    </div>
    <InteractionAccessError :status="status" />
  </section>
</template>

<style scoped>
.access {
  display: grid;
  gap: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
.access-heading,
.access-status,
.available {
  display: flex;
  align-items: center;
  gap: 8px;
}
.access-heading {
  color: var(--text-primary);
  font-size: var(--font-size-body);
}
.access-heading strong {
  font-weight: 600;
}
.optional {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  margin-left: auto;
}
.access p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.access-status {
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.available {
  color: var(--color-success);
}
</style>

<script setup lang="ts">
import Switch from '~/ui/switch/Switch.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useSpellCheckStore } from '~/stores/spell-check';

const { t } = useTranslate('HudPreferences');
const spellCheckStore = useSpellCheckStore();
</script>

<template>
  <div class="spell-check-preference">
    <div class="spell-check-copy">
      <span class="spell-check-title">{{ t('spellCheck') }}</span>
      <span class="spell-check-description">{{ t('spellCheckDescription') }}</span>
    </div>
    <Switch
      :model-value="spellCheckStore.enabled"
      :aria-label="t('spellCheck')"
      @update:model-value="spellCheckStore.setEnabled"
    />
  </div>
</template>

<style scoped>
.spell-check-preference {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.spell-check-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.spell-check-title {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.spell-check-description {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.35;
}
</style>

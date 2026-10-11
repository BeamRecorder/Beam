<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Search } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { usePreferencesStore } from '~/stores/preferences';
import ShortcutInput from '~/ui/input/ShortcutInput.vue';
import Input from '~/ui/input/Input.vue';
import Select from '~/ui/select/Select.vue';
import ConfirmDialog from '~/ui/dialog/ConfirmDialog.vue';
import { ACTION_GROUPS, configurableActions } from '~/shortcuts/action-catalog';
import { actionKeys, conflictingActions } from '~/shortcuts/action-bindings';
import { actionSectionLabel, groupShortcutActions } from '~/shortcuts/action-sections';
import { shortcutLabel } from '~/shortcuts/shortcut-label';
import type { ActionBindings, ActionDefinition, ShortcutReassignment } from '~/shortcuts/action-types';
const props = defineProps<{ focusedSetting?: string }>();
const { t, te } = useI18n();
const preferences = usePreferencesStore();
const actions = configurableActions();
onMounted(async () => {
  if (!preferences.settings) {
    try {
      await preferences.load();
    } catch (reason) {
      error.value = { loading: String(reason) };
    }
  }
});
const group = ref('editing');
const query = ref('');
const error = ref<Record<string, string>>({});
const pending = ref<string | null>(null);
const reassignment = ref<ShortcutReassignment | null>(null);
const reassignmentDescription = computed(() =>
  reassignment.value
    ? t('ActionShortcuts.reassignDescription', {
        keys: shortcutLabel(reassignment.value.keys),
        actions: reassignment.value.conflicts.map((action) => t(action.label)).join(', '),
        action: t(reassignment.value.action.label),
      })
    : '',
);
const options = computed(() => ACTION_GROUPS.map((item) => ({ value: item.id, label: t(item.label) })));
const rows = computed(() =>
  actions.filter(
    (action) =>
      te(action.label) &&
      (query.value.trim()
        ? `${t(action.label)} ${t(actionSectionLabel(action))} ${action.id}`
            .toLocaleLowerCase()
            .includes(query.value.trim().toLocaleLowerCase())
        : action.group === group.value),
  ),
);
const sections = computed(() => groupShortcutActions(rows.value));
const keys = (action: ActionDefinition) => actionKeys(action.id, preferences.settings?.shortcuts ?? {});
const persist = async (action: ActionDefinition, value: string, conflicts: readonly ActionDefinition[] = []) => {
  if (pending.value || !preferences.settings) return false;
  error.value = {};
  const shortcuts: ActionBindings = {
    [action.id]: { keys: value, scope: action.scope, category: action.group },
  };
  for (const conflict of conflicts) {
    shortcuts[conflict.id] = { keys: '', scope: conflict.scope, category: conflict.group };
  }
  pending.value = action.id;
  try {
    await preferences.update({ shortcuts });
    return true;
  } catch (reason) {
    error.value = { [action.id]: reason instanceof Error ? reason.message : String(reason) };
    return false;
  } finally {
    pending.value = null;
  }
};
const save = async (action: ActionDefinition, value: string) => {
  if (pending.value || reassignment.value || !preferences.settings) return;
  error.value = {};
  if (value === keys(action)) return;
  const conflicts =
    action.kind === 'modifier' ? [] : conflictingActions(action, value, actions, preferences.settings.shortcuts);
  if (conflicts.length) reassignment.value = { action, keys: value, conflicts };
  else await persist(action, value);
};
const confirmReassignment = async () => {
  const requested = reassignment.value;
  if (!requested || pending.value || !preferences.settings) return;
  const conflicts = conflictingActions(requested.action, requested.keys, actions, preferences.settings.shortcuts);
  if (conflicts.some((action) => !requested.conflicts.some((approved) => approved.id === action.id))) {
    reassignment.value = { ...requested, conflicts };
    return;
  }
  if (await persist(requested.action, requested.keys, conflicts)) reassignment.value = null;
};
watch(
  () => props.focusedSetting,
  (id) => {
    const action = actions.find((item) => item.id === id);
    if (action) {
      group.value = action.group;
      query.value = '';
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="shortcuts">
    <p v-if="error.loading" role="alert">{{ error.loading }}</p>
    <div class="shortcut-filters">
      <Input
        v-model="query"
        type="search"
        :placeholder="t('ActionShortcuts.search')"
        :aria-label="t('ActionShortcuts.search')"
      >
        <template #prefix><Search :size="15" /></template>
      </Input>
      <Select v-model="group" :options="options" :aria-label="t('ActionShortcuts.category')" />
    </div>
    <p class="shortcut-help">
      {{ t(group === 'gestures' ? 'ActionShortcuts.gestureHint' : 'ActionShortcuts.editHint') }}
    </p>
    <section
      v-for="section in sections"
      :key="section.id"
      class="shortcut-section"
      :aria-labelledby="`section-${section.id}`"
    >
      <h3 :id="`section-${section.id}`">
        <span v-if="query.trim()" class="shortcut-category"
          >{{ t(ACTION_GROUPS.find((item) => item.id === section.group)!.label) }} · </span
        >{{ t(section.label) }}
      </h3>
      <div
        v-for="action in section.actions"
        :key="action.id"
        class="shortcut-row"
        :data-setting="action.id"
        tabindex="-1"
      >
        <div class="shortcut-copy">
          <label :for="`shortcut-${action.id}`">{{ t(action.label) }}</label>
        </div>
        <ShortcutInput
          :input-id="`shortcut-${action.id}`"
          :label="t(action.label)"
          :model-value="keys(action)"
          :kind="action.kind"
          :disabled="!preferences.settings || pending !== null"
          :customized="keys(action) !== action.keys"
          :error="reassignment?.action.id === action.id ? undefined : error[action.id]"
          @update:model-value="save(action, $event)"
          @reset="save(action, action.keys)"
        />
      </div>
    </section>
    <p v-if="!rows.length" class="shortcut-help" role="status">{{ t('EditorSearch.noResults') }}</p>
    <ConfirmDialog
      :is-open="reassignment !== null"
      :title="t('ActionShortcuts.reassignTitle')"
      :description="reassignmentDescription"
      :confirm-label="t('ActionShortcuts.reassign')"
      :cancel-label="t('ActionShortcuts.cancel')"
      :busy="pending !== null"
      @close="reassignment = null"
      @confirm="confirmReassignment"
    >
      <p v-if="reassignment && error[reassignment.action.id]" class="shortcut-error" role="alert">
        {{ error[reassignment.action.id] }}
      </p>
    </ConfirmDialog>
  </div>
</template>
<style scoped>
.shortcuts {
  width: 100%;
  max-width: 720px;
}
.shortcut-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, 0.65fr);
  gap: 12px;
}
.shortcut-help {
  margin: 16px 0 24px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}
.shortcut-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: center;
  min-height: 64px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}
.shortcut-section + .shortcut-section {
  margin-top: 32px;
}
.shortcut-section h3 {
  margin: 0 0 4px;
  font-size: var(--font-size-sm);
  font-weight: var(--weight-title);
  color: var(--text-secondary);
  line-height: 1.6;
}
.shortcut-copy {
  display: grid;
  gap: 4px;
  color: var(--text-primary);
  font-size: var(--font-size-body);
}
.shortcut-category {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.shortcut-error {
  margin: 12px 0 0;
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
.shortcut-row:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 3px;
}
@media (max-width: 480px) {
  .shortcut-filters {
    grid-template-columns: 1fr;
  }
  .shortcut-row {
    gap: 12px;
  }
}
</style>

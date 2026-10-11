import { computed } from 'vue';
import type { ScreenshotGroupDisabledReason } from './screenshot-toolbar-types';
import type { Ref } from 'vue';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { groupScreenshotLayers, ungroupScreenshotLayers } from '@beam/engine/screenshot/screenshot-groups';
import {
  canMoveScreenshotLayersToGroup,
  moveScreenshotLayersToGroup,
} from '@beam/engine/screenshot/screenshot-group-transfer';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
export function useScreenshotGroups(
  state: Ref<ScreenshotState | null>,
  selected: Ref<string[]>,
  disabled: () => boolean,
) {
  const members = computed(() =>
    state.value ? screenshotLayers(state.value).filter((r) => selected.value.includes(r.id)) : [],
  );
  const groupDisabledReason = computed<ScreenshotGroupDisabledReason | undefined>(() => {
    if (disabled()) return 'busy';
    if (members.value.length === 0) return 'selectTwoToGroup';
    if (members.value.some((r) => r.locked)) return 'locked';
    if (members.value.some((r) => ['background', 'watermark', 'zoom'].includes(r.kind))) return 'unsupported';
    if (members.value.length === 1) return 'selectOneMoreToGroup';
    if (members.value.every((r) => r.groupId && r.groupId === members.value[0]?.groupId)) return 'alreadyGrouped';
    return undefined;
  });
  const ungroupDisabledReason = computed<ScreenshotGroupDisabledReason | undefined>(() => {
    if (disabled()) return 'busy';
    if (members.value.some((r) => r.locked)) return 'locked';
    if (!members.value.some((r) => r.groupId)) return 'selectGroupToUngroup';
    return undefined;
  });
  const canGroup = computed(() => !groupDisabledReason.value);
  const canUngroup = computed(() => !ungroupDisabledReason.value);
  const perform = (ungroup: boolean) => {
    if (!state.value || !(ungroup ? canUngroup.value : canGroup.value)) return false;
    beginPropertyInteraction();
    try {
      state.value = ungroup
        ? ungroupScreenshotLayers(state.value, selected.value)
        : groupScreenshotLayers(state.value, selected.value, crypto.randomUUID());
    } finally {
      endPropertyInteraction();
    }
    return true;
  };
  const canMoveToGroup = (id: string, groupId: string | null) =>
    !disabled() && Boolean(state.value && canMoveScreenshotLayersToGroup(state.value, [id], groupId));
  const moveToGroup = (id: string, groupId: string | null, frontIndex: number) => {
    if (!state.value || !canMoveToGroup(id, groupId)) return false;
    beginPropertyInteraction();
    try {
      state.value = moveScreenshotLayersToGroup(state.value, [id], groupId, frontIndex);
    } finally {
      endPropertyInteraction();
    }
    selected.value = [id];
    return true;
  };
  return {
    canGroup,
    groupDisabledReason,
    ungroupDisabledReason,
    canUngroup,
    canMoveToGroup,
    moveToGroup,
    group: () => perform(false),
    ungroup: () => perform(true),
  };
}

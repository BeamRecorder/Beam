import { computed, onScopeDispose, shallowRef, watch, type ShallowRef } from 'vue';
import type { ProjectEditorData } from '~/api/types/capture-api';
import { useToastStore } from '~/components/ui/toast/toastStore';
import { useTranslate } from '~/i18n/useTranslate';
import { packHoverPath } from '@beam/runtime/cursor/hover/hover-path';
import { analyzeCursorHoversInBackground } from '@beam/runtime/cursor/hover/hover-analysis-browser';
import type { HoverSource } from '@beam/runtime/cursor/hover/hover-types';
import type { CursorHoverSync } from '@beam/engine/cursor/cursor-hover-types';

export function useCursorHoverAnalysis(data: ShallowRef<ProjectEditorData | null>) {
  const result = shallowRef<{ owner: ProjectEditorData; sync: CursorHoverSync } | null>(null);
  const sourceData = shallowRef<ProjectEditorData | null>(null);
  const toast = useToastStore();
  const { t } = useTranslate('CursorRecording');
  let active: AbortController | null = null;
  watch(
    data,
    (owner, _previous, onCleanup) => {
      active?.abort();
      result.value = null;
      sourceData.value = owner;
      if (!owner?.cursor.available || owner.cursor.hoverSync) return;
      if (owner.manifest.cursorEmbedded) {
        sourceData.value = { ...owner, cursor: { ...owner.cursor, hoverSources: [] } };
        return;
      }
      const sources: HoverSource[] = owner.tracks
        .filter((track) => track.kind === 'screen')
        .flatMap((track) =>
          track.assets
            .filter((segment) => segment.complete && segment.exists && segment.src)
            .map((segment) => ({
              id: `session:${owner.sessionId}:screen:${segment.path}`,
              src: segment.src!,
              startSeconds: segment.startNs / 1e9,
              durationSeconds: ((segment.endNs ?? owner.manifest.durationNs) - segment.startNs) / 1e9,
            })),
        )
        .sort((a, b) => a.startSeconds - b.startSeconds);
      sourceData.value = { ...owner, cursor: { ...owner.cursor, hoverSources: sources } };
      if (!sources.length) return;
      const controller = new AbortController();
      active = controller;
      let failure: string | null = null;
      onCleanup(() => {
        if (failure) toast.remove(failure);
      });
      void analyzeCursorHoversInBackground({ sources, path: packHoverPath(owner.cursor.events) }, controller.signal)
        .then((sync) => {
          if (!controller.signal.aborted) result.value = { owner, sync };
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error('[Beam cursor] Hover synchronization failed.', error);
          failure = toast.error(t('hoverSyncFailed'), 0);
        });
    },
    { immediate: true },
  );
  onScopeDispose(() => active?.abort());
  return computed(() => {
    const owner = data.value;
    return owner && result.value?.owner === owner
      ? { ...sourceData.value!, cursor: { ...sourceData.value!.cursor, hoverSync: result.value.sync } }
      : sourceData.value;
  });
}

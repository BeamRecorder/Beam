<script setup lang="ts">
import { onBeforeUnmount, inject } from 'vue';
import { capture } from '~/api/capture';
import { useEditorWorkspaceContext } from '../../workspace/workspace-context';
import { useFakeWebcamOverlay } from './useFakeWebcamOverlay';
import { visualClipDefaultProps } from '../../composables/editor-defaults';
import { editorSearchKey } from '../../search/editor-search-types';
import { useTranslate } from '~/i18n/useTranslate';
import type { SettingsEditorAction } from '~/api/types/hud-panel';
const workspace = useEditorWorkspaceContext();
const { t } = useTranslate('SettingsPanel');
const webcam = useFakeWebcamOverlay({
  composition: workspace.composition,
  projectId: () => workspace.props.project?.id ?? null,
  selectedClipId: () => workspace.selectedClipId.value,
  currentTimeMs: () => workspace.currentTime.value * 1000,
  appearance: () => visualClipDefaultProps(workspace.editorDefaults.value, 'webcam', 8000).appearance,
  onAdded: () => workspace.commitNow(workspace.createEditorSnapshot()),
});
const run = async (action: SettingsEditorAction) => {
  if (action === 'devtools') {
    if (!capture.toggleDevTools) throw new Error(t('recorderUnavailable'));
    await capture.toggleDevTools();
    return;
  }
  if (action === 'recorder') {
    if (!(await capture.openRecorderFromEditor())) throw new Error(t('recorderUnavailable'));
    return;
  }
  if (webcam.unavailable.value) throw new Error(webcam.unavailable.value);
  await webcam.add();
  if (webcam.error.value) throw new Error(webcam.error.value);
};
onBeforeUnmount(capture.onSettingsEditorAction(run));
const search = inject(editorSearchKey, null);
const release = import.meta.env.DEV
  ? search?.registerActions(() => [
      { id: 'developer:recorder', label: t('recorderTool'), group: 'action', run: () => run('recorder') },
      {
        id: 'developer:webcam',
        label: t('fakeWebcamTitle'),
        group: 'action',
        disabled: !!webcam.unavailable.value || webcam.busy.value,
        run: () => run('webcam'),
      },
    ])
  : undefined;
onBeforeUnmount(() => release?.());
</script>
<template></template>

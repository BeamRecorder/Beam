import { ref } from 'vue';
import { useEditorMediaDrop } from '~/components/video-editor/composables/useEditorMediaDrop';
import { useClipboardImagePaste } from '~/components/video-editor/composables/useClipboardImagePaste';
import { usePlaybackErrorToast } from '~/components/video-editor/composables/usePlaybackErrorToast';
import { useTimelineClipboard } from '~/components/video-editor/timeline/composables/useTimelineClipboard';
import { IMAGE_DURATION_MS } from '@beam/runtime/shared/index';
import { capture } from '~/api/capture';
import type { EditorWorkspaceState } from './workspace-types';
export function useEditorWorkspaceMedia(state: EditorWorkspaceState, finishCrop: () => void) {
  const { t, toast, currentTime, playbackError, composition, addImportedAsset, props } = state;
  const mediaDrop = useEditorMediaDrop({
    projectId: () => props.project?.id ?? null,
    currentTimeSeconds: () => currentTime.value,
    addImportedAsset: (...args) => {
      finishCrop();
      return addImportedAsset(...args);
    },
    t,
  });
  const isPastingClipboardImage = ref(false);
  const timelineClipboard = useTimelineClipboard();
  const pasteClipboardImage = async () => {
    const projectId = props.project?.id;
    if (!projectId || isPastingClipboardImage.value) return;
    isPastingClipboardImage.value = true;
    try {
      const asset = await capture.pasteProjectClipboardImage(projectId);
      if (!asset) return;
      addImportedAsset(
        asset,
        {
          kind: 'image',
          durationMs: IMAGE_DURATION_MS,
          width: asset.width,
          height: asset.height,
          hasAudio: false,
          canDecodeAudio: false,
          audioCodec: null,
        },
        Math.max(0, Math.round(currentTime.value * 1_000)),
      );
    } finally {
      isPastingClipboardImage.value = false;
    }
  };
  useClipboardImagePaste({
    disabled: () => !props.project || isPastingClipboardImage.value || mediaDrop.isImportingMedia.value,
    preferInternal: () => timelineClipboard.canPaste(props.project?.id),
    paste: pasteClipboardImage,
    onError: (reason) => toast.error(`${t('mediaDropImportFailed')}: ${String(reason)}`),
  });
  usePlaybackErrorToast(playbackError, t, () => ({
    project: props.project ?? null,
    editorData: props.editorData ?? null,
    composition: composition.value,
  }));
  return { mediaDrop, isPastingClipboardImage, timelineClipboard, pasteClipboardImage };
}

import { provide, watch, type Ref } from 'vue';
import type { MediaError } from '@beam/runtime/shared/index';
import { useToastStore } from '~/ui/toast/toastStore';
import { PLAYBACK_ERROR_REPORT, playbackErrorDiagnostic } from './playback-error-diagnostics';
import type { PlaybackErrorContext, PlaybackErrorTranslate } from './playback-error-types';

export function usePlaybackErrorToast(
  playbackError: Ref<MediaError | null>,
  t: PlaybackErrorTranslate,
  context: () => PlaybackErrorContext,
) {
  const toast = useToastStore();
  const shownErrors = new Set<string>();
  provide(PLAYBACK_ERROR_REPORT, (error) => JSON.stringify(playbackErrorDiagnostic(error, context()), null, 2));

  watch(playbackError, (error) => {
    if (!error) return;
    const detail = JSON.stringify({ kind: error.kind, sourceId: error.sourceId, message: error.message });
    if (shownErrors.has(detail)) return;
    shownErrors.add(detail);
    const current = context();
    const asset = current.composition.assets.find((entry) => entry.id === error.sourceId);
    const diagnostic = playbackErrorDiagnostic(error, current);
    const expectedPath = diagnostic.media.expectedProjectPath;
    const incompleteRecording = Boolean(
      asset?.origin === 'session' && current.editorData && !current.editorData.manifest.completed,
    );
    const message = asset
      ? t(incompleteRecording ? 'mediaPlaybackIncompleteRecording' : 'mediaPlaybackAssetError', {
          project: current.project?.name ?? t('mediaPlaybackUnknownProject'),
          name: asset.name,
          path: expectedPath ?? error.sourceId,
          message: error.message,
        })
      : t('mediaPlaybackError', { message: error.message });
    toast.error(message, 12_000, {
      label: t('mediaPlaybackCopyError'),
      copyText: JSON.stringify(diagnostic, null, 2),
    });
  });
}

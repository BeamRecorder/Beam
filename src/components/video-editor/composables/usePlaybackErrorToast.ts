import { watch, type Ref } from 'vue';
import type { MediaError } from '~/media/shared';
import type { ClipComposition } from '~/media/shared/composition-types';
import { useToastStore } from '~/ui/toast/toastStore';

type Translate = (key: string, params?: Record<string, unknown>) => string;
type PlaybackErrorContext = {
  project: { id: string; name: string } | null;
  editorData: { sessionId: string; manifest: { completed: boolean } } | null;
  composition: ClipComposition;
};

const errorSignature = (error: MediaError) =>
  JSON.stringify({
    kind: error.kind,
    sourceId: error.sourceId,
    message: error.message,
    ...('track' in error ? { track: error.track } : {}),
    ...('codec' in error ? { codec: error.codec } : {}),
  });

const sourcePath = (asset: ClipComposition['assets'][number] | undefined) => {
  if (!asset) return null;
  if (asset.origin === 'session' && asset.sessionId && asset.sessionPath)
    return `session-${asset.sessionId}/${asset.sessionPath}`;
  return asset.fileName ? `media/${asset.fileName}` : null;
};

export function usePlaybackErrorToast(
  playbackError: Ref<MediaError | null>,
  t: Translate,
  context: () => PlaybackErrorContext,
) {
  const toast = useToastStore();
  const shownErrors = new Set<string>();

  watch(playbackError, (error) => {
    if (!error) return;
    const detail = errorSignature(error);
    if (shownErrors.has(detail)) return;
    shownErrors.add(detail);
    const current = context();
    const asset = current.composition.assets.find((entry) => entry.id === error.sourceId);
    const expectedPath = sourcePath(asset);
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
    const copyDetail = JSON.stringify(
      {
        project: current.project,
        recordingSession: current.editorData
          ? { id: current.editorData.sessionId, completed: current.editorData.manifest.completed }
          : null,
        media: {
          id: error.sourceId,
          name: asset?.name ?? null,
          expectedProjectPath: expectedPath,
        },
        error: JSON.parse(detail) as unknown,
      },
      null,
      2,
    );
    toast.error(message, 12_000, {
      label: t('mediaPlaybackCopyError'),
      copyText: copyDetail,
    });
  });
}

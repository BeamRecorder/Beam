import { onScopeDispose, ref } from 'vue';
import { capture } from '~/api/capture';
import { useToastStore } from '~/ui/toast/toastStore';
import { inspectDroppedMedia, MediaInputError, type DroppedMediaInspection, type MediaAsset } from '~/media/shared';

type Translate = (key: string, params?: Record<string, unknown>) => string;
type ImportedItem = { file: File; asset: MediaAsset; inspection: DroppedMediaInspection };
type FailedItem = { file: File; reason: string };

export interface EditorMediaDropOptions {
  projectId: () => string | null;
  currentTimeSeconds: () => number;
  addImportedAsset: (asset: MediaAsset, inspection: DroppedMediaInspection, startMs: number) => string;
  t: Translate;
}

const containsFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
};

export function useEditorMediaDrop(options: EditorMediaDropOptions) {
  const toast = useToastStore();
  const isDraggingMedia = ref(false);
  const isImportingMedia = ref(false);
  let dragDepth = 0;

  const resetDrag = () => {
    dragDepth = 0;
    isDraggingMedia.value = false;
  };

  const reasonFor = (error: unknown) => {
    if (error instanceof MediaInputError) {
      if (error.detail.kind === 'unsupported-codec') {
        return options.t('mediaDropUnsupportedCodec', { codec: error.detail.codec ?? '?' });
      }
      if (error.detail.kind === 'empty') return options.t('mediaDropEmpty');
      if (error.detail.kind === 'invalid-container') return options.t('mediaDropInvalidFormat');
      return options.t('mediaDropDecodeFailed');
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('gif not supported')) return 'GIF not supported';
    if (message.includes('non autorisé')) return options.t('mediaDropUnsupportedExtension');
    if (message.includes('fichier') || message.includes('chemin')) return options.t('mediaDropNotLocal');
    return options.t('mediaDropImportFailed');
  };

  const summarizeFailures = (failures: FailedItem[]) => {
    const reasons = new Map<string, number>();
    for (const failure of failures) reasons.set(failure.reason, (reasons.get(failure.reason) ?? 0) + 1);
    return [...reasons].map(([reason, count]) => (count > 1 ? `${count}× ${reason}` : reason)).join(' · ');
  };

  const importFiles = async (files: File[]) => {
    if (isImportingMedia.value) {
      toast.info(options.t('mediaDropAlreadyImporting'));
      return;
    }
    const projectId = options.projectId();
    if (!projectId || files.length === 0) return;
    isImportingMedia.value = true;
    const startSeconds = options.currentTimeSeconds();
    const startMs = Math.max(0, Math.round(startSeconds * 1_000));
    const imported: ImportedItem[] = [];
    const failures: FailedItem[] = [];
    try {
      for (const file of files) {
        try {
          const inspection = await inspectDroppedMedia(file, file.name);
          const asset = await capture.importDroppedProjectMedia(projectId, file, inspection.kind);
          imported.push({ file, asset, inspection });
        } catch (error) {
          failures.push({ file, reason: reasonFor(error) });
        }
      }

      const added: ImportedItem[] = [];
      for (const item of [...imported].reverse()) {
        try {
          options.addImportedAsset(item.asset, item.inspection, startMs);
          added.push(item);
        } catch (error) {
          failures.push({ file: item.file, reason: reasonFor(error) });
        }
      }

      if (added.length === 1) {
        toast.success(
          options.t('mediaDropSingleSuccess', { name: added[0]!.file.name, time: formatTime(startSeconds) }),
        );
      } else if (added.length > 1) {
        toast.success(options.t('mediaDropBatchSuccess', { count: added.length, time: formatTime(startSeconds) }));
      }
      const videosWithoutAudio = added.filter(
        ({ inspection }) => inspection.kind === 'video' && inspection.hasAudio && !inspection.canDecodeAudio,
      );
      if (videosWithoutAudio.length > 0) {
        toast.addToast(options.t('mediaDropAudioIgnored', { count: videosWithoutAudio.length }), 'warning', 5_000);
      }
      if (failures.length > 0) {
        toast.error(
          options.t('mediaDropRejected', { count: failures.length, reasons: summarizeFailures(failures) }),
          6_000,
        );
      }
    } finally {
      isImportingMedia.value = false;
    }
  };

  const onMediaDragEnter = (event: DragEvent) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    isDraggingMedia.value = true;
  };

  const onMediaDragOver = (event: DragEvent) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  const onMediaDragLeave = (event: DragEvent) => {
    if (dragDepth === 0) return;
    event.preventDefault();
    dragDepth -= 1;
    if (dragDepth === 0) isDraggingMedia.value = false;
  };

  const onMediaDrop = (event: DragEvent) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    resetDrag();
    void importFiles(files);
  };

  onScopeDispose(resetDrag, true);

  return {
    isDraggingMedia,
    isImportingMedia,
    importFiles,
    onMediaDragEnter,
    onMediaDragOver,
    onMediaDragLeave,
    onMediaDrop,
  };
}

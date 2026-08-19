import { isVisualClip, type Clip } from '~/media/shared/composition-types';

export function selectedClipNames(clips: readonly Clip[], freezeFrameName: string): string[] {
  return clips
    .map((clip) =>
      isVisualClip(clip) && clip.freezeFrameSourceMs !== undefined ? freezeFrameName.trim() : clip.name.trim(),
    )
    .filter(Boolean);
}

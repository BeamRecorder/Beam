import { clipTextStyles } from '@beam/engine/shared/element-fonts';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
export function projectFontSources(composition: Pick<ClipComposition, 'clips'>): Record<string, string> {
  return Object.fromEntries(
    clipTextStyles(composition.clips)
      .filter((style) => style.fontAssetId)
      .map((style) => [style.fontAssetId!, `project-media://font/${style.fontAssetId}`]),
  );
}

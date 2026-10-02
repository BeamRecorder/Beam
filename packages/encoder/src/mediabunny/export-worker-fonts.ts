import { clipTextStyles } from '@beam/engine/shared/element-fonts';
import type { ClipComposition } from '@beam/engine/shared/composition-types';

export async function loadExportFonts(composition: ClipComposition, sources: Readonly<Record<string, string>> = {}) {
  const requested = new Map<string, string>();
  for (const style of clipTextStyles(composition.clips)) {
    if (!style.fontAssetId) continue;
    requested.set(style.fontAssetId, style.fontFamily || 'sans-serif');
  }
  const fontSet = (self as typeof self & { fonts?: FontFaceSet }).fonts;
  if (requested.size && !fontSet) throw new Error('Imported fonts are unavailable in the export Worker.');
  for (const [id, family] of requested) {
    const source = sources[id];
    if (!source) throw new Error(`No font source supplied for "${family}" (${id}).`);
    try {
      const face = new FontFace(family, `url(${JSON.stringify(source)})`);
      await face.load();
      fontSet?.add(face);
    } catch {
      throw new Error(`Unable to load imported font "${family}" for export.`);
    }
  }
}

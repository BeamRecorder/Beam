import { isCaptionClip, type ClipComposition } from '~/media/shared/composition-types';

export async function loadExportFonts(composition: ClipComposition) {
  const requested = new Map<string, string>();
  for (const clip of composition.clips) {
    if (!isCaptionClip(clip) || !clip.caption.style.fontAssetId) continue;
    requested.set(clip.caption.style.fontAssetId, clip.caption.style.fontFamily || 'sans-serif');
  }
  const fontSet = (self as typeof self & { fonts?: FontFaceSet }).fonts;
  if (requested.size && !fontSet) throw new Error('Imported fonts are unavailable in the export Worker.');
  for (const [id, family] of requested) {
    try {
      const face = new FontFace(family, `url("project-media://font/${id}")`);
      await face.load();
      fontSet?.add(face);
    } catch {
      throw new Error(`Unable to load imported font "${family}" for export.`);
    }
  }
}

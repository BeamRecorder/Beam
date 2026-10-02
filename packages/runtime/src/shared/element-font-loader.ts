import type { Clip } from '@beam/engine/shared/composition-types';
import { clipTextStyles } from '@beam/engine/shared/element-fonts';

const loaded = new Map<string, Promise<void>>();
export async function loadElementFonts(clips: readonly Clip[]) {
  for (const style of clipTextStyles(clips)) {
    if (!style.fontAssetId) continue;
    const id = style.fontAssetId;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid imported font identifier.');
    const key = `${id}:${style.fontFamily}`;
    if (!loaded.has(key)) {
      const face = new FontFace(style.fontFamily, `url("project-media://font/${id}")`);
      const loading = face.load().then(() => {
        const fonts =
          typeof document !== 'undefined'
            ? document.fonts
            : (globalThis as typeof globalThis & { fonts?: FontFaceSet }).fonts;
        if (!fonts) throw new Error('Imported fonts are unavailable in this rendering context.');
        fonts.add(face);
      });
      loaded.set(key, loading);
      loading.catch(() => loaded.delete(key));
    }
    await loaded.get(key);
  }
}

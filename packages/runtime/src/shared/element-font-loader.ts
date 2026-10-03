import type { Clip } from '@beam/engine/shared/composition-types';
import { clipTextStyles } from '@beam/engine/shared/element-fonts';

const loaded = new Map<string, Promise<void>>();
export async function loadElementFonts(clips: readonly Clip[], sourceFor: (id: string) => string) {
  for (const style of clipTextStyles(clips)) {
    if (!style.fontAssetId) continue;
    const id = style.fontAssetId;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid imported font identifier.');
    const source = sourceFor(id);
    if (!source) throw new Error(`Imported font source is unavailable: ${id}`);
    const key = `${id}:${style.fontFamily}:${source}`;
    if (!loaded.has(key)) {
      const face = new FontFace(style.fontFamily, `url(${JSON.stringify(source)})`);
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

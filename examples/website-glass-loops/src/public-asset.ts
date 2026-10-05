import hand from '../../../public/macOsSvgCursors/handpointing.svg';
export function resolvePublicAssetUrl(path: string) {
  if (path === '/macOsSvgCursors/handpointing.svg') return hand;
  throw new Error(`Unbundled lens asset: ${path}`);
}

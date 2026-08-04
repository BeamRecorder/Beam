/**
 * Resolves a public asset path (e.g. "/brand/BeamIcon.webp", "/wallpapers/...")
 * to a relative URL compatible with both Vite dev server and Electron file:// protocol.
 */
export function resolvePublicAssetUrl(path: string): string {
  if (!path) return path;
  if (/^(https?|file|data|blob|project-media):/i.test(path)) return path;
  const relativePath = path.startsWith('/') ? path.slice(1) : path;
  const baseUrl = import.meta.env.BASE_URL || './';
  return baseUrl.endsWith('/') ? `${baseUrl}${relativePath}` : `${baseUrl}/${relativePath}`;
}

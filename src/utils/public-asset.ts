/**
 * Resolves a public asset path (e.g. "/brand/BeamIcon.webp", "./wallpapers/...")
 * to an absolute/relative URL compatible with Vite dev server, Electron file://, and Web Workers.
 */
export function resolvePublicAssetUrl(path: string): string {
  if (!path) return path;
  if (/^(https?|file|data|blob|project-media):/i.test(path)) return path;
  const cleanPath = path.replace(/^(\/|\.\/)+/, '');

  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      return new URL(cleanPath, window.location.href).href;
    } catch {
      // Fallback if URL construction fails
    }
  }

  const baseUrl = import.meta.env.BASE_URL || './';
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${prefix}${cleanPath}`;
}

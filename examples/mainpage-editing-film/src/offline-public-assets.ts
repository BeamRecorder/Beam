const previews = import.meta.glob('../../../public/frame-previews/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const files = new Map(Object.entries(previews).map(([path, url]) => [`frame-previews/${path.split('/').at(-1)}`, url]));
export function resolvePublicAssetUrl(path: string): string {
  if (/^(https?|data|blob):/.test(path)) return path;
  const normalized = path.replace(/^(\/|\.\/)+/, '');
  const url = files.get(normalized);
  if (!url) throw new Error(`Public asset was not frozen into the film: ${path}`);
  return url;
}

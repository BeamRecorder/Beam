import type { SourcePickerSource, SourcePickerKind } from '~/api/types/source-picker';

export function filterSources(
  sources: SourcePickerSource[],
  kind: SourcePickerKind,
  query: string,
): SourcePickerSource[] {
  const search = query.trim().toLocaleLowerCase();
  return sources.filter(
    (source) =>
      source.kind === kind &&
      (!search || `${source.app} ${source.name} ${source.detail}`.toLocaleLowerCase().includes(search)),
  );
}

export function adjacentSourceId(sources: SourcePickerSource[], currentId: string | null, step: number): string | null {
  if (!sources.length) return null;
  const current = sources.findIndex((source) => source.id === currentId);
  const next =
    current < 0
      ? step < 0
        ? sources.length - 1
        : 0
      : (current + (step % sources.length) + sources.length) % sources.length;
  return sources[next]!.id;
}

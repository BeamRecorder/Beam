import type { AnimationValue } from './scene-types';

export function propertyPath(property: string) {
  const path = property.split('.');
  if (
    !path.length ||
    path.length > 8 ||
    path.some(
      (key) =>
        !/^[a-zA-Z][\w]*$/.test(key) ||
        [
          '__proto__',
          'prototype',
          'constructor',
          'id',
          'assetId',
          'kind',
          'children',
          'trackId',
          'timelineStartMs',
          'timelineDurationMs',
          'sourceInMs',
          'sourceDurationMs',
          'playbackRate',
          'timing',
        ].includes(key),
    )
  ) {
    throw new Error(`Invalid animation property: ${property}`);
  }
  return path;
}

export function readProperty(target: object, path: readonly string[]): unknown {
  let value: unknown = target;
  for (const key of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      throw new Error(`Unknown animation property: ${path.join('.')}`);
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function writeProperty<T extends object>(target: T, path: readonly string[], value: AnimationValue): T {
  const [key, ...rest] = path;
  if (!key) throw new Error('Empty animation property.');
  const record = target as Record<string, unknown>;
  return { ...target, [key]: rest.length ? writeProperty(record[key] as object, rest, value) : value };
}

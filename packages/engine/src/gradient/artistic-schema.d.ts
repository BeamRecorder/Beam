import type { ArtisticEffect, ArtisticKind, ArtisticRecipeMap } from './artistic-effect-types';
export const ARTISTIC_DEFAULTS: ArtisticRecipeMap;
export const ARTISTIC_RANGES: {
  [K in ArtisticKind]: Partial<Record<keyof ArtisticRecipeMap[K], readonly [number, number]>>;
};
export function validateArtisticRecipe<K extends ArtisticKind>(
  kind: K,
  value: unknown,
): asserts value is ArtisticRecipeMap[K];
export function createArtisticEffect<K extends ArtisticKind>(kind: K, id: string): Extract<ArtisticEffect, { kind: K }>;

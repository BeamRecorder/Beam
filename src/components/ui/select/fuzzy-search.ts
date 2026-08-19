import type { FuzzySearchEngine } from './select-types';

interface IndexedItem<T> {
  item: T;
  index: number;
  fields: string[];
}

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const subsequenceScore = (field: string, query: string) => {
  let fieldIndex = 0;
  let previousMatch = -2;
  let score = 0;
  for (const character of query) {
    const match = field.indexOf(character, fieldIndex);
    if (match < 0) return null;
    score += match - fieldIndex;
    if (match === 0 || field[match - 1] === ' ') score -= 4;
    if (match === previousMatch + 1) score -= 2;
    previousMatch = match;
    fieldIndex = match + 1;
  }
  return 100 + score + Math.max(0, field.length - query.length) * 0.05;
};

const fieldScore = (field: string, token: string) => {
  if (field === token) return 0;
  if (field.startsWith(token)) return 5 + (field.length - token.length) * 0.01;
  const wordStart = field.indexOf(` ${token}`);
  if (wordStart >= 0) return 10 + wordStart;
  const substring = field.indexOf(token);
  if (substring >= 0) return 30 + substring;
  return subsequenceScore(field, token);
};

export function createFuzzySearchEngine<T>(items: readonly T[], fieldsFor: (item: T) => readonly string[]) {
  const indexed: IndexedItem<T>[] = items.map((item, index) => ({
    item,
    index,
    fields: fieldsFor(item).map(normalize).filter(Boolean),
  }));

  const engine: FuzzySearchEngine<T> = {
    search(query) {
      const tokens = normalize(query).split(/\s+/).filter(Boolean);
      if (!tokens.length) return items.slice();
      const matches: Array<{ item: T; index: number; score: number }> = [];
      for (const entry of indexed) {
        let score = 0;
        let matchesAllTokens = true;
        for (const token of tokens) {
          let best = Number.POSITIVE_INFINITY;
          for (const field of entry.fields) {
            const candidate = fieldScore(field, token);
            if (candidate !== null && candidate < best) best = candidate;
          }
          if (!Number.isFinite(best)) {
            matchesAllTokens = false;
            break;
          }
          score += best;
        }
        if (matchesAllTokens) matches.push({ item: entry.item, index: entry.index, score });
      }
      return matches
        .sort((left, right) => left.score - right.score || left.index - right.index)
        .map(({ item }) => item);
    },
  };
  return engine;
}

import type { SettingsSearchEntry, SettingsSearchIndex } from './settings-types';

export function normalizeSettingsSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function grams(value: string, width: number): Set<string> {
  const result = new Set<string>();
  for (let offset = 0; offset <= value.length - width; offset++) result.add(value.slice(offset, offset + width));
  return result;
}

// Build once per language change. Short queries use the same postings as long
// queries, so typing never normalizes or scans the entire settings catalogue.
export function createSettingsSearch(entries: readonly SettingsSearchEntry[]): SettingsSearchIndex {
  const documents = entries.map((entry) =>
    normalizeSettingsSearch([entry.title, entry.description, ...entry.terms].join(' ')),
  );
  const postings = new Map<string, Set<number>>();
  documents.forEach((document, index) => {
    for (const width of [1, 2, 3]) {
      for (const gram of grams(document, width)) {
        let matches = postings.get(gram);
        if (!matches) postings.set(gram, (matches = new Set()));
        matches.add(index);
      }
    }
  });

  return {
    search(query) {
      const normalized = normalizeSettingsSearch(query);
      if (!normalized) return [];
      const words = [...new Set(normalized.split(' '))];
      const candidates: Set<number>[] = [];
      for (const word of words) {
        for (const gram of grams(word, Math.min(3, word.length))) {
          const matches = postings.get(gram);
          if (!matches) return [];
          candidates.push(matches);
        }
      }
      candidates.sort((a, b) => a.size - b.size);
      const result: number[] = [];
      for (const index of candidates[0]!) {
        if (
          candidates.every((matches) => matches.has(index)) &&
          words.every((word) => documents[index]!.includes(word))
        ) {
          result.push(index);
        }
      }
      // Stable catalogue order, independent of which posting was the smallest.
      return result.sort((a, b) => a - b).map((index) => entries[index]!);
    },
  };
}

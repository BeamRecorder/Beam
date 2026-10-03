import { validateComposition, type ClipComposition } from '@beam/engine';
import type { DocumentFile } from './document-file-types';

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Accept the existing Beam project format, a render snapshot, or a standalone composition. */
export function readDocumentFile(value: unknown): DocumentFile {
  if (!record(value)) throw new TypeError('Expected a Beam document object.');
  const editor = record(value.editor) ? value.editor : null;
  const snapshot = record(value.snapshot) ? value.snapshot : null;
  const container = editor ?? snapshot ?? value;
  const candidate = record(container.composition) ? container.composition : container;
  if (
    !Array.isArray(candidate.assets) ||
    !Array.isArray(candidate.clips) ||
    !Array.isArray(candidate.keyboardCaptionSessions)
  ) {
    throw new TypeError('Expected a Beam composition with assets, clips and keyboardCaptionSessions.');
  }
  const composition = candidate as unknown as ClipComposition;
  validateComposition(composition);
  return {
    composition,
    replace: (next) => {
      if (editor) return { ...value, editor: { ...editor, composition: next } };
      if (snapshot) return { ...value, snapshot: { ...snapshot, composition: next } };
      return candidate === container ? next : { ...value, composition: next };
    },
  };
}

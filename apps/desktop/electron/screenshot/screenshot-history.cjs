const { isDeepStrictEqual } = require('node:util');
const { validateScreenshotState } = require('./screenshot-validation.cjs');

// Same bound as the shared editor history: the current state counts as one entry.
const MAX_HISTORY_DEPTH = 50;
function validateScreenshotHistory(history, state, projectId) {
  if (history === undefined) return undefined;
  if (
    !history ||
    history.version !== 1 ||
    !Array.isArray(history.undo) ||
    !Array.isArray(history.redo) ||
    !history.undo.length ||
    history.undo.length + history.redo.length > MAX_HISTORY_DEPTH ||
    Object.keys(history).some((key) => !['version', 'undo', 'redo'].includes(key))
  )
    throw new Error('Invalid screenshot history.');
  // Each snapshot is capped at 2 MB by the state validator; the whole history is bounded at 100 MB.
  for (const snapshot of [...history.undo, ...history.redo]) validateScreenshotState(snapshot, projectId);
  if (!isDeepStrictEqual(history.undo.at(-1), state)) throw new Error('Screenshot history does not match its state.');
  return history;
}
module.exports = { validateScreenshotHistory };

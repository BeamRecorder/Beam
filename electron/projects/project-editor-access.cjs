const {
  migrateComposition,
  normalizeComposition,
  materializeComposition,
  pruneProjectMedia,
} = require('./clip-composition.cjs');
const { migratePresentation, presentationState, zoomState } = require('./project-editor-state.cjs');

function createProjectEditorAccess(options) {
  const migrateEditor = (directory, manifest) => {
    const current = manifest.editor;
    if (current?.schemaVersion === 3 && current.composition?.schemaVersion === 7) return current;
    if (current?.schemaVersion !== undefined && ![2, 3].includes(current.schemaVersion))
      throw new Error(`Version d’état éditeur inconnue: ${String(current.schemaVersion)}`);
    const legacyComposition = current?.composition ?? { schemaVersion: 1, assets: [], clips: [] };
    const presentation = migratePresentation(current?.presentation);
    const editor = {
      schemaVersion: 3,
      composition:
        legacyComposition.schemaVersion === 7
          ? normalizeComposition(legacyComposition)
          : migrateComposition(
              legacyComposition,
              presentation.canvas.showBackground,
              Array.isArray(manifest.sessions) ? manifest.sessions.map((session) => session.sessionId) : [],
            ),
      zoom: current?.zoom ? zoomState(current.zoom) : { elements: [], generatedSessions: [] },
      presentation,
    };
    manifest.editor = editor;
    options.writeManifest(directory, manifest);
    return editor;
  };

  const editorState = (id) => {
    const directory = options.directoryFor(id);
    const manifest = options.readManifest(directory);
    const editor = migrateEditor(directory, manifest);
    return {
      schemaVersion: 3,
      composition: materializeComposition(
        directory,
        normalizeComposition(editor.composition),
        options.sessionFileFor,
        options.mediaUrlFor,
      ),
      zoom: zoomState(editor.zoom),
      presentation: presentationState(editor.presentation),
    };
  };

  const saveEditorState = (id, value) => {
    if (!value || value.schemaVersion !== 3) throw new Error('État éditeur invalide');
    const directory = options.directoryFor(id);
    editorState(id);
    const manifest = options.readManifest(directory);
    const previous = normalizeComposition(manifest.editor.composition);
    const composition = normalizeComposition(value.composition);
    const zoom = zoomState(value.zoom);
    const presentation = presentationState(value.presentation);
    pruneProjectMedia(directory, previous, composition);
    manifest.editor = { schemaVersion: 3, composition, zoom, presentation };
    manifest.updatedAtUtc = new Date().toISOString();
    options.writeManifest(directory, manifest);
    return editorState(id);
  };

  return { editorState, saveEditorState };
}

module.exports = { createProjectEditorAccess };

async function openAuthoringProject(input, { editorWindow, projectStore, screenshotStore }) {
  if (!['image', 'video'].includes(input.kind)) throw new Error('Project kind must be image or video.');
  const disposition = input.disposition === undefined ? 'new-window' : input.disposition;
  if (!['new-window', 'reuse'].includes(disposition))
    throw new Error('Project disposition must be new-window or reuse.');

  if (input.kind === 'image') screenshotStore.read(input.projectId);
  else projectStore.get(input.projectId);
  const opened = await editorWindow.open(input.projectId, {
    disposition,
    ...(input.kind === 'image' ? { kind: 'screenshot' } : {}),
  });
  return { projectId: input.projectId, kind: input.kind, disposition, status: opened ? 'opened' : 'cancelled' };
}

module.exports = { openAuthoringProject };

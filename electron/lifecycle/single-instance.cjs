function shortcutId(commandLine) {
  const argument = (commandLine || []).find((value) => value.startsWith('--beam-shortcut='));
  if (!argument) return null;
  try {
    const id = decodeURIComponent(argument.slice('--beam-shortcut='.length));
    return id || null;
  } catch {
    return null;
  }
}

function initializeSingleInstance({ app, initialize, restoreHud, handleShortcut = null, handleProject = null, commandLine = process.argv }) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', (_event, commandLine) => {
    if (handleProject && handleProject(commandLine)) return;
    const id = shortcutId(commandLine);
    if (id && handleShortcut && handleShortcut(id)) return;
    restoreHud();
  });
  initialize();
  if (handleProject && handleProject(commandLine)) return true;
  const id = shortcutId(commandLine);
  if (id && handleShortcut) handleShortcut(id);
  return true;
}

module.exports = { initializeSingleInstance, shortcutId };

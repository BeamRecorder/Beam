function registerCommunityLinks({ ipcMain, shell }) {
  ipcMain.handle('community:open-discord', () => shell.openExternal('https://discord.gg/PcKC8AbaaA'));
  ipcMain.handle('community:open-github', () => shell.openExternal('https://github.com/BeamRecorder/Beam'));
}

module.exports = { registerCommunityLinks };

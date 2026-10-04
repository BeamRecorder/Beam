function registerCommunityLinks({ ipcMain, shell, fetchImpl = globalThis.fetch }) {
  ipcMain.handle('community:open-discord', () => shell.openExternal('https://discord.gg/PcKC8AbaaA'));
  ipcMain.handle('community:open-github', () => shell.openExternal('https://github.com/BeamRecorder/Beam'));
  ipcMain.handle('community:get-github-stars', async () => {
    try {
      const response = await fetchImpl('https://api.github.com/repos/BeamRecorder/Beam', {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { stars: 0 };
      const data = await response.json();
      const stars = data?.stargazers_count;
      return { stars: Number.isSafeInteger(stars) && stars >= 0 ? stars : 0 };
    } catch {
      return { stars: 0 };
    }
  });
}

module.exports = { registerCommunityLinks };

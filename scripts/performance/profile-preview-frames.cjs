// Complete repeated frames at fixed scene times, independent of hidden-window RAF throttling.
module.exports = async (editor) =>
  editor.webContents.executeJavaScript(`(async () => {
  const probe = window.__beamPreview;
  await probe.player.setPlaying(false);
  probe.player.volume.value = 0;
  const percentile = (values, q) => [...values].sort((a,b) => a-b)[Math.floor(values.length*q)];
  const summarize = values => ({ median:percentile(values,.5), p95:percentile(values,.95) });
  const results = [];
  for (const time of [0, .75, 1.5, 4]) {
    await probe.player.seek(time);
    await new Promise(requestAnimationFrame);
    const values = Object.fromEntries(['all', 'visible'].map(mode => [mode, {submitted:[],completed:[]}]));
    for (let i = 0; i < 12; i++) {
      for (const mode of i % 2 ? ['visible','all'] : ['all','visible']) {
        window.__beamBypassShapeCulling = mode === 'all';
        const start = performance.now();
        const data = window.__beamCanvasQuality();
        const duration = performance.now() - start;
        if (i >= 2) {
          values[mode].submitted.push(window.__beamPreviewDraws.at(-1));
          values[mode].completed.push(duration);
        }
        if (!data.width || !data.height) throw new Error('Missing completed preview frame.');
      }
    }
    results.push({ time, samples:10, modes:Object.fromEntries(Object.entries(values).map(([mode,v]) =>
      [mode,{submission:summarize(v.submitted),completed:summarize(v.completed)}])) });
  }
  delete window.__beamBypassShapeCulling;
  return { results, excludes:'Decode, Vue updates and onscreen presentation; readback completes actual frame pixels.' };
})()`);

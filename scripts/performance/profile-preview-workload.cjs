// Loaded by profile-editor after first preview; drives the real engine and Vue canvas.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const clockTicks =
  process.platform === 'linux' ? Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim()) : null;
const rendererCpuMs = (editor) => {
  if (process.platform !== 'linux') return null;
  const fields = fs.readFileSync(`/proc/${editor.webContents.getOSProcessId()}/stat`, 'utf8').split(') ')[1].split(' ');
  return (Number(fields[11]) + Number(fields[12])) * (1000 / clockTicks);
};

module.exports = async (editor, result) => {
  const playbackMs = Number(process.env.BEAM_PREVIEW_PROFILE_PLAYBACK_MS || 6000);
  if (!Number.isSafeInteger(playbackMs) || playbackMs < 1000 || playbackMs > 60000)
    throw new Error('Playback profiling must last between 1000 and 60000 milliseconds.');
  const profileRoot = process.env.BEAM_PREVIEW_PROFILE_CPU;
  const run = async (name, expression) => {
    if (profileRoot) {
      await editor.webContents.debugger.sendCommand('Profiler.start');
    }
    const before = process.cpuUsage();
    const rendererBefore = rendererCpuMs(editor);
    const startedAt = performance.now();
    const phase = await editor.webContents.executeJavaScript(`(async () => {
      const probe = window.__beamPreview;
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const percentile = (values, fraction) => {
        const sorted = [...values].sort((a,b) => a-b);
        return sorted[Math.min(sorted.length-1, Math.floor(sorted.length * fraction))] ?? null;
      };
      const gaps = []; let last = performance.now(); let active = true;
      const sample = time => { gaps.push(time-last); last = time; if(active) requestAnimationFrame(sample); };
      window.__beamPreviewDraws = [];
      probe.player.resetEngineMetrics?.();
      const frameStart = probe.player.frameVersion.value;
      const longTaskStart = window.__beamProfileLongTasks.length;
      requestAnimationFrame(sample);
      const data = await (${expression})();
      active = false;
      const draws = window.__beamPreviewDraws;
      const longTasks = window.__beamProfileLongTasks.slice(longTaskStart);
      return JSON.parse(JSON.stringify({ ...data, frames: probe.player.frameVersion.value - frameStart,
        draws: draws.length, drawMs: { median:percentile(draws,.5), p95:percentile(draws,.95), total:draws.reduce((a,b)=>a+b,0) },
        rafMs: { median:percentile(gaps,.5), p95:percentile(gaps,.95), max:Math.max(0,...gaps) },
        longTasks, playbackError:probe.player.playbackError.value,
        playbackMetrics:probe.player.playbackMetrics.value, audioMetrics:probe.player.audioMetrics.value,
        engineMetrics:probe.player.engineMetrics?.() }));
    })()`);
    result.phases ??= {};
    const rendererAfter = rendererCpuMs(editor);
    result.phases[name] = {
      ...phase,
      wallMs: performance.now() - startedAt,
      mainCpu: process.cpuUsage(before),
      rendererCpuMs: rendererAfter === null ? null : rendererAfter - rendererBefore,
    };
    if (process.env.BEAM_EDITOR_PROFILE_OUTPUT)
      fs.writeFileSync(process.env.BEAM_EDITOR_PROFILE_OUTPUT, JSON.stringify(result, null, 2));
    if (profileRoot) {
      const cpu = await editor.webContents.debugger.sendCommand('Profiler.stop');
      fs.writeFileSync(path.join(profileRoot, `${name}.cpuprofile`), JSON.stringify(cpu.profile));
    }
  };
  if (profileRoot) {
    fs.mkdirSync(profileRoot, { recursive: true });
    const initial = await editor.webContents.debugger.sendCommand('Profiler.stop');
    fs.writeFileSync(path.join(profileRoot, 'loading.cpuprofile'), JSON.stringify(initial.profile));
  }
  await editor.webContents.executeJavaScript('window.__beamPreview.player.volume.value = 0');
  if (process.env.BEAM_PREVIEW_FRAME_PROFILE) {
    result.previewFrames = await require('./profile-preview-frames.cjs')(editor);
    return;
  }
  if (process.env.BEAM_TIMELINE_SCROLL_QUALITY) {
    result.timelineScroll = await require('./profile-timeline-scroll-quality.cjs')(editor);
    return;
  }
  if (process.env.BEAM_GPU_BLUR_COMPARISON) {
    result.gpuBlur = await require('./profile-gpu-blur-comparison.cjs')(editor);
    return;
  }
  if (process.env.BEAM_SHAPE_BATCH_PROFILE) {
    result.shapeBatching = await require('./profile-shape-batching.cjs')(editor);
    return;
  }
  if (process.env.BEAM_GPU_SCENE_PROFILE) {
    result.gpuScene = await require('./profile-gpu-scene.cjs')(editor);
    return;
  }
  if (process.env.BEAM_MEDIA_QUALITY_PROFILE || process.env.BEAM_BLUR_QUALITY_PROFILE) {
    if (process.env.BEAM_MEDIA_QUALITY_PROFILE)
      result.mediaQuality = await require('./profile-media-quality.cjs')(editor);
    if (process.env.BEAM_BLUR_QUALITY_PROFILE) result.blurQuality = await require('./profile-blur-quality.cjs')(editor);
    return;
  }
  if (process.env.BEAM_GPU_RENDER_PROFILE) {
    result.gpuRendering = await require('./profile-gpu-rendering.cjs')(editor);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
  result.shapeThumbnailRenders = await editor.webContents.executeJavaScript('window.__beamShapeRenders || 0');
  result.timelineDom = await editor.webContents
    .executeJavaScript(`({ rows:document.querySelectorAll('.track-row').length,
    clips:document.querySelectorAll('[data-timeline-clip-id], [data-timeline-zoom-id]').length })`);
  if (process.env.BEAM_EXPORT_PROFILE_DEST)
    await editor.webContents.executeJavaScript(
      'window.__beamExportSnapshot = window.__beamPreview.createExportSnapshot()',
    );
  if (process.env.BEAM_EXPORT_PROFILE_SECONDS) {
    const seconds = Number(process.env.BEAM_EXPORT_PROFILE_SECONDS);
    if (!process.env.BEAM_EXPORT_PROFILE_DEST || !Number.isFinite(seconds) || seconds <= 0 || seconds > 60)
      throw new Error('Excerpt profiling requires an export destination and a duration in (0, 60].');
    result.exportExcerptSeconds = await editor.webContents.executeJavaScript(`
      window.__beamExportSnapshot.duration = Math.min(window.__beamExportSnapshot.duration, ${seconds})
    `);
  }
  if (!process.env.BEAM_TIMELINE_PROFILE_ONLY) {
    await run(
      'playback',
      `async () => {
    await probe.player.seek(0);
    await probe.player.setPlaying(true);
    await sleep(${playbackMs});
    await probe.player.setPlaying(false);
    return { time:probe.player.currentTime.value };
  }`,
    );
    if (!process.env.BEAM_PREVIEW_PROFILE_PLAYBACK_ONLY) {
      await run(
        'seeking',
        `async () => {
    const latencies = []; const failures = [];
    for(let i=0;i<40;i++) {
      const time = ((i*17)%40)/40 * Math.min(8, probe.player.duration.value);
      const started = performance.now();
      try { await probe.player.seek(time); await new Promise(requestAnimationFrame); }
      catch(error) { failures.push(String(error)); }
      latencies.push(performance.now()-started);
    }
    return { seekMs: { median:percentile(latencies,.5), p95:percentile(latencies,.95), total:latencies.reduce((a,b)=>a+b,0) }, failures };
  }`,
      );
      await run(
        'scrubbing',
        `async () => {
    const pending = [];
    for(let i=0;i<120;i++) {
      pending.push(probe.player.seek(((i*17)%120)/120 * Math.min(8,probe.player.duration.value), 'scrub').catch(String));
      await sleep(1000/60);
    }
    const results = await Promise.all(pending);
    await probe.player.seek(4);
    return { requests:120, results };
  }`,
      );
    }
  }
  if (process.env.BEAM_TIMELINE_PROFILE_WORKLOAD) {
    await require('./profile-timeline-workload.cjs')(run, editor);
  }
  if (process.env.BEAM_EXPORT_PROFILE_DEST) {
    await run(
      'export',
      `async () => {
      await probe.player.setPlaying(false);
      const output = await probe.exportVideo(window.__beamExportSnapshot);
      return { export:output };
    }`,
    );
  }
};

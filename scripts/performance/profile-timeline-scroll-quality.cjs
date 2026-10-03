// Actual two-axis scroll, zoom badges and audio placement in an isolated editor.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

module.exports = async (editor) => {
  const output = process.env.BEAM_TIMELINE_SCROLL_QUALITY;
  if (!output || !path.isAbsolute(output) || !output.startsWith(os.tmpdir() + path.sep) || fs.existsSync(output))
    throw new Error('Scroll quality requires a fresh temporary screenshot directory.');
  fs.mkdirSync(output);
  await editor.webContents.executeJavaScript(`(async () => {
    await window.__beamPreview.player.setPlaying(false);
    document.documentElement.classList.add('dark');
    for(let i=0;i<24;i++) {
      document.querySelector('.timeline-root').dispatchEvent(new WheelEvent('wheel',
        {ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true}));
      await new Promise(requestAnimationFrame);
    }
    await new Promise(resolve=>setTimeout(resolve,300));
  })()`);
  const samples = [];
  for (const section of ['top', 'bottom', 'zoom']) {
    for (const left of [0, 40, 240, 480, 720, 480, 240, 0]) {
      const sample = await editor.webContents.executeJavaScript(`(async () => {
        const el=document.querySelector('.timeline-tracks-container');
        el.scrollTop=${section === 'bottom' ? 'el.scrollHeight-el.clientHeight' : section === 'zoom' ? 'Math.max(0,el.scrollHeight-el.clientHeight-100)' : '0'};
        el.scrollLeft=${left}; el.dispatchEvent(new Event('scroll'));
        await new Promise(requestAnimationFrame);
        const pending=[...el.querySelectorAll('.timeline-canvas-lane')].map(canvas=>({left:canvas.style.left,width:canvas.style.width}));
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        if(${section === 'bottom' && left === 0}) {
          const deadline=performance.now()+10000;
          while(performance.now()<deadline && ![...el.querySelectorAll('.blick-waveform-current .blick-waveform-canvas')].some(c=>c.width!==300&&c.width>1))
            await new Promise(resolve=>setTimeout(resolve,100));
          await new Promise(resolve=>setTimeout(resolve,250));
        }
        const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};};
        const scroller=rect(el);
        const lanes=[...el.querySelectorAll('.timeline-canvas-lane')].map(canvas=>({
          row:canvas.closest('[data-timeline-row-id]')?.dataset.timelineRowId,
          css:rect(canvas), parent:rect(canvas.parentElement), pixels:[canvas.width,canvas.height],
          uncoveredLeft:Math.max(0,rect(canvas).left-Math.max(scroller.left,rect(canvas.parentElement).left)),
        }));
        const audio=[...el.querySelectorAll('.audio-track [data-timeline-clip-id]')].map(clip=>({
          id:clip.dataset.timelineClipId,clip:rect(clip),waveform:rect(clip.querySelector('.waveform')),
          title:clip.querySelector('.audio-clip-label')?.textContent ?? null,
          foreground:clip.querySelector('.audio-clip-label') ? getComputedStyle(clip.querySelector('.audio-clip-label')).color : null,
          bitmaps:[...clip.querySelectorAll('.blick-waveform-canvas')].map(canvas=>({pixels:[canvas.width,canvas.height],css:rect(canvas)})),
          diagnostics:[...clip.querySelectorAll('.blick-waveform')].map(container=>({state:container.dataset.profileWaveform,bounds:container.dataset.profileWaveformBounds,css:rect(container)})),
        }));
        const zooms=[...el.querySelectorAll('[data-timeline-zoom-id]')].map(clip=>({
          id:clip.dataset.timelineZoomId,title:clip.querySelector('.zoom-title')?.textContent,
          foreground:getComputedStyle(clip).color,
          badges:[...clip.querySelectorAll('.zoom-meta-badge')].map(badge=>({text:badge.textContent,color:getComputedStyle(badge).color})),
        }));
        return {scroll:{left:el.scrollLeft,top:el.scrollTop,width:el.clientWidth,totalWidth:el.scrollWidth},pending,lanes,audio,zooms};
      })()`);
      samples.push({ section, requestedLeft: left, ...sample });
      if (left === 0 || left === 240) {
        const file = path.join(output, `${section}-${left}-${samples.length}.png`);
        fs.writeFileSync(file, (await editor.webContents.capturePage()).toPNG());
      }
    }
  }
  return { screenshots: output, samples };
};

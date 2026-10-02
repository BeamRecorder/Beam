// Actual renderer selection/copy/paste handlers; native clipboard text stays private to this probe.
module.exports = async (run, editor) => {
  const selectionCount = Number(process.env.BEAM_TIMELINE_PROFILE_SELECTION || 1000);
  if (!Number.isSafeInteger(selectionCount) || selectionCount < 1 || selectionCount > 10000)
    throw new Error('Timeline selection count must be between 1 and 10000.');
  const repeatCount = Number(process.env.BEAM_TIMELINE_PROFILE_REPEATS || 0);
  if (!Number.isSafeInteger(repeatCount) || repeatCount < 0 || repeatCount > 10)
    throw new Error('Paste burst count must be between 0 and 10.');
  await editor.webContents.executeJavaScript(`Object.defineProperty(navigator, 'clipboard',
    { configurable:true, value:{ writeText:async () => {} } });`);
  if (process.env.BEAM_TIMELINE_PROFILE_ONLY !== 'drag') {
    await run(
      'copy',
      `async () => {
    await probe.player.seek(0);
    const selected = probe.composition.value.clips.filter(c => c.kind === 'blur' || c.kind === 'shape').slice(0,${selectionCount});
    probe.compositionState.selectClips(selected.map(c=>c.id));
    await new Promise(requestAnimationFrame);
    const start = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { key:'c', ctrlKey:true, bubbles:true, cancelable:true }));
    const handlerMs = performance.now()-start;
    await new Promise(requestAnimationFrame);
    return { selected:selected.length, handlerMs };
  }`,
    );
    await run(
      'paste',
      `async () => {
    const before = probe.composition.value.clips.length;
    const start = performance.now();
    window.dispatchEvent(new ClipboardEvent('paste', { bubbles:true, cancelable:true }));
    const handlerMs = performance.now()-start;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return { before, after:probe.composition.value.clips.length, handlerMs,
      rows:document.querySelectorAll('.track-row').length,
      clips:document.querySelectorAll('[data-timeline-clip-id], [data-timeline-zoom-id]').length };
  }`,
    );
  }
  await run(
    'drag',
    `async () => {
    const element = [...document.querySelectorAll('[data-timeline-clip-id]')].find(el => {
      const r=el.getBoundingClientRect(); return r.width>0 && r.top>0 && r.bottom<innerHeight;
    });
    if(!element) return { skipped:'No visible clip' };
    const clip = probe.composition.value.clips.find(c=>c.id===element.dataset.timelineClipId);
    probe.compositionState.selectClips([clip.id]);
    await new Promise(requestAnimationFrame);
    const rect=element.getBoundingClientRect();
    const x=rect.left+rect.width/2, y=rect.top+rect.height/2;
    const latencies=[];
    element.dispatchEvent(new PointerEvent('pointerdown',{ bubbles:true,cancelable:true,button:0,pointerId:1,clientX:x,clientY:y }));
    for(let i=0;i<${process.env.BEAM_TIMELINE_PROFILE_ONLY === 'drag' ? 10 : 30};i++) {
      const start=performance.now();
      window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:x+((i%10)+1)*2,clientY:y}));
      await new Promise(requestAnimationFrame);
      latencies.push(performance.now()-start);
    }
    window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}));
    await new Promise(requestAnimationFrame);
    return { updates:latencies.length, frameMs:{median:percentile(latencies,.5),p95:percentile(latencies,.95)} };
  }`,
  );
  if (process.env.BEAM_TIMELINE_PROFILE_ONLY !== 'drag')
    await run(
      'scroll',
      `async () => {
    const el=document.querySelector('.timeline-tracks-container');
    const latencies=[];
    let maximumRows=0, maximumClips=0;
    for(let i=0;i<20;i++) {
      const start=performance.now();
      el.scrollTop=((i*7)%20)/19*(el.scrollHeight-el.clientHeight);
      el.dispatchEvent(new Event('scroll'));
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      latencies.push(performance.now()-start);
      maximumRows=Math.max(maximumRows,document.querySelectorAll('.track-row').length);
      maximumClips=Math.max(maximumClips,document.querySelectorAll('[data-timeline-clip-id], [data-timeline-zoom-id]').length);
    }
    el.scrollTop=0; el.dispatchEvent(new Event('scroll'));
    return { updates:20, maximumRows, maximumClips, frameMs:{median:percentile(latencies,.5),p95:percentile(latencies,.95)} };
  }`,
    );
  if (process.env.BEAM_TIMELINE_PROFILE_ONLY !== 'drag')
    await run(
      'scrollHorizontal',
      `async () => {
    const el=document.querySelector('.timeline-tracks-container'),root=document.querySelector('.timeline-root');
    for(let i=0;i<24;i++) {
      root.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true}));
      await new Promise(requestAnimationFrame);
    }
    await sleep(180);
    const latencies=[];let maximumRows=0,maximumClips=0;
    for(let i=0;i<20;i++) {
      const start=performance.now();
      el.scrollLeft=((i*7)%20)/19*(el.scrollWidth-el.clientWidth);
      el.scrollTop=((i*11)%20)/19*(el.scrollHeight-el.clientHeight);
      el.dispatchEvent(new Event('scroll'));
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      latencies.push(performance.now()-start);
      maximumRows=Math.max(maximumRows,document.querySelectorAll('.track-row').length);
      maximumClips=Math.max(maximumClips,document.querySelectorAll('[data-timeline-clip-id], [data-timeline-zoom-id]').length);
    }
    const totalWidth=el.scrollWidth;
    el.scrollLeft=el.scrollTop=0;el.dispatchEvent(new Event('scroll'));
    for(let i=0;i<24;i++) {
      root.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:100,bubbles:true,cancelable:true}));
      await new Promise(requestAnimationFrame);
    }
    await sleep(180);
    return { updates:20,totalWidth,maximumRows,maximumClips,frameMs:{median:percentile(latencies,.5),p95:percentile(latencies,.95)} };
  }`,
    );
  if (repeatCount)
    await run(
      'pasteBurst',
      `async () => {
    const before=probe.composition.value.clips.length, handlers=[];
    for(let i=0;i<${repeatCount};i++) {
      const start=performance.now();
      window.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true}));
      handlers.push(performance.now()-start);
      await new Promise(requestAnimationFrame);
    }
    await new Promise(requestAnimationFrame);
    return { repeats:${repeatCount},before,after:probe.composition.value.clips.length,handlerMs:handlers };
  }`,
    );
};

// Native Canvas2D workloads with real decoded video pixels. Readback fences deferred rendering.
module.exports = async (editor) =>
  editor.webContents.executeJavaScript(`(async () => {
  const probe = window.__beamPreview;
  const drawMedia = window.__beamDecoratedMedia;
  const drawShape = window.__beamShapeClip;
  const blur = window.__beamBlurEffect;
  if (!drawMedia || !drawShape || !blur) throw new Error('Missing temporary rendering probes.');
  await probe.player.setPlaying(false);
  const composition = probe.composition.value;
  const video = composition.clips.find(clip => clip.kind === 'video');
  const shape = composition.clips.find(clip => clip.kind === 'shape');
  const effect = composition.clips.find(clip => clip.kind === 'blur' && clip.mode === 'blur');
  if (!video || !shape || !effect) throw new Error('A real video, shape and blur are required.');
  const frames = [];
  try {
    for (const offset of [.25, .5, .75, 1]) {
      await probe.player.seek(video.timelineStartMs / 1000 + offset);
      const frame = probe.player.frameFor(video.id);
      if (!frame) throw new Error('Video did not decode.');
      frames.push(await createImageBitmap(frame.bitmap));
    }
    const canvas = new OffscreenCanvas(1920, 1080);
    const ctx = canvas.getContext('2d', {willReadFrequently:false});
    const percentile = (values, fraction) => [...values].sort((a,b)=>a-b)[Math.floor(values.length*fraction)];
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
    const cases = [
      {name:'videos-solid-128', count:128, kind:'video', shadowMode:'solid'},
      {name:'videos-adaptive-128', count:128, kind:'video', shadowMode:'adaptive'},
      {name:'videos-fresh-adaptive-128', count:128, kind:'video', shadowMode:'adaptive', fresh:true},
      {name:'videos-squircle-128', count:128, kind:'video', shadowMode:'solid', mask:'squircle'},
      {name:'shapes-catalog-1000', count:1000, kind:'shape', preset:'heart'},
      {name:'shapes-native-1000', count:1000, kind:'shape', preset:'rounded-rectangle'},
      {name:'shapes-backdrop-100', count:100, kind:'shape', preset:'heart', backdrop:true},
      {name:'blurs-small-after-large-500', count:500, kind:'blur'},
    ];
    const results = [];
    for (const scene of cases) {
      const commands = Array.from({length:scene.count}, (_, index) => {
        const width = scene.kind === 'video' ? 180 : 70;
        const height = scene.kind === 'video' ? 110 : 52;
        const rect = {x:((index*137)%1750)+.375, y:((index*83)%970)+.125, width, height};
        const clip = {...shape, preset:scene.preset, family:'shape', rotation:(index%4)*15,
          opacityEnabled:!!scene.backdrop, opacity:70, backdropBlur:scene.backdrop ? 35 : 0, shadowEnabled:true, shadowBlur:12, borderWidth:2,
          transform:{x:rect.x/1920,y:rect.y/1080,width:width/1920,height:height/1080}, text:undefined};
        return {rect,clip};
      });
      const submission = [], completed = [];
      const directSubmission = [], directCompleted = [];
      let pixels;
      let freshSources = [];
      const render = frameIndex => {
        ctx.setTransform(1,0,0,1,0,0);
        ctx.fillStyle = '#20293c'; ctx.fillRect(0,0,1920,1080);
        const source = frames[frameIndex%frames.length];
        if (scene.fresh && !window.__beamBypassShadowCache && window.__beamPrepareShadows) window.__beamPrepareShadows(freshSources.map(source => ({source,fallbackColor:video.appearance.shadowColor})));
        if (scene.backdrop) ctx.drawImage(source,0,0,1920,1080);
        if (scene.kind === 'blur') {
          ctx.drawImage(source,0,0,1920,1080);
          blur(ctx,effect,{x:0,y:0,width:1700,height:960});
        }
        for (const [index,{rect,clip}] of commands.entries()) {
          if (scene.kind === 'video') drawMedia(ctx,{source:scene.fresh ? freshSources[index] : source,rect,title:'Video',mask:scene.mask,
            appearance:{...video.appearance,shadowMode:scene.shadowMode}});
          else if (scene.kind === 'shape') drawShape(ctx,clip,{x:0,y:0,width:1920,height:1080});
          else blur(ctx,effect,rect);
        }
      };
      for (let frameIndex=0; frameIndex<14; frameIndex++) {
        await new Promise(requestAnimationFrame);
        if (scene.fresh) {
          for (const frame of freshSources) frame.close();
          freshSources = await Promise.all(commands.map((_,index) => createImageBitmap(frames[(frameIndex+index)%frames.length],{resizeWidth:640,resizeHeight:360})));
        }
        // Alternate order within one native process: desktop load/temperature
        // cannot be confused with a cache speedup across distant launches.
        for (const direct of frameIndex % 2 ? [true,false] : [false,true]) {
          window.__beamBypassRasterCache = window.__beamBypassShadowCache = direct;
          const start = performance.now();
          render(frameIndex);
          const submitted = performance.now();
          const rendered = ctx.getImageData(0,0,1920,1080).data;
          const finished = performance.now();
          if (!direct) pixels = rendered;
          if (frameIndex >= 2) {
            (direct ? directSubmission : submission).push(submitted-start);
            (direct ? directCompleted : completed).push(finished-start);
          }
        }
        window.__beamBypassRasterCache = window.__beamBypassShadowCache = false;
      }
      window.__beamBypassRasterCache = true;
      window.__beamBypassShadowCache = true;
      try { render(13); } finally { window.__beamBypassRasterCache = window.__beamBypassShadowCache = false; }
      const reference = ctx.getImageData(0,0,1920,1080).data;
      let differentBytes = 0, maxChannelDelta = 0, sumSquaredDelta = 0;
      for(let i=0;i<pixels.length;i++) {
        const delta = Math.abs(pixels[i]-reference[i]);
        if(delta) differentBytes++;
        maxChannelDelta = Math.max(maxChannelDelta,delta); sumSquaredDelta += delta*delta;
      }
      results.push({...scene, frames:12, submissionMs:{median:percentile(submission,.5),p95:percentile(submission,.95)},
        completedWithReadbackMs:{median:percentile(completed,.5),p95:percentile(completed,.95)},
        pairedDirectMediaControl:{submissionMs:{median:percentile(directSubmission,.5),p95:percentile(directSubmission,.95)},
          completedWithReadbackMs:{median:percentile(directCompleted,.5),p95:percentile(directCompleted,.95)},
          bypassed:'adaptive color memo/batching and geometric media shadow rasters only; shape/blur code unchanged'},
        hash:await hash(pixels), referenceHash:await hash(reference),
        difference:{differentBytes,maxChannelDelta,meanSquaredDelta:sumSquaredDelta/pixels.length}});
      for (const frame of freshSources) frame.close();
    }
    return {canvas:{width:1920,height:1080}, decodedSources:frames.length,
      method:'12 frames after 2 warmups; synchronous RGBA readback included, not pure GPU timestamp', cases:results};
  } finally { for (const frame of frames) frame.close(); }
})()`);

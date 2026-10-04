// Same decoded video pixels and ordered commands; submission and fenced completion are separate.
module.exports = async (editor) =>
  editor.webContents.executeJavaScript(`(async () => {
  const probe=window.__beamPreview, Renderer=window.__beamGpuScene, Metrics=window.__beamEngineMetrics;
  const video=probe.composition.value.clips.find(c=>c.kind==='video');
  if(!video || !Renderer) throw new Error('GPU scene profiling requires a real video.');
  await probe.player.setPlaying(false);
  const frames=[], metrics=new Metrics({enabled:true}), gpu=new Renderer({metrics});
  const canvas=new OffscreenCanvas(1920,1080),ctx=canvas.getContext('2d');
  const percentile=(v,q)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*q))];
  const difference=(a,b)=>{let total=0,max=0,n=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;max=Math.max(max,d);if(d)n++;}return {differentBytes:n,maxChannelDelta:max,meanAbsoluteDelta:total/a.length};};
  try {
    for(const t of [.25,.5,.75,1]) {
      await probe.player.seek(video.timelineStartMs/1000+t);
      frames.push(await createImageBitmap(probe.player.frameFor(video.id).bitmap,{resizeWidth:180,resizeHeight:110,resizeQuality:'high',premultiplyAlpha:'none'}));
    }
    const results=[];
    for(const workload of [{name:'retained-videos-128',videos:128,solids:0,blurs:0},{name:'solids-10000',videos:0,solids:10000,blurs:0},{name:'mixed-videos-shapes-effects',videos:64,solids:128,blurs:64}]) {
      const commands=[{kind:'solid',rect:{x:0,y:0,width:1920,height:1080},color:[.1,.15,.2,1]}];
      for(let i=0;i<workload.videos;i++) commands.push({kind:'image',source:frames[i%4],width:180,height:110,immutable:true,rect:{x:(i*137)%1740,y:(i*83)%970,width:180,height:110}});
      for(let i=0;i<workload.solids;i++) commands.push({kind:'solid',rect:{x:(i*137)%1850,y:(i*83)%1028,width:70,height:52},color:[.8,.2,.4,1]});
      for(let i=0;i<workload.blurs;i++) commands.push({kind:'blur',rect:{x:(i*137)%1850,y:(i*83)%1028,width:70,height:52},radius:4});
      const native=()=>{
        ctx.clearRect(0,0,1920,1080);
        for(const c of commands) {
          if(c.kind==='image')ctx.drawImage(c.source,c.rect.x,c.rect.y,c.rect.width,c.rect.height);
          else if(c.kind==='solid'){ctx.fillStyle='rgba('+c.color.slice(0,3).map(v=>Math.round(v*255)).join(',')+','+c.color[3]+')';ctx.fillRect(c.rect.x,c.rect.y,c.rect.width,c.rect.height);}
          else {ctx.save();ctx.beginPath();ctx.rect(c.rect.x,c.rect.y,c.rect.width,c.rect.height);ctx.clip();ctx.filter='blur('+c.radius+'px)';ctx.drawImage(canvas,0,0);ctx.restore();}
        }
      };
      const accelerated=()=>{ctx.clearRect(0,0,1920,1080);ctx.drawImage(gpu.render(commands,1920,1080),0,0);};
      const submission={native:[],gpu:[]},completed={native:[],gpu:[]};
      let pixels={};
      metrics.reset();
      for(let iteration=0;iteration<14;iteration++) {
        for(const key of iteration%2?['gpu','native']:['native','gpu']) {
          const start=performance.now(); (key==='gpu'?accelerated:native)();
          const submitted=performance.now(),data=ctx.getImageData(0,0,1920,1080).data,end=performance.now();
          if(iteration>=2){submission[key].push(submitted-start);completed[key].push(end-start);}
          if(iteration===13)pixels[key]=data;
          await new Promise(requestAnimationFrame);gpu.pollMetrics();
        }
      }
      const summarize=v=>({median:percentile(v,.5),p95:percentile(v,.95)});
      results.push({name:workload.name,commands:commands.length,samples:12,submission:{native:summarize(submission.native),gpu:summarize(submission.gpu)},completed:{native:summarize(completed.native),gpu:summarize(completed.gpu)},quality:difference(pixels.native,pixels.gpu),metrics:metrics.snapshot(),resources:gpu.stats()});
    }
    return {results,blurAlgorithm:'five-tap separable GPU prototype; not equivalent to native Canvas blur',sources:'four real decoded video bitmaps resized once outside timings; aliases are not independent decoders'};
  } finally {gpu.dispose();for(const f of frames)f.close();}
})()`);

// Exercise the shipped native/GPU ordering bridge, not an isolated substitute painter.
module.exports = async (editor) =>
  editor.webContents.executeJavaScript(`(async () => {
  const probe=window.__beamPreview, draw=window.__beamShapeClip, ordered=window.__beamOrderedShapes;
  await probe.player.setPlaying(false);
  const template=probe.composition.value.clips.find(c=>c.kind==='shape');
  if(!template || !ordered)throw new Error('Shape profile requires the product shape painters.');
  const video=probe.composition.value.clips.find(c=>c.kind==='video');
  await probe.player.seek(video.timelineStartMs/1000+.75);
  const source=await createImageBitmap(probe.player.frameFor(video.id).bitmap);
  const canvas=new OffscreenCanvas(1920,1080),ctx=canvas.getContext('2d'),viewport={x:0,y:0,width:1920,height:1080};
  const difference=(a,b)=>{let bytes=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)bytes++;max=Math.max(max,d);}return {differentBytes:bytes,maxChannelDelta:max};};
  const percentile=(a,q)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))];
  const summarize=a=>({median:percentile(a,.5),p95:percentile(a,.95)}),results=[];
  try {
    for(const mode of ['filled-10000','outlined-10000','fractional-10000','mixed-ordering-8192']) {
      const count=mode==='mixed-ordering-8192'?8192:10000;
      const clips=Array.from({length:count},(_,i)=>({...template,id:'profile-'+i,preset:'rectangle',family:'shape',rotation:0,text:undefined,transitions:undefined,
        shadowEnabled:false,opacityEnabled:false,fillEnabled:mode!=='outlined-10000',fill:undefined,fillColor:'#ce3a65',borderColor:'#ffc24a',borderWidth:mode==='outlined-10000'?8:0,
        transform:{x:(48+(i*138)%1780)/1920,y:(48+(i*84)%930)/1080,width:48/1920,height:32/1080}}));
      const render=gpu=>{
        ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1920,1080);
        ctx.fillStyle='#102638';ctx.fillRect(0,0,1920,1080);
        if(mode==='fractional-10000')ctx.translate(.25,.75);
        const paint=(clip,i,batch)=>{
          if(mode==='mixed-ordering-8192' && i===4096){
            batch?.flush();ctx.drawImage(source,200,150,1200,600);
            ctx.save();ctx.beginPath();ctx.rect(130,200,500,300);ctx.clip();ctx.filter='blur(4px)';ctx.drawImage(canvas,0,0);ctx.restore();
          }
          const native=()=>draw(ctx,clip,viewport);
          if(!batch?.tryShape(clip,viewport,native)) {batch?.flush();native();}
        };
        if(gpu)ordered.render(ctx,batch=>clips.forEach((clip,i)=>paint(clip,i,batch)));
        else clips.forEach((clip,i)=>paint(clip,i));
      };
      const submit={native:[],gpu:[]},completed={native:[],gpu:[]};let pixels={};
      probe.player.resetEngineMetrics();
      for(let i=0;i<14;i++)for(const key of i%2?['gpu','native']:['native','gpu']) {
        const start=performance.now();render(key==='gpu');const sent=performance.now();
        const data=ctx.getImageData(0,0,1920,1080).data,end=performance.now();
        if(i>=2){submit[key].push(sent-start);completed[key].push(end-start);}
        if(i===13)pixels[key]=data;
        await new Promise(requestAnimationFrame);
      }
      const metrics=probe.player.engineMetrics();
      if((mode==='filled-10000'||mode==='outlined-10000') && !metrics.stages['gpu-submit'])throw new Error('No GPU work admitted for '+mode);
      results.push({name:mode,samples:12,submission:{native:summarize(submit.native),gpu:summarize(submit.gpu)},completed:{native:summarize(completed.native),gpu:summarize(completed.gpu)},quality:difference(pixels.native,pixels.gpu),metrics});
    }
    return {results};
  } finally {ordered.dispose(ctx);source.close();}
})()`);

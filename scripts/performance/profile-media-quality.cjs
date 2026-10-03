// Compare optimized raster/sampling paths with direct native paints in the same Chromium process.
module.exports = async (editor) =>
  editor.webContents.executeJavaScript(`(async () => {
  const probe=window.__beamPreview, draw=window.__beamDecoratedMedia;
  await probe.player.setPlaying(false);
  const video=probe.composition.value.clips.find(c=>c.kind==='video');
  await probe.player.seek(video.timelineStartMs/1000+.75);
  const source=await createImageBitmap(probe.player.frameFor(video.id).bitmap);
  try {
    const canvas=new OffscreenCanvas(640,360),ctx=canvas.getContext('2d',{willReadFrequently:false});
    const results=[];
    const appearances=[['rounded',{}],['circle',{mask:'circle'}],['squircle',{mask:'squircle'}],
      ['directional',{appearance:{shadowDirection:'bottom-right',shadowColor:'#bc2468'}}],
      ['adaptive',{appearance:{shadowMode:'adaptive'}}],['safari',{appearance:{frame:'safari'}}],
      ['windows',{appearance:{frame:'windows-95'}}],['phone',{appearance:{frame:'iphone-16-max'}}]];
    const matrices=[[1,0,0,1,0,0],[.75,0,0,.75,17.3,21.7],[1.4,0,0,1.4,-50.25,-32.75],
      [Math.cos(.2),Math.sin(.2),-Math.sin(.2),Math.cos(.2),35,8],[-1,0,0,1,600,0]];
    for(const [name,patch] of appearances) for(const [index,matrix] of matrices.entries()) {
      const render=direct=>{
        window.__beamBypassRasterCache=window.__beamBypassShadowCache=direct;
        ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,640,360);
        const gradient=ctx.createLinearGradient(0,0,640,360);
        gradient.addColorStop(0,'#1038dd');gradient.addColorStop(.5,'#f6bd29');gradient.addColorStop(1,'#e80c7a');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,640,360);ctx.setTransform(...matrix);
        const appearance={...video.appearance,...patch.appearance};
        const options={source,rect:{x:82.375,y:63.125,width:210,height:130},title:'Video',
          sourceRect:{x:20,y:25,width:1300,height:700},appearance,mask:patch.mask,mirrored:true};
        if(!direct && appearance.shadowMode==='adaptive') window.__beamPrepareShadows([{source,sourceRect:options.sourceRect,fallbackColor:appearance.shadowColor}]);
        draw(ctx,options);draw(ctx,{...options,rect:{...options.rect,x:options.rect.x+120,y:options.rect.y+20}});
        return ctx.getImageData(0,0,640,360).data;
      };
      render(false); // Warm admission even when the two overlapping rasters have different phases.
      const optimized=render(false),direct=render(true);
      let differentBytes=0,maxChannelDelta=0;
      for(let i=0;i<direct.length;i++) {const d=Math.abs(direct[i]-optimized[i]);if(d) differentBytes++;maxChannelDelta=Math.max(maxChannelDelta,d);}
      results.push({name,matrix:index,differentBytes,maxChannelDelta});
    }
    const preview=[],captures=[];
    const png=async pixels=>{
      const canvas=new OffscreenCanvas(pixels.width,pixels.height);
      canvas.getContext('2d').putImageData(pixels,0,0);
      const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
      let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return btoa(binary);
    };
    const difference=(a,b)=>{
      let differentBytes=0,maxChannelDelta=0;
      for(let i=0;i<a.data.length;i++) {const d=Math.abs(a.data[i]-b.data[i]);if(d) differentBytes++;maxChannelDelta=Math.max(maxChannelDelta,d);}
      return {differentBytes,maxChannelDelta};
    };
    for (const time of [0,.6,1.7,2.396,3.75,5.6,7.2,11,14.2]) {
      await probe.player.seek(time);
      await new Promise(resolve=>setTimeout(resolve,500));
      window.__beamBypassRasterCache=window.__beamBypassShadowCache=false;
      window.__beamCanvasQuality();
      const now=performance.now.bind(performance),fixedNow=now();
      performance.now=()=>fixedNow;
      try {
        const optimized=window.__beamCanvasQuality(),optimizedAgain=window.__beamCanvasQuality();
        window.__beamBypassRasterCache=window.__beamBypassShadowCache=true;
        const direct=window.__beamCanvasQuality(),directAgain=window.__beamCanvasQuality();
        preview.push({time,width:direct.width,height:direct.height,...difference(optimized,direct),
          optimizedRepeat:difference(optimized,optimizedAgain),directRepeat:difference(direct,directAgain)});
        if(time===11)captures.push({time,optimized:await png(optimized),direct:await png(direct)});
      } finally {performance.now=now;}
    }
    return {media:results,preview,captures};
  } finally {source.close();window.__beamBypassRasterCache=window.__beamBypassShadowCache=false;}
})()`);

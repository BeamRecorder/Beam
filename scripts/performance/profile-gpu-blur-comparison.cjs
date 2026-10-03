// Frozen native source is an oracle, never a product fallback. Includes completed-pixel fences.
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');

module.exports = async (editor) => {
  const source = process.env.BEAM_BLUR_ORACLE_SOURCE;
  if (
    !source ||
    !path.isAbsolute(source) ||
    !fs.existsSync(path.join(source, 'components/video-editor/composition/effects/blur-effect.ts'))
  )
    throw new Error('Provide the frozen native source directory for Gaussian quality comparison.');
  const oracle = buildSync({
    entryPoints: [path.join(source, 'components/video-editor/composition/effects/blur-effect.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'nativeBlurOracle',
    platform: 'browser',
    alias: { '~': source },
    logLevel: 'silent',
  }).outputFiles[0].text;
  return editor.webContents.executeJavaScript(`${oracle}\n(async () => {
    const apply=window.__beamBlurEffect;
    if(!apply) throw new Error('Missing temporary GPU effect probe.');
    const results=[], percentile=(v,q)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*q))];
    const clip={id:'gpu-blur-quality',kind:'blur',shape:'rectangle',mode:'blur',strength:30,feather:14,cornerRadius:24,tintOpacity:25,color:'#8a93b5',highlightColor:'#ffc851'};
    const cases=[
      ['gaussian-low',{strength:2,feather:0},{x:74,y:67,width:180,height:115}],
      ['gaussian-medium',{}, {x:74,y:67,width:180,height:115}],
      ['gaussian-48',{strength:100,feather:0},{x:74,y:67,width:180,height:115}],
      ['tiny-48',{strength:100,feather:50},{x:312,y:190,width:3,height:2}],
      ['frosted',{mode:'frosted',shape:'circle'},{x:240,y:160,width:166,height:115}],
      ['edge',{strength:67,feather:37},{x:-14,y:4,width:150,height:80}],
      ['pixelated',{mode:'pixelated',strength:82},{x:310,y:215,width:210,height:130}],
      ['pixelated-edge',{mode:'pixelated',strength:100,feather:0},{x:-20,y:-10,width:150,height:100}],
      ['gaussian-alpha',{strength:67,backgroundAlpha:.4},{x:74,y:67,width:180,height:115}],
      ['opaque',{mode:'opaque',shape:'square',feather:0},{x:60,y:265,width:112,height:92}],
      ['highlight',{mode:'highlight',strength:64,feather:0},{x:140,y:85,width:160,height:120}],
      ['highlight-alpha',{mode:'highlight',strength:64,feather:0,contextAlpha:.4},{x:140,y:85,width:160,height:120}],
      ['highlight-multiply',{mode:'highlight',strength:64,feather:0,contextAlpha:.4,contextBlend:'multiply'},{x:140,y:85,width:160,height:120}],
      ['highlight-screen',{mode:'highlight',strength:64,feather:0,contextAlpha:.4,contextBlend:'screen'},{x:140,y:85,width:160,height:120}],
      ['highlight-feather',{mode:'highlight',strength:64,feather:70},{x:140,y:85,width:160,height:120}],
      ['custom-mask',{}, {x:120,y:100,width:140,height:110}],
    ];
    for(const scale of [1,.75,1.4]) for(const [name,overrides,rect] of cases) {
      const nativeCanvas=new OffscreenCanvas(640,360),gpuCanvas=new OffscreenCanvas(640,360);
      const contexts={native:nativeCanvas.getContext('2d'),gpu:gpuCanvas.getContext('2d')};
      const background=ctx=>{
        ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,640,360);
        const g=ctx.createLinearGradient(0,0,640,360);g.addColorStop(0,'#f04652');g.addColorStop(.5,'#32cb84');g.addColorStop(1,'#202ec8');
        ctx.globalAlpha=overrides.backgroundAlpha??1;ctx.fillStyle=g;ctx.fillRect(0,0,640,360);
        for(let y=0;y<360;y+=17)for(let x=0;x<640;x+=23){ctx.fillStyle=(x+y)%3?'#ffffff8f':'#070b16';ctx.fillRect(x,y,11,8);}
        ctx.setTransform(scale,0,0,scale,0,0);
        ctx.globalAlpha=overrides.contextAlpha??1;ctx.globalCompositeOperation=overrides.contextBlend??'source-over';
      };
      const options=name==='custom-mask'?{bounds:{x:100,y:80,width:180,height:150},maskPath:(m,r)=>{m.beginPath();m.moveTo(r.x,r.y);m.lineTo(r.x+r.width,r.y+r.height);m.lineTo(r.x,r.y+r.height);m.closePath();}}:{};
      const submission={native:[],gpu:[]},completed={native:[],gpu:[]};let pixels={};
      for(let i=0;i<14;i++) {
        for(const key of i%2?['gpu','native']:['native','gpu']){
          const ctx=contexts[key];background(ctx);ctx.getImageData(0,0,1,1);
          const start=performance.now();(key==='gpu'?apply:nativeBlurOracle.applyBlurEffect)(ctx,{...clip,...overrides},rect,options);
          (key==='gpu'?apply:nativeBlurOracle.applyBlurEffect)(ctx,{...clip,...overrides},rect,options);
          const submitted=performance.now(),data=ctx.getImageData(0,0,640,360).data,end=performance.now();
          if(i>=2){submission[key].push(submitted-start);completed[key].push(end-start);}if(i===13)pixels[key]=data;
          await new Promise(requestAnimationFrame);
        }
      }
      let total=0,max=0,changed=0,over8=0;for(let i=0;i<pixels.native.length;i++){const d=Math.abs(pixels.native[i]-pixels.gpu[i]);total+=d;max=Math.max(max,d);if(d)changed++;if(d>8)over8++;}
      const summarize=v=>({median:percentile(v,.5),p95:percentile(v,.95)});
      results.push({name,scale,samples:12,submission:{native:summarize(submission.native),gpu:summarize(submission.gpu)},completed:{native:summarize(completed.native),gpu:summarize(completed.gpu)},quality:{maxChannelDelta:max,meanAbsoluteDelta:total/pixels.native.length,differentBytes:changed,over8Bytes:over8}});
      nativeBlurOracle.disposeBlurEffect(contexts.native);
      window.__beamDisposeBlurEffect(contexts.gpu);
    }
    const groups=[];
    for(const count of [16,64]) {
      const surfaces={native:new OffscreenCanvas(1920,1080),gpu:new OffscreenCanvas(1920,1080)},contexts={};
      for(const key of ['native','gpu'])contexts[key]=surfaces[key].getContext('2d');
      const effects=Array.from({length:count},(_,i)=>({clip:{...clip,strength:18,feather:8,cornerRadius:20},rect:{x:360+(i*137)%1000,y:240+(i*83)%480,width:160,height:110}}));
      const regions=effects.map(item=>window.__beamPlanGpuEffect(contexts.gpu,item.clip,item.rect,{}).region);
      const x=Math.min(...regions.map(r=>r.x)),y=Math.min(...regions.map(r=>r.y));
      const bounds={x,y,width:Math.max(...regions.map(r=>r.x+r.width))-x,height:Math.max(...regions.map(r=>r.y+r.height))-y};
      const times={native:[],gpu:[]},submission={native:[],gpu:[]};let pixels={};
      for(let i=0;i<14;i++)for(const key of i%2?['gpu','native']:['native','gpu']){
        const ctx=contexts[key];ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#20374e';ctx.fillRect(0,0,1920,1080);
        for(let y=0;y<1080;y+=19)for(let x=0;x<1920;x+=23){ctx.fillStyle=(x+y)%3?'#ffffffaa':'#213ddb';ctx.fillRect(x,y,11,8);}ctx.getImageData(0,0,1,1);
        const start=performance.now();
        const draw=()=>{for(const item of effects)(key==='gpu'?apply:nativeBlurOracle.applyBlurEffect)(ctx,item.clip,item.rect);};
        if(key==='gpu')window.__beamGpuBlurGroup(ctx,draw,bounds);else draw();
        const submitted=performance.now(),data=ctx.getImageData(0,0,1920,1080).data,end=performance.now();
        if(i>=2){times[key].push(end-start);submission[key].push(submitted-start);}if(i===13)pixels[key]=data;
        await new Promise(requestAnimationFrame);
      }
      let total=0,max=0;for(let i=0;i<pixels.native.length;i++){const d=Math.abs(pixels.native[i]-pixels.gpu[i]);total+=d;max=Math.max(max,d);}
      const summary=v=>({median:percentile(v,.5),p95:percentile(v,.95)});
      groups.push({count,bounds,samples:12,completed:{native:summary(times.native),gpu:summary(times.gpu)},submission:{native:summary(submission.native),gpu:summary(submission.gpu)},quality:{maxChannelDelta:max,meanAbsoluteDelta:total/pixels.native.length}});
      nativeBlurOracle.disposeBlurEffect(contexts.native);window.__beamDisposeBlurEffect(contexts.gpu);
    }
    return {method:'12 warmed alternating pairs; completed RGBA readback; frozen native oracle; singles two sequential effects640x360; retainedgroups1920x1080',results,groups};
  })()`);
};

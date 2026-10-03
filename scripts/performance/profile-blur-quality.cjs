// Real accelerated Chromium pixels, not mocked Canvas2D calls. Compare hashes across builds.
module.exports = async (editor) =>
  editor.webContents.executeJavaScript(`(async () => {
    const apply = window.__beamBlurEffect;
    if (!apply) throw new Error('Missing temporary blur quality probe.');
    const results = [];
    const clip = { id:'quality', kind:'blur', shape:'rectangle', mode:'blur', strength:30,
      feather:14, cornerRadius:24, tintOpacity:25, color:'#8a93b5' };
    for (const scale of [1, .75, 1.4]) {
      const canvas = new OffscreenCanvas(640, 360);
      const ctx = canvas.getContext('2d');
      const background = () => {
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,640,360);
        const gradient = ctx.createLinearGradient(0,0,640,360);
        gradient.addColorStop(0,'#f04652'); gradient.addColorStop(.5,'#32cb84'); gradient.addColorStop(1,'#202ec8');
        ctx.fillStyle = gradient; ctx.fillRect(0,0,640,360);
        for(let y=0;y<360;y+=17) for(let x=0;x<640;x+=23) {
          ctx.fillStyle = ((x+y)%3) ? '#ffffff8f' : '#070b16';
          ctx.fillRect(x,y,11,8);
        }
        ctx.setTransform(scale,0,0,scale,0,0);
      };
      const cases = [
        ['blur', {}, {x:74,y:67,width:180,height:115}],
        ['frosted', {mode:'frosted',shape:'circle'}, {x:240,y:160,width:166,height:115}],
        ['edge', {strength:67,feather:37}, {x:-14,y:4,width:150,height:80}],
        ['pixelated', {mode:'pixelated',strength:82}, {x:310,y:215,width:210,height:130}],
        ['opaque', {mode:'opaque',shape:'square'}, {x:60,y:265,width:112,height:92}],
      ];
      for (const [name, overrides, rect] of cases) {
        background();
        apply(ctx,{...clip,...overrides},rect);
        apply(ctx,{...clip,...overrides},rect); // exercise geometry reuse and sequential live backdrop
        const bytes = ctx.getImageData(0,0,640,360).data;
        const hash = await crypto.subtle.digest('SHA-256',bytes);
        results.push({scale,name,hash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')});
      }
      background();
      const source = new OffscreenCanvas(640,360);
      source.getContext('2d').drawImage(canvas,0,0);
      const rect = {x:120,y:100,width:140,height:110};
      const options = {source,bounds:{x:100,y:80,width:180,height:150},maskPath:(mask,r)=>{
        mask.beginPath(); mask.moveTo(r.x,r.y); mask.lineTo(r.x+r.width,r.y+r.height);
        mask.lineTo(r.x,r.y+r.height); mask.closePath();
      }};
      apply(ctx,clip,rect,options); apply(ctx,clip,rect,options);
      const hash = await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,640,360).data);
      results.push({scale,name:'external-custom-mask',hash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')});
    }
    return results;
  })()`);

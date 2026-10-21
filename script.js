
"use strict";
let BW=48,RH=16;const LO=0,HI=128,ROWS=HI-LO,SNAP=0.25,LEN=16;
let S,sel=0,selNote=null,undo=[],redo=[],lastDur=1,playing=false,playBeat=0,loop=true,blockPlayback=null;
let PA=null,PAEdit=false,PAKind='vol',PADrag=false;
let ctx=null,master=null,nextBeat=0,nextTime=0,startT=0,timer=null;
const $=id=>document.getElementById(id);
const TCOL=['#2f6fed','#e5484d','#2da44e','#d4a017','#8957e5','#0aa5a5','#e0702d','#d6409f'];
const newTrack=(i)=>({name:'Track '+(i+1),wave:'sawtooth',vol:.7,mute:false,solo:false,cut:6000,sf:null,pan:0,fx:[],color:TCOL[i%TCOL.length],id:uid(),notes:[]});
const fresh=()=>{const P={id:uid(),name:'Pattern 1',color:TCOL[0],len:16,notes:[]};return{v:1,projectName:'BGM',bpm:120,len:LEN,tracks:[newTrack(0)],patterns:[P],place:[{id:uid(),pid:P.id,ti:0,s:0,l:16,w:4}],edit:P.id}};
S=fresh();

/* ---------- audio ---------- */
function initAudio(){
  if(ctx){if(ctx.state!=='running')ctx.resume();return}
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  const c=ctx.createDynamicsCompressor();master=ctx.createGain();master.gain.value=.8;master.connect(c);c.connect(ctx.destination);an=ctx.createAnalyser();c.connect(an);meter();ensureWL(ctx).then(rebuildAll).catch(()=>{});
  ctx.resume();
}
function voice(t,p,v,when,dur){PC=(VB==null)?null:pitchCurve(t,VB,dur/spb());if(PA&&PA.p){const av=patAutoVal(PA.p,PA.b,'vol');v=Math.max(0,Math.min(127,v*av));const ev=patAutoVal(PA.p,PA.b,'echo');try{const ch=getCh(t);ch.eg.gain.setValueAtTime(Math.max(0,Math.min(1,ev)),when)}catch(_){}}if(t.sf&&sfRes(t))sfVoice(t,p,v,when,dur);else synthVoice(t,p,v,when,dur);PC=null;PA=null}
function synthVoice(t,p,v,when,dur){
  const o=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  o.type=t.wave;o.frequency.value=440*Math.pow(2,(p-69)/12);if(PC)applyDet(o.detune,when,PC);
  f.type='lowpass';f.frequency.value=t.cut;
  const pk=t.vol*(v/127)*.35,A=.01,R=.12,end=when+Math.max(dur,.05);
  g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(pk,when+A);
  g.gain.setValueAtTime(pk*.8,Math.max(end,when+A));g.gain.linearRampToValueAtTime(0,end+R);
  o.connect(f);f.connect(g);g.connect(chIn(t));o.start(when);o.stop(end+R+.02);
}
const anySolo=()=>S.tracks.some(t=>t.solo)||AT().some(t=>t.solo);
const audible=t=>!t.mute&&(!anySolo()||t.solo);
const spb=()=>60/S.bpm;
function schedule(){
  const ahead=ctx.currentTime+.15;
  while(nextTime<ahead){
    const b0=nextBeat, end=blockPlayback?blockPlayback.end:S.len;
    for(const e of songNotes())if(e.s>=b0-1e-6&&e.s<b0+SNAP-1e-6&&(!blockPlayback||(e.s>=blockPlayback.start-1e-6&&e.s<blockPlayback.end-1e-6&&e.ti===blockPlayback.ti))&&audible(e.t)){
      VB=e.s;PA={p:e.pat,b:e.localS};voice(e.t,e.p,e.v,nextTime+(e.s-b0)*spb(),Math.min(e.d,Math.max(0,end-e.s))*spb());VB=null;PA=null
    }
    if(!blockPlayback){
      for(const tr of AT())for(const c of tr.clips)if(c.s>=b0-1e-6&&c.s<b0+SNAP-1e-6)startClip(c,tr,nextTime+(c.s-b0)*spb(),c.o,Math.min(c.d,(S.len-c.s)*spb()),true);
      schedAuto(b0,nextTime,spb());
    }
    nextTime+=SNAP*spb();nextBeat+=SNAP;
    if(nextBeat>=end-1e-6){
      if(loop){nextBeat=blockPlayback?blockPlayback.start:0}
      else{const stopAt=end;setTimeout(()=>{if(playing&&playBeat>=stopAt-.1)stop(false)},Math.max(0,(nextTime-ctx.currentTime)*1000));nextBeat=1e9;}
    }
  }
}
function play(){
  if(playing)return;blockPlayback=null;const bb=$('blockPlay');if(bb){bb.classList.remove('on');bb.innerHTML=ico('play')}initAudio();playing=true;
  nextBeat=Math.floor(playBeat/SNAP)*SNAP;nextTime=ctx.currentTime+.06;startT=nextTime-nextBeat*spb();
  startRef={t:nextTime,b:nextBeat};startPartial();
  timer=setInterval(schedule,25);schedule();setPlayUI(true);requestAnimationFrame(frame);
}
let startRef={t:0,b:0};
function pause(){playing=false;blockPlayback=null;const bb=$('blockPlay');if(bb){bb.classList.remove('on');bb.innerHTML=ico('play');bb.setAttribute('aria-label','ブロック内を再生');bb.dataset.tip='選択中のソングブロックだけ再生'}clearInterval(timer);ASRC.forEach(x=>{try{x.stop()}catch(e){}});ASRC.clear();resetAuto();setPlayUI(false)}
let prevPx=0;
function followPlayhead(){const px=playBeat*BW,v=x=>x>=roll.scrollLeft&&x<=roll.scrollLeft+roll.clientWidth-24;if(v(prevPx)&&!v(px))roll.scrollLeft=Math.max(0,px-60);prevPx=px}
function stop(rewind){pause();if(rewind){playBeat=0;roll.scrollLeft=0}draw();upPos()}
function frame(){
  if(!playing)return;
  let b=startRef.b+(ctx.currentTime-startRef.t)/spb();
  const lo=blockPlayback?blockPlayback.start:0,hi=blockPlayback?blockPlayback.end:S.len;
  if(loop&&nextBeat<1e8){if(b>=hi)b=lo+((b-lo)%(hi-lo));}
  else if(b>=hi)b=hi;
  playBeat=Math.max(lo,b);followPlayhead();draw();upPos();requestAnimationFrame(frame);
}
function upPos(){const bar=Math.floor(playBeat/4)+1,bt=Math.floor(playBeat%4)+1;$('pos').textContent=bar+':'+bt}

/* ---------- project name / browser tab title ---------- */
function currentProjectName(){const v=String(S&&S.projectName||'').trim();return v||'BGM'}
function updateTabTitle(){const name=currentProjectName();document.title='BGM-notpc '+name;const el=$('projectName');if(el&&document.activeElement!==el&&el.value!==name)el.value=name}
$('projectName').addEventListener('input',e=>{S.projectName=String(e.target.value||'').slice(0,100);updateTabTitle();dirty()});
$('projectName').addEventListener('change',()=>{S.projectName=String($('projectName').value||'').trim()||'BGM';$('projectName').value=S.projectName;updateTabTitle();dirty()});

/* ---------- state / undo / save ---------- */
const snap=()=>JSON.stringify(S,function(k,v){return(k==='notes'&&this&&this.wave!==undefined)?undefined:v});
function pushUndo(){undo.push(snap());if(undo.length>100)undo.shift();redo=[]}
function restore(j){S=JSON.parse(j);normS();if(!S.projectName)S.projectName='BGM';sel=Math.min(sel,S.tracks.length-1);selNote=null;selSet.clear();$('bpm').value=S.bpm;updateTabTitle();renderTracks();draw();dirty()}
let saveT=null;
function dirty(){NC=null;AC=null;$('st').textContent='未保存の変更あり';clearTimeout(saveT);saveT=setTimeout(saveDB,800)}
const dbp=new Promise((res,rej)=>{
  if(!window.indexedDB)return rej(new Error('IndexedDB非対応'));
  const r=indexedDB.open('browser-daw',3);r.onupgradeneeded=()=>{const d=r.result;for(const n of ['p','a','sfl','sfb'])if(!d.objectStoreNames.contains(n))d.createObjectStore(n)};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
});
async function saveDB(){
  try{S.projectName=currentProjectName();updateTabTitle();const db=await dbp;await new Promise((res,rej)=>{const tx=db.transaction('p','readwrite');tx.objectStore('p').put({data:snap(),at:Date.now()},'current');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
    $('st').textContent='端末に保存済み '+new Date().toLocaleTimeString()}
  catch(e){$('st').textContent='保存失敗: '+e.message}
}
async function loadDB(){
  try{const db=await dbp;const v=await new Promise((res,rej)=>{const r=db.transaction('p').objectStore('p').get('current');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    if(v){S=JSON.parse(v.data);normS();if(!S.projectName)S.projectName='BGM';$('st').textContent='保存データを読み込みました'}else $('st').textContent='新規プロジェクト'}
  catch(e){$('st').textContent='保存機能が使えません: '+e.message}
  $('bpm').value=S.bpm;updateTabTitle();renderTracks();draw();
}

/* ---------- tracks UI ---------- */
function renderTracks(){
  const tl=$('tl');tl.innerHTML='';
  S.tracks.forEach((t,i)=>{
    const d=document.createElement('div');d.className='trk'+(i===sel?' sel':'');
    d.innerHTML=`<div class="r"><input value="${t.name.replace(/"/g,'&quot;')}" data-k="name"><button data-a="up" title="上へ">▲</button><button data-a="dn" title="下へ">▼</button><button data-a="del" title="削除">✕</button></div>
    <div class="r"><label>色</label><input type="color" data-k="color" value="${t.color||'#2f6fed'}"></div>
    <div class="r"><select data-k="wave"><option value="sine">サイン波</option><option value="square">矩形波</option><option value="triangle">三角波</option><option value="sawtooth">ノコギリ波</option></select></div>
    <div class="r"><select data-src>${srcOpts(t)}</select></div>
    <div class="r"><label>音量</label><input type="range" data-k="vol" min="0" max="1" step=".01" value="${t.vol}"></div>
    <div class="r"><label>音色</label><input type="range" data-k="cut" min="200" max="12000" step="50" value="${t.cut}"></div>
    <div class="r"><button data-a="mute" class="${t.mute?'on':''}">M</button><button data-a="solo" class="${t.solo?'on':''}">S</button></div>`;
    d.querySelector('select').value=t.wave;
    d.onclick=e=>{if(e.target.closest('[data-a],input,select,.dd'))return;sel=i;selNote=null;selSet.clear();renderTracks();draw()};
    d.querySelectorAll('[data-k]').forEach(el=>{
      el.onfocus=()=>{sel=i;draw()};
      el.oninput=()=>{const k=el.dataset.k;t[k]=el.type==='range'?+el.value:el.value;dirty();if(k==='color'||k==='name')draw()};
      el.onchange=()=>{if(el.tagName==='SELECT'){initAudio();voice(t,60,100,ctx.currentTime,.3)}};
    });
    d.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{
      const a=b.dataset.a;
      if(a==='mute'){t.mute=!t.mute}
      else if(a==='solo'){t.solo=!t.solo}
      else if(a==='up'||a==='dn'){pushUndo();moveTrack(i,a==='up'?-1:1);return}
      else if(a==='del'){if(S.tracks.length<2){alert('最後のトラックは削除できません');return}
        if(!confirm(t.name+' を削除しますか？'))return;pushUndo();syncBuf();S.tracks.splice(i,1);S.place=S.place.filter(p=>p.ti!==i);S.place.forEach(p=>{if(p.ti>i)p.ti--});fixAuto();sel=Math.max(0,Math.min(sel,S.tracks.length-1))}
      dirty();renderTracks();draw();
    });
    const ss=d.querySelector('[data-src]');ss.onfocus=()=>{sel=i;draw()};
    ss.onchange=()=>{const v=ss.value;if(v==='x')return;pushUndo();t.sf=v===''?null:sfParse(v);initAudio();voice(t,60,100,ctx.currentTime,.5);dirty()};
    tl.appendChild(d);
  });
}

/* ---------- piano roll ---------- */
const cv=$('cv'),g2=cv.getContext('2d');
function css(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
const RULER=24,MAXBARS=256,roll=$('roll'),sz=$('sz');
const isBlack=p=>[1,3,6,8,10].includes(p%12);
const NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function normS(){
  if(!S||!Array.isArray(S.tracks)||!S.tracks.length)S=fresh();
  fixPatterns();seClean();let mx=0;for(const pl of S.place)mx=Math.max(mx,pl.s+pl.l);for(const pl of S.aplace||[])mx=Math.max(mx,pl.s+pl.l);for(const t of S.tracks){t.notes=Array.isArray(t.notes)?t.notes:[];for(const n of t.notes){mx=Math.max(mx,n.s+n.d);n.v=Math.max(1,Math.min(127,Math.round(n.v)||100))}}
  S.atracks=Array.isArray(S.atracks)?S.atracks:[];for(const tr of S.atracks){tr.clips=Array.isArray(tr.clips)?tr.clips:[];for(const c of tr.clips)mx=Math.max(mx,c.s+c.d*(S.bpm||120)/60)}
  let L=Number(S.len);if(!isFinite(L)||L<4)L=16;L=Math.max(L,mx);
  S.len=Math.min(MAXBARS*4,Math.ceil(L/4)*4);
}
function drawRoll(){
  const r=devicePixelRatio||1,vw=Math.max(1,roll.clientWidth),vh=Math.max(1,roll.clientHeight);
  const W=S.len*BW,H=ROWS*RH,sx=roll.scrollLeft,sy=roll.scrollTop;
  sz.style.width=W+'px';sz.style.height=(H+RULER)+'px';
  const cw=Math.round(vw*r),chh=Math.round(vh*r);
  if(cv.width!==cw||cv.height!==chh){cv.width=cw;cv.height=chh;cv.style.width=vw+'px';cv.style.height=vh+'px'}
  const C={bg:css('--bg'),panel:css('--panel'),fg:css('--fg'),mut:css('--mut'),line:css('--line'),beat:css('--beat'),bar:css('--bar'),black:css('--black'),note:css('--note')};
  g2.setTransform(r,0,0,r,0,0);g2.globalAlpha=1;g2.lineWidth=1;
  g2.fillStyle=C.bg;g2.fillRect(0,0,vw,vh);
  const nb=S.len/4,b0=Math.max(0,Math.floor(sx/BW/4)),b1=Math.min(nb,Math.ceil((sx+vw)/BW/4));
  const x0=sx,x1=Math.min(W,sx+vw);
  g2.save();g2.beginPath();g2.rect(0,RULER,vw,vh-RULER);g2.clip();g2.translate(-sx,RULER-sy);
  g2.fillStyle=C.panel;g2.fillRect(x0,0,x1-x0,H);
  for(let p=LO;p<HI;p++){const y=(HI-1-p)*RH;
    if(isBlack(p)){g2.fillStyle=C.black;g2.fillRect(x0,y,x1-x0,RH)}
    if(p%12===0){g2.fillStyle=C.mut;g2.font='10px system-ui';g2.fillText('C'+(p/12-1),x0+3,y+RH-4)}}
  for(let bar=b0;bar<b1;bar++)if(bar%2){g2.globalAlpha=.05;g2.fillStyle=C.fg;g2.fillRect(bar*4*BW,0,4*BW,H)}
  g2.globalAlpha=1;
  const s0=Math.max(0,Math.floor(sx/(BW/4))),s1=Math.min(S.len*4,Math.ceil((sx+vw)/(BW/4)));
  for(let b=s0;b<=s1;b++){const x=b*BW/4,isBar=b%16===0;
    g2.strokeStyle=isBar?C.bar:b%4===0?C.beat:C.line;g2.globalAlpha=(isBar||b%4===0)?1:.5;g2.lineWidth=isBar?2:1;
    g2.beginPath();g2.moveTo(x+.5,0);g2.lineTo(x+.5,H);g2.stroke()}
  g2.globalAlpha=1;g2.lineWidth=1;
  if(GRID<.25-1e-9&&GRID*BW>=6){g2.strokeStyle=C.line;g2.globalAlpha=.3;for(let k=Math.floor(sx/BW/GRID);k<=Math.ceil((sx+vw)/BW/GRID);k++){const bt=k*GRID;if(Math.abs(bt*4-Math.round(bt*4))<1e-6)continue;const x=bt*BW;g2.beginPath();g2.moveTo(x+.5,0);g2.lineTo(x+.5,H);g2.stroke()}g2.globalAlpha=1}
  if(EP&&EP.len*BW<W){g2.globalAlpha=.2;g2.fillStyle=C.mut;g2.fillRect(EP.len*BW,0,W-EP.len*BW,H);g2.globalAlpha=1;g2.strokeStyle='#e5484d';g2.lineWidth=2;g2.beginPath();g2.moveTo(EP.len*BW,0);g2.lineTo(EP.len*BW,H);g2.stroke();g2.lineWidth=1}
  const vis=n=>(n.s+n.d)*BW>=sx&&n.s*BW<=sx+vw;
  S.tracks.forEach((t,i)=>{if(i===sel)return;g2.globalAlpha=.18;g2.fillStyle=C.mut;
    t.notes.forEach(n=>{if(vis(n))g2.fillRect(n.s*BW,(HI-1-n.p)*RH+1,n.d*BW,RH-2)})});
  g2.globalAlpha=1;
  const t=S.tracks[sel];
  t.notes.forEach(n=>{if(!vis(n))return;const x=n.s*BW,y=(HI-1-n.p)*RH+1;
    g2.globalAlpha=.4+.6*n.v/127;g2.fillStyle=C.note;g2.fillRect(x,y,Math.max(4,n.d*BW-1),RH-2);g2.globalAlpha=1;
    if(n===selNote||selSet.has(n)){g2.strokeStyle=C.fg;g2.lineWidth=2;g2.strokeRect(x,y,Math.max(4,n.d*BW-1),RH-2);g2.lineWidth=1}});
  // 選択範囲: 薄い青の外周と右端の一括伸縮ハンドル
  {const picked=S.tracks[sel].notes.filter(n=>selSet.has(n));if(picked.length){const bx0=Math.min(...picked.map(n=>n.s))*BW,bx1=Math.max(...picked.map(n=>n.s+n.d))*BW,by0=Math.min(...picked.map(n=>(HI-1-n.p)*RH)),by1=Math.max(...picked.map(n=>(HI-n.p)*RH));g2.strokeStyle='#72baff';g2.lineWidth=1.25;g2.setLineDash([]);g2.strokeRect(bx0-2,by0-2,bx1-bx0+4,by1-by0+4);g2.fillStyle='#72baff';g2.fillRect(bx1-2,(by0+by1)/2-5,5,10)}}
  {const rp=relPB();if(rp>=0){g2.strokeStyle='#e5484d';g2.lineWidth=2;g2.beginPath();g2.moveTo(rp*BW,0);g2.lineTo(rp*BW,H);g2.stroke();g2.lineWidth=1}}
  if(drag&&drag.mode==='box'){const xa=Math.min(drag.x0,drag.x1),ya=Math.min(drag.y0,drag.y1),bw=Math.abs(drag.x1-drag.x0),bh=Math.abs(drag.y1-drag.y0);g2.globalAlpha=.15;g2.fillStyle=C.note;g2.fillRect(xa,ya,bw,bh);g2.globalAlpha=1;g2.strokeStyle=C.note;g2.setLineDash([4,3]);g2.strokeRect(xa+.5,ya+.5,bw,bh);g2.setLineDash([])}
  g2.restore();
  // ルーラー(小節番号)
  g2.fillStyle=C.panel;g2.fillRect(0,0,vw,RULER);
  g2.strokeStyle=C.line;g2.beginPath();g2.moveTo(0,RULER-.5);g2.lineTo(vw,RULER-.5);g2.stroke();
  for(let bt=Math.max(0,Math.floor(sx/BW));bt<=Math.min(S.len,Math.ceil((sx+vw)/BW));bt++){
    if(bt%4===0)continue;const x=bt*BW-sx;g2.strokeStyle=C.beat;g2.beginPath();g2.moveTo(x+.5,RULER-7);g2.lineTo(x+.5,RULER);g2.stroke()}
  for(let bar=b0;bar<=b1;bar++){const x=bar*4*BW-sx;
    g2.strokeStyle=C.bar;g2.lineWidth=2;g2.beginPath();g2.moveTo(x+.5,0);g2.lineTo(x+.5,RULER);g2.stroke();g2.lineWidth=1;
    if(bar<nb){g2.fillStyle=C.fg;g2.font='bold 11px system-ui';g2.fillText(String(bar+1),x+5,15)}}
  const rp2=relPB(),px=rp2*BW-sx;if(rp2>=0&&px>=0&&px<=vw){g2.fillStyle='#e5484d';g2.beginPath();g2.moveTo(px-5,0);g2.lineTo(px+5,0);g2.lineTo(px,8);g2.fill()}
  if(W-sx<vw-40){g2.fillStyle=C.mut;g2.font='12px system-ui';g2.fillText('タップで小節を追加 →',W-sx+10,RULER+22)}
  $('info').textContent=selSet.size>1?selSet.size+'音符を選択中':selNote?`${NN[selNote.p%12]}${Math.floor(selNote.p/12)-1}  長さ ${selNote.d}拍`:'';
  if(document.activeElement!==$('bars'))$('bars').value=S.len/4;
  updateHS();updateVS();drawVL();drawAL();drawPatternAutomationOverlay();
}
let drag=null,MODE='draw',CLIP=null;const selSet=new Set();
const TAPDEL=true;const TP=new Map();let pinch=null;
function pt(e){const r=cv.getBoundingClientRect();return{x:e.clientX-r.left+roll.scrollLeft,y:e.clientY-r.top-RULER+roll.scrollTop}}
function edgeScroll(e){const b=roll.getBoundingClientRect();if(e.clientX>b.right-48)roll.scrollLeft+=28;else if(e.clientX<b.left+48)roll.scrollLeft-=28}
function autoExtend(e,x){if(x>S.len*BW-BW&&S.len<MAXBARS*4)S.len=Math.min(MAXBARS*4,S.len+4);edgeScroll(e)}
function hit(x,y){const t=S.tracks[sel];const p=HI-1-Math.floor(y/RH);
  for(let i=t.notes.length-1;i>=0;i--){const n=t.notes[i];if(n.p===p&&x>=n.s*BW&&x<=(n.s+n.d)*BW)return n}return null}
const selList=()=>S.tracks[sel].notes.filter(n=>selSet.has(n));
function seekTo(beat){const b=Math.max(0,Math.min(S.len,Math.round(beat/SNAP)*SNAP)),w=playing;if(w)pause();playBeat=b;if(w)play();else{draw();upPos()}}
function boxSelect(){const d=drag,xa=Math.min(d.x0,d.x1),xb=Math.max(d.x0,d.x1),ya=Math.min(d.y0,d.y1),yb=Math.max(d.y0,d.y1);
  selSet.clear();d.base.forEach(n=>selSet.add(n));
  for(const n of S.tracks[sel].notes){const nx0=n.s*BW,nx1=(n.s+n.d)*BW,ny0=(HI-1-n.p)*RH,ny1=ny0+RH;if(nx1>=xa&&nx0<=xb&&ny1>=ya&&ny0<=yb)selSet.add(n)}}
cv.addEventListener('pointerdown',e=>{
  const rc=cv.getBoundingClientRect();
  if(VIEW!=='roll')return;syncBuf();if(e.clientY-rc.top<RULER){const localBeat=(e.clientX-rc.left+roll.scrollLeft)/BW;const targetBeat=(EP&&sSel&&sSel.pid===EP.id)?sSel.s+localBeat:localBeat;seekTo(targetBeat);return}
  initAudio();const{x,y}=pt(e),t=S.tracks[sel];let n=hit(x,y);
  const mod=e.shiftKey||e.ctrlKey||e.metaKey;const was=!!n;
  if(e.pointerType==='touch'){ // タッチ: 2本指=ズーム / 空き領域のドラッグ=スクロール / タップ(指を離したとき)=追加
    TP.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(TP.size>=2){if(!drag||drag.mode==='tapadd'||drag.mode==='pan')startPinch();return}
    if(!n&&MODE==='draw'&&!mod){cv.setPointerCapture(e.pointerId);drag={mode:'tapadd',x,y,cx:e.clientX,cy:e.clientY,t0:performance.now(),sl:roll.scrollLeft,st:roll.scrollTop,moved:false};return}}
  cv.setPointerCapture(e.pointerId);
  // 選択枠の内側なら、音符そのものがない場所でも選択グループを移動できる。
  // 範囲選択モードの空白クリック判定より先に行い、内側ドラッグが箱選択に奪われないようにする。
  let picked=S.tracks[sel].notes.filter(m=>selSet.has(m));
  const bounds=()=>({left:Math.min(...picked.map(m=>m.s))*BW,right:Math.max(...picked.map(m=>m.s+m.d))*BW,
    top:Math.min(...picked.map(m=>(HI-1-m.p)*RH)),bottom:Math.max(...picked.map(m=>(HI-m.p)*RH))});
  let insideSelection=false,selectionBounds=null;
  if(!n&&!mod&&picked.length){selectionBounds=bounds();insideSelection=x>=selectionBounds.left-2&&x<=selectionBounds.right+3&&y>=selectionBounds.top-2&&y<=selectionBounds.bottom+2;}
  if(!n&&!insideSelection&&(MODE==='select'||mod)){drag={mode:'box',x0:x,y0:y,x1:x,y1:y,base:new Set(mod?selSet:[])};selNote=null;boxSelect();draw();return}
  if(n&&mod){if(selSet.has(n)){selSet.delete(n);selNote=null;draw();return}selSet.add(n);picked=S.tracks[sel].notes.filter(m=>selSet.has(m))}
  else if(n&&!selSet.has(n)){selSet.clear();selSet.add(n);picked=[n]}
  pushUndo();let mode='move';
  if(!n&&x>=S.len*BW&&!insideSelection)S.len=Math.min(MAXBARS*4,Math.ceil(x/BW/4)*4);
  if(insideSelection){n=picked[0];selectionBounds=bounds();}
  if(n){
    picked=S.tracks[sel].notes.filter(m=>selSet.has(m));
    const left=Math.min(...picked.map(m=>m.s)),right=Math.max(...picked.map(m=>m.s+m.d));
    const rightPx=right*BW-x;
    const withinY=y>=Math.min(...picked.map(m=>(HI-1-m.p)*RH))-5&&y<=Math.max(...picked.map(m=>(HI-m.p)*RH))+5;
    mode=(picked.length>1&&rightPx>=-2&&rightPx<10&&withinY)?'groupResize':((rightPx>=0&&rightPx<10&&selSet.size===1)?'resize':'move');
  }
  else{const p=HI-1-Math.floor(y/RH);if(p<LO||p>=HI){undo.pop();return}
    const s=Math.max(0,Math.min(S.len-lastDur,Math.floor(x/BW/GRID+1e-9)*GRID));
    n={p,s,d:lastDur,v:100};t.notes.push(n);selSet.clear();selSet.add(n);picked=[n]}
  selNote=n;voice(t,n.p,n.v,ctx.currentTime,.25);
  const snap=[...selSet].map(m=>({m,s:m.s,p:m.p,d:m.d}));
  drag={mode,n,ox:x/BW-n.s,moved:false,n0s:n.s,n0p:n.p,was,mod,cx:e.clientX,cy:e.clientY,snap,
    groupStart:snap.length?Math.min(...snap.map(o=>o.s)):n.s,
    groupEnd:snap.length?Math.max(...snap.map(o=>o.s+o.d)):n.s+n.d};draw();
});
cv.addEventListener('pointermove',e=>{
  if(TP.has(e.pointerId))TP.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch){pinchMove();return}
  if(!drag)return;const{x,y}=pt(e);if(drag.mode==='tapadd'||drag.mode==='pan'){tapPan(e);return}
  if(drag.mode==='box'){edgeScroll(e);drag.x1=x;drag.y1=y;boxSelect();draw();return}
  const n=drag.n;if(!drag.moved&&Math.hypot(e.clientX-drag.cx,e.clientY-drag.cy)<8)return;autoExtend(e,x);
  if(drag.mode==='resize'){n.d=Math.max(GRID,Math.min(S.len-n.s,Math.round((x/BW-n.s)/GRID)*GRID));lastDur=n.d}
  else if(drag.mode==='groupResize'){
    const oldSpan=Math.max(GRID,drag.groupEnd-drag.groupStart);
    // 右端を左へ動かせば縮小、右へ動かせば拡大。
    // 選択グループは最小1グリッドまで縮小可能。縮小時に音符の開始位置が
    // グループ幅をはみ出さないよう、開始位置と長さをそれぞれ目標幅内に制限する。
    const minSpan=GRID;
    const target=Math.max(minSpan,Math.min(S.len-drag.groupStart,Math.round((x/BW-drag.groupStart)/GRID)*GRID));
    const ratio=target/oldSpan;
    const movePositions=$('rangeResizeMove')?.checked===true;
    for(const o of drag.snap){
      if(movePositions){
        // ON: 音符の開始位置もグループの左端を基準に比例移動する（従来の動作）
        const rel=o.s-drag.groupStart;
        const scaledRel=Math.round(rel*ratio/GRID)*GRID;
        const safeRel=Math.max(0,Math.min(Math.max(0,target-GRID),scaledRel));
        o.m.s=drag.groupStart+safeRel;
        o.m.d=Math.max(GRID,Math.min(target-safeRel,Math.round(o.d*ratio/GRID)*GRID));
      }else{
        // OFF（初期設定）: 開始位置は固定し、各音符の長さだけを比例変更する
        o.m.s=o.s;
        o.m.d=Math.max(GRID,Math.min(S.len-o.s,Math.round(o.d*ratio/GRID)*GRID));
      }
      if(o.m.s+o.m.d>S.len)o.m.d=Math.max(GRID,Math.floor((S.len-o.m.s)/GRID)*GRID);
    }
  }
  else{
    let ds=Math.round((x/BW-drag.ox)/GRID)*GRID-drag.n0s;
    let mnS=1e9,mxE=-1e9,mnP=1e9,mxP=-1e9;
    for(const o of drag.snap){mnS=Math.min(mnS,o.s);mxE=Math.max(mxE,o.s+o.m.d);mnP=Math.min(mnP,o.p);mxP=Math.max(mxP,o.p)}
    ds=Math.max(-mnS,Math.min(S.len-mxE,ds));
    let dp=Math.max(LO,Math.min(HI-1,HI-1-Math.floor(y/RH)))-drag.n0p;
    dp=Math.max(LO-mnP,Math.min(HI-1-mxP,dp));
    if(n.p!==drag.n0p+dp)voice(S.tracks[sel],drag.n0p+dp,n.v,ctx.currentTime,.15);
    for(const o of drag.snap){o.m.s=o.s+ds;o.m.p=o.p+dp}}
  drag.moved=true;draw();
});
const endDrag=e=>{if(e&&TP.has(e.pointerId))TP.delete(e.pointerId);if(pinch){if(TP.size<2)pinch=null;return}
  if(!drag)return;const d=drag;drag=null;
  if(d.mode==='tapadd'){if(!d.moved&&e&&e.type==='pointerup'&&performance.now()-d.t0<700)tapAdd(d.x,d.y);return}
  if(d.mode==='pan')return;
  if(d.mode==='box'){selNote=selSet.size===1?[...selSet][0]:null;draw();return}
  if(d.was&&!d.moved&&!d.mod&&TAPDEL&&MODE==='draw'&&e&&e.type==='pointerup'){tapErase(d.n);return} // 動かさずにもう一度タップ → 削除(pointerdownで取った Undo を1回分そのまま使う)
  dirty()};
function tapErase(n){const t=S.tracks[sel];t.notes=t.notes.filter(x=>x!==n);selSet.delete(n);if(selNote===n)selNote=null;draw();dirty();$('st').textContent='音符を削除しました(空いた場所をタップで追加 / ↶で元に戻せます)'}
function tapAdd(x,y){const t=S.tracks[sel];pushUndo();if(x>=S.len*BW)S.len=Math.min(MAXBARS*4,Math.ceil(x/BW/4)*4);
  const p=HI-1-Math.floor(y/RH);if(p<LO||p>=HI){undo.pop();return}
  const s2=Math.max(0,Math.min(S.len-lastDur,Math.floor(x/BW/GRID+1e-9)*GRID)),n={p,s:s2,d:lastDur,v:100};t.notes.push(n);selSet.clear();selSet.add(n);selNote=n;voice(t,n.p,n.v,ctx.currentTime,.25);draw();dirty()}
function tapPan(e){const d=drag;if(!d.moved&&Math.hypot(e.clientX-d.cx,e.clientY-d.cy)<8)return;d.moved=true;d.mode='pan';roll.scrollLeft=d.sl-(e.clientX-d.cx);roll.scrollTop=d.st-(e.clientY-d.cy)}
function startPinch(){const[a,b]=[...TP.values()];drag=null;pinch={dx:Math.max(20,Math.abs(a.x-b.x)),dy:Math.max(20,Math.abs(a.y-b.y)),zh,zv}}
function pinchMove(){const v=[...TP.values()];if(v.length<2)return;const dx=Math.abs(v[0].x-v[1].x),dy=Math.abs(v[0].y-v[1].y);if(dx>=20)zoomH(pinch.zh*dx/pinch.dx);if(dy>=20)zoomV(pinch.zv*dy/pinch.dy)}
cv.addEventListener('pointerup',endDrag);cv.addEventListener('pointercancel',endDrag);
function deleteNotes(arr){if(!arr.length)return;pushUndo();const t=S.tracks[sel],ds=new Set(arr);t.notes=t.notes.filter(n=>!ds.has(n));selSet.clear();selNote=null;draw();dirty()}
cv.addEventListener('contextmenu',e=>{e.preventDefault();if(VIEW!=='roll')return;const{x,y}=pt(e),n=hit(x,y);if(n)deleteNotes(selSet.has(n)?selList():[n])});
function delSel(){const a=selList();if(selNote&&!a.includes(selNote)&&S.tracks[sel].notes.includes(selNote))a.push(selNote);deleteNotes(a)}
function copySel(cut){const a=selList();
  if(!a.length){$('st').textContent='音符が選択されていません(「選択モード」で範囲選択できます)';return}
  const b0=Math.min(...a.map(n=>n.s)),b1=Math.max(...a.map(n=>n.s+n.d));
  CLIP={notes:a.map(n=>({p:n.p,s:n.s-b0,d:n.d,v:n.v})),span:b1-b0};
  if(cut)deleteNotes(a);$('st').textContent=a.length+'音符を'+(cut?'切り取り':'コピー')+'しました'}
function pasteSel(){
  if(!CLIP){$('st').textContent='貼り付ける音符がありません(先にコピーしてください)';return}
  const rp0=relPB(),at=Math.max(0,Math.round((rp0>=0?rp0:0)/GRID)*GRID),end=at+CLIP.span;
  if(end>MAXBARS*4){alert('最大小節数を超えるため貼り付けできません');return}
  pushUndo();if(end>S.len)S.len=Math.ceil(end/4)*4;
  const t=S.tracks[sel];selSet.clear();selNote=null;
  for(const c of CLIP.notes){const n={p:c.p,s:at+c.s,d:c.d,v:c.v};t.notes.push(n);selSet.add(n)}
  if(at*BW<roll.scrollLeft||at*BW>roll.scrollLeft+roll.clientWidth-40)roll.scrollLeft=Math.max(0,at*BW-40);
  draw();dirty();$('st').textContent=CLIP.notes.length+'音符を再生位置に貼り付けました(位置はルーラーをタップして変更)'}
function selectAll(){selSet.clear();S.tracks[sel].notes.forEach(n=>selSet.add(n));selNote=null;draw()}
$('mdsel').onclick=()=>{MODE=MODE==='select'?'draw':'select';$('mdsel').classList.toggle('on',MODE==='select');$('mdsel').dataset.tip=MODE==='select'?'選択モード: ON(クリックでOFF)':'選択モード(ドラッグで範囲選択)'};
$('cp').onclick=()=>copySel(false);$('ct').onclick=()=>copySel(true);$('pst').onclick=pasteSel;$('sall').onclick=selectAll;
addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.key==='Escape'){selSet.clear();selNote=null;draw();return}
  if(!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();
  if(k==='c'){e.preventDefault();copySel(false)}else if(k==='x'){e.preventDefault();copySel(true)}
  else if(k==='d'){e.preventDefault();dupSel()}else if(k==='v'){e.preventDefault();pasteSel()}else if(k==='a'){e.preventDefault();selectAll()}});
/* ---------- 下部の横スクロールバー ---------- */
(function(){const hs=$('hs'),T=$('hsT');let st=null;
  const geo=()=>{const tw=hs.clientWidth,W=S.len*BW,vw=roll.clientWidth,w=Math.max(36,tw*Math.min(1,vw/W));return{tw,w,maxL:Math.max(0,W-vw)}};
  T.addEventListener('pointerdown',e=>{e.stopPropagation();T.setPointerCapture(e.pointerId);st={x:e.clientX,l:roll.scrollLeft}});
  T.addEventListener('pointermove',e=>{if(!st)return;const g=geo();if(g.tw-g.w<=0)return;roll.scrollLeft=st.l+(e.clientX-st.x)*g.maxL/(g.tw-g.w)});
  const up=()=>{st=null};T.addEventListener('pointerup',up);T.addEventListener('pointercancel',up);
  hs.addEventListener('pointerdown',e=>{if(e.target!==hs)return;const g=geo(),r=hs.getBoundingClientRect();if(g.tw-g.w<=0)return;
    roll.scrollLeft=((e.clientX-r.left-g.w/2)/(g.tw-g.w))*g.maxL});
})();
/* ---------- 右側の縦スクロールバー ---------- */
(function(){const vs=$('vs'),T=$('vsT');let st=null;
  const geo=()=>{const th=vs.clientHeight,Hh=contentH(),vh=roll.clientHeight,h=Math.max(36,th*Math.min(1,vh/Hh));return{th,h,maxT:Math.max(0,Hh-vh)}};
  T.addEventListener('pointerdown',e=>{e.stopPropagation();T.setPointerCapture(e.pointerId);st={y:e.clientY,t:roll.scrollTop}});
  T.addEventListener('pointermove',e=>{if(!st)return;const g=geo();if(g.th-g.h<=0)return;roll.scrollTop=st.t+(e.clientY-st.y)*g.maxT/(g.th-g.h)});
  const up=()=>{st=null};T.addEventListener('pointerup',up);T.addEventListener('pointercancel',up);
  vs.addEventListener('pointerdown',e=>{if(e.target!==vs)return;const g=geo(),r=vs.getBoundingClientRect();if(g.th-g.h<=0)return;
    roll.scrollTop=((e.clientY-r.top-g.h/2)/(g.th-g.h))*g.maxT});
})();
function updateVS(){const vs=$('vs'),T=$('vsT'),th=vs.clientHeight,Hh=contentH(),vh=roll.clientHeight,ratio=Math.min(1,vh/Hh),h=Math.max(36,th*ratio),maxT=Math.max(0,Hh-vh);
  T.style.display=ratio>=1?'none':'block';T.style.height=h+'px';T.style.top=(maxT>0?roll.scrollTop/maxT*(th-h):0)+'px'}
function updateHS(){const hs=$('hs'),T=$('hsT'),tw=hs.clientWidth,W=S.len*BW,vw=roll.clientWidth,ratio=Math.min(1,vw/W);
  const w=Math.max(36,tw*ratio),maxL=Math.max(0,W-vw);
  T.style.display=ratio>=1?'none':'block';T.style.width=w+'px';T.style.left=(maxL>0?roll.scrollLeft/maxL*(tw-w):0)+'px';
  $('hsP').style.left=Math.min(tw-2,playBeat/S.len*tw)+'px'}

/* ---------- controls ---------- */
$('play').onclick=()=>playing?pause():play();
$('blockPlay').onclick=()=>{
  if(blockPlayback&&playing){stop(false);return}
  if(playing)return;
  const q=sSel&&S.place.includes(sSel)?sSel:null;
  if(!q){$('st').textContent='ソング画面で再生したいブロックを選択してから開いてください';return}
  const start=Math.max(0,q.s),end=Math.min(S.len,q.s+q.l);if(end-start<=0)return;
  blockPlayback={start,end,ti:q.ti,pid:q.pid};playBeat=start;initAudio();playing=true;nextBeat=start;nextTime=ctx.currentTime+.06;startT=nextTime-start*spb();startRef={t:nextTime,b:start};
  timer=setInterval(schedule,25);schedule();setPlayUI(true);$('blockPlay').classList.add('on');$('blockPlay').innerHTML=ico('pause');$('blockPlay').setAttribute('aria-label','ブロック再生を停止');$('blockPlay').dataset.tip='ブロック再生を停止';requestAnimationFrame(frame);
};
$('stop').onclick=()=>stop(true);
$('rew').onclick=()=>{const w=playing;if(w)pause();playBeat=0;if(w)play();else{draw();upPos()}};
$('bpm').onchange=e=>{const v=Math.max(40,Math.min(240,+e.target.value||120));e.target.value=v;
  if(playing){const b=playBeat;pause();S.bpm=v;playBeat=b;play()}else S.bpm=v;updSyncFx();dirty()};
$('loop').onclick=e=>{loop=!loop;e.target.classList.toggle('on',loop)};
$('add').onclick=()=>{pushUndo();S.tracks.push(newTrack(S.tracks.length));sel=S.tracks.length-1;renderTracks();draw();dirty()};
$('del').onclick=delSel;
$('undo').onclick=()=>{if(!undo.length)return;redo.push(snap());restore(undo.pop())};
$('redo').onclick=()=>{if(!redo.length)return;undo.push(snap());restore(redo.pop())};
$('save').onclick=saveDB;
$('exp').onclick=()=>dl((currentProjectName().replace(/[\\/:*?"<>|]/g,'_')||'BGM')+'.json',snap(),'application/json');
$('imp').onclick=()=>$('file').click();
$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  try{const o=JSON.parse(await f.text());
    if(!o||o.v!==1||!Array.isArray(o.tracks)||!o.tracks.length)throw new Error('対応していない形式です');
    pushUndo();restore(JSON.stringify(o));loadAudioFiles();libEnsureForProject()}catch(err){alert('読み込み失敗: '+err.message)}e.target.value=''};
addEventListener('keydown',e=>{
  if(['INPUT','SELECT'].includes(e.target.tagName))return;
  if(e.code==='Space'){e.preventDefault();$('play').click()}
  else if(e.key==='Delete'||e.key==='Backspace'){delSel()}
  else if((e.ctrlKey||e.metaKey)&&['z','y'].includes((e.key||'').toLowerCase())){e.preventDefault();((e.shiftKey||(e.key||'').toLowerCase()==='y')?$('redo'):$('undo')).click()}
});
addEventListener('beforeunload',()=>{if(S)saveDB()});
/* ---------- SF2 (自前パーサー+サンプラー。SF3は未対応) ---------- */
let SF=null;
function srcOpts(t){let h='<option value="">シンセ(内蔵)</option>',found=false;const R=t.sf?sfRes(t):null;
  for(const f of libSorted()){if(!f.sf)continue;const fo=LIB.folders.find(x=>x.id===f.folder);h+='<optgroup label="'+fsEsc((fo?fo.name+' / ':'')+(f.dn||f.name))+'">';
    for(const r of f.sf.presets){const on=!!R&&R.file===f&&R.pr===r;if(on)found=true;
      h+='<option value="'+f.id+'|'+r.b+'|'+r.p+'"'+(on?' selected':'')+'>'+String(r.b).padStart(3,'0')+':'+String(r.p).padStart(3,'0')+' '+fsEsc(r.name)+'</option>'}h+='</optgroup>'}
  if(t.sf&&!found)h+='<option value="x" selected>(未読込) '+fsEsc((t.sf.fn||'SF2')+' / '+(t.sf.n||('Bank'+t.sf.b+':'+t.sf.p)))+'</option>';return h}
function parseSF2(buf){
  const dv=new DataView(buf),u8=new Uint8Array(buf),L=buf.byteLength;
  const str=(o,n)=>{let s='';for(let i=0;i<n;i++){const c=u8[o+i];if(!c)break;s+=String.fromCharCode(c)}return s};
  if(L<12||str(0,4)!=='RIFF'||str(8,4)!=='sfbk')throw new Error('SoundFontファイルではありません');
  const ch={};let smpl=-1,o=12;
  while(o+8<=L){const id=str(o,4),sz=dv.getUint32(o+4,true);
    if(id==='LIST'){const ty=str(o+8,4),e=Math.min(L,o+8+sz);let p=o+12;
      while(p+8<=e){const cid=str(p,4),cs=dv.getUint32(p+4,true);
        if(ty==='sdta'&&cid==='smpl')smpl=p+8;else if(ty==='pdta'||ty==='INFO')ch[cid]=[p+8,cs];p+=8+cs+(cs&1)}}
    o+=8+sz+(sz&1)}
  if(ch.ifil&&dv.getUint16(ch.ifil[0],true)>=3)throw new Error('SF3(圧縮形式)は未対応です。現在はSF2のみ読み込めます');
  if(smpl<0)throw new Error('サンプルデータが見つかりません');
  for(const k of ['phdr','pbag','pgen','inst','ibag','igen','shdr'])if(!ch[k])throw new Error('必要なデータ('+k+')がありません');
  const rec=(n,sz,fn)=>{const[p,l]=ch[n],c=Math.floor(l/sz),a=[];for(let i=0;i<c;i++)a.push(fn(p+i*sz));return a};
  const gen=p=>({o:dv.getUint16(p,true),lo:u8[p+2],hi:u8[p+3],s:dv.getInt16(p+2,true),u:dv.getUint16(p+2,true)});
  const phdr=rec('phdr',38,p=>({name:str(p,20),p:dv.getUint16(p+20,true),b:dv.getUint16(p+22,true),bag:dv.getUint16(p+24,true)}));
  const pbag=rec('pbag',4,p=>dv.getUint16(p,true)),pgen=rec('pgen',4,gen);
  const inst=rec('inst',22,p=>({bag:dv.getUint16(p+20,true)}));
  const ibag=rec('ibag',4,p=>dv.getUint16(p,true)),igen=rec('igen',4,gen);
  const samples=rec('shdr',46,p=>({start:dv.getUint32(p+20,true),end:dv.getUint32(p+24,true),sl:dv.getUint32(p+28,true),el:dv.getUint32(p+32,true),rate:dv.getUint32(p+36,true),pitch:u8[p+40],corr:dv.getInt8(p+41),type:dv.getUint16(p+44,true)})).slice(0,-1);
  if(samples.some(s=>s.type&0x10))throw new Error('圧縮サンプル(SF3)は未対応です');
  const zl=(bags,gens,i0,i1)=>{const z=[];for(let b=i0;b<i1;b++){const m={};for(let k=bags[b];k<bags[b+1];k++)m[gens[k].o]=gens[k];z.push(m)}return z};
  const presets=phdr.slice(0,-1).map((h,i)=>({name:h.name,b:h.b,p:h.p,i0:h.bag,i1:phdr[i+1].bag})).sort((a,b)=>a.b-b.b||a.p-b.p);
  const tc=x=>Math.pow(2,x/1200);
  function zones(pr){if(pr.z)return pr.z;const out=[];let pg=null;
    for(const m of zl(pbag,pgen,pr.i0,pr.i1)){if(!m[41]){pg=pg||m;continue}
      const ii=m[41].u;if(!inst[ii+1])continue;let ig=null;
      for(const im of zl(ibag,igen,inst[ii].bag,inst[ii+1].bag)){if(!im[53]){ig=ig||im;continue}
        const s=samples[im[53].u];if(!s||(s.type&0x8000))continue;
        const v=(q,k,d)=>{const a=im[q]||(ig&&ig[q]);return a?a[k]:d};
        const pv=(q,k)=>{const a=m[q]||(pg&&pg[q]);return a?a[k]:0};
        const kr=[v(43,'lo',0),v(43,'hi',127)],vr=[v(44,'lo',0),v(44,'hi',127)];
        const pk=[pv(43,'lo')||0,(m[43]||(pg&&pg[43]))?pv(43,'hi'):127],pvl=[pv(44,'lo')||0,(m[44]||(pg&&pg[44]))?pv(44,'hi'):127];
        const ro=v(58,'s',-1);
        out.push({si:im[53].u,klo:Math.max(kr[0],pk[0]),khi:Math.min(kr[1],pk[1]),vlo:Math.max(vr[0],pvl[0]),vhi:Math.min(vr[1],pvl[1]),
          root:ro>=0?ro:(s.pitch===255?60:s.pitch),tune:(v(51,'s',0)+pv(51,'s'))*100+v(52,'s',0)+pv(52,'s')+s.corr,
          att:Math.max(0,v(48,'s',0)+pv(48,'s')),atk:tc(v(34,'s',-12000)),dec:tc(v(36,'s',-12000)),
          sus:Math.max(0,Math.min(1440,v(37,'s',0))),rel:Math.max(.06,tc(v(38,'s',-12000))),loop:(v(54,'u',0)&1)===1,pan:v(17,'s',0)})}}
    return pr.z=out}
  function sBuf(i){const s=samples[i];if(s.buf!==undefined)return s.buf;const n=s.end-s.start;
    if(n<8||smpl+s.end*2>L){return s.buf=null}
    const f=new Float32Array(n);for(let j=0;j<n;j++)f[j]=dv.getInt16(smpl+(s.start+j)*2,true)/32768;
    const ab=ctx.createBuffer(1,n,Math.max(8000,Math.min(96000,s.rate||44100)));ab.copyToChannel(f,0);return s.buf=ab}
  return{presets,zones,sBuf,samples,buf}}
function sfVoice(t,p,v,when,dur){
  const SFO=sfRes(t);if(!SFO)return;const pr=SFO.pr;
  for(const z of SFO.sf.zones(pr)){if(p<z.klo||p>z.khi||v<z.vlo||v>z.vhi)continue;
    const ab=SFO.sf.sBuf(z.si);if(!ab)continue;const s=SFO.sf.samples[z.si];
    const src=ctx.createBufferSource();src.buffer=ab;
    const rate=Math.pow(2,((p-z.root)*100+z.tune)/1200);src.playbackRate.value=rate;if(PC)applyDet(src.detune,when,PC);
    if(z.loop&&s.el>s.sl+8){src.loop=true;src.loopStart=(s.sl-s.start)/ab.sampleRate;src.loopEnd=(s.el-s.start)/ab.sampleRate}
    const g=ctx.createGain(),pn=ctx.createStereoPanner();pn.pan.value=Math.max(-1,Math.min(1,z.pan/500));
    const peak=t.vol*Math.pow(v/127,2)*Math.pow(10,-z.att/200)*.6,lvl=Math.pow(10,-z.sus/200);
    let end=when+Math.max(dur,.05);if(!z.loop)end=Math.max(end,when+Math.min(ab.duration/rate,1.5));
    const ta=when+Math.max(z.atk,.003);
    g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(peak,ta);
    const tau=Math.max(z.dec/3,.001);g.gain.setTargetAtTime(peak*lvl,ta,tau);
    const ve=end>ta?peak*lvl+(peak-peak*lvl)*Math.exp(-(end-ta)/tau):peak*(end-when)/(ta-when);
    g.gain.setValueAtTime(ve,end);g.gain.setTargetAtTime(0,end,z.rel/3);
    src.connect(g);g.connect(pn);pn.connect(chIn(t));src.start(when);src.stop(end+Math.min(z.rel*1.5,4)+.05)}}
$('sf2b').onclick=()=>$('sf2f').click();
$('sf2f').onchange=e=>{const fl=[...e.target.files];e.target.value='';libAddFiles(fl)};
/* ---------- ミキサー / エフェクト ---------- */
let an=null;const mb=new Float32Array(2048);
function meter(){if(an){an.getFloatTimeDomainData(mb);let m=0;for(let i=0;i<mb.length;i++){const a=Math.abs(mb[i]);if(a>m)m=a}
  $('mt').style.width=Math.min(100,m*100)+'%';$('mt').style.background=m>=.95?'#e5484d':'var(--acc)';if(m>=.98)$('clip').textContent='CLIP!'}requestAnimationFrame(meter)}
$('clip').onclick=()=>{$('clip').textContent=''};
const FXD={
reverb:['リバーブ',{mix:[0,1,.3,.01,'ミックス'],time:[.3,5,1.8,.1,'長さ']}],
delay:['ディレイ',{mix:[0,1,.3,.01,'ミックス'],time:[.05,1,.3,.01,'時間'],fb:[0,.9,.35,.01,'反復']}],
eq:['イコライザー',{low:[-15,15,0,1,'低音'],mid:[-15,15,0,1,'中音'],high:[-15,15,0,1,'高音']}],
chorus:['コーラス',{mix:[0,1,.5,.01,'ミックス'],rate:[.1,5,1,.1,'速さ'],depth:[.001,.01,.004,.001,'深さ']}],
dist:['ディストーション',{drive:[0,100,20,1,'歪み'],mix:[0,1,1,.01,'ミックス']}],
comp:['コンプレッサー',{thr:[-60,0,-20,1,'閾値'],ratio:[1,20,4,.5,'比率']}]};
const defP=k=>Object.fromEntries(Object.entries(FXD[k][1]).map(([n,v])=>[n,v[2]]));
function mkFx(type,p){
 const c=ctx,I=c.createGain(),O=c.createGain(),d=c.createGain(),w=c.createGain(),mx=m=>{lm=m;ap()};
 let byp=false,lm=1;const ap=()=>{d.gain.value=byp?1:1-lm;w.gain.value=byp?0:lm};
 I.connect(d);d.connect(O);w.connect(O);let h,sy=null,cu=null;const dsp=[];
 if(type==='reverb'){const cv=c.createConvolver();I.connect(cv);cv.connect(w);let tt=0;
  h=q=>{mx(q.mix);if(q.time!==tt){tt=q.time;const n=c.sampleRate*tt|0,b=c.createBuffer(2,n,c.sampleRate);for(let k=0;k<2;k++){const a=b.getChannelData(k);for(let j=0;j<n;j++)a[j]=(Math.random()*2-1)*Math.pow(1-j/n,3)}cv.buffer=b}}}
 else if(type==='delay'){const dl=c.createDelay(1),fb=c.createGain();I.connect(dl);dl.connect(w);dl.connect(fb);fb.connect(dl);h=q=>{mx(q.mix);dl.delayTime.value=q.time;fb.gain.value=q.fb}}
 else if(type==='eq'){const f=['lowshelf','peaking','highshelf'].map((ty,i)=>{const b=c.createBiquadFilter();b.type=ty;b.frequency.value=[200,1000,4000][i];return b});
  I.connect(f[0]);f[0].connect(f[1]);f[1].connect(f[2]);f[2].connect(w);h=q=>{mx(1);f[0].gain.value=q.low;f[1].gain.value=q.mid;f[2].gain.value=q.high}}
 else if(type==='chorus'){const dl=c.createDelay(.1),l=c.createOscillator(),lg=c.createGain();dl.delayTime.value=.02;l.connect(lg);lg.connect(dl.delayTime);l.start();I.connect(dl);dl.connect(w);h=q=>{mx(q.mix);l.frequency.value=q.rate;lg.gain.value=q.depth}}
 else if(type==='dist'){const ws=c.createWaveShaper();ws.oversample='4x';I.connect(ws);ws.connect(w);h=q=>{mx(q.mix);const n=256,cu=new Float32Array(n);for(let i=0;i<n;i++)cu[i]=Math.tanh((i*2/(n-1)-1)*(1+q.drive/5));ws.curve=cu}}
 else if(type==='comp'){const cm=c.createDynamicsCompressor();I.connect(cm);cm.connect(w);h=q=>{mx(1);cm.threshold.value=q.thr;cm.ratio.value=q.ratio}}
 else if(type==='tremolo'||type==='autopan'){const lfo=c.createOscillator(),lg=c.createGain();let q0=p,tg;
  if(type==='tremolo'){tg=c.createGain();I.connect(tg);tg.connect(w);lg.connect(tg.gain)}else{tg=c.createStereoPanner();I.connect(tg);tg.connect(w);lg.connect(tg.pan)}
  lfo.connect(lg);lfo.start();dsp.push(()=>lfo.stop());
  const fr=()=>{lfo.frequency.value=q0.sync>=.5?Math.max(.01,Math.min(40,S.bpm/60/Math.max(.125,q0.beats))):q0.rate};
  h=q=>{q0=q;mx(q.mix);lfo.type=['sine','triangle','square'][Math.round(q.shape)]||'sine';
    if(type==='tremolo'){lg.gain.value=q.depth*.5;tg.gain.value=1-q.depth*.5}else{lg.gain.value=q.depth;tg.pan.value=0}fr()};sy=fr}
 else if(type==='ring'){const o=c.createOscillator(),rg=c.createGain();rg.gain.value=0;I.connect(rg);rg.connect(w);o.connect(rg.gain);o.start();dsp.push(()=>o.stop());
  h=q=>{mx(q.mix);o.type=q.shape>=.5?'square':'sine';o.frequency.value=Math.max(1,Math.min(8000,q.freq))}}
 else if(type==='widener'){const sp=c.createChannelSplitter(2),mg=c.createChannelMerger(2),mM=c.createGain(),mS=c.createGain(),inv=c.createGain(),lm2=c.createGain(),rm2=c.createGain(),ls=c.createGain(),rs=c.createGain();
  inv.gain.value=-1;lm2.gain.value=.5;rm2.gain.value=.5;ls.gain.value=.5;rs.gain.value=-.5;
  I.connect(sp);sp.connect(lm2,0);sp.connect(rm2,1);sp.connect(ls,0);sp.connect(rs,1);lm2.connect(mM);rm2.connect(mM);ls.connect(mS);rs.connect(mS);
  mM.connect(mg,0,0);mM.connect(mg,0,1);mS.connect(mg,0,0);mS.connect(inv);inv.connect(mg,0,1);mg.connect(w);
  h=q=>{mx(q.mix);mS.gain.value=q.mono>=.5?0:Math.max(0,Math.min(2,q.width))}}
 else if(type==='custom'){const cf=cfxBuild(c,p.cid,mx,I,w);h=cf.h;cu=cf.cu;dsp.push(cf.ds)}
 else if(WLT.has(type)){const wn=new AudioWorkletNode(c,'dfx',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',channelInterpretation:'speakers',processorOptions:{type,p:Object.assign({},p)}});
  I.connect(wn);wn.connect(w);dsp.push(()=>{try{wn.port.close()}catch(e){}wn.disconnect()});h=q=>{mx(q.mix);wn.port.postMessage(Object.assign({},q))}}
 else{h=q=>{mx(0)}}
 {const h0=h;h=q=>h0(type==='custom'?q:clampP(type,q))}
 h(p);return{I,O,h,sy,cu,bp:v=>{byp=v;ap()},ds:()=>{dsp.forEach(g=>{try{g()}catch(e){}});try{I.disconnect();O.disconnect()}catch(e){}}}}
let CH=new WeakMap(),FXN=new WeakMap();
function getCh(t){let c=CH.get(t);if(!c){c={in:ctx.createGain(),pan:ctx.createStereoPanner(),f:[],vg:ctx.createGain(),eg:ctx.createGain()};c.pan.connect(c.vg);c.vg.connect(master);c.eg.gain.value=0;c.ec=mkFx('delay',{mix:1,time:.3,fb:.35});c.vg.connect(c.eg);c.eg.connect(c.ec.I);c.ec.O.connect(master);CH.set(t,c);rebuild(t)}return c}
const chIn=t=>getCh(t).in;
const MIXP=[0,1,1,.01,'ミックス'],SYN=[0,1,0,1,'テンポ同期',['OFF','ON']],SHP=[0,2,0,1,'波形',['サイン','三角','矩形']];
Object.assign(FXD,{
crush:['ビットクラッシャー',{bits:[1,16,8,1,'ビット深度'],down:[1,50,4,.5,'ダウンサンプル(1/n)'],mix:MIXP}],
phaser:['フェイザー',{rate:[.05,10,.5,.05,'レート(Hz)'],depth:[0,1,.7,.01,'デプス'],freq:[200,3000,800,10,'中心(Hz)'],fb:[0,.85,.4,.01,'フィードバック'],mix:[0,1,.5,.01,'ミックス']}],
flanger:['フランジャー',{rate:[.05,10,.3,.05,'レート(Hz)'],depth:[0,1,.7,.01,'デプス'],delay:[.5,10,2.5,.1,'ディレイ(ms)'],fb:[-.85,.85,.5,.01,'フィードバック'],mix:[0,1,.5,.01,'ミックス']}],
tremolo:['トレモロ',{sync:SYN,rate:[.1,20,5,.1,'レート(Hz)'],beats:[.25,8,1,.25,'周期(拍)'],depth:[0,1,.7,.01,'デプス'],shape:SHP,mix:MIXP}],
autopan:['オートパン',{sync:SYN,rate:[.05,10,1,.05,'レート(Hz)'],beats:[.25,8,2,.25,'周期(拍)'],depth:[0,1,1,.01,'デプス'],shape:SHP,mix:MIXP}],
widener:['ステレオワイダー',{width:[0,2,1.5,.01,'ステレオ幅'],mono:[0,1,0,1,'モノ確認',['OFF','ON']],mix:MIXP}],
limiter:['リミッター',{ceil:[-30,0,-1,.5,'上限(dB)'],rel:[1,1000,100,1,'リリース(ms)'],mix:MIXP}],
gate:['ノイズゲート',{thr:[-80,0,-45,1,'しきい値(dB)'],att:[.1,100,2,.1,'アタック(ms)'],hold:[0,500,50,1,'ホールド(ms)'],rel:[5,1000,120,1,'リリース(ms)'],mix:MIXP}],
trans:['トランジェントシェイパー',{att:[-100,100,0,1,'アタック(%)'],sus:[-100,100,0,1,'サステイン(%)'],mix:MIXP}],
pitch:['ピッチシフター',{semi:[-24,24,0,1,'半音'],fine:[-100,100,0,1,'セント'],win:[20,120,50,1,'ウィンドウ(ms)'],mix:MIXP}],
ring:['リングモジュレーター',{freq:[1,5000,300,1,'周波数(Hz)'],shape:[0,1,0,1,'波形',['サイン','矩形']],mix:[0,1,.8,.01,'ミックス']}],
wah:['オートワウ',{sens:[0,10,3,.1,'感度'],freq:[100,2000,300,10,'基準(Hz)'],range:[0,4,2.5,.1,'幅(oct)'],q:[.5,12,4,.1,'Q'],att:[1,50,5,1,'アタック(ms)'],rel:[10,500,120,1,'リリース(ms)'],mix:MIXP}]});
const fmtP=(v,d)=>d[5]?(d[5][Math.round(v)]??v):(d[3]>=1?String(Math.round(v)):Number(v).toFixed(d[3]<.01?3:2));
function clampP(type,q){const D=FXD[type];if(!D)return q;const o={};for(const k in D[1]){const d=D[1][k];let v=+q[k];if(!isFinite(v))v=d[2];o[k]=Math.max(d[0],Math.min(d[1],v))}return o}
/* AudioWorklet(サンプル単位のDSP): Bitcrusher/Phaser/Flanger/Limiter/Gate/Transient/Pitch/Wah */
const WLT=new Set(['crush','phaser','flanger','limiter','gate','trans','pitch','wah']),WLOK=new WeakSet(),WLP=new WeakMap();let WLURL=null;
const WLCODE=`
const fin=x=>(x===x&&x!==Infinity&&x!==-Infinity)?x:0;
const cl=(x,a,b)=>x<a?a:x>b?b:x;
const TP=6.283185307179586;
class DFX extends AudioWorkletProcessor{
constructor(o){super();const op=o.processorOptions||{};this.t=op.type;this.p=op.p||{};const sr=sampleRate;this.sr=sr;const s=this.s={};
 switch(this.t){
  case 'crush':s.ph=0;s.hl=0;s.hr=0;break;
  case 'gate':s.det=0;s.hc=0;s.g=0;break;
  case 'trans':s.ef=0;s.es=0;s.g=1;break;
  case 'limiter':s.N=Math.max(8,Math.round(sr*.005));s.bl=new Float32Array(s.N);s.br=new Float32Array(s.N);s.gw=new Float32Array(s.N).fill(1);s.pos=0;s.gs=1;break;
  case 'pitch':s.BS=Math.ceil(sr*.5)+8;s.bl=new Float32Array(s.BS);s.br=new Float32Array(s.BS);s.wp=0;s.ph=0;break;
  case 'wah':s.env=0;s.a1=[0,0];s.a2=[0,0];break;
  case 'phaser':s.ph=0;s.z=[new Float32Array(6),new Float32Array(6)];s.fb=[0,0];break;
  case 'flanger':s.BS=Math.ceil(sr*.03)+8;s.bl=new Float32Array(s.BS);s.br=new Float32Array(s.BS);s.wp=0;s.ph=0;break;
 }
 this.port.onmessage=e=>{if(e.data)this.p=e.data}}
rd(b,pos){const BS=b.length;let i=Math.floor(pos);const f=pos-i;i=((i%BS)+BS)%BS;const j=(i+1)%BS;return b[i]+(b[j]-b[i])*f}
process(ins,outs){const out=outs[0],inp=ins[0];if(!out||!out[0])return true;
 const oL=out[0],oR=out[1]||out[0],n=oL.length;
 if(!inp||!inp[0]||inp[0].length===0){oL.fill(0);if(out[1])out[1].fill(0);return true}
 const L=inp[0],R=inp[1]||inp[0];
 try{this['r_'+this.t](L,R,oL,oR,n)}catch(e){oL.fill(0);if(out[1])out[1].fill(0)}
 return true}
r_crush(L,R,oL,oR,n){const p=this.p,s=this.s,lv=Math.pow(2,cl(p.bits,1,16)-1),dn=Math.max(1,p.down);
 for(let i=0;i<n;i++){s.ph+=1;if(s.ph>=dn){s.ph-=dn;s.hl=fin(L[i]);s.hr=fin(R[i])}
  oL[i]=cl(Math.round(s.hl*lv)/lv,-1,1);oR[i]=cl(Math.round(s.hr*lv)/lv,-1,1)}}
r_gate(L,R,oL,oR,n){const p=this.p,s=this.s,sr=this.sr,thr=Math.pow(10,cl(p.thr,-80,0)/20),ca=1-Math.exp(-1/(Math.max(.1,p.att)*.001*sr)),cr=1-Math.exp(-1/(Math.max(1,p.rel)*.001*sr)),hold=Math.max(0,p.hold||0)*.001*sr;
 for(let i=0;i<n;i++){const l=fin(L[i]),r=fin(R[i]),x=Math.max(Math.abs(l),Math.abs(r));s.det=x>s.det?x:s.det*.999;
  let tg;if(s.det>thr){s.hc=hold;tg=1}else if(s.hc>0){s.hc--;tg=1}else tg=0;
  s.g+=(tg-s.g)*(tg>s.g?ca:cr);oL[i]=l*s.g;oR[i]=r*s.g}}
r_trans(L,R,oL,oR,n){const p=this.p,s=this.s,sr=this.sr,aF=1-Math.exp(-1/(.001*sr)),rF=1-Math.exp(-1/(.02*sr)),aS=1-Math.exp(-1/(.02*sr)),rS=1-Math.exp(-1/(.15*sr)),gc=1-Math.exp(-1/(.0005*sr)),at=cl(p.att,-100,100)/100,su=cl(p.sus,-100,100)/100;
 for(let i=0;i<n;i++){const l=fin(L[i]),r=fin(R[i]),x=Math.max(Math.abs(l),Math.abs(r));
  s.ef+=(x-s.ef)*(x>s.ef?aF:rF);s.es+=(x-s.es)*(x>s.es?aS:rS);
  const t=cl(Math.log((s.ef+1e-5)/(s.es+1e-5)),0,2),gdb=cl(at*t*6+su*(1-Math.min(1,t))*6,-12,12),tgt=Math.pow(10,gdb/20);
  s.g+=(tgt-s.g)*gc;oL[i]=cl(fin(l*s.g),-4,4);oR[i]=cl(fin(r*s.g),-4,4)}}
r_limiter(L,R,oL,oR,n){const p=this.p,s=this.s,sr=this.sr,N=s.N,ceil=Math.pow(10,cl(p.ceil,-30,0)/20),rc=1-Math.exp(-1/(Math.max(1,p.rel)*.001*sr)),ac=1-Math.exp(-3/N);
 for(let i=0;i<n;i++){const xl=fin(L[i]),xr=fin(R[i]),pk=Math.max(Math.abs(xl),Math.abs(xr)),need=pk>ceil?ceil/pk:1;
  let m=need;for(let k=0;k<N;k++){const v=s.gw[k];if(v<m)m=v}
  s.gw[s.pos]=need;
  s.gs+=(m-s.gs)*(m<s.gs?ac:rc);
  const dl=s.bl[s.pos],dr=s.br[s.pos];s.bl[s.pos]=xl;s.br[s.pos]=xr;s.pos=(s.pos+1)%N;
  oL[i]=cl(dl*s.gs,-ceil,ceil);oR[i]=cl(dr*s.gs,-ceil,ceil)}}
r_pitch(L,R,oL,oR,n){const p=this.p,s=this.s,sr=this.sr,ratio=Math.pow(2,(cl(p.semi||0,-24,24)+cl(p.fine||0,-100,100)/100)/12),W=cl(p.win||50,20,120)*.001*sr,BS=s.BS;
 for(let i=0;i<n;i++){s.bl[s.wp]=fin(L[i]);s.br[s.wp]=fin(R[i]);let yl,yr;
  if(Math.abs(ratio-1)<1e-4){const d=W*.5;yl=this.rd(s.bl,s.wp-d);yr=this.rd(s.br,s.wp-d)}
  else{s.ph+=(1-ratio)/W;s.ph-=Math.floor(s.ph);const p1=s.ph,p2=(s.ph+.5)%1,d1=p1*W+1,d2=p2*W+1,w1=.5-.5*Math.cos(TP*p1),w2=.5-.5*Math.cos(TP*p2);
   yl=w1*this.rd(s.bl,s.wp-d1)+w2*this.rd(s.bl,s.wp-d2);yr=w1*this.rd(s.br,s.wp-d1)+w2*this.rd(s.br,s.wp-d2)}
  oL[i]=cl(fin(yl),-4,4);oR[i]=cl(fin(yr),-4,4);s.wp=(s.wp+1)%BS}}
r_wah(L,R,oL,oR,n){const p=this.p,s=this.s,sr=this.sr,ca=1-Math.exp(-1/(cl(p.att||5,1,50)*.001*sr)),cr=1-Math.exp(-1/(cl(p.rel||120,10,500)*.001*sr)),k=1/cl(p.q||4,.5,12),sens=cl(p.sens==null?3:p.sens,0,10),base=cl(p.freq||300,100,2000),rg=cl(p.range==null?2.5:p.range,0,4);
 for(let i=0;i<n;i++){const xl=fin(L[i]),xr=fin(R[i]),x=Math.max(Math.abs(xl),Math.abs(xr));s.env+=(x-s.env)*(x>s.env?ca:cr);
  const e=cl(s.env*sens,0,1),fc=cl(base*Math.pow(2,rg*e),20,sr*.45),g=Math.tan(Math.PI*fc/sr),a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;
  for(let c=0;c<2;c++){const x0=c?xr:xl,v3=x0-s.a2[c],v1=a1*s.a1[c]+a2*v3,v2=s.a2[c]+a2*s.a1[c]+a3*v3;s.a1[c]=2*v1-s.a1[c];s.a2[c]=2*v2-s.a2[c];
   let y=cl(fin(k*v1*2),-4,4);if(!isFinite(s.a1[c])||!isFinite(s.a2[c])){s.a1[c]=0;s.a2[c]=0;y=0}(c?oR:oL)[i]=y}}}
r_phaser(L,R,oL,oR,n){const p=this.p,s=this.s,sr=this.sr,rate=cl(p.rate==null?.5:p.rate,.05,10)/sr,depth=cl(p.depth==null?.7:p.depth,0,1),ctr=cl(p.freq||800,200,3000),fb=cl(p.fb==null?.4:p.fb,0,.85);
 for(let i=0;i<n;i++){s.ph+=rate;if(s.ph>=1)s.ph-=1;const fc=cl(ctr*Math.pow(2,Math.sin(TP*s.ph)*depth*2),30,sr*.45),t=Math.tan(Math.PI*fc/sr),a=(t-1)/(t+1);
  for(let c=0;c<2;c++){let x=fin(c?R[i]:L[i])+fb*s.fb[c];const z=s.z[c];for(let k=0;k<6;k++){const y=a*x+z[k];z[k]=x-a*y;x=y}x=cl(fin(x),-4,4);s.fb[c]=x;(c?oR:oL)[i]=x}}}
r_flanger(L,R,oL,oR,n){const p=this.p,s=this.s,sr=this.sr,rate=cl(p.rate==null?.3:p.rate,.05,10)/sr,depth=cl(p.depth==null?.7:p.depth,0,1),base=cl(p.delay||2.5,.5,10)*.001*sr,fb=cl(p.fb==null?.5:p.fb,-.85,.85),BS=s.BS;
 for(let i=0;i<n;i++){s.ph+=rate;if(s.ph>=1)s.ph-=1;
  const dl=Math.max(1,base*(1+.9*depth*Math.sin(TP*s.ph))),dr=Math.max(1,base*(1+.9*depth*Math.sin(TP*s.ph+1.5707963))),yl=this.rd(s.bl,s.wp-dl),yr=this.rd(s.br,s.wp-dr);
  s.bl[s.wp]=cl(fin(L[i])+fb*yl,-4,4);s.br[s.wp]=cl(fin(R[i])+fb*yr,-4,4);oL[i]=cl(fin(yl),-4,4);oR[i]=cl(fin(yr),-4,4);s.wp=(s.wp+1)%BS}}
}
registerProcessor('dfx',DFX);`;
async function ensureWL(c){if(WLOK.has(c))return;if(WLP.has(c))return WLP.get(c);
  const pr=(async()=>{if(!c.audioWorklet)throw new Error('このブラウザはAudioWorkletに対応していません');
    if(!WLURL)WLURL=URL.createObjectURL(new Blob([WLCODE],{type:'text/javascript'}));await c.audioWorklet.addModule(WLURL);WLOK.add(c)})();
  WLP.set(c,pr);try{await pr}catch(e){WLP.delete(c);throw e}}
const usesWL=()=>S.tracks.some(t=>(t.fx||[]).some(e=>needWL(e)));
function rebuildAll(){for(const t of S.tracks)if(CH.get(t))rebuild(t)}
function updSyncFx(){for(const t of S.tracks){const c=CH.get(t);if(c)c.f.forEach(n=>{if(n.sy)n.sy()})}}
function fxNode(e){let n=FXN.get(e);if(!n){
  if(needWL(e)&&!WLOK.has(ctx)){ensureWL(ctx).then(rebuildAll).catch(er=>{$('st').textContent='AudioWorkletを使えないため「'+FXD[e.type][0]+'」は無効です: '+er.message});const g=ctx.createGain();return{I:g,O:g,h(){},bp(){}}}
  n=mkFx(e.type,Object.assign(defP(e.type),e.p));if(e.on===false)n.bp(true);FXN.set(e,n)}return n}
function rebuild(t){if(!ctx)return;const c=getCh(t);c.in.disconnect();c.f.forEach(n=>n.O.disconnect());
 const fx=(t.fx||[]).map(fxNode);let prev=c.in;fx.forEach(n=>{prev.connect(n.I);prev=n.O});prev.connect(c.pan);c.f.forEach(n=>{if(!fx.includes(n)&&n.ds)n.ds()});c.f=fx;c.pan.pan.value=t.pan||0}
function renderMx(){const m=$('mx'),t=S.tracks[sel];m.innerHTML='';t.fx=t.fx||[];
 const h=document.createElement('div');h.className='fx';
 h.innerHTML='<div class="h"><b>'+t.name.replace(/[<>&"]/g,'')+' のミキサー</b></div><label>パン <input type="range" min="-1" max="1" step=".05" value="'+(t.pan||0)+'"></label><select><option value="">＋エフェクト追加</option>'+Object.keys(FXD).filter(k=>k!=='custom').map(k=>'<option value="'+k+'">'+FXD[k][0]+'</option>').join('')+cfxOptions()+'</select><button data-st="1">★ 自作エフェクト作成</button><span style="color:var(--mut)">上から順に処理されます</span>';
 h.querySelector('input').oninput=e=>{t.pan=+e.target.value;if(ctx)getCh(t).pan.pan.value=t.pan;dirty()};
 h.querySelector('select').onchange=async e=>{const k=e.target.value;if(!k)return;
  if(k.startsWith('custom:')){const cid=k.slice(7),cf=S.cfx.find(x=>x.id===cid);
    if(cf&&cfxUsesWL(cf)){try{initAudio();await ensureWL(ctx)}catch(er){alert('AudioWorkletを使えないため、このエフェクトは追加できません: '+er.message);renderMx();return}}
    pushUndo();t.fx.push({type:'custom',p:{mix:cf?cf.mix:1,cid},on:true});rebuild(t);renderMx();dirty();return}
  if(WLT.has(k)){try{initAudio();await ensureWL(ctx)}catch(er){alert('このブラウザではAudioWorkletを使えないため、このエフェクトは追加できません: '+er.message);renderMx();return}}
  pushUndo();t.fx.push({type:k,p:defP(k),on:true});rebuild(t);renderMx();dirty()};
 h.querySelector('[data-st]').onclick=()=>openStudio();m.appendChild(h);
 t.fx.forEach((e,i)=>{const d=document.createElement('div');d.className='fx';
  d.innerHTML='<div class="h"><b>'+(i+1)+'. '+fxName(e)+'</b>'+(e.type==='custom'?'<button data-o="3" title="スタジオで編集">✎</button>':'')+'<button data-o="1" title="ON/OFF" class="'+(e.on===false?'':'on')+'">ON</button><button data-o="2" title="初期値に戻す">↺</button><button data-m="-1">◀</button><button data-m="1">▶</button><button data-m="0">✕</button></div>'+
   Object.entries(fxParams(e)).map(([k,v])=>'<label>'+v[4]+' <span class="fv">'+fmtP(e.p[k]??v[2],v)+'</span><input type="range" data-k="'+k+'" min="'+v[0]+'" max="'+v[1]+'" step="'+v[3]+'" value="'+(e.p[k]??v[2])+'"></label>').join('');
  d.querySelectorAll('[data-k]').forEach(r=>r.oninput=()=>{e.p[r.dataset.k]=+r.value;const sp=r.parentNode.querySelector('.fv');if(sp)sp.textContent=fmtP(+r.value,fxParams(e)[r.dataset.k]);if(ctx)fxNode(e).h(Object.assign(defP(e.type),e.p));dirty()});
  d.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const mv=+b.dataset.m;pushUndo();
   if(mv===0){const dn=FXN.get(t.fx[i]);if(dn&&dn.ds)dn.ds();FXN.delete(t.fx[i]);t.fx.splice(i,1)}else{const j=i+mv;if(j<0||j>=t.fx.length)return;[t.fx[i],t.fx[j]]=[t.fx[j],t.fx[i]]}
   rebuild(t);renderMx();dirty()});
  d.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{pushUndo();
   if(b.dataset.o==='3'){undo.pop();openStudio(e.p.cid);return}if(b.dataset.o==='1'){e.on=e.on===false;if(ctx)fxNode(e).bp(e.on===false)}else{e.p=Object.assign(defP(e.type),e.type==='custom'?{cid:e.p.cid}:{});if(ctx)fxNode(e).h(Object.assign({},e.p))}
   renderMx();dirty()});
  m.appendChild(d)})}
const _rt=renderTracks;renderTracks=function(){_rt();renderMx()};
/* ---------- 書き出し (WAV/MIDI/JSON) ---------- */
function dl(name,data,mime){
  try{const b=data instanceof Blob?data:new Blob([data],{type:mime||'application/octet-stream'});
    const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.style.display='none';
    document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(u)},4000);
    $('st').textContent='ファイルを書き出しました: '+name}
  catch(e){$('st').textContent='書き出し失敗: '+e.message;alert('ファイルを保存できませんでした: '+e.message)}}
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=u=>{let c=-1;for(let i=0;i<u.length;i++)c=crcT[(c^u[i])&255]^(c>>>8);return(c^-1)>>>0};
const cat=a=>{const r=new Uint8Array(a.reduce((s,x)=>s+x.length,0));let o=0;for(const x of a){r.set(x,o);o+=x.length}return r};
function zip(name,u8){
  const nb=new TextEncoder().encode(name),crc=crc32(u8),n=u8.length,l=new DataView(new ArrayBuffer(30+nb.length));
  l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint32(14,crc,true);l.setUint32(18,n,true);l.setUint32(22,n,true);l.setUint16(26,nb.length,true);new Uint8Array(l.buffer).set(nb,30);
  const c=new DataView(new ArrayBuffer(46+nb.length));
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,crc,true);c.setUint32(20,n,true);c.setUint32(24,n,true);c.setUint16(28,nb.length,true);new Uint8Array(c.buffer).set(nb,46);
  const e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,1,true);e.setUint16(10,1,true);e.setUint32(12,c.byteLength,true);e.setUint32(16,30+nb.length+n,true);
  return new Blob([l.buffer,u8,c.buffer,e.buffer],{type:'application/zip'})}
async function renderMix(sr){ // 既存のオフライン描画(再生と同じ voice / チャンネル / エフェクト / オートメーション)を AudioBuffer として返す
  const sp=60/S.bpm,dur=S.len*sp+3;
  if(!songNotes().some(e=>audible(e.t))&&!AT().some(tr=>tr.clips.length&&audA(tr)))throw Object.assign(new Error('書き出す音符がありません'),{cancel:true});
  const missSF=S.tracks.filter(t=>t.sf&&!sfRes(t)&&songNotes().some(e=>e.t===t));
  if(missSF.length&&!confirm('音源(SF2)が読み込まれていないトラックがあります: '+missSF.map(t=>t.name).join(', ')+'\nこのまま書き出すと、そのトラックは内蔵シンセの音になります。続けますか?'))throw Object.assign(new Error('書き出しを中止しました'),{cancel:true});
  const sv={ctx,master,an,CH,FXN,AG};let p;
  try{
    const oc=new OfflineAudioContext(2,Math.ceil(dur*sr),sr);if(usesWL())await ensureWL(oc);
    ctx=oc;an=null;CH=new WeakMap();FXN=new WeakMap();AG=new WeakMap();
    const cm=oc.createDynamicsCompressor();master=oc.createGain();master.gain.value=.8;master.connect(cm);cm.connect(oc.destination);
    for(const e of songNotes())if(audible(e.t)){VB=e.s;voice(e.t,e.p,e.v,.05+e.s*sp,e.d*sp);VB=null}
    for(const tr of AT()){if(!audA(tr))continue;for(const c of tr.clips)startClip(c,tr,.05+c.s*sp,c.o,Math.min(c.d,Math.max(0,(S.len-c.s)*sp)),false)}
    for(let b=0;b<S.len-1e-9;b+=SNAP)schedAuto(b,.05+b*sp,sp);
    p=oc.startRendering();
  }finally{ctx=sv.ctx;master=sv.master;an=sv.an;CH=sv.CH;FXN=sv.FXN;AG=sv.AG}
  return await p}
function encodeWav(b,g){g=g==null?1:g;const n=b.length,sr=b.sampleRate,L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L,ch=[L,R],o=new DataView(new ArrayBuffer(44+n*4));
  const w=(i,t)=>{for(let k=0;k<t.length;k++)o.setUint8(i+k,t.charCodeAt(k))};
  w(0,'RIFF');o.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');o.setUint32(16,16,true);o.setUint16(20,1,true);o.setUint16(22,2,true);o.setUint32(24,sr,true);o.setUint32(28,sr*4,true);o.setUint16(32,4,true);o.setUint16(34,16,true);w(36,'data');o.setUint32(40,n*4,true);
  let pk=0;for(let i=0;i<n;i++)for(let c=0;c<2;c++){let v=ch[c][i]*g;if(!isFinite(v))v=0;const a=v<0?-v:v;if(a>pk)pk=a;const x=v>1?1:v<-1?-1:v;o.setInt16(44+i*4+c*2,x<0?x*32768:x*32767,true)}
  return{blob:new Blob([o.buffer],{type:'audio/wav'}),peak:pk}}
async function exportWav(){ // 従来の「そのままWAV書き出し」(mix.wav)。モーダルを使わない呼び出し用に残してある
  const sr=+$('sr').value;$('st').textContent='WAVを書き出し中…(長い曲は数秒かかります)';
  try{const b=await renderMix(sr),r=encodeWav(b,1);$('st').textContent='WAV生成完了'+(r.peak>1?' (クリッピングあり)':'');dl((xDefName()+'.wav'),r.blob)}
  catch(e){if(e&&e.cancel){$('st').textContent=e.message;if(e.message==='書き出す音符がありません')alert(e.message);return}$('st').textContent='WAV書き出し失敗: '+e.message;alert('WAVを生成できませんでした: '+e.message)}}
/* ---------- ダウンロード用モーダル(形式・音量・プレビュー) ---------- */
const xo=$('xpo'),xs={buf:null,key:'',p:null,peak:0,prev:null,busy:false,abort:null,ret:null,fmts:[]};
const XEXT=['wav','webm','ogg','m4a','mp3','mp4','opus','aac'];
function xClean(n){n=String(n==null?'':n).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().replace(/^\.+/,'');const m=n.match(/\.([A-Za-z0-9]{2,4})$/);if(m&&XEXT.includes(m[1].toLowerCase()))n=n.slice(0,-m[0].length);return n.replace(/[. ]+$/,'').slice(0,100)}
function xDefName(){return xClean(currentProjectName())||'BGM'}
function xFormats(){const L=[{id:'wav',label:'WAV (16bit PCM・非圧縮)',ext:'wav'}];
  const ok=t=>{try{return MediaRecorder.isTypeSupported(t)}catch(e){return false}};
  const can=typeof MediaRecorder!=='undefined'&&typeof AudioContext!=='undefined'&&typeof AudioContext.prototype.createMediaStreamDestination==='function';
  if(can)for(const [id,label,ext,types] of [['webm','WebM / Opus','webm',['audio/webm;codecs=opus']],['ogg','Ogg / Opus','ogg',['audio/ogg;codecs=opus']],['m4a','M4A / AAC','m4a',['audio/mp4;codecs=mp4a.40.2','audio/mp4']],['mp3','MP3','mp3',['audio/mpeg']]]){const t=types.find(ok);if(t)L.push({id,label,ext,rec:t})}
  return L}
const xFmt=()=>xs.fmts.find(f=>f.id===$('xFmt').value)||xs.fmts[0];
const xVolVal=()=>{const v=+$('xVolN').value;return isFinite(v)?Math.max(0,Math.min(200,v)):100};
function xMsg(t,c){const e=$('xMsg');e.textContent=t||'';e.className=c||''}
function xProg(p){$('xBar').classList.remove('ind');$('xBar').firstChild.style.width=Math.round(Math.max(0,Math.min(1,p))*100)+'%'}
function xBusy(on,msg){xs.busy=on;$('xGo').disabled=on;$('xPrev').disabled=on;$('xFmt').disabled=on;$('xSr').disabled=on;$('xName').disabled=on;const b=$('xBar');if(on){b.classList.add('ind');xMsg(msg||'処理中…')}else{b.classList.remove('ind');b.firstChild.style.width='0'}}
function xInfo(){if(!xs.buf||!xs.peak)return;const g=xVolVal()/100,pk=xs.peak*g,db=pk>0?20*Math.log10(pk):-Infinity;
  xMsg('ピーク '+(isFinite(db)?db.toFixed(1):'-∞')+' dBFS(音量適用後)'+(pk>1?' — 音が大きすぎて一部がクリップします。全体音量を下げてください':''),pk>1?'warn':'')}
async function xGetMix(){const sr=+$('xSr').value,key=sr+'|'+LIBVER+'|'+snap();if(xs.key===key){if(xs.buf)return xs.buf;if(xs.p)return xs.p}
  xs.key=key;xs.buf=null;xs.peak=0;
  xs.p=renderMix(sr).then(b=>{if(xs.key===key){xs.buf=b;let pk=0;for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);for(let i=0;i<d.length;i++){const a=d[i]<0?-d[i]:d[i];if(a>pk)pk=a}}xs.peak=pk}return b}).finally(()=>{if(xs.key===key)xs.p=null});return xs.p}
function recordBuf(buf,g,fmt,onProg,ab){return new Promise(async(res,rej)=>{
  try{initAudio();await ctx.resume();const dst=ctx.createMediaStreamDestination(),src=ctx.createBufferSource(),gn=ctx.createGain();gn.gain.value=g;src.buffer=buf;src.connect(gn);gn.connect(dst);
    const mr=new MediaRecorder(dst.stream,{mimeType:fmt.rec,audioBitsPerSecond:192000}),ch=[];
    mr.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data)};mr.onerror=e=>rej(new Error('エンコードに失敗しました: '+((e.error&&e.error.message)||'不明なエラー')));
    mr.onstop=()=>{try{src.disconnect();gn.disconnect()}catch(_){}if(ab.abort){rej(Object.assign(new Error('中止しました'),{cancel:true}));return}const blob=new Blob(ch,{type:mr.mimeType||fmt.rec});blob.size?res(blob):rej(new Error('出力が空でした'))};
    const t0=ctx.currentTime+.05;src.onended=()=>setTimeout(()=>{if(mr.state!=='inactive')mr.stop()},200);
    ab.stop=()=>{ab.abort=true;try{src.stop()}catch(_){}if(mr.state!=='inactive')mr.stop()};
    mr.start(250);src.start(t0);const tick=()=>{if(mr.state==='inactive')return;onProg((ctx.currentTime-t0)/buf.duration);requestAnimationFrame(tick)};tick()}
  catch(e){rej(new Error('エンコーダーを開始できません: '+e.message))}})}
function xStopPrev(){const p=xs.prev;xs.prev=null;if(p){try{p.src.onended=null;p.src.stop()}catch(_){}try{p.gn.disconnect()}catch(_){}}$('xPrev').textContent='▶ プレビュー';if(!xs.busy)xProg(0)}
function xTick(){const p=xs.prev;if(!p)return;xProg((ctx.currentTime-p.t0)/p.dur);requestAnimationFrame(xTick)}
async function xPreview(){if(xs.prev){xStopPrev();return}if(xs.busy)return;xBusy(true,'プレビュー用のミックスを生成中…');
  try{const buf=await xGetMix();if(xo.hidden){xBusy(false);return}initAudio();await ctx.resume();const src=ctx.createBufferSource(),gn=ctx.createGain();gn.gain.value=xVolVal()/100;src.buffer=buf;src.connect(gn);gn.connect(ctx.destination);
    const t0=ctx.currentTime+.03;xs.prev={src,gn,t0,dur:buf.duration};src.onended=()=>{if(xs.prev&&xs.prev.src===src)xStopPrev()};src.start(t0);
    xBusy(false);$('xPrev').disabled=false;$('xPrev').textContent='■ 停止';xInfo();xTick()}
  catch(e){xBusy(false);if(e&&e.cancel)xMsg(e.message);else xMsg('プレビューに失敗しました: '+(e&&e.message||e),'err')}}
async function xDownload(){if(xs.busy)return;const base=xClean($('xName').value);if(!base){xMsg('ファイル名を入力してください','err');$('xName').focus();return}
  xStopPrev();const fmt=xFmt(),g=xVolVal()/100,ab={};xs.abort=ab;xBusy(true,'ミックスを生成中…(長い曲は数秒かかります)');
  try{const buf=await xGetMix();if(ab.abort)throw Object.assign(new Error('中止しました'),{cancel:true});let blob,pk=xs.peak*g;
    if(fmt.id==='wav'){const r=encodeWav(buf,g);blob=r.blob;pk=r.peak}
    else{xBusy(true,fmt.label+' に変換中…(曲の長さと同じ時間がかかります)');blob=await recordBuf(buf,g,fmt,xProg,ab)}
    if(ab.abort)throw Object.assign(new Error('中止しました'),{cancel:true});
    dl(base+'.'+fmt.ext,blob,blob.type||'application/octet-stream');
    const m=base+'.'+fmt.ext+' を書き出しました('+(blob.size/1048576).toFixed(1)+'MB)'+(pk>1?' ※一部がクリップしています':'');xBusy(false);xMsg(m,pk>1?'warn':'ok');$('st').textContent=m}
  catch(e){xBusy(false);if(e&&e.cancel)xMsg(e.message);else{xMsg('書き出しに失敗しました: '+(e&&e.message||e),'err');$('st').textContent='書き出し失敗: '+(e&&e.message||e)}}
  finally{xs.abort=null}}
function xFill(){const sel=$('xFmt'),cur=sel.value;xs.fmts=xFormats();sel.innerHTML=xs.fmts.map(f=>'<option value="'+f.id+'">'+f.label+'</option>').join('');sel.value=xs.fmts.some(f=>f.id===cur)?cur:'wav';
  $('xExt').textContent='.'+xFmt().ext;$('xFmtNote').textContent=xs.fmts.length>1?'このブラウザで書き出せる形式だけを表示しています。圧縮形式は曲の長さと同じ時間をかけて変換します。':'このブラウザではWAV以外の形式を書き出せないため、WAVのみ表示しています。'}
function openExport(){xs.ret=document.activeElement;xFill();$('xName').value=xDefName();$('xSr').value=$('sr').value;xMsg('');xProg(0);xo.hidden=false;document.body.classList.add('fxopen');$('xName').focus();$('xName').select()}
function xClose(){if(xs.abort){xs.abort.abort=true;if(xs.abort.stop)xs.abort.stop()}xStopPrev();xBusy(false);xo.hidden=true;document.body.classList.remove('fxopen');xs.buf=null;xs.key='';xs.p=null;xs.peak=0;if(xs.ret&&xs.ret.isConnected)xs.ret.focus()}
$('xCancel').onclick=xClose;$('xGo').onclick=xDownload;$('xPrev').onclick=xPreview;
$('xFmt').onchange=()=>{$('xExt').textContent='.'+xFmt().ext};$('xSr').onchange=()=>{xStopPrev();xMsg('')};
$('xVol').oninput=e=>{$('xVolN').value=e.target.value;if(xs.prev)xs.prev.gn.gain.value=xVolVal()/100;xInfo()};
$('xVolN').oninput=e=>{const v=Math.max(0,Math.min(200,+e.target.value||0));$('xVol').value=v;if(xs.prev)xs.prev.gn.gain.value=v/100;xInfo()};
$('xVolN').onchange=e=>{const v=Math.max(0,Math.min(200,Math.round(+e.target.value)));e.target.value=isFinite(v)?v:100;$('xVol').value=e.target.value;xInfo()};
$('xName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();xDownload()}};
xo.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab'){const f=[...xo.querySelectorAll('button:not([disabled]),input:not([disabled]),.dd>button:not([disabled])')].filter(x=>x.offsetParent!==null);if(f.length){const i=f.indexOf(document.activeElement);if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}}});
addEventListener('keydown',e=>{if(xo.hidden||e.key!=='Escape'||(typeof DD!=='undefined'&&DD.openNow()))return;e.stopImmediatePropagation();xClose()},true);

function exportMidi(){
  const PPQ=480,vl=v=>{const a=[v&127];while(v>>=7)a.unshift((v&127)|128);return a};
  const chunk=(id,d)=>{const h=new Uint8Array(8+d.length);for(let i=0;i<4;i++)h[i]=id.charCodeAt(i);new DataView(h.buffer).setUint32(4,d.length);h.set(d,8);return h};
  const mk=ev=>{ev.sort((a,b)=>a.t-b.t||a.o-b.o);let last=0,d=[];for(const e of ev){d.push(...vl(e.t-last),...e.b);last=e.t}d.push(0,0xFF,0x2F,0);return chunk('MTrk',Uint8Array.from(d))};
  const us=Math.round(6e7/S.bpm),head=new Uint8Array(14),hv=new DataView(head.buffer);
  head.set([77,84,104,100,0,0,0,6,0,1]);hv.setUint16(10,S.tracks.length+1);hv.setUint16(12,PPQ);
  const parts=[head,mk([{t:0,o:0,b:[0xFF,0x51,3,us>>16&255,us>>8&255,us&255]},{t:0,o:0,b:[0xFF,0x58,4,4,2,24,8]}])];
  const CHS=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15];
  S.tracks.forEach((t,i)=>{const c=CHS[i%15],ev=[];if(t.sf)ev.push({t:0,o:-1,b:[0xC0|c,t.sf.p&127]});
    for(const n of songNotes().filter(e=>e.t===t)){const a=Math.round(n.s*PPQ),z=Math.max(a+1,Math.round((n.s+n.d)*PPQ));ev.push({t:a,o:1,b:[0x90|c,n.p&127,n.v&127]},{t:z,o:0,b:[0x80|c,n.p&127,0]})}
    parts.push(mk(ev))});
  dl((xDefName()+'.mid'),new Blob([cat(parts)],{type:'audio/midi'}));
}
function importMidi(buf){
  const u=new Uint8Array(buf),dv=new DataView(buf);
  const s4=p=>String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]);
  if(u.length<14||s4(0)!=='MThd')throw new Error('標準MIDIファイルではありません');
  const nt=dv.getUint16(10),div=dv.getUint16(12);
  if(!div||(div&0x8000))throw new Error('この時間形式(SMPTE)のMIDIは未対応です');
  let p=8+dv.getUint32(4),bpm=null,maxEnd=0;const tr=[];
  for(let k=0;k<nt&&p+8<=u.length;k++){
    const len=dv.getUint32(p+4),end=Math.min(u.length,p+8+len);let q=p+8,tick=0,rs=0;const on={},notes=[];
    while(q<end){
      let d=0,b;do{b=u[q++];d=d*128+(b&127)}while((b&128)&&q<end);tick+=d;
      const st=u[q];
      if(st===0xFF){const ty=u[q+1];let l=0,r=q+2,c;do{c=u[r++];l=l*128+(c&127)}while((c&128)&&r<end);
        if(ty===0x51&&bpm===null&&l===3)bpm=Math.round(6e7/(u[r]*65536+u[r+1]*256+u[r+2]));
        q=r+l;if(ty===0x2F)break;continue}
      if(st===0xF0||st===0xF7){let l=0,r=q+1,c;do{c=u[r++];l=l*128+(c&127)}while((c&128)&&r<end);q=r+l;continue}
      let s=st;if(st&128){rs=st;q++}else s=rs;
      const hi=s>>4,ch=s&15;
      if(hi===0xC||hi===0xD){q++;continue}
      const a=u[q++],v=u[q++],key=ch*128+a;
      if(hi===9&&v>0){on[key]=[tick,v]}
      else if(hi===8||hi===9){const x=on[key];if(x){delete on[key];const n={p:a,s:x[0]/div,d:Math.max(.0625,(tick-x[0])/div),v:x[1]};notes.push(n);maxEnd=Math.max(maxEnd,n.s+n.d)}}
    }
    if(notes.length)tr.push(notes);
    p+=8+len;
  }
  if(!tr.length)throw new Error('音符が見つかりませんでした');
  pushUndo();
  const len=Math.min(MAXBARS*4,Math.max(16,Math.ceil(maxEnd/4)*4));
  S.len=len;if(bpm)S.bpm=Math.max(40,Math.min(240,bpm));fitLen();
  S.tracks=tr.slice(0,16).map((ns,i)=>Object.assign(newTrack(i),{name:'MIDI '+(i+1),notes:ns.filter(n=>n.s<len)}));
  sel=0;selNote=null;playBeat=0;$('bpm').value=S.bpm;S.patterns=null;normS();renderTracks();draw();dirty();
  return 'トラック'+S.tracks.length+' / 音符'+(NC=null,songNotes().length)+(tr.length>16?' (17トラック目以降は省略)':'')}
$('wav').onclick=openExport;$('mexp').onclick=exportMidi;$('mimp').onclick=()=>$('midf').click();
$('midf').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{if(playing)stop(true);const m=importMidi(await f.arrayBuffer());$('st').textContent='MIDI読込完了: '+m+' (拍子は4/4固定)'}
  catch(err){$('st').textContent='MIDI読込失敗: '+err.message;alert('MIDIを読み込めませんでした: '+err.message)}};
/* ---------- ベロシティレーン ---------- */
const vl=$('vl'),vg=vl.getContext('2d'),VLH=96;let vdrag=null;
function drawVL(){const r=devicePixelRatio||1,w=Math.max(1,roll.clientWidth),h=VLH,sx=roll.scrollLeft;
  const cw=Math.round(w*r),chh=Math.round(h*r);if(vl.width!==cw||vl.height!==chh){vl.width=cw;vl.height=chh;vl.style.width=w+'px';vl.style.height=h+'px'}
  const C={panel:css('--panel'),line:css('--line'),bar:css('--bar'),mut:css('--mut'),note:css('--note'),fg:css('--fg')},top=14,bh=h-top-4;
  vg.setTransform(r,0,0,r,0,0);vg.globalAlpha=1;vg.fillStyle=C.panel;vg.fillRect(0,0,w,h);
  vg.strokeStyle=C.line;for(const q of [.25,.5,.75,1]){const y=Math.round(top+bh*(1-q))+.5;vg.beginPath();vg.moveTo(0,y);vg.lineTo(w,y);vg.stroke()}
  for(let bar=Math.max(0,Math.floor(sx/BW/4));bar<=Math.min(S.len/4,Math.ceil((sx+w)/BW/4));bar++){const x=bar*4*BW-sx;vg.strokeStyle=C.bar;vg.beginPath();vg.moveTo(x+.5,top);vg.lineTo(x+.5,h);vg.stroke()}
  vg.fillStyle=C.mut;vg.font='10px system-ui';vg.fillText('ベロシティ (1-127)',6,10);
  for(const n of S.tracks[sel].notes){const x=n.s*BW-sx;if(x<-8||x>w+8)continue;const on=n===selNote||selSet.has(n),bhh=Math.max(2,n.v/127*bh),y=top+bh-bhh;
    vg.globalAlpha=on?1:.55;vg.fillStyle=on?C.fg:C.note;vg.fillRect(x,y,6,bhh);if(on){vg.fillStyle=C.note;vg.fillRect(x-1,y,8,3)}}
  vg.globalAlpha=1;{const rp=relPB();if(rp>=0){vg.fillStyle='#e5484d';vg.fillRect(rp*BW-sx,top,2,bh)}}}
const vOf=y=>Math.max(1,Math.min(127,Math.round((1-(y-14)/(VLH-18))*127)));
const vXY=e=>{const r=vl.getBoundingClientRect();return{x:e.clientX-r.left+roll.scrollLeft,y:e.clientY-r.top}};
function vApply(e){const nv=vOf(vXY(e).y),d=nv-vdrag.v0;for(const g of vdrag.group)g.n.v=Math.max(1,Math.min(127,g.v+d));draw()}
vl.addEventListener('pointerdown',e=>{const{x,y}=vXY(e),tv=vOf(y);let best=null,bs=1e9;
  for(const n of S.tracks[sel].notes){const dx=Math.abs(x-(n.s*BW+3));if(dx>10)continue;const sc=Math.abs(n.v-tv)+dx*.5;if(sc<bs){bs=sc;best=n}}
  if(!best)return;initAudio();vl.setPointerCapture(e.pointerId);pushUndo();
  if(!selSet.has(best)){selSet.clear();selSet.add(best)}selNote=best;
  vdrag={n:best,v0:best.v,group:[...selSet].map(n=>({n,v:n.v}))};vApply(e)});
vl.addEventListener('pointermove',e=>{if(vdrag)vApply(e)});
const vEnd=()=>{if(!vdrag)return;const n=vdrag.n;vdrag=null;voice(S.tracks[sel],n.p,n.v,ctx.currentTime,.3);draw();dirty()};
vl.addEventListener('pointerup',vEnd);vl.addEventListener('pointercancel',vEnd);
/* ---------- 複製 ---------- */
function dupSel(){const a=selList();if(!a.length){$('st').textContent='複製する音符を選択してください(選択モードで範囲選択)';return}
  const b0=Math.min(...a.map(n=>n.s)),b1=Math.max(...a.map(n=>n.s+n.d)),off=Math.ceil((b1-b0)/GRID-1e-9)*GRID;
  if(b1+off>MAXBARS*4){alert('最大小節数を超えるため複製できません');return}
  pushUndo();if(b1+off>S.len)S.len=Math.ceil((b1+off)/4)*4;
  const t=S.tracks[sel],ns=a.map(n=>({p:n.p,s:n.s+off,d:n.d,v:n.v}));t.notes.push(...ns);
  selSet.clear();ns.forEach(n=>selSet.add(n));selNote=null;
  const x=(b0+off)*BW;if(x<roll.scrollLeft||x>roll.scrollLeft+roll.clientWidth-40)roll.scrollLeft=Math.max(0,x-40);
  draw();dirty();$('st').textContent=ns.length+'音符を直後に複製しました'}
$('dup').onclick=dupSel;
/* ---------- ズーム ---------- */
const BW0=48,RH0=16;let zh=1,zv=1;
function zoomH(z){const c=(roll.scrollLeft+roll.clientWidth/2)/BW;zh=Math.max(.33,Math.min(4,z));BW=BW0*zh;draw();roll.scrollLeft=Math.max(0,c*BW-roll.clientWidth/2);$('zhl').textContent=Math.round(zh*100)+'%';draw()}
function zoomV(z){const c=(roll.scrollTop+roll.clientHeight/2)/RH;zv=Math.max(.6,Math.min(3,z));RH=RH0*zv;draw();roll.scrollTop=Math.max(0,c*RH-roll.clientHeight/2);$('zvl').textContent=Math.round(zv*100)+'%';draw()}
$('zhm').onclick=()=>zoomH(zh/1.25);$('zhp').onclick=()=>zoomH(zh*1.25);$('zhr').onclick=()=>zoomH(1);
$('zvm').onclick=()=>zoomV(zv/1.25);$('zvp').onclick=()=>zoomV(zv*1.25);
roll.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();zoomH(zh*(e.deltaY<0?1.15:1/1.15))},{passive:false});
/* ---------- オーディオトラック ---------- */
const AFILES=new Map(),ASRC=new Set();let AG=new WeakMap();
function AT(){return S.atracks||(S.atracks=[])}
const cbt=c=>c.d/spb(),audA=tr=>!tr.mute&&(!anySolo()||tr.solo);
function aGain(tr){let g=AG.get(tr);if(!g){g=ctx.createGain();g.connect(master);AG.set(tr,g);g.gain.value=audA(tr)?tr.vol:0}return g}
function updateAllAGains(){if(!ctx)return;for(const tr of AT())aGain(tr).gain.value=audA(tr)?tr.vol:0}
async function decodeBytes(ab){const oc=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(2,1,44100);return await oc.decodeAudioData(ab.slice(0))}
function mkPeaks(b){const BL=256,n=Math.ceil(b.length/BL),pk=new Float32Array(n*2),chs=[];for(let c=0;c<b.numberOfChannels;c++)chs.push(b.getChannelData(c));
  for(let i=0;i<n;i++){let mn=1,mx=-1;const e=Math.min(b.length,(i+1)*BL);for(const d of chs)for(let j=i*BL;j<e;j++){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v}pk[i*2]=mn;pk[i*2+1]=mx}return pk}
async function idbA(op,key,val){const db=await dbp;return new Promise((res,rej)=>{const st=db.transaction('a',op==='get'?'readonly':'readwrite').objectStore('a'),r=op==='get'?st.get(key):st.put(val,key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function fitLen(){let mx=0;for(const tr of AT())for(const c of tr.clips)mx=Math.max(mx,c.s+cbt(c));if(mx>S.len)S.len=Math.min(MAXBARS*4,Math.ceil(mx/4)*4)}
const aSnap=b=>{const g=+$('asn').value;return g>0?Math.round(b/g)*g:b};
function startClip(c,tr,when,off,dur,live){const f=AFILES.get(c.f);if(!f||!f.buf||dur<=.001)return;
  const se=seOf(c.f,f.buf.duration);if(se){const a=Math.max(off,se.start),b2=Math.min(off+dur,se.end);if(b2-a<=.001)return;when+=a-off;dur=b2-a;off=a}
  const src=ctx.createBufferSource(),g=ctx.createGain(),lv=(c.g==null?1:c.g)*(se?se.vol:1);src.buffer=f.buf;
  g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(lv,when+.004);g.gain.setValueAtTime(lv,Math.max(when+.004,when+dur-.006));g.gain.linearRampToValueAtTime(0,when+dur);
  src.connect(g);g.connect(aGain(tr));src.start(when,Math.max(0,off),dur);
  if(live){src._tr=tr;ASRC.add(src);src.onended=()=>ASRC.delete(src)}}
function startPartial(){for(const tr of AT())for(const c of tr.clips){const cb=cbt(c);
  if(c.s<nextBeat-1e-6&&c.s+cb>nextBeat+1e-6){const sk=(nextBeat-c.s)*spb();startClip(c,tr,nextTime,c.o+sk,Math.min(c.d-sk,(S.len-nextBeat)*spb()),true)}}}
async function addAudio(file){
  if(file.size>150*1048576){alert('ファイルが大きすぎます(150MB超)。短く書き出してから読み込んでください');return}
  $('st').textContent='音声を読み込み中…';
  try{const ab=await file.arrayBuffer(),buf=await decodeBytes(ab),id='a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    AFILES.set(id,{name:file.name,buf,peaks:mkPeaks(buf)});
    let kept=true;try{await idbA('put',id,{name:file.name,data:ab})}catch(e){kept=false}
    pushUndo();AT().push({name:file.name.replace(/\.[^.]+$/,'').slice(0,24),vol:.9,mute:false,solo:false,clips:[{f:id,s:Math.max(0,aSnap(playBeat)),o:0,d:buf.duration,g:1}]});
    fitLen();renderATracks();draw();dirty();
    $('st').textContent='音声を読み込みました: '+file.name+' ('+buf.duration.toFixed(1)+'秒 / メモリ約'+(buf.length*buf.numberOfChannels*4/1048576).toFixed(0)+'MB)'+(kept?'':' ※この端末には保存できませんでした')}
  catch(e){const m=(e&&e.name==='EncodingError')?'対応していない形式か、壊れたファイルです':((e&&e.message)||String(e));$('st').textContent='音声の読み込み失敗: '+m;alert('音声を読み込めませんでした: '+m)}}
async function loadAudioFiles(){const ids=new Set();for(const tr of AT())for(const c of tr.clips)ids.add(c.f);let miss=0;
  for(const id of ids){if(AFILES.has(id))continue;try{const v=await idbA('get',id);if(!v)throw 0;const buf=await decodeBytes(v.data);AFILES.set(id,{name:v.name,buf,peaks:mkPeaks(buf)})}catch(e){miss++}}
  if(ids.size){draw();if(miss)$('st').textContent='音声データ'+miss+'件が見つかりません(JSON読込や保存失敗の可能性。音声を再読込してください)'}}
function renderATracks(){const el=$('atl');el.innerHTML='';
  AT().forEach((tr,i)=>{const d=document.createElement('div');d.className='trk'+(seEd.tr===tr&&!seo.hidden?' sel':'');
    d.innerHTML='<div class="r"><input value="'+tr.name.replace(/[<>&"]/g,'')+'"><button data-a="e" title="SEの長さ・音量を編集">編集</button><button data-a="x" title="SEを削除">削除</button></div><div class="r"><label>音量</label><input type="range" min="0" max="1.5" step=".01" value="'+tr.vol+'"></div><div class="r"><button data-a="m" class="'+(tr.mute?'on':'')+'">M</button><button data-a="s" class="'+(tr.solo?'on':'')+'">S</button>'+seLabel(tr)+'</div>';
    d.querySelector('input').oninput=e=>{tr.name=e.target.value;drawAL();dirty()};
    d.querySelector('[type=range]').oninput=e=>{tr.vol=+e.target.value;updateAllAGains();dirty()};
    d.querySelector('[data-a=m]').onclick=()=>{tr.mute=!tr.mute;renderATracks();drawAL();dirty()};
    d.querySelector('[data-a=s]').onclick=()=>{tr.solo=!tr.solo;renderATracks();drawAL();dirty()};
    d.querySelector('[data-a=x]').onclick=()=>seDelete(tr);d.querySelector('[data-a=e]').onclick=()=>seOpen(tr);
    el.appendChild(d)});updateAllAGains()}
const _rt2=renderTracks;renderTracks=function(){_rt2();renderATracks()};
/* タイムライン(波形付きクリップ) */
const al=$('al'),ag=al.getContext('2d'),ROWH=56;let aSel=null,adrag=null;
function drawAL(){const T=AT(),w=$('alw');if(!T.length){w.style.display='none';return}
  w.style.display='block';const r=devicePixelRatio||1,cw=Math.max(1,roll.clientWidth),H=T.length*ROWH,sx=roll.scrollLeft;
  w.style.height=Math.min(H,3*ROWH)+'px';
  const pw=Math.round(cw*r),ph=Math.round(H*r);if(al.width!==pw||al.height!==ph){al.width=pw;al.height=ph;al.style.width=cw+'px';al.style.height=H+'px'}
  if(aSel&&!(T.includes(aSel.tr)&&aSel.tr.clips.includes(aSel.c)))aSel=null;
  const C={panel:css('--panel'),black:css('--black'),line:css('--line'),bar:css('--bar'),mut:css('--mut'),fg:css('--fg'),acc:css('--acc')};
  ag.setTransform(r,0,0,r,0,0);ag.globalAlpha=1;
  T.forEach((tr,i)=>{const y=i*ROWH;ag.fillStyle=i%2?C.black:C.panel;ag.fillRect(0,y,cw,ROWH)});
  for(let b=Math.max(0,Math.floor(sx/BW));b<=Math.min(S.len,Math.ceil((sx+cw)/BW));b++){const x=b*BW-sx;ag.strokeStyle=b%4===0?C.bar:C.line;ag.globalAlpha=b%4===0?1:.4;ag.beginPath();ag.moveTo(x+.5,0);ag.lineTo(x+.5,H);ag.stroke()}
  ag.globalAlpha=1;
  T.forEach((tr,i)=>{const y=i*ROWH,mt=!audA(tr);
    for(const c of tr.clips){const x0=c.s*BW-sx,wp=cbt(c)*BW;if(x0>cw||x0+wp<0)continue;
      const f=AFILES.get(c.f),sel=aSel&&aSel.c===c;
      ag.globalAlpha=mt?.35:1;ag.fillStyle=C.acc;ag.globalAlpha*=.22;ag.fillRect(x0,y+3,wp,ROWH-6);ag.globalAlpha=mt?.35:1;
      if(f&&f.peaks){const mid=y+ROWH/2+5,amp=(ROWH-22)/2,sr=f.buf.sampleRate,pk=f.peaks,nb=pk.length/2;ag.fillStyle=C.acc;
        for(let px=Math.max(0,Math.floor(-x0));px<Math.min(wp,cw-x0);px++){
          const t0=c.o+px/BW*spb(),t1=Math.min(c.o+c.d,c.o+(px+1)/BW*spb());
          let b0=Math.floor(t0*sr/256),b1=Math.max(b0,Math.floor(t1*sr/256)),mn=1,mx=-1;
          for(let b=Math.max(0,b0);b<=Math.min(nb-1,b1);b++){if(pk[b*2]<mn)mn=pk[b*2];if(pk[b*2+1]>mx)mx=pk[b*2+1]}
          if(mx>=mn){const y1=mid-mx*amp,hh=Math.max(1,(mx-mn)*amp);ag.fillRect(x0+px,y1,1,hh)}}}
      else{ag.fillStyle=C.mut;ag.font='11px system-ui';ag.fillText('音声データなし(再読込してください)',x0+6,y+ROWH/2+4)}
      {const se=seOf(c.f,f&&f.buf?f.buf.duration:0);if(se&&f&&f.buf){const px=t=>x0+(t-c.o)/spb()*BW,e0=c.o+c.d;ag.globalAlpha=.55;ag.fillStyle=C.panel;
          if(se.start>c.o){const xa=px(c.o),xb=px(Math.min(se.start,e0));ag.fillRect(xa,y+3,Math.max(0,xb-xa),ROWH-6)}
          if(se.end<e0){const xa=px(Math.max(se.end,c.o)),xb=px(e0);ag.fillRect(xa,y+3,Math.max(0,xb-xa),ROWH-6)}}}
      ag.globalAlpha=1;ag.strokeStyle=sel?C.fg:C.acc;ag.lineWidth=sel?2:1;ag.strokeRect(x0+.5,y+3.5,wp,ROWH-7);ag.lineWidth=1;
      ag.fillStyle=C.fg;ag.font='10px system-ui';ag.save();ag.beginPath();ag.rect(x0,y+3,wp,14);ag.clip();ag.fillText((f?f.name:'?'),Math.max(x0,0)+4,y+13);ag.restore()}
    ag.fillStyle=C.mut;ag.font='bold 10px system-ui';ag.fillText(tr.name+(mt?' (無音)':''),6,y+ROWH-5)});
  ag.fillStyle='#e5484d';ag.fillRect(playBeat*BW-sx,0,2,H)}
const aXY=e=>{const r=al.getBoundingClientRect();return{x:e.clientX-r.left+roll.scrollLeft,y:e.clientY-r.top}};
function aHit(x,y){const ri=Math.floor(y/ROWH),tr=AT()[ri];if(!tr)return null;
  for(let i=tr.clips.length-1;i>=0;i--){const c=tr.clips[i],x0=c.s*BW,x1=x0+cbt(c)*BW;if(x>=x0&&x<=x1)return{tr,c,x0,x1}}return null}
al.addEventListener('pointerdown',e=>{const{x,y}=aXY(e),h=aHit(x,y);
  if(!h){aSel=null;seekTo(x/BW);draw();return}
  al.setPointerCapture(e.pointerId);selSet.clear();selNote=null;aSel={tr:h.tr,c:h.c};
  const mode=x-h.x0<8&&h.x1-h.x0>24?'l':h.x1-x<8&&h.x1-h.x0>24?'r':'move';
  adrag={mode,tr:h.tr,c:h.c,ox:x/BW-h.c.s,s0:h.c.s,o0:h.c.o,d0:h.c.d,before:snap(),moved:false};draw()});
al.addEventListener('pointermove',e=>{if(!adrag)return;const{x,y}=aXY(e),c=adrag.c,T=AT(),f=AFILES.get(c.f);
  if(!adrag.moved){adrag.moved=true;undo.push(adrag.before);if(undo.length>100)undo.shift();redo=[]}
  edgeScroll(e);
  if(adrag.mode==='move'){c.s=Math.max(0,Math.min(MAXBARS*4-cbt(c),aSnap(x/BW-adrag.ox)));
    const ri=Math.max(0,Math.min(T.length-1,Math.floor(y/ROWH)));
    if(T[ri]!==adrag.tr){adrag.tr.clips.splice(adrag.tr.clips.indexOf(c),1);T[ri].clips.push(c);adrag.tr=T[ri];aSel.tr=T[ri]}}
  else if(adrag.mode==='r'){const mx=f?f.buf.duration-c.o:c.d;c.d=Math.max(.05,Math.min(mx,(aSnap(x/BW)-c.s)*spb()))}
  else{let ds=(aSnap(x/BW)-adrag.s0)*spb();ds=Math.max(-adrag.o0,Math.min(adrag.d0-.05,ds));c.s=adrag.s0+ds/spb();c.o=adrag.o0+ds;c.d=adrag.d0-ds}
  fitLen();draw()});
const aEnd=()=>{if(!adrag)return;const m=adrag.moved;adrag=null;if(m)dirty();draw()};
al.addEventListener('pointerup',aEnd);al.addEventListener('pointercancel',aEnd);
cv.addEventListener('pointerdown',()=>{if(aSel){aSel=null;drawAL()}},true);
function delAClip(){if(!aSel)return;pushUndo();aSel.tr.clips.splice(aSel.tr.clips.indexOf(aSel.c),1);aSel=null;draw();dirty()}
function dupAClip(){if(!aSel)return;const c=aSel.c,g=+$('asn').value,end=c.s+cbt(c),ns=g>0?Math.ceil(end/g-1e-9)*g:end;
  if(ns+cbt(c)>MAXBARS*4){alert('最大小節数を超えるため複製できません');return}
  pushUndo();const n={f:c.f,s:ns,o:c.o,d:c.d,g:c.g};aSel.tr.clips.push(n);aSel={tr:aSel.tr,c:n};fitLen();
  const x=n.s*BW;if(x<roll.scrollLeft||x>roll.scrollLeft+roll.clientWidth-40)roll.scrollLeft=Math.max(0,x-40);
  draw();dirty();$('st').textContent='クリップを複製しました'}
const _delSel=delSel;delSel=function(){if(aSel)delAClip();else _delSel()};
const _dupSel=dupSel;dupSel=function(){if(aSel)dupAClip();else _dupSel()};
$('del').onclick=delSel;$('dup').onclick=dupSel;
$('addA').onclick=()=>$('audf').click();
$('audf').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(f){initAudio();await addAudio(f)}};

/* ---------- ブロック内オートメーション ---------- */
function patAutoVal(p,b,kind){const a=p&&p.automation,pts=a&&a.curves&&a.curves[kind];if(!pts||!pts.length)return kind==='vol'?1:0;if(b<=pts[0].t)return patAutoMap(kind,pts[0].v);if(b>=pts[pts.length-1].t)return patAutoMap(kind,pts[pts.length-1].v);let i=0;while(i<pts.length-2&&b>pts[i+1].t)i++;const x=pts[i],y=pts[i+1],u=(b-x.t)/Math.max(1e-9,y.t-x.t);return patAutoMap(kind,x.v+(y.v-x.v)*u)}
function patAutoMap(kind,v){return kind==='vol'?Math.max(0,1+v):kind==='pitch'?v*12:Math.max(0,v)}
function patAutoPitch(p,b){return patAutoVal(p,b,'pitch')*100}
function drawPatternAutomationOverlay(){if(!PAEdit||VIEW!=='roll'||!EP)return;const r=devicePixelRatio||1,vw=Math.max(1,roll.clientWidth),vh=Math.max(1,roll.clientHeight),sx=roll.scrollLeft,sy=roll.scrollTop,top=RULER;const a=EP.automation||(EP.automation={kind:'vol',curves:{vol:[],pitch:[],echo:[]}});g2.save();g2.setTransform(r,0,0,r,0,0);g2.globalAlpha=.32;g2.fillStyle=css('--panel');g2.fillRect(0,top,vw,vh-top);g2.globalAlpha=.85;g2.strokeStyle=css('--acc');g2.lineWidth=1.5;const mid=top+(vh-top)/2;g2.setLineDash([5,4]);g2.beginPath();g2.moveTo(0,mid);g2.lineTo(vw,mid);g2.stroke();g2.setLineDash([]);g2.globalAlpha=1;const pts=(a.curves&&a.curves[a.kind])||[];if(pts.length){g2.strokeStyle=css('--acc');g2.lineWidth=2.5;g2.beginPath();pts.forEach((p,i)=>{const x=p.t*BW-sx,y=mid-p.v*(vh-top)*.45;i?g2.lineTo(x,y):g2.moveTo(x,y)});g2.stroke();for(const p of pts){const x=p.t*BW-sx,y=mid-p.v*(vh-top)*.45;g2.beginPath();g2.arc(x,y,5,0,Math.PI*2);g2.fillStyle=css('--panel');g2.fill();g2.strokeStyle=css('--acc');g2.lineWidth=2;g2.stroke()}}g2.fillStyle=css('--acc');g2.font='bold 12px system-ui';g2.fillText('オートメーション: '+({vol:'音量',pitch:'ピッチ',echo:'エコー'}[a.kind]||a.kind)+'　中央線 = 基準値',8,top+15);g2.restore()}
function automationPointFromEvent(e){const rc=cv.getBoundingClientRect(),x=e.clientX-rc.left+roll.scrollLeft,y=e.clientY-rc.top,usable=Math.max(1,roll.clientHeight-RULER),mid=RULER+usable/2;return{t:Math.max(0,Math.min(EP.len,Math.round((x/BW)/GRID)*GRID)),v:Math.max(-1,Math.min(1,(mid-y)/(usable*.45)))}}
cv.addEventListener('pointerdown',e=>{if(!PAEdit||VIEW!=='roll'||!EP)return;e.preventDefault();e.stopImmediatePropagation();cv.setPointerCapture(e.pointerId);pushUndo();const p=automationPointFromEvent(e),a=EP.automation||(EP.automation={kind:PAKind,points:[]});a.kind=PAKind;let found=a.points.findIndex(q=>Math.abs(q.t-p.t)<GRID*.45);if(found>=0)a.points.splice(found,1);a.points.push(p);a.points.sort((x,y)=>x.t-y.t);PADrag=true;draw();dirty()},true);
cv.addEventListener('pointermove',e=>{if(!PADrag||!PAEdit||!EP)return;e.preventDefault();const p=automationPointFromEvent(e),a=EP.automation,pts=a.curves[PAKind];pts.push(p);pts.sort((x,y)=>x.t-y.t);const out=[];for(const q of pts){if(out.length&&Math.abs(out[out.length-1].t-q.t)<GRID*.4)out[out.length-1]=q;else out.push(q)}a.curves[PAKind]=out;draw();dirty()},true);
const endPADrag=()=>{if(PADrag){PADrag=false;dirty()}};cv.addEventListener('pointerup',endPADrag,true);cv.addEventListener('pointercancel',endPADrag,true);
function togglePatternAutomation(){if(!EP){$('st').textContent='先にパターンを開いてください';return}PAEdit=!PAEdit;if(PAEdit){PAKind=EP.automation?.kind||'vol';$('patAuto').classList.add('on');$('patAutoKind').style.display='';$('patAutoKind').value=PAKind;$('st').textContent='オートメーション編集: タップ/ドラッグで線を描画。もう一度ボタンで終了'}else{$('patAuto').classList.remove('on');$('patAutoKind').style.display='none';$('st').textContent='オートメーション編集を終了しました'}draw()}
$('patAuto').onclick=togglePatternAutomation;$('patAutoKind').onchange=e=>{PAKind=e.target.value;if(EP){EP.automation=EP.automation||{curves:{}};EP.automation.kind=PAKind;EP.automation.curves=EP.automation.curves||{};EP.automation.curves[PAKind]=EP.automation.curves[PAKind]||[];draw();dirty()}};

/* ---------- パターン / ソングエディター ---------- */
let EP=null,bufObj=null,NC=null,VIEW='roll',sSel=null,sdrag=null,lastTap={pl:null,t:0};const SRH=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)?34:24,svTop={roll:(HI-1-76)*RH,song:0};
function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3)}
const contentH=()=>VIEW==='song'?S.tracks.length*SRH+RULER:VIEW==='auto'?roll.clientHeight:ROWS*RH+RULER;
function newPattern(color){return{id:uid(),name:'Pattern '+(S.patterns.length+1),color:color||TCOL[0],len:16,notes:[],automation:{kind:'vol',curves:{vol:[],pitch:[],echo:[]}}}}
function fixPatterns(){try{
  S.tracks.forEach((t,i)=>{t.color=t.color||TCOL[i%TCOL.length];t.id=t.id||uid()});
  if(!Array.isArray(S.patterns)||!Array.isArray(S.place)){ // 旧形式 → パターンへ移行(元の音符は破棄せず移し替える)
    const ps=[],pl=[];
    S.tracks.forEach((t,i)=>{if(Array.isArray(t.notes)&&t.notes.length){let m=0;for(const n of t.notes)m=Math.max(m,n.s+n.d);
      const P={id:uid(),name:(t.name||'Track')+' pattern',color:t.color,len:Math.max(4,Math.ceil(Math.max(Number(S.len)||16,m)/4)*4),notes:t.notes};ps.push(P);pl.push({id:uid(),pid:P.id,ti:i,s:0,l:P.len})}});
    if(!ps.length){const P={id:uid(),name:'Pattern 1',color:S.tracks[0].color,len:16,notes:[]};ps.push(P);pl.push({id:uid(),pid:P.id,ti:0,s:0,l:16,w:4})}
    S.patterns=ps;S.place=pl;S.edit=ps[0].id;S.tracks.forEach(t=>{t.notes=[]})}
  const ids=new Set(S.patterns.map(p=>p.id));
  for(const p of S.patterns){p.notes=Array.isArray(p.notes)?p.notes:[];p.len=Math.max(1,Number(p.len)||16);for(const n of p.notes)n.v=Math.max(1,Math.min(127,Math.round(n.v)||100));if(!p.automation||typeof p.automation!=='object')p.automation={kind:'vol',curves:{}};p.automation.kind=['vol','pitch','echo'].includes(p.automation.kind)?p.automation.kind:'vol';if(!p.automation.curves||typeof p.automation.curves!=='object')p.automation.curves={};if(Array.isArray(p.automation.points)&&!p.automation.curves[p.automation.kind])p.automation.curves[p.automation.kind]=p.automation.points;p.automation.curves=p.automation.curves||{};for(const k of ['vol','pitch','echo'])p.automation.curves[k]=(Array.isArray(p.automation.curves[k])?p.automation.curves[k]:[]).map(a=>({t:Math.max(0,Math.min(p.len,+a.t||0)),v:Math.max(-1,Math.min(1,+a.v||0))})).sort((a,b)=>a.t-b.t);delete p.automation.points}
  S.place=S.place.filter(q=>ids.has(q.pid)&&S.tracks[q.ti]&&q.l>0&&q.s>=0);
  for(const q of S.place){const w=+q.w;q.w=(isFinite(w)&&w>0)?Math.max(.5,w):q.l} // 旧データ(表示幅なし)は再生範囲と同じ幅=従来と同じ見た目
  EP=S.patterns.find(p=>p.id===S.edit)||S.patterns[0]||null;
  if(!EP){EP=newPattern(S.tracks[0].color);S.patterns.push(EP)}
  S.edit=EP.id;bufObj=null;NC=null;fixAuto()}
 catch(e){alert('パターンへのデータ移行に失敗しました: '+e.message+'\n元のデータは変更していません。')}}
function syncBuf(){if(EP&&bufObj)EP.notes=bufObj.notes;S.tracks.forEach((t,i)=>{t.notes=(EP&&i===sel)?EP.notes:[]});bufObj=EP?S.tracks[sel]:null}
function songNotes(){if(NC)return NC;NC=[];const P=new Map(S.patterns.map(p=>[p.id,p]));
  for(const pl of S.place){const p=P.get(pl.pid),t=S.tracks[pl.ti];if(!p||!t)continue;
    for(let k=0;k*p.len<pl.l-1e-9;k++){const o=pl.s+k*p.len,lim=Math.min(pl.s+pl.l,o+p.len);
      for(const n of p.notes){const st=o+n.s;if(n.s>=p.len||st>=lim)continue;NC.push({t,p:n.p,s:st,d:Math.min(n.d,lim-st),v:n.v,ti:pl.ti,pat:p,localS:n.s})}}}
  return NC}
function relPB(){if(!EP)return -1;for(const q of S.place)if(q.pid===EP.id&&playBeat>=q.s&&playBeat<q.s+q.l)return(playBeat-q.s)%EP.len;return -1}
function updInfo(){if(EP){const n=S.place.filter(q=>q.pid===EP.id).length;$('pinfo').textContent='編集中: '+EP.name+' (配置'+n+'箇所)';if(document.activeElement!==$('plen'))$('plen').value=EP.len/4}}
function draw(){if(VIEW==='auto'&&!EA){setView('song');return}syncBuf();updInfo();if(VIEW==='song'){drawSong();updateHS();updateVS();drawAL()}else if(VIEW==='auto'){updAbar();drawAuto();updateHS();updateVS();drawAL()}else drawRoll()}
function drawSong(){
  const r=devicePixelRatio||1,vw=Math.max(1,roll.clientWidth),vh=Math.max(1,roll.clientHeight),W=S.len*BW,H=S.tracks.length*SRH,sx=roll.scrollLeft,sy=roll.scrollTop;
  sz.style.width=W+'px';sz.style.height=(H+RULER)+'px';
  const cw=Math.round(vw*r),chh=Math.round(vh*r);if(cv.width!==cw||cv.height!==chh){cv.width=cw;cv.height=chh;cv.style.width=vw+'px';cv.style.height=vh+'px'}
  const C={bg:css('--bg'),panel:css('--panel'),fg:css('--fg'),mut:css('--mut'),line:css('--line'),beat:css('--beat'),bar:css('--bar'),black:css('--black')};
  g2.setTransform(r,0,0,r,0,0);g2.globalAlpha=1;g2.lineWidth=1;g2.fillStyle=C.bg;g2.fillRect(0,0,vw,vh);
  const nb=S.len/4,b0=Math.max(0,Math.floor(sx/BW/4)),b1=Math.min(nb,Math.ceil((sx+vw)/BW/4)),x1=Math.min(W,sx+vw);
  g2.save();g2.beginPath();g2.rect(0,RULER,vw,vh-RULER);g2.clip();g2.translate(-sx,RULER-sy);
  for(let i=0;i<S.tracks.length;i++){g2.fillStyle=i>=S.tracks.length?C.black:(i%2?C.black:C.panel);g2.globalAlpha=i>=S.tracks.length?.6:1;g2.fillRect(sx,i*SRH,x1-sx,SRH);g2.globalAlpha=1}
  for(let b=Math.max(0,Math.floor(sx/BW));b<=Math.min(S.len,Math.ceil((sx+vw)/BW));b++){const x=b*BW,isBar=b%4===0;g2.strokeStyle=isBar?C.bar:C.line;g2.globalAlpha=isBar?1:.4;g2.lineWidth=isBar?1.5:1;g2.beginPath();g2.moveTo(x+.5,0);g2.lineTo(x+.5,H);g2.stroke()}
  g2.globalAlpha=1;g2.lineWidth=1;g2.strokeStyle=C.line;for(let i=0;i<S.tracks.length;i++){g2.beginPath();g2.moveTo(sx,(i+1)*SRH-.5);g2.lineTo(x1,(i+1)*SRH-.5);g2.stroke()}
  const P=new Map(S.patterns.map(p=>[p.id,p]));
  for(const q of S.place){const p=P.get(q.pid);if(!p)continue;const x=q.s*BW,w=qpx(q),rw=q.l*BW,y=q.ti*SRH+3,h=SRH-6;if(x>sx+vw||x+Math.max(w,rw)<sx)continue;
    g2.globalAlpha=.85;g2.fillStyle=p.color;g2.fillRect(x,y,w,h);g2.globalAlpha=1;g2.save();g2.beginPath();g2.rect(x,y,w,h);g2.clip();
    if(p.notes.length){let lo=127,hi=0;for(const n of p.notes){lo=Math.min(lo,n.p);hi=Math.max(hi,n.p)}const rg=Math.max(8,hi-lo+1),nh=Math.max(1,(h-4)/rg);g2.fillStyle='rgba(255,255,255,.85)';
      for(let k=0;k*p.len<q.l-1e-9;k++){const o=q.s+k*p.len,lim=Math.min(q.s+q.l,o+p.len);for(const n of p.notes){const st=o+n.s;if(n.p<lo||st>=lim)continue;const nx=st*BW;if(nx>sx+vw||nx+n.d*BW<sx)continue;g2.fillRect(nx,y+2+(hi-n.p)*nh,Math.max(2,Math.min(n.d,lim-st)*BW),nh)}
        if(k>0){g2.fillStyle='rgba(0,0,0,.35)';g2.fillRect(o*BW,y,1.5,h);g2.fillStyle='rgba(255,255,255,.85)'}}}
    if(rw<w-1){g2.fillStyle='rgba(0,0,0,.5)';g2.fillRect(x+rw,y,w-rw,h);g2.fillStyle='rgba(255,255,255,.7)';g2.fillRect(x+rw-1,y,2,h)} // 表示幅より短い再生範囲: 範囲外(再生されない部分)を暗く
    g2.restore();
    if(rw>w+1){g2.strokeStyle=p.color;g2.lineWidth=2;g2.setLineDash([5,3]);g2.beginPath();g2.moveTo(x+w,y+h/2);g2.lineTo(x+rw,y+h/2);g2.stroke();g2.setLineDash([]);g2.lineWidth=1;g2.fillStyle=p.color;g2.fillRect(x+rw-2,y+2,3,h-4)} // 表示幅より長い再生範囲: 破線で再生される範囲を示す
    const sel=sSel===q,ed=EP===p;g2.strokeStyle=sel?C.fg:'rgba(0,0,0,.35)';g2.lineWidth=sel?2.5:1;g2.strokeRect(x+.5,y+.5,w-1,h-1);g2.lineWidth=1;
    g2.save();g2.beginPath();g2.rect(x,y,w,h);g2.clip();g2.fillStyle='#fff';g2.font='bold 11px system-ui';g2.shadowColor='rgba(0,0,0,.6)';g2.shadowBlur=2;g2.fillText(fitText(g2,(ed?'✎ ':'')+p.name,Math.max(8,w-18)),Math.max(x,sx)+5,y+11);g2.restore();
    if(RANGEMODE){g2.fillStyle='#e0902d';g2.fillRect(x+rw-3,y-2,6,h+4);g2.fillStyle='#fff';g2.fillRect(x+rw-1,y+4,2,h-8)} // 再生範囲の取っ手(オレンジ)
    else if(sel){g2.fillStyle='rgba(255,255,255,.85)';g2.fillRect(x+w-6,y+4,2,h-8);g2.fillRect(x+w-10,y+4,2,h-8)}} // 表示幅の取っ手(右端)
  g2.fillStyle='#e5484d';g2.fillRect(playBeat*BW,0,2,H);
  g2.restore();
  g2.fillStyle=C.panel;g2.fillRect(0,0,vw,RULER);g2.strokeStyle=C.line;g2.beginPath();g2.moveTo(0,RULER-.5);g2.lineTo(vw,RULER-.5);g2.stroke();
  for(let bar=b0;bar<=b1;bar++){const x=bar*4*BW-sx;g2.strokeStyle=C.bar;g2.lineWidth=2;g2.beginPath();g2.moveTo(x+.5,0);g2.lineTo(x+.5,RULER);g2.stroke();g2.lineWidth=1;if(bar<nb){g2.fillStyle=C.fg;g2.font='bold 11px system-ui';g2.fillText(String(bar+1),x+5,15)}}
  const px=playBeat*BW-sx;if(px>=0&&px<=vw){g2.fillStyle='#e5484d';g2.beginPath();g2.moveTo(px-5,0);g2.lineTo(px+5,0);g2.lineTo(px,8);g2.fill()}
  S.tracks.forEach((t,i)=>{const y=i*SRH+RULER-sy;if(y+SRH<RULER||y>vh)return;g2.fillStyle=C.panel;g2.globalAlpha=.88;g2.fillRect(0,y+3,96,SRH-6);g2.globalAlpha=1;g2.fillStyle=t.color;g2.fillRect(0,y+3,5,SRH-6);
    g2.save();g2.beginPath();g2.rect(8,y,86,SRH);g2.clip();g2.fillStyle=C.fg;g2.font='bold 11px system-ui';g2.fillText(t.name,9,y+SRH/2+4);g2.restore()});
  S.autotr.forEach((r,i)=>{const y=(S.tracks.length+i)*SRH+RULER-sy;if(y+SRH<RULER||y>vh)return;const t=S.tracks.find(x=>x.id===r.tid);g2.fillStyle=C.panel;g2.globalAlpha=.88;g2.fillRect(0,y+3,96,SRH-6);g2.globalAlpha=1;g2.fillStyle=t?t.color:C.mut;g2.fillRect(0,y+3,5,SRH-6);
    g2.save();g2.beginPath();g2.rect(8,y,86,SRH);g2.clip();g2.fillStyle=C.fg;g2.font='bold 10px system-ui';g2.fillText('⟲ '+(t?t.name:'?'),9,y+SRH/2+4);g2.restore()});
  $('sgbar').querySelector('#pn').disabled=!sSel;
}
function setView(v){if(v===VIEW)return;syncBuf();svTop[VIEW]=roll.scrollTop;VIEW=v;selSet.clear();selNote=null;drag=null;
  $('vlw').style.display=v==='roll'?'':'none';$('sgbar').style.display=v==='song'?'flex':'none';$('abar').style.display=v==='auto'?'flex':'none';
  $('vSong').classList.toggle('on',v==='song');$('vRoll').classList.toggle('on',v==='roll');draw();roll.scrollTop=svTop[v];draw();syncSongBar()}
$('vSong').onclick=()=>{PAEdit=false;$('patAuto').classList.remove('on');$('patAutoKind').style.display='none';setView('song')};$('vRoll').onclick=()=>setView('roll');
function openPattern(q){const P=S.patterns.find(p=>p.id===q.pid);if(!P)return;syncBuf();bufObj=null;EP=P;S.edit=P.id;sel=q.ti;selSet.clear();selNote=null;sSel=q;
  setView('roll');renderTracks();draw();roll.scrollLeft=0;$('st').textContent='パターン「'+P.name+'」を編集中(ソング画面に戻るとブロックに反映されます)'}
function fitSong(){let mx=0;for(const q of S.place)mx=Math.max(mx,q.s+q.l);for(const q of S.aplace)mx=Math.max(mx,q.s+q.l);if(mx>S.len)S.len=Math.min(MAXBARS*4,Math.ceil(mx/4)*4);fitLen()}
const patOf=q=>q&&S.patterns.find(p=>p.id===q.pid);
function syncSongBar(){const P=patOf(sSel);$('pn').value=P?P.name:'';if(P)$('pc').value=P.color}
cv.addEventListener('pointerdown',e=>{if(VIEW!=='song')return;
  const rc=cv.getBoundingClientRect();if(e.clientY-rc.top<RULER){seekTo((e.clientX-rc.left+roll.scrollLeft)/BW);return}
  const{x,y}=pt(e),ri=Math.floor(y/SRH);if(ri<0||ri>=S.tracks.length)return;cv.setPointerCapture(e.pointerId);
  let h=null,hm=null;const hz=e.pointerType==='touch'?24:12;
  if(RANGEMODE){for(let i=S.place.length-1;i>=0;i--){const q=S.place[i];if(q.ti===ri&&Math.abs(x-(q.s+q.l)*BW)<=hz){h=q;hm='range';break}}}
  if(!h)h=sgHit(x,ri);
  if(h){const now=Date.now();if(lastTap.pl===h&&now-lastTap.t<400){lastTap={pl:null,t:0};sdrag=null;openPattern(h);return}
    lastTap={pl:h,t:now};sSel=h;selA=null;sdrag={pl:h,mode:hm||((!RANGEMODE&&h.s*BW+qpx(h)-x<=Math.min(hz,qpx(h)*.45)&&qpx(h)>=28)?'r':'move'),ox:x/BW-h.s,before:snap(),moved:false,cx:e.clientX,cy:e.clientY,lp:null}}
  else{const s=Math.max(0,Math.floor(x/BW/4)*4);if(s>=MAXBARS*4)return;pushUndo();const P=newPattern(S.tracks[ri].color);S.patterns.push(P);
    const q={id:uid(),pid:P.id,ti:ri,s,l:P.len,w:Math.min(P.len,DEFW)};S.place.push(q);sSel=q;selA=null;fitSong();dirty();lastTap={pl:q,t:Date.now()}}
  if(sdrag&&e.pointerType==='touch'){const d0=sdrag;d0.lp=setTimeout(()=>{if(sdrag===d0&&!d0.moved){sdrag=null;openBlockMenu(e.clientX,e.clientY,d0.pl)}},550)} // 長押し=メニュー
  syncSongBar();draw()});
cv.addEventListener('contextmenu',e=>{if(VIEW!=='song')return;e.preventDefault();const rc=cv.getBoundingClientRect();if(e.clientY-rc.top<RULER)return;const{x,y}=pt(e),q=sgHit(x,Math.floor(y/SRH));if(q)openBlockMenu(e.clientX,e.clientY,q)});
cv.addEventListener('pointermove',e=>{if(VIEW!=='song'||!sdrag)return;const{x,y}=pt(e),q=sdrag.pl;
  if(!sdrag.moved&&Math.hypot(e.clientX-sdrag.cx,e.clientY-sdrag.cy)<8)return;clearTimeout(sdrag.lp);
  if(!sdrag.moved){sdrag.moved=true;undo.push(sdrag.before);if(undo.length>100)undo.shift();redo=[]}edgeScroll(e);
  if(sdrag.mode==='move'){q.s=Math.max(0,Math.min(MAXBARS*4-q.l,sgSnap(x/BW-sdrag.ox)));q.ti=Math.max(0,Math.min(S.tracks.length-1,Math.floor(y/SRH)))}   // 配置位置だけ
  else if(sdrag.mode==='range'){q.l=Math.max(Math.max(.25,sgG()),Math.min(MAXBARS*4-q.s,sgSnap(x/BW-q.s)));NC=null}                                  // 再生範囲だけ
  else{const width=Math.max(Math.max(.5,sgG()),Math.min(Math.max(.5,S.len-q.s),sgSnap(x/BW-q.s)));q.w=width;q.l=Math.max(.25,Math.min(MAXBARS*4-q.s,width));NC=null} // 右端ドラッグでブロック幅と実際の再生範囲を同時に変更
  fitSong();draw()});
const sEnd=()=>{if(!sdrag)return;clearTimeout(sdrag.lp);const m=sdrag.moved;sdrag=null;if(m)dirty();draw()};
cv.addEventListener('pointerup',sEnd);cv.addEventListener('pointercancel',sEnd);
function delPl(){if(!sSel)return;pushUndo();const P=patOf(sSel);S.place=S.place.filter(q=>q!==sSel);sSel=null;
  if(P&&P!==EP&&!S.place.some(q=>q.pid===P.id))S.patterns=S.patterns.filter(p=>p!==P);dirty();draw();syncSongBar()}
function delPat(){const P=patOf(sSel);if(!P)return;if(!confirm('パターン「'+P.name+'」と、その配置すべてを削除しますか?'))return;pushUndo();
  S.place=S.place.filter(q=>q.pid!==P.id);S.patterns=S.patterns.filter(p=>p!==P);sSel=null;
  if(EP===P){syncBuf();bufObj=null;EP=S.patterns[0]||newPattern(S.tracks[0].color);if(!S.patterns.includes(EP))S.patterns.push(EP);S.edit=EP.id}
  dirty();draw();syncSongBar()}
function dupPl(indep){if(!sSel)return;const q0=sSel,P=patOf(q0);if(!P)return;if(q0.s+q0.l*2>MAXBARS*4){alert('最大小節数を超えるため複製できません');return}
  pushUndo();let pid=P.id;
  if(indep){const P2={id:uid(),name:P.name+' (コピー)',color:P.color,len:P.len,notes:P.notes.map(n=>({p:n.p,s:n.s,d:n.d,v:n.v})),automation:JSON.parse(JSON.stringify(P.automation||{kind:'vol',points:[]}))};S.patterns.push(P2);pid=P2.id}
  const q={id:uid(),pid,ti:q0.ti,s:q0.s+q0.l,l:q0.l,w:qw(q0)};S.place.push(q);sSel=q;selA=null;fitSong();dirty();draw();syncSongBar();
  $('st').textContent=indep?'独立したパターンとしてコピーしました':'同じパターンを参照する配置を追加しました'}
function moveTrack(i,d){const j=i+d;if(j<0||j>=S.tracks.length)return;syncBuf();bufObj=null;[S.tracks[i],S.tracks[j]]=[S.tracks[j],S.tracks[i]];
  S.place.forEach(q=>{if(q.ti===i)q.ti=j;else if(q.ti===j)q.ti=i});if(sel===i)sel=j;else if(sel===j)sel=i;renderTracks();draw();dirty()}
$('sgOpen').onclick=()=>{if(sSel)openPattern(sSel)};$('sgDup').onclick=()=>dupPl(false);$('sgCopy').onclick=()=>dupPl(true);$('sgDel').onclick=delPl;$('sgDelP').onclick=delPat;
$('pn').oninput=e=>{const P=patOf(sSel);if(P){P.name=e.target.value||'Pattern';dirty();draw()}};
$('pc').oninput=e=>{const P=patOf(sSel);if(P){P.color=e.target.value;dirty();draw()}};
$('plen').onchange=e=>{const n=Math.max(1,Math.min(64,Math.round(+e.target.value)||1));if(EP&&n*4!==EP.len){pushUndo();EP.len=n*4;dirty();draw()}};
const _d2=delSel;delSel=function(){if(VIEW==='song'){delPl();return}_d2()};
const _u2=dupSel;dupSel=function(){if(VIEW==='song'){dupPl(false);return}_u2()};
$('del').onclick=delSel;$('dup').onclick=dupSel;
/* ---------- オートメーション ---------- */
const ADEF={vol:1,echo:0,pitch:0},KN={vol:'音量',pitch:'ピッチ',echo:'エコー'},KC={vol:'#2f6fed',pitch:'#2da44e',echo:'#d4a017'};
let GRID=.25,AC=null,EA=null,EQ=null,eaId=null,eqId=null,selA=null,asel=new Set(),ad=null,adr=null,ACLIP=null,lastTapA={q:null,t:0},VB=null,PC=null,AGON=true;
try{const sv=localStorage.getItem('daw-grid');if(sv&&[...$('grid').options].some(o=>o.value===sv)){$('grid').value=sv;GRID=+sv}}catch(_){}
$('grid').onchange=e=>{GRID=+e.target.value;try{localStorage.setItem('daw-grid',e.target.value)}catch(_){}draw()};
const aDef=a=>a.kind==='vol'?1:a.kind==='pitch'?.5:0;
function autoVal(a,x){const P=a.pts,n=P.length;if(!n)return aDef(a);if(x<=P[0].t)return P[0].v;if(x>=P[n-1].t)return P[n-1].v;
  let i=0;while(i<n-2&&x>=P[i+1].t)i++;const p0=P[i],p1=P[i+1],dx=p1.t-p0.t;if(dx<=1e-9)return p1.v;const u=(x-p0.t)/dx;
  if(a.mode!=='curve')return p0.v+(p1.v-p0.v)*u;
  const sl=j=>{const d=P[j+1].t-P[j].t;return d>1e-9?(P[j+1].v-P[j].v)/d:0};
  const tn=j=>{if(j===0)return sl(0);if(j===n-1)return sl(n-2);const A=sl(j-1),B=sl(j);return A*B<=0?0:2*A*B/(A+B)};
  const k=a.smooth==null?1:a.smooth,m0=tn(i)*k,m1=tn(i+1)*k,u2=u*u,u3=u2*u;
  return Math.max(0,Math.min(1,(2*u3-3*u2+1)*p0.v+(u3-2*u2+u)*dx*m0+(-2*u3+3*u2)*p1.v+(u3-u2)*dx*m1))}
function autoIdx(){if(AC)return AC;AC=new Map();const A=new Map(S.autos.map(a=>[a.id,a])),R=new Map(S.autotr.map(a=>[a.id,a]));
  for(const q of S.aplace){const a=A.get(q.aid),r=R.get(q.tr);if(!a||!r)continue;const k=r.tid+'|'+a.kind;if(!AC.has(k))AC.set(k,[]);AC.get(k).push({s:q.s,l:q.l,a})}return AC}
function autoBlk(tid,kind,b){const L=autoIdx().get(tid+'|'+kind);if(!L)return null;let r=null;for(const e of L)if(b>=e.s&&b<e.s+e.l)r=e;return r||false}
function autoAt(tid,kind,b){const r=autoBlk(tid,kind,b);if(r===null)return null;if(r===false)return ADEF[kind];const v=autoVal(r.a,Math.min(b-r.s,r.a.len));return kind==='pitch'?(v-.5)*2*r.a.range*100:v}
function schedAuto(b0,when,sp){const idx=autoIdx();if(!idx.size)return;const b1=b0+SNAP-1e-6,t1=when+SNAP*sp;
  for(const t of S.tracks){const hv=idx.has(t.id+'|vol'),he=idx.has(t.id+'|echo');if(!hv&&!he)continue;const c=getCh(t);
    if(hv){c.vg.gain.setValueAtTime(autoAt(t.id,'vol',b0),when);c.vg.gain.linearRampToValueAtTime(autoAt(t.id,'vol',b1),t1)}
    if(he){c.eg.gain.setValueAtTime(autoAt(t.id,'echo',b0),when);c.eg.gain.linearRampToValueAtTime(autoAt(t.id,'echo',b1),t1);
      const rb=autoBlk(t.id,'echo',b0);if(rb)c.ec.h({mix:1,time:Math.max(.02,Math.min(1,rb.a.tm)),fb:Math.max(0,Math.min(.85,rb.a.fb))})}}}
function resetAuto(){if(!ctx)return;for(const t of S.tracks){const c=CH.get(t);if(c&&c.vg){c.vg.gain.cancelScheduledValues(0);c.vg.gain.value=1;c.eg.gain.cancelScheduledValues(0);c.eg.gain.value=0}}}
function pitchCurve(t,beat,db){const sp=spb(),n=Math.min(48,Math.max(2,Math.ceil((db+.5)/.125))),pts=[];let any=false;
  for(let i=0;i<=n;i++){const off=Math.min(db+.5,i*.125),c=PA&&PA.p?patAutoPitch(PA.p,PA.b+off): (autoIdx().has(t.id+'|pitch')?autoAt(t.id,'pitch',beat+off):0);pts.push([off*sp,c]);if(Math.abs(c)>.01)any=true}return any?pts:null}
function applyDet(par,when,pc){par.setValueAtTime(pc[0][1],when);for(let i=1;i<pc.length;i++)par.linearRampToValueAtTime(pc[i][1],when+pc[i][0])}
function fixAuto(){S.autos=Array.isArray(S.autos)?S.autos:[];S.autotr=Array.isArray(S.autotr)?S.autotr:[];S.aplace=Array.isArray(S.aplace)?S.aplace:[];
  for(const a of S.autos){a.id=a.id||uid();if(!(a.kind in ADEF))a.kind='vol';a.mode=a.mode==='curve'?'curve':'line';a.smooth=Math.max(0,Math.min(1,a.smooth==null?1:+a.smooth));a.range=Math.max(1,Math.min(48,+a.range||12));
    a.len=Math.max(1,+a.len||16);a.tm=Math.max(.02,Math.min(1,+a.tm||.3));a.fb=Math.max(0,Math.min(.85,a.fb==null?.35:+a.fb));a.color=a.color||KC[a.kind];a.name=a.name||KN[a.kind];
    a.pts=(Array.isArray(a.pts)?a.pts:[]).map(p=>({t:Math.max(0,Math.min(a.len,+p.t||0)),v:Math.max(0,Math.min(1,+p.v))})).filter(p=>isFinite(p.v)).sort((x,y)=>x.t-y.t)}
  const tids=new Set(S.tracks.map(t=>t.id));S.autotr=S.autotr.filter(r=>(r.id=r.id||uid())&&tids.has(r.tid));
  const rid=new Set(S.autotr.map(r=>r.id)),aid=new Set(S.autos.map(a=>a.id));S.aplace=S.aplace.filter(q=>rid.has(q.tr)&&aid.has(q.aid)&&q.l>0&&q.s>=0);
  EA=S.autos.find(a=>a.id===eaId)||null;EQ=S.aplace.find(q=>q.id===eqId)||null;asel=new Set();selA=null;AC=null;NC=null;fixCfx()}
const newAuto=kind=>({id:uid(),name:KN[kind]+' '+(S.autos.length+1),color:KC[kind],kind,mode:'line',smooth:1,range:12,len:16,tm:.3,fb:.35,pts:[{t:0,v:aDef({kind})},{t:16,v:aDef({kind})}]});
function openAuto(q){const a=S.autos.find(x=>x.id===q.aid);if(!a)return;EA=a;EQ=q;eaId=a.id;eqId=q.id;asel=new Set();svTop.auto=0;setView('auto');roll.scrollLeft=0;draw()}
// --- ソング上: オートメーション行/ブロック ---
cv.addEventListener('pointerdown',e=>{if(VIEW!=='song')return;const rc=cv.getBoundingClientRect();if(e.clientY-rc.top<RULER)return;
  const{x,y}=pt(e),ri=Math.floor(y/SRH)-S.tracks.length;if(ri<0||ri>=S.autotr.length)return;cv.setPointerCapture(e.pointerId);const row=S.autotr[ri];let h=null;
  for(let i=S.aplace.length-1;i>=0;i--){const q=S.aplace[i];if(q.tr===row.id&&x>=q.s*BW&&x<=(q.s+q.l)*BW){h=q;break}}
  if(h){const now=Date.now();if(lastTapA.q===h&&now-lastTapA.t<400){lastTapA={q:null,t:0};ad=null;openAuto(h);return}
    lastTapA={q:h,t:now};selA=h;sSel=null;ad={q:h,mode:(h.s*BW+h.l*BW-x<10&&h.l*BW>24)?'r':'move',ox:x/BW-h.s,before:snap(),moved:false}}
  else{pushUndo();const s=Math.max(0,Math.floor(x/BW/4)*4);if(s>=MAXBARS*4)return;const a=newAuto($('akind').value),q={id:uid(),aid:a.id,tr:row.id,s,l:a.len};S.autos.push(a);S.aplace.push(q);selA=q;sSel=null;fitSong();dirty();lastTapA={q,t:Date.now()}}
  syncSongBar();draw()});
cv.addEventListener('pointermove',e=>{if(VIEW!=='song'||!ad)return;const{x,y}=pt(e),q=ad.q;
  if(!ad.moved){ad.moved=true;undo.push(ad.before);if(undo.length>100)undo.shift();redo=[]}edgeScroll(e);
  if(ad.mode==='move'){q.s=Math.max(0,Math.min(MAXBARS*4-q.l,Math.round((x/BW-ad.ox)/4)*4));const ri=Math.max(0,Math.min(S.autotr.length-1,Math.floor(y/SRH)-S.tracks.length));q.tr=S.autotr[ri].id}
  else q.l=Math.max(4,Math.min(MAXBARS*4-q.s,Math.round((x/BW-q.s)/4)*4));
  fitSong();draw()});
const adEnd=()=>{if(!ad)return;const m=ad.moved;ad=null;if(m)dirty();draw()};cv.addEventListener('pointerup',adEnd);cv.addEventListener('pointercancel',adEnd);
function delAblk(){if(!selA)return;pushUndo();const a=S.autos.find(x=>x.id===selA.aid);S.aplace=S.aplace.filter(q=>q!==selA);selA=null;if(a&&a!==EA&&!S.aplace.some(q=>q.aid===a.id))S.autos=S.autos.filter(x=>x!==a);dirty();draw()}
function dupAblk(indep){if(!selA)return;const q0=selA,a=S.autos.find(x=>x.id===q0.aid);if(!a)return;if(q0.s+q0.l*2>MAXBARS*4){alert('最大小節数を超えるため複製できません');return}
  pushUndo();let aid=a.id;if(indep){const b=JSON.parse(JSON.stringify(a));b.id=uid();b.name=a.name+' (コピー)';S.autos.push(b);aid=b.id}
  const q={id:uid(),aid,tr:q0.tr,s:q0.s+q0.l,l:q0.l};S.aplace.push(q);selA=q;fitSong();dirty();draw()}
$('sgOpen').onclick=()=>{if(selA)openAuto(selA);else if(sSel)openPattern(sSel)};
$('sgDup').onclick=()=>selA?dupAblk(false):dupPl(false);$('sgCopy').onclick=()=>selA?dupAblk(true):dupPl(true);$('sgDel').onclick=()=>selA?delAblk():delPl();
$('sgAT').style.display='none';$('sgDelAT').style.display='none';$('akind').style.display='none';
$('sgAT').onclick=()=>{pushUndo();S.autotr.push({id:uid(),name:'Auto '+(S.autotr.length+1),tid:S.tracks[sel].id});dirty();draw();$('st').textContent='選択中のトラック「'+S.tracks[sel].name+'」用のオートメーショントラックを追加しました'};
$('sgDelAT').onclick=()=>{if(!selA){alert('削除するオートメーショントラックのブロックを選択してください');return}if(!confirm('このオートメーショントラックと、その上のブロックをすべて削除しますか?'))return;
  pushUndo();const id=selA.tr;S.autotr=S.autotr.filter(r=>r.id!==id);S.aplace=S.aplace.filter(q=>q.tr!==id);selA=null;fixAuto();dirty();draw()};
// --- オートメーションエディター ---
const PY0=RULER+12,ph=()=>Math.max(20,roll.clientHeight-PY0-14),clampV=v=>Math.max(0,Math.min(1,v)),sortPts=()=>EA.pts.sort((a,b)=>a.t-b.t);
const snapT=t=>{t=AGON?Math.round(t/GRID)*GRID:t;return Math.max(0,Math.min(EA.len,t))};
function aLbl(a,v){if(a.kind==='vol')return Math.round(v*100)+'% ('+(v>0?(20*Math.log10(v)).toFixed(1):'-∞')+'dB)';if(a.kind==='echo')return Math.round(v*100)+'%';const sm=(v-.5)*2*a.range;return(sm>0?'+':'')+sm.toFixed(2)+'半音'}
function boxA(){const d=adr,xa=Math.min(d.x0,d.x1),xb=Math.max(d.x0,d.x1),ya=Math.min(d.y0,d.y1),yb=Math.max(d.y0,d.y1),PH=ph();asel=new Set(d.base);
  for(const p of EA.pts){const x=p.t*BW,y=PY0+(1-p.v)*PH;if(x>=xa&&x<=xb&&y>=ya&&y<=yb)asel.add(p)}}
function drawAuto(){const a=EA,r=devicePixelRatio||1,vw=Math.max(1,roll.clientWidth),vh=Math.max(1,roll.clientHeight),W=S.len*BW,sx=roll.scrollLeft,PH=ph();
  sz.style.width=W+'px';sz.style.height=vh+'px';const cw=Math.round(vw*r),chh=Math.round(vh*r);if(cv.width!==cw||cv.height!==chh){cv.width=cw;cv.height=chh;cv.style.width=vw+'px';cv.style.height=vh+'px'}
  const C={panel:css('--panel'),fg:css('--fg'),mut:css('--mut'),line:css('--line'),bar:css('--bar')};
  g2.setTransform(r,0,0,r,0,0);g2.globalAlpha=1;g2.lineWidth=1;g2.fillStyle=C.panel;g2.fillRect(0,0,vw,vh);
  const LX=Math.max(0,a.len*BW-sx);if(LX<vw){g2.globalAlpha=.25;g2.fillStyle=C.mut;g2.fillRect(LX,RULER,vw-LX,vh-RULER);g2.globalAlpha=1}
  for(let b=Math.max(0,Math.floor(sx/BW));b<=Math.min(S.len,Math.ceil((sx+vw)/BW));b++){const x=b*BW-sx;g2.strokeStyle=b%4===0?C.bar:C.line;g2.globalAlpha=b%4===0?1:.45;g2.beginPath();g2.moveTo(x+.5,RULER);g2.lineTo(x+.5,vh);g2.stroke()}
  if(GRID<.25-1e-9&&GRID*BW>=6){g2.strokeStyle=C.line;g2.globalAlpha=.25;for(let k=Math.floor(sx/BW/GRID);k<=Math.ceil((sx+vw)/BW/GRID);k++){const bt=k*GRID;if(Math.abs(bt*4-Math.round(bt*4))<1e-6)continue;const x=bt*BW-sx;g2.beginPath();g2.moveTo(x+.5,RULER);g2.lineTo(x+.5,vh);g2.stroke()}}
  g2.globalAlpha=1;
  for(const q of [0,.25,.5,.75,1]){const y=PY0+(1-q)*PH,mid=q===.5&&a.kind==='pitch';g2.strokeStyle=mid?C.bar:C.line;g2.lineWidth=mid?1.5:1;g2.beginPath();g2.moveTo(0,y+.5);g2.lineTo(vw,y+.5);g2.stroke();g2.fillStyle=C.mut;g2.font='10px system-ui';g2.fillText(aLbl(a,q),4,y-2)}
  g2.lineWidth=1;const P=a.pts;
  if(a.mode==='curve'&&P.length>1){g2.strokeStyle=C.mut;g2.globalAlpha=.45;g2.setLineDash([3,3]);g2.beginPath();P.forEach((p,i)=>{const x=p.t*BW-sx,y=PY0+(1-p.v)*PH;i?g2.lineTo(x,y):g2.moveTo(x,y)});g2.stroke();g2.setLineDash([]);g2.globalAlpha=1}
  g2.strokeStyle=a.color;g2.lineWidth=2.5;g2.beginPath();let f=true;for(let px=0;px<=Math.min(vw,a.len*BW-sx);px+=2){const v=autoVal(a,(px+sx)/BW),y=PY0+(1-v)*PH;if(f){g2.moveTo(px,y);f=false}else g2.lineTo(px,y)}g2.stroke();g2.lineWidth=1;
  for(const p of P){const x=p.t*BW-sx,y=PY0+(1-p.v)*PH;if(x<-8||x>vw+8)continue;g2.beginPath();g2.arc(x,y,asel.has(p)?6:5,0,7);g2.fillStyle=asel.has(p)?C.fg:C.panel;g2.fill();g2.strokeStyle=a.color;g2.lineWidth=2;g2.stroke();g2.lineWidth=1}
  if(asel.size===1){const p=[...asel][0];g2.fillStyle=C.fg;g2.font='bold 11px system-ui';g2.fillText(aLbl(a,p.v),Math.max(4,Math.min(vw-150,p.t*BW-sx+8)),Math.max(RULER+12,PY0+(1-p.v)*PH-9))}
  if(adr&&adr.mode==='box'){const xa=Math.min(adr.x0,adr.x1)-sx,ya=Math.min(adr.y0,adr.y1),bw=Math.abs(adr.x1-adr.x0),bh=Math.abs(adr.y1-adr.y0);g2.globalAlpha=.15;g2.fillStyle=a.color;g2.fillRect(xa,ya,bw,bh);g2.globalAlpha=1;g2.strokeStyle=a.color;g2.setLineDash([4,3]);g2.strokeRect(xa+.5,ya+.5,bw,bh);g2.setLineDash([])}
  if(EQ){const rel=playBeat-EQ.s;if(rel>=0&&rel<=EQ.l){g2.fillStyle='#e5484d';g2.fillRect(rel*BW-sx,RULER,2,vh-RULER)}}
  g2.fillStyle=C.panel;g2.fillRect(0,0,vw,RULER);g2.strokeStyle=C.line;g2.beginPath();g2.moveTo(0,RULER-.5);g2.lineTo(vw,RULER-.5);g2.stroke();
  for(let bar=Math.max(0,Math.floor(sx/BW/4));bar<=Math.min(S.len/4,Math.ceil((sx+vw)/BW/4));bar++){const x=bar*4*BW-sx;g2.strokeStyle=C.bar;g2.lineWidth=2;g2.beginPath();g2.moveTo(x+.5,0);g2.lineTo(x+.5,RULER);g2.stroke();g2.lineWidth=1;g2.fillStyle=C.fg;g2.font='bold 11px system-ui';g2.fillText(String(bar+1),x+5,15)}
  if(EQ){const rel=playBeat-EQ.s;if(rel>=0&&rel<=EQ.l){g2.fillStyle='#e5484d';const px=rel*BW-sx;g2.beginPath();g2.moveTo(px-5,0);g2.lineTo(px+5,0);g2.lineTo(px,8);g2.fill()}}}
function updAbar(){const a=EA;if(!a)return;$('ainfo').textContent=KN[a.kind]+'オートメーション';const set=(id,v)=>{const el=$(id);if(document.activeElement!==el)el.value=v};
  set('an',a.name);set('asm',a.smooth);set('arng',a.range);set('atm',a.tm);set('afb',a.fb);set('alen',a.len/4);set('akd',a.kind);
  $('amLine').classList.toggle('on',a.mode==='line');$('amCurve').classList.toggle('on',a.mode==='curve');
  document.querySelectorAll('#abar .aeo').forEach(el=>el.style.display=a.kind==='echo'?'':'none');
  document.querySelectorAll('#abar .apt').forEach(el=>el.style.display=a.kind==='pitch'?'':'none');
  document.querySelectorAll('#abar .acv').forEach(el=>el.style.display=a.mode==='curve'?'':'none')}
cv.addEventListener('pointerdown',e=>{if(VIEW!=='auto'||!EA)return;const rc=cv.getBoundingClientRect();
  if(e.clientY-rc.top<RULER){if(EQ)seekTo(EQ.s+(e.clientX-rc.left+roll.scrollLeft)/BW);return}
  const sx=roll.scrollLeft,mx=e.clientX-rc.left,my=e.clientY-rc.top,PH=ph();cv.setPointerCapture(e.pointerId);
  let h=null,bd=121;for(const p of EA.pts){const dx=p.t*BW-sx-mx,dy=PY0+(1-p.v)*PH-my,d=dx*dx+dy*dy;if(d<bd){bd=d;h=p}}
  const mod=e.shiftKey||e.ctrlKey||e.metaKey;
  if(!h&&(MODE==='select'||mod)){adr={mode:'box',x0:mx+sx,y0:my,x1:mx+sx,y1:my,base:new Set(mod?asel:[])};boxA();draw();return}
  let pushed=false;
  if(h&&mod){if(asel.has(h)){asel.delete(h);draw();return}asel.add(h)}
  else if(h&&!asel.has(h)){asel=new Set([h])}
  else if(!h){pushUndo();pushed=true;h={t:snapT((mx+sx)/BW),v:clampV(1-(my-PY0)/PH)};EA.pts.push(h);sortPts();asel=new Set([h]);dirty()}
  adr={mode:'move',before:snap(),pushed,moved:false,t0:h.t,v0:h.v,ox:(mx+sx)/BW-h.t,oy:(1-(my-PY0)/PH)-h.v,snap:[...asel].map(p=>({p,t:p.t,v:p.v}))};draw()});
cv.addEventListener('pointermove',e=>{if(VIEW!=='auto'||!adr)return;const rc=cv.getBoundingClientRect(),sx=roll.scrollLeft,mx=e.clientX-rc.left+sx,my=e.clientY-rc.top,PH=ph();
  if(adr.mode==='box'){edgeScroll(e);adr.x1=mx;adr.y1=my;boxA();draw();return}
  if(!adr.moved){adr.moved=true;if(!adr.pushed){undo.push(adr.before);if(undo.length>100)undo.shift();redo=[]}}edgeScroll(e);
  let dt=snapT(mx/BW-adr.ox)-adr.t0,dv=clampV(1-(my-PY0)/PH-adr.oy)-adr.v0,mnT=1e9,mxT=-1e9,mnV=1e9,mxV=-1e9;
  for(const o of adr.snap){mnT=Math.min(mnT,o.t);mxT=Math.max(mxT,o.t);mnV=Math.min(mnV,o.v);mxV=Math.max(mxV,o.v)}
  dt=Math.max(-mnT,Math.min(EA.len-mxT,dt));dv=Math.max(-mnV,Math.min(1-mxV,dv));
  for(const o of adr.snap){o.p.t=o.t+dt;o.p.v=o.v+dv}sortPts();draw()});
const aUp=()=>{if(VIEW!=='auto'||!adr)return;const m=adr.mode==='move'&&(adr.moved||adr.pushed);adr=null;if(m)dirty();draw()};cv.addEventListener('pointerup',aUp);cv.addEventListener('pointercancel',aUp);
cv.addEventListener('contextmenu',e=>{if(VIEW!=='auto'||!EA)return;e.preventDefault();const rc=cv.getBoundingClientRect(),sx=roll.scrollLeft,PH=ph();let h=null,bd=121;
  for(const p of EA.pts){const dx=p.t*BW-sx-(e.clientX-rc.left),dy=PY0+(1-p.v)*PH-(e.clientY-rc.top),d=dx*dx+dy*dy;if(d<bd){bd=d;h=p}}
  if(h){const del=asel.has(h)?new Set(asel):new Set([h]);pushUndo();EA.pts=EA.pts.filter(p=>!del.has(p));asel=new Set();dirty();draw()}});
function delAPts(){if(!asel.size)return;pushUndo();EA.pts=EA.pts.filter(p=>!asel.has(p));asel=new Set();dirty();draw()}
function aCopy(cut){if(!asel.size){$('st').textContent='制御点が選択されていません';return}const a=[...asel].sort((x,y)=>x.t-y.t),t0=a[0].t;ACLIP={pts:a.map(p=>({t:p.t-t0,v:p.v})),span:a[a.length-1].t-t0};
  if(cut)delAPts();$('st').textContent=a.length+'点を'+(cut?'切り取り':'コピー')+'しました'}
function aPaste(){if(!ACLIP){$('st').textContent='貼り付ける制御点がありません';return}const rel=EQ?playBeat-EQ.s:-1,at=snapT(rel>=0&&rel<=EA.len?rel:0);pushUndo();
  const n=ACLIP.pts.filter(c=>at+c.t<=EA.len+1e-9).map(c=>({t:at+c.t,v:c.v}));EA.pts.push(...n);sortPts();asel=new Set(n);dirty();draw();$('st').textContent=n.length+'点を再生位置に貼り付けました'}
function aDup(){if(!asel.size)return;const a=[...asel],t0=Math.min(...a.map(p=>p.t)),t1=Math.max(...a.map(p=>p.t)),off=Math.max(t1-t0,GRID);
  if(t1+off>EA.len){$('st').textContent='クリップの長さを超えるため複製できません(長さを延ばしてください)';return}pushUndo();const n=a.map(p=>({t:p.t+off,v:p.v}));EA.pts.push(...n);sortPts();asel=new Set(n);dirty();draw()}
$('an').oninput=e=>{EA.name=e.target.value||KN[EA.kind];dirty();draw()};
$('akd').onchange=e=>{pushUndo();EA.kind=e.target.value;dirty();draw()};
$('amLine').onclick=()=>{if(EA.mode!=='line'){pushUndo();EA.mode='line';dirty();draw()}};$('amCurve').onclick=()=>{if(EA.mode!=='curve'){pushUndo();EA.mode='curve';dirty();draw()}};
$('asm').oninput=e=>{EA.smooth=+e.target.value;dirty();draw()};
$('arng').onchange=e=>{pushUndo();EA.range=Math.max(1,Math.min(48,Math.round(+e.target.value)||12));dirty();draw()};
$('atm').onchange=e=>{pushUndo();EA.tm=Math.max(.02,Math.min(1,+e.target.value||.3));dirty();draw()};
$('afb').onchange=e=>{pushUndo();EA.fb=Math.max(0,Math.min(.85,+e.target.value||0));dirty();draw()};
$('alen').onchange=e=>{const n=Math.max(1,Math.min(64,Math.round(+e.target.value)||1));pushUndo();EA.len=n*4;for(const p of EA.pts)p.t=Math.min(p.t,EA.len);dirty();draw()};
$('asnOn').onchange=e=>{AGON=e.target.checked};
const _d3=delSel;delSel=function(){if(VIEW==='auto'){delAPts();return}if(VIEW==='song'&&selA){delAblk();return}_d3()};
const _u3=dupSel;dupSel=function(){if(VIEW==='auto'){aDup();return}if(VIEW==='song'&&selA){dupAblk(false);return}_u3()};
const _ps=pasteSel;pasteSel=function(){if(VIEW==='auto'){aPaste();return}_ps()};
const _sa=selectAll;selectAll=function(){if(VIEW==='auto'){asel=new Set(EA.pts);draw();return}_sa()};
const _cs=copySel;copySel=function(cut){if(VIEW==='auto'){aCopy(cut);return}_cs(cut)};
$('del').onclick=delSel;$('dup').onclick=dupSel;$('pst').onclick=pasteSel;$('sall').onclick=selectAll;
/* ---------- 自作エフェクト制作スタジオ ---------- */
// [min,max,既定,step,表示名,変調スケール(LFO/制御の深さ1での振れ幅。無ければ変調不可)]
const CN={
 in:{n:'音声入力',cat:'入出力',ins:[],outs:['out'],p:{}},
 out:{n:'音声出力',cat:'入出力',ins:['in'],outs:[],p:{}},
 vol:{n:'音量',cat:'音声処理',ins:['in'],outs:['out'],p:{gain:[0,2,1,.01,'ゲイン',1]}},
 pan:{n:'パン',cat:'音声処理',ins:['in'],outs:['out'],p:{pan:[-1,1,0,.01,'パン',1]}},
 lpf:{n:'ローパスフィルター',cat:'音声処理',ins:['in'],outs:['out'],p:{freq:[20,20000,2000,1,'周波数(Hz)',2400],q:[.1,20,.7,.1,'Q',10]}},
 hpf:{n:'ハイパスフィルター',cat:'音声処理',ins:['in'],outs:['out'],p:{freq:[20,20000,200,1,'周波数(Hz)',2400],q:[.1,20,.7,.1,'Q',10]}},
 eq:{n:'EQ',cat:'音声処理',ins:['in'],outs:['out'],p:{low:[-15,15,0,.5,'低域(dB)'],mid:[-15,15,0,.5,'中域(dB)'],high:[-15,15,0,.5,'高域(dB)']}},
 dist:{n:'ディストーション',cat:'音声処理',ins:['in'],outs:['out'],p:{drive:[1,50,8,.5,'ドライブ',20],level:[0,1.5,.6,.01,'出力']}},
 crush:{n:'Bitcrusher',cat:'音声処理',ins:['in'],outs:['out'],p:{bits:[1,16,8,1,'ビット深度'],down:[1,50,4,.5,'ダウンサンプル(1/n)']}},
 ring:{n:'Ring Modulator',cat:'音声処理',ins:['in'],outs:['out'],p:{freq:[1,5000,300,1,'周波数(Hz)',2400],shape:[0,1,0,1,'波形(0サイン/1矩形)']}},
 delay:{n:'ディレイ',cat:'音声処理',ins:['in'],outs:['out'],p:{time:[.01,1,.3,.01,'時間(秒)',.01],fb:[0,.85,.35,.01,'フィードバック'],mix:[0,1,.5,.01,'ミックス']}},
 reverb:{n:'リバーブ',cat:'音声処理',ins:['in'],outs:['out'],p:{decay:[.3,5,1.8,.1,'長さ(秒)'],mix:[0,1,.3,.01,'ミックス']}},
 mix:{n:'Mix',cat:'音声処理',ins:['a','b'],outs:['out'],p:{mix:[0,1,.5,.01,'B側の割合']}},
 split:{n:'分岐',cat:'音声処理',ins:['in'],outs:['out'],p:{gain:[0,2,1,.01,'ゲイン']}},
 merge:{n:'合流',cat:'音声処理',ins:['in'],outs:['out'],p:{gain:[0,2,1,.01,'ゲイン']}},
 lfo:{n:'LFO',cat:'制御',ins:[],outs:[],cv:1,p:{freq:[.05,30,2,.05,'周波数(Hz)'],depth:[0,1,.5,.01,'深さ'],shape:[0,3,0,1,'波形(0サイン/1三角/2矩形/3ノコギリ)']}},
 ctl:{n:'パラメータ制御入力',cat:'制御',ins:[],outs:[],cv:1,p:{def:[0,1,.5,.01,'初期値(0.5=変化なし)']}}};
FXD.custom=['自作エフェクト',{mix:[0,1,1,.01,'ミックス']}];
const cl01=(v,d)=>{v=+v;return isFinite(v)?Math.max(0,Math.min(1,v)):d};
function edgeKind(ta,fp,tb,tp){const A=CN[ta],B=CN[tb];if(!A||!B)return null;
  if(fp==='cv')return(A.cv&&B.p[tp]&&B.p[tp][5]!=null)?'c':null;
  return(A.outs.includes(fp)&&B.ins.includes(tp))?'a':null}
function pathA(edges,from,to){const st=[from],seen=new Set();while(st.length){const x=st.pop();if(x===to)return true;if(seen.has(x))continue;seen.add(x);for(const e of edges)if(e.from===x&&e.fp!=='cv')st.push(e.to)}return false}
function cfxClean(d){if(!d||typeof d!=='object')return null;
  const e={id:typeof d.id==='string'&&d.id?d.id:uid(),name:String(d.name||'マイエフェクト').slice(0,40),ver:1,mix:cl01(d.mix,1),on:d.on!==false,nodes:[],edges:[]};
  const ids=new Set();let hi=false,ho=false;
  for(const n of (Array.isArray(d.nodes)?d.nodes:[]).slice(0,60)){if(!n||!CN[n.type])continue;if(n.type==='in'){if(hi)continue;hi=true}if(n.type==='out'){if(ho)continue;ho=true}
    const id=(typeof n.id==='string'&&n.id&&!ids.has(n.id))?n.id:uid();ids.add(id);const p={};
    for(const k in CN[n.type].p){const sp=CN[n.type].p[k];let v=n.p?+n.p[k]:NaN;if(!isFinite(v))v=sp[2];p[k]=Math.max(sp[0],Math.min(sp[1],v))}
    const o={id,type:n.type,x:isFinite(+n.x)?+n.x:40,y:isFinite(+n.y)?+n.y:40,p};if(n.type==='ctl')o.lbl=String(n.lbl||'マクロ').slice(0,20);e.nodes.push(o)}
  const by=new Map(e.nodes.map(n=>[n.id,n])),seen=new Set(),eids=new Set();
  for(const x of (Array.isArray(d.edges)?d.edges:[]).slice(0,200)){if(!x)continue;const a=by.get(x.from),b=by.get(x.to);if(!a||!b||a===b)continue;
    const k=edgeKind(a.type,x.fp,b.type,x.tp);if(!k)continue;const key=x.from+'|'+x.fp+'|'+x.to+'|'+x.tp;if(seen.has(key))continue;
    if(k==='a'&&pathA(e.edges,b.id,a.id))continue;seen.add(key);const id=(typeof x.id==='string'&&x.id&&!eids.has(x.id))?x.id:uid();eids.add(id);e.edges.push({id,from:a.id,fp:x.fp,to:b.id,tp:x.tp})}
  return e}
function fixCfx(){S.cfx=(Array.isArray(S.cfx)?S.cfx:[]).map(cfxClean).filter(Boolean)}
function cfxAnalyze(d){const fw=new Set(),bw=new Set(),inN=d.nodes.find(n=>n.type==='in'),outN=d.nodes.find(n=>n.type==='out');
  if(inN){const st=[inN.id];while(st.length){const x=st.pop();if(fw.has(x))continue;fw.add(x);for(const e of d.edges)if(e.from===x&&e.fp!=='cv')st.push(e.to)}}
  if(outN){const st=[outN.id];while(st.length){const x=st.pop();if(bw.has(x))continue;bw.add(x);for(const e of d.edges)if(e.to===x&&e.fp!=='cv')st.push(e.from)}}
  const act=new Set([...fw].filter(x=>bw.has(x)));
  for(const e of d.edges)if(e.fp==='cv'&&act.has(e.to))act.add(e.from);
  return{ok:!!(inN&&outN&&fw.has(outN.id)),act}}
const cfxUsesWL=d=>!!d&&d.nodes.some(n=>n.type==='crush');
function needWL(e){return WLT.has(e.type)||(e.type==='custom'&&e.p&&cfxUsesWL(S.cfx.find(x=>x.id===e.p.cid)))}
function fxName(e){return e.type==='custom'?'★ '+((S.cfx.find(x=>x.id===(e.p&&e.p.cid))||{}).name||'(見つかりません)'):FXD[e.type][0]}
function fxParams(e){if(e.type!=='custom')return FXD[e.type][1];const o={mix:FXD.custom[1].mix},d=S.cfx.find(x=>x.id===e.p.cid);
  if(d)for(const n of d.nodes)if(n.type==='ctl')o['m_'+n.id]=[0,1,n.p.def,.01,'◆'+(n.lbl||'マクロ')];return o}
function cfxOptions(){return S.cfx.map(x=>'<option value="custom:'+x.id+'">★ '+x.name.replace(/[<>&"]/g,'')+'</option>').join('')}
function mkIR(c,sec){const n=Math.max(1,Math.floor(c.sampleRate*sec)),b=c.createBuffer(2,n,c.sampleRate);for(let k=0;k<2;k++){const a=b.getChannelData(k);for(let j=0;j<n;j++)a[j]=(Math.random()*2-1)*Math.pow(1-j/n,3)}return b}
function mkCN(c,nd,dsp){const p=nd.p,R={in:{},out:{},pm:{},upd(){}},G=v=>{const g=c.createGain();g.gain.value=v;return g};
  switch(nd.type){
   case 'vol':{const g=G(p.gain);R.in.in=g;R.out.out=g;R.pm.gain=g.gain;R.upd=()=>{g.gain.value=p.gain};break}
   case 'split':case 'merge':{const g=G(p.gain);R.in.in=g;R.out.out=g;R.upd=()=>{g.gain.value=p.gain};break}
   case 'pan':{const n=c.createStereoPanner();n.pan.value=p.pan;R.in.in=n;R.out.out=n;R.pm.pan=n.pan;R.upd=()=>{n.pan.value=p.pan};break}
   case 'lpf':case 'hpf':{const n=c.createBiquadFilter();n.type=nd.type==='lpf'?'lowpass':'highpass';R.in.in=n;R.out.out=n;R.pm.freq=n.detune;R.pm.q=n.Q;R.upd=()=>{n.frequency.value=p.freq;n.Q.value=p.q};R.upd();break}
   case 'eq':{const f=['lowshelf','peaking','highshelf'].map((ty,i)=>{const b=c.createBiquadFilter();b.type=ty;b.frequency.value=[200,1000,4000][i];return b});f[0].connect(f[1]);f[1].connect(f[2]);R.in.in=f[0];R.out.out=f[2];R.upd=()=>{f[0].gain.value=p.low;f[1].gain.value=p.mid;f[2].gain.value=p.high};R.upd();break}
   case 'dist':{const pre=G(p.drive),ws=c.createWaveShaper(),post=G(p.level),cu=new Float32Array(1024);for(let i=0;i<1024;i++)cu[i]=Math.tanh((i*2/1023-1)*4);ws.curve=cu;ws.oversample='4x';pre.connect(ws);ws.connect(post);R.in.in=pre;R.out.out=post;R.pm.drive=pre.gain;R.upd=()=>{pre.gain.value=p.drive;post.gain.value=p.level};break}
   case 'crush':{if(WLOK.has(c)){const wn=new AudioWorkletNode(c,'dfx',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',channelInterpretation:'speakers',processorOptions:{type:'crush',p:{bits:p.bits,down:p.down}}});
      R.in.in=wn;R.out.out=wn;R.upd=()=>wn.port.postMessage({bits:p.bits,down:p.down});dsp.push(()=>{try{wn.port.close()}catch(e){}wn.disconnect()})}else{const g=G(1);R.in.in=g;R.out.out=g}break}
   case 'ring':{const o=c.createOscillator(),rg=G(0);o.connect(rg.gain);o.start();dsp.push(()=>o.stop());R.in.in=rg;R.out.out=rg;R.pm.freq=o.detune;R.upd=()=>{o.frequency.value=p.freq;o.type=p.shape>=.5?'square':'sine'};R.upd();break}
   case 'delay':{const i=G(1),dry=G(1),o=G(1),dl=c.createDelay(1),wet=G(1),fb=G(0);i.connect(dry);dry.connect(o);i.connect(dl);dl.connect(wet);wet.connect(o);dl.connect(fb);fb.connect(dl);
      R.in.in=i;R.out.out=o;R.pm.time=dl.delayTime;R.upd=()=>{dry.gain.value=1-p.mix;wet.gain.value=p.mix;fb.gain.value=p.fb;dl.delayTime.value=p.time};R.upd();break}
   case 'reverb':{const i=G(1),dry=G(1),o=G(1),cv=c.createConvolver(),wet=G(1);i.connect(dry);dry.connect(o);i.connect(cv);cv.connect(wet);wet.connect(o);let dc=-1;
      R.in.in=i;R.out.out=o;R.upd=()=>{dry.gain.value=1-p.mix;wet.gain.value=p.mix;if(p.decay!==dc){dc=p.decay;cv.buffer=mkIR(c,p.decay)}};R.upd();break}
   case 'mix':{const ga=G(1),gb=G(1),o=G(1);ga.connect(o);gb.connect(o);R.in.a=ga;R.in.b=gb;R.out.out=o;R.upd=()=>{ga.gain.value=1-p.mix;gb.gain.value=p.mix};R.upd();break}
   case 'lfo':{const o=c.createOscillator(),dg=G(1);o.connect(dg);o.start();dsp.push(()=>o.stop());R.out.cv=dg;R.upd=()=>{o.frequency.value=p.freq;o.type=['sine','triangle','square','sawtooth'][Math.round(p.shape)]||'sine';dg.gain.value=p.depth};R.upd();break}
   case 'ctl':{const k=c.createConstantSource();k.start();dsp.push(()=>k.stop());R.out.cv=k;R.setMacro=v=>{k.offset.value=(v-.5)*2};R.setMacro(p.def);break}
  }return R}
function cfxBuild(c,cid,mx,I,w){const def=(S.cfx||[]).find(x=>x.id===cid),dsp=[];
  const pass=()=>{I.connect(w);return{h:q=>mx(1),cu:()=>{},ds:()=>{}}};
  if(!def)return pass();const an=cfxAnalyze(def);if(!an.ok)return pass();
  const N=new Map();for(const nd of def.nodes){if(!an.act.has(nd.id)||nd.type==='in'||nd.type==='out')continue;N.set(nd.id,mkCN(c,nd,dsp))}
  const inN=def.nodes.find(n=>n.type==='in'),outN=def.nodes.find(n=>n.type==='out');
  N.set(inN.id,{out:{out:I},in:{},pm:{},upd(){}});N.set(outN.id,{in:{in:w},out:{},pm:{},upd(){}});
  const T=new Map(def.nodes.map(n=>[n.id,n.type]));
  for(const e of def.edges){const a=N.get(e.from),b=N.get(e.to);if(!a||!b)continue;
    if(e.fp==='cv'){const tp=b.pm[e.tp],sc=CN[T.get(e.to)].p[e.tp][5];if(!tp||!a.out.cv)continue;const g=c.createGain();g.gain.value=sc;a.out.cv.connect(g);g.connect(tp)}
    else{const src=a.out[e.fp],dst=b.in[e.tp];if(src&&dst)src.connect(dst)}}
  const h=q=>{mx(cl01(q.mix,1));for(const nd of def.nodes){if(nd.type!=='ctl')continue;const n=N.get(nd.id);if(n&&n.setMacro)n.setMacro(cl01(q['m_'+nd.id],nd.p.def))}};
  const cu=nid=>{if(nid){const n=N.get(nid);if(n&&n.upd)n.upd();return}N.forEach(n=>n.upd&&n.upd())};
  return{h,cu,ds:()=>dsp.forEach(g=>{try{g()}catch(e){}})}}
// ---- 編集画面 ----
const fs={cur:null,selN:null,selE:null,v:{x:30,y:30,k:1},ust:[],rst:[],pend:null,aud:null,tmsg:0},$f=id=>document.getElementById(id),fsEsc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fsWs=$f('fsWs'),fsWorld=$f('fsWorld'),ptrs=new Map();let gest=null;
function fsMsg(t){fs.tmsg=Date.now();$f('fsMsg').textContent=t}
function newCfx(){const a={id:uid(),name:'マイエフェクト '+(S.cfx.length+1),ver:1,mix:1,on:true,nodes:[{id:uid(),type:'in',x:40,y:140,p:{}},{id:uid(),type:'out',x:560,y:140,p:{}}],edges:[]};
  a.edges.push({id:uid(),from:a.nodes[0].id,fp:'out',to:a.nodes[1].id,tp:'in'});S.cfx.push(a);dirty();return a}
function openStudio(cid){let e=S.cfx.find(x=>x.id===cid)||S.cfx[0]||newCfx();fs.cur=e;fs.selN=fs.selE=null;fs.ust=[];fs.rst=[];fs.pend=null;
  $f('fxs').hidden=false;document.body.classList.add('fxopen');fsPal();fsList();fsRender();fsFit()}
function fsClose(){fsStopAud();$f('fxs').hidden=true;document.body.classList.remove('fxopen');renderMx()}
function fsList(){const sl=$f('fsSel');sl.innerHTML=S.cfx.map(x=>'<option value="'+x.id+'"'+(x===fs.cur?' selected':'')+'>'+fsEsc(x.name)+'</option>').join('');$f('fsName').value=fs.cur.name}
function fsPal(){const cats={};for(const k in CN)(cats[CN[k].cat]=cats[CN[k].cat]||[]).push(k);
  $f('fsPal').innerHTML=Object.keys(cats).map(c=>'<b>'+c+'</b>'+cats[c].map(k=>'<button data-add="'+k+'">'+CN[k].n+'</button>').join('')).join('');
  $f('fsPal').querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>fsAddNode(b.dataset.add))}
function applyV(){fsWorld.style.transform='translate('+fs.v.x+'px,'+fs.v.y+'px) scale('+fs.v.k+')';$f('fsZl').textContent=Math.round(fs.v.k*100)+'%';fsWs.style.backgroundSize=(24*fs.v.k)+'px '+(24*fs.v.k)+'px';fsWs.style.backgroundPosition=fs.v.x+'px '+fs.v.y+'px'}
const wsR=()=>fsWs.getBoundingClientRect();
function zoomAt(cx,cy,nk){nk=Math.max(.3,Math.min(2.5,nk));const r=wsR(),px=cx-r.left,py=cy-r.top;fs.v.x=px-(px-fs.v.x)*nk/fs.v.k;fs.v.y=py-(py-fs.v.y)*nk/fs.v.k;fs.v.k=nk;applyV();fsEdges()}
function fsFit(){const ns=fs.cur.nodes,r=wsR();if(!ns.length||!r.width){applyV();return}let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const n of ns){x0=Math.min(x0,n.x);y0=Math.min(y0,n.y);x1=Math.max(x1,n.x+170);y1=Math.max(y1,n.y+120)}
  const k=Math.max(.3,Math.min(1.2,Math.min((r.width-40)/(x1-x0),(r.height-40)/(y1-y0))));fs.v.k=k;fs.v.x=(r.width-(x1-x0)*k)/2-x0*k;fs.v.y=(r.height-(y1-y0)*k)/2-y0*k;applyV();fsEdges()}
function fsRender(){const e=fs.cur,an=cfxAnalyze(e);
  $f('fsNodes').innerHTML=e.nodes.map(n=>{const C=CN[n.type],ins=C.ins.map(k=>'<div class="pt a in" data-pt="'+k+'" data-k="a" data-d="in"><i></i><span>'+k+'</span></div>').join(''),
    ctl=Object.keys(C.p).filter(k=>C.p[k][5]!=null).map(k=>'<div class="pt c in" data-pt="'+k+'" data-k="c" data-d="in"><i></i><span>'+fsEsc(C.p[k][4].replace(/\(.*\)/,''))+'</span></div>').join(''),
    outs=C.outs.map(k=>'<div class="pt a out" data-pt="'+k+'" data-k="a" data-d="out"><i></i><span>'+k+'</span></div>').join('')+(C.cv?'<div class="pt c out" data-pt="cv" data-k="c" data-d="out"><i></i><span>制御</span></div>':'');
    const sm=Object.keys(C.p).slice(0,2).map(k=>fsEsc(C.p[k][4].replace(/\(.*\)/,''))+' '+(+n.p[k].toFixed(2))).join('<br>')+(n.type==='ctl'?'<br>'+fsEsc(n.lbl):'');
    return '<div class="fn'+(fs.selN===n.id?' sel':'')+((!an.act.has(n.id)&&n.type!=='in'&&n.type!=='out')?' dim':'')+'" id="fn_'+n.id+'" data-id="'+n.id+'" style="left:'+n.x+'px;top:'+n.y+'px"><div class="fh"><span>'+C.n+'</span><button class="fdel" title="削除">✕</button></div><div class="fb"><div class="fcol">'+ins+ctl+'</div><div class="fcol" style="font-size:11px;color:var(--mut);justify-content:center;text-align:center">'+sm+'</div><div class="fcol">'+outs+'</div></div></div>'}).join('');
  applyV();fsEdges();fsInsp();
  if(Date.now()-fs.tmsg>3500)$f('fsMsg').textContent=an.ok?'入力→出力の経路があります。'+(e.nodes.some(n=>!an.act.has(n.id)&&n.type!=='in'&&n.type!=='out')?'(出力に繋がっていないノードは薄く表示され、音には影響しません)':''):'警告: 音声入力→音声出力の経路がないため、この状態では原音がそのまま通ります。'}
function pPos(id,pt,d){const el=document.querySelector('#fn_'+id+' .pt[data-pt="'+pt+'"][data-d="'+d+'"] i');if(!el)return null;const r=el.getBoundingClientRect(),w=wsR();return{x:(r.left+r.width/2-w.left-fs.v.x)/fs.v.k,y:(r.top+r.height/2-w.top-fs.v.y)/fs.v.k}}
const bez=(a,b)=>'M'+a.x+' '+a.y+' C'+(a.x+70)+' '+a.y+','+(b.x-70)+' '+b.y+','+b.x+' '+b.y;
function fsEdges(){const e=fs.cur;let h='';
  for(const x of e.edges){const a=pPos(x.from,x.fp,'out'),b=pPos(x.to,x.tp,'in');if(!a||!b)continue;const d=bez(a,b);
    h+='<path class="eh" data-e="'+x.id+'" d="'+d+'" stroke="transparent" stroke-width="22" fill="none"/><path class="ev '+(x.fp==='cv'?'c':'a')+(fs.selE===x.id?' sel':'')+'" d="'+d+'"/>'}
  if(gest&&gest.mode==='wire'&&gest.moved){const f=gest.from,p=pPos(f.id,f.pt,f.d),q=toW(gest.x,gest.y);if(p)h+='<path class="ev '+(f.k==='c'?'c':'a')+'" d="'+(f.d==='out'?bez(p,q):bez(q,p))+'" opacity=".6"/>'}
  $f('fsSvg').innerHTML=h}
function toW(cx,cy){const r=wsR();return{x:(cx-r.left-fs.v.x)/fs.v.k,y:(cy-r.top-fs.v.y)/fs.v.k}}
function fsSelect(n,e){fs.selN=n;fs.selE=e;document.querySelectorAll('.fn').forEach(el=>el.classList.toggle('sel',el.dataset.id===n));fsEdges();fsInsp()}
function fsInsp(){const box=$f('fsIns'),E=fs.cur;let h='';
  const rowFor=(k,s,v)=>'<label>'+s[4]+' <span class="fv"></span><input type="range" data-k="'+k+'" min="'+s[0]+'" max="'+s[1]+'" step="'+s[3]+'" value="'+v+'"><input type="number" data-n="'+k+'" min="'+s[0]+'" max="'+s[1]+'" step="'+s[3]+'" value="'+v+'"></label>';
  const n=fs.selN&&E.nodes.find(x=>x.id===fs.selN);
  if(n){const C=CN[n.type];h+='<b>'+C.n+'</b>';if(n.type==='ctl')h+='<label>マクロ名(トラックのエフェクト欄に表示)<input id="fsLbl" value="'+fsEsc(n.lbl)+'"></label>';
    for(const k in C.p)h+=rowFor(k,C.p[k],n.p[k]);
    if(n.type==='lfo'||n.type==='ctl')h+='<span class="fv">出力の「制御」端子を、変調したいパラメーター端子(オレンジの四角)へ繋ぎます。</span>';
    h+='<button id="fsDelN">このノードを削除</button>'}
  else if(fs.selE&&E.edges.some(x=>x.id===fs.selE))h+='<b>接続線</b><button id="fsDelE">この接続を削除</button>';
  else{h+='<b>エフェクト全体</b>'+rowFor('mix',[0,1,1,.01,'全体ミックス(新規追加時の初期値)'],E.mix)+'<label><span><input type="checkbox" id="fsOn" '+(E.on?'checked':'')+'> 試聴時ON</span></label><span class="fv">ノードをタップすると、パラメーターを編集できます。端子をタップ→別の端子をタップでも接続できます。</span>'}
  box.innerHTML=h;let pushed=false;
  box.querySelectorAll('[data-k],[data-n]').forEach(inp=>{const k=inp.dataset.k||inp.dataset.n,tgt=n?n.p:null;
    const set=v=>{v=+v;if(!isFinite(v))return;const sp=n?CN[n.type].p[k]:[0,1];v=Math.max(sp[0],Math.min(sp[1],v));if(!pushed){fsPush();pushed=true}
      if(n)n.p[k]=v;else E.mix=v;box.querySelectorAll('[data-k="'+k+'"],[data-n="'+k+'"]').forEach(o=>{if(o!==inp)o.value=v});
      const nd=document.querySelector('#fn_'+(n?n.id:'')+' .fb .fcol:nth-child(2)');cfxChanged(E.id,false,n?n.id:null)};
    inp.oninput=()=>set(inp.value);inp.onchange=()=>{pushed=false;if(n)fsRenderLite()}});
  const lb=$f('fsLbl');if(lb)lb.oninput=()=>{n.lbl=lb.value.slice(0,20);dirty();renderMx()};
  const dn=$f('fsDelN');if(dn)dn.onclick=()=>fsDelNode(n.id);const de=$f('fsDelE');if(de)de.onclick=()=>fsDelEdge(fs.selE);
  const on=$f('fsOn');if(on)on.onchange=()=>{E.on=on.checked;dirty();cfxRestartAud()}}
function fsRenderLite(){const keepN=fs.selN;fsRender();fs.selN=keepN}
function fsPush(){fs.ust.push(JSON.stringify(fs.cur));if(fs.ust.length>80)fs.ust.shift();fs.rst=[]}
function fsLoad(j){const o=JSON.parse(j),c=fs.cur;c.name=o.name;c.mix=o.mix;c.on=o.on;c.nodes=o.nodes;c.edges=o.edges;fs.selN=fs.selE=null;fsList();fsStruct()}
function fsUndo(){if(!fs.ust.length)return;fs.rst.push(JSON.stringify(fs.cur));fsLoad(fs.ust.pop())}
function fsRedo(){if(!fs.rst.length)return;fs.ust.push(JSON.stringify(fs.cur));fsLoad(fs.rst.pop())}
function fsStruct(){fsRender();cfxChanged(fs.cur.id,true)}
function cfxChanged(cid,struct,nid){dirty();if(struct)cfxRestartAud();
  for(const t of S.tracks)for(const e of (t.fx||[]))if(e.type==='custom'&&e.p&&e.p.cid===cid){const n=FXN.get(e);if(!n)continue;if(struct){if(n.ds)n.ds();FXN.delete(e)}else if(n.cu)n.cu(nid)}
  if(struct&&ctx)rebuildAll()}
async function fsAddNode(type){const E=fs.cur;if((type==='in'||type==='out')&&E.nodes.some(n=>n.type===type)){fsMsg(CN[type].n+'は1つだけ配置できます');return}
  if(E.nodes.length>=60){fsMsg('ノード数の上限(60)です');return}
  if(type==='crush'){try{initAudio();await ensureWL(ctx)}catch(er){fsMsg('AudioWorkletを使えないため Bitcrusher は追加できません: '+er.message);return}}
  fsPush();const r=wsR(),c=toW(r.left+r.width/2,r.top+r.height/2),p={};for(const k in CN[type].p)p[k]=CN[type].p[k][2];
  const n={id:uid(),type,x:Math.round(c.x-70+(Math.random()-.5)*60),y:Math.round(c.y-30+(Math.random()-.5)*60),p};if(type==='ctl')n.lbl='マクロ';E.nodes.push(n);fs.selN=n.id;fsStruct()}
function fsDelNode(id){fsPush();const E=fs.cur;E.nodes=E.nodes.filter(n=>n.id!==id);E.edges=E.edges.filter(e=>e.from!==id&&e.to!==id);fs.selN=null;fsStruct()}
function fsDelEdge(id){fsPush();fs.cur.edges=fs.cur.edges.filter(e=>e.id!==id);fs.selE=null;fsStruct()}
function fsConnect(a,b){if(a.d===b.d){fsMsg('出力端子と入力端子を接続してください');return}
  const o=a.d==='out'?a:b,i=a.d==='out'?b:a;if(o.id===i.id){fsMsg('同じノード同士は接続できません');return}
  if(o.k!==i.k){fsMsg('音声端子と制御端子は接続できません');return}
  const E=fs.cur,A=E.nodes.find(n=>n.id===o.id),B=E.nodes.find(n=>n.id===i.id),kind=A&&B&&edgeKind(A.type,o.pt,B.type,i.pt);
  if(!kind){fsMsg('この端子同士は接続できません');return}
  if(E.edges.some(x=>x.from===o.id&&x.fp===o.pt&&x.to===i.id&&x.tp===i.pt)){fsMsg('すでに接続されています');return}
  if(kind==='a'&&pathA(E.edges,i.id,o.id)){fsMsg('循環接続になるため接続できません');return}
  fsPush();E.edges.push({id:uid(),from:o.id,fp:o.pt,to:i.id,tp:i.pt});fsStruct()}
const ptInfo=el=>({id:el.closest('.fn').dataset.id,pt:el.dataset.pt,k:el.dataset.k,d:el.dataset.d});
function fsPend(info){document.querySelectorAll('.pt.pend').forEach(e=>e.classList.remove('pend'));fs.pend=info;
  if(info){const el=document.querySelector('#fn_'+info.id+' .pt[data-pt="'+info.pt+'"][data-d="'+info.d+'"]');if(el)el.classList.add('pend');fsMsg('接続先の端子をタップしてください')}}
fsWs.addEventListener('pointerdown',e=>{
  if(e.target.closest('.fdel')){const n=e.target.closest('.fn');if(n)fsDelNode(n.dataset.id);return}
  fsWs.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){const[a,b]=[...ptrs.values()];gest={mode:'pinch',d:Math.hypot(a.x-b.x,a.y-b.y)||1,k:fs.v.k,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,vx:fs.v.x,vy:fs.v.y};return}
  if(ptrs.size>2)return;
  const pt=e.target.closest('.pt'),nd=e.target.closest('.fn'),eh=e.target.closest('.eh');
  if(pt){gest={mode:'wire',from:ptInfo(pt),sx:e.clientX,sy:e.clientY,x:e.clientX,y:e.clientY,moved:false};return}
  if(nd&&e.target.closest('.fh')){fsSelect(nd.dataset.id,null);const n=fs.cur.nodes.find(x=>x.id===nd.dataset.id);gest={mode:'move',n,sx:e.clientX,sy:e.clientY,ox:n.x,oy:n.y,moved:false,snap:JSON.stringify(fs.cur)};return}
  if(nd){fsSelect(nd.dataset.id,null);return}
  if(eh){fsSelect(null,eh.dataset.e);return}
  fsSelect(null,null);fsPend(null);gest={mode:'pan',sx:e.clientX,sy:e.clientY,vx:fs.v.x,vy:fs.v.y}});
fsWs.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!gest)return;
  if(gest.mode==='pinch'){if(ptrs.size<2)return;const[a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y)||1,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,r=wsR(),nk=Math.max(.3,Math.min(2.5,gest.k*d/gest.d));
    fs.v.x=(cx-r.left)-(gest.cx-r.left-gest.vx)*nk/gest.k;fs.v.y=(cy-r.top)-(gest.cy-r.top-gest.vy)*nk/gest.k;fs.v.k=nk;applyV();fsEdges();return}
  if(gest.mode==='pan'){fs.v.x=gest.vx+e.clientX-gest.sx;fs.v.y=gest.vy+e.clientY-gest.sy;applyV();return}
  if(gest.mode==='move'){const dx=(e.clientX-gest.sx)/fs.v.k,dy=(e.clientY-gest.sy)/fs.v.k;if(!gest.moved){if(Math.hypot(dx,dy)*fs.v.k<3)return;gest.moved=true;fs.ust.push(gest.snap);fs.rst=[]}
    gest.n.x=Math.round(gest.ox+dx);gest.n.y=Math.round(gest.oy+dy);const el=$f('fn_'+gest.n.id);el.style.left=gest.n.x+'px';el.style.top=gest.n.y+'px';fsEdges();return}
  if(gest.mode==='wire'){gest.x=e.clientX;gest.y=e.clientY;if(Math.hypot(e.clientX-gest.sx,e.clientY-gest.sy)>6)gest.moved=true;fsEdges()}});
const fsUp=e=>{ptrs.delete(e.pointerId);if(!gest)return;const g=gest;if(g.mode==='pinch'){if(ptrs.size<2)gest=null;return}gest=null;
  if(g.mode==='move'&&g.moved)dirty();
  if(g.mode==='wire'){if(g.moved){const el=document.elementFromPoint(e.clientX,e.clientY),pt=el&&el.closest&&el.closest('.pt');if(pt)fsConnect(g.from,ptInfo(pt));else fsMsg('端子の上で指を離すと接続されます');fsPend(null);fsEdges()}
    else{if(fs.pend){const a=fs.pend;fsPend(null);if(a.id===g.from.id&&a.pt===g.from.pt&&a.d===g.from.d)return;fsConnect(a,g.from)}else fsPend(g.from)}}};
fsWs.addEventListener('pointerup',fsUp);fsWs.addEventListener('pointercancel',fsUp);
fsWs.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,fs.v.k*(e.deltaY<0?1.1:1/1.1))},{passive:false});
fsWs.addEventListener('contextmenu',e=>e.preventDefault());
$f('fsZm').onclick=()=>{const r=wsR();zoomAt(r.left+r.width/2,r.top+r.height/2,fs.v.k/1.2)};$f('fsZp').onclick=()=>{const r=wsR();zoomAt(r.left+r.width/2,r.top+r.height/2,fs.v.k*1.2)};$f('fsFit').onclick=fsFit;
$f('fsClose').onclick=fsClose;$f('fsUndo').onclick=fsUndo;$f('fsRedo').onclick=fsRedo;
$f('fsSel').onchange=e=>{fs.cur=S.cfx.find(x=>x.id===e.target.value)||fs.cur;fs.selN=fs.selE=null;fs.ust=[];fs.rst=[];fsList();fsRender();fsFit();cfxRestartAud()};
$f('fsName').oninput=e=>{fs.cur.name=(e.target.value||'マイエフェクト').slice(0,40);const o=$f('fsSel').selectedOptions[0];if(o)o.textContent=fs.cur.name;dirty()};
$f('fsNew').onclick=()=>{fs.cur=newCfx();fs.selN=fs.selE=null;fs.ust=[];fs.rst=[];fsList();fsRender();fsFit()};
$f('fsDup').onclick=()=>{const c=JSON.parse(JSON.stringify(fs.cur));c.id=uid();c.name=fs.cur.name+' (コピー)';const idm=new Map();c.nodes.forEach(n=>{const o=n.id;n.id=uid();idm.set(o,n.id)});c.edges.forEach(e=>{e.id=uid();e.from=idm.get(e.from);e.to=idm.get(e.to)});
  const cc=cfxClean(c);S.cfx.push(cc);dirty();fs.cur=cc;fs.ust=[];fs.rst=[];fsList();fsRender();fsFit()};
$f('fsDel').onclick=()=>{const E=fs.cur;if(!confirm('「'+E.name+'」を削除しますか?(トラックに追加済みの分も取り除かれます)'))return;
  for(const t of S.tracks){const had=(t.fx||[]).some(e=>e.type==='custom'&&e.p&&e.p.cid===E.id);if(had){for(const e of t.fx)if(e.type==='custom'&&e.p.cid===E.id){const n=FXN.get(e);if(n&&n.ds)n.ds();FXN.delete(e)}t.fx=t.fx.filter(e=>!(e.type==='custom'&&e.p&&e.p.cid===E.id));if(ctx&&CH.get(t))rebuild(t)}}
  S.cfx=S.cfx.filter(x=>x!==E);dirty();fsStopAud();fs.cur=S.cfx[0]||newCfx();fs.selN=fs.selE=null;fs.ust=[];fs.rst=[];fsList();fsRender();fsFit()};
$f('fsAdd').onclick=async()=>{const t=S.tracks[sel],E=fs.cur;if(cfxUsesWL(E)){try{initAudio();await ensureWL(ctx)}catch(er){fsMsg('AudioWorkletを使えないため追加できません: '+er.message);return}}
  pushUndo();t.fx=t.fx||[];t.fx.push({type:'custom',p:{mix:E.mix,cid:E.id},on:true});if(ctx)rebuild(t);dirty();fsMsg('トラック「'+t.name+'」のエフェクト欄に追加しました')};
$f('fsExp').onclick=()=>dl((fs.cur.name.replace(/[^\w\-ぁ-んァ-ヶ一-龠]/g,'_')||'effect')+'.json',JSON.stringify({kind:'daw-custom-effect',ver:1,effect:fs.cur},null,1),'application/json');
$f('fsImp').onclick=()=>$f('fsF').click();
$f('fsF').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const o=JSON.parse(await f.text()),raw=o&&o.kind==='daw-custom-effect'?o.effect:o;if(!raw||!Array.isArray(raw.nodes))throw new Error('自作エフェクトのJSONではありません');
    raw.id=uid();const c=cfxClean(raw);if(!c||!c.nodes.length)throw new Error('有効なノードがありません');S.cfx.push(c);dirty();fs.cur=c;fs.selN=fs.selE=null;fs.ust=[];fs.rst=[];fsList();fsRender();fsFit();
    fsMsg('読み込みました: '+c.name+(c.nodes.length!==(Array.isArray(raw.nodes)?raw.nodes.length:0)||c.edges.length!==(Array.isArray(raw.edges)?raw.edges.length:0)?'(無効なノード・接続は取り除きました)':''))}
  catch(er){fsMsg('読み込み失敗: '+er.message);alert('自作エフェクトを読み込めませんでした: '+er.message)}};
// ---- 試聴(通常再生と同じ mkFx 経路で処理) ----
function fsStopAud(){const a=fs.aud;fs.aud=null;if(!a)return;try{a.src.stop()}catch(e){}try{a.n.ds()}catch(e){}try{a.g.disconnect()}catch(e){}}
async function fsAud(kind){fsStopAud();try{initAudio();if(cfxUsesWL(fs.cur))await ensureWL(ctx)}catch(er){fsMsg('AudioWorkletを使えません: '+er.message);return}
  const sr=ctx.sampleRate,len=sr*2,buf=ctx.createBuffer(1,len,sr),d=buf.getChannelData(0);
  if(kind==='n'){for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*.35}
  else{const nt=[130.8,164.8,196,261.6,196,164.8,130.8,98];for(let k=0;k<8;k++){const f=nt[k],s0=Math.floor(k*len/8),n=Math.floor(len/8);for(let i=0;i<n;i++){const t=i/sr;d[s0+i]+=((((f*t)%1)*2-1)*.5)*Math.exp(-t*5);if(i<sr*.03)d[s0+i]+=(Math.random()*2-1)*.3*(1-i/(sr*.03))}}}
  const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const n=mkFx('custom',{mix:fs.cur.mix,cid:fs.cur.id}),g=ctx.createGain();g.gain.value=.5;if(!fs.cur.on)n.bp(true);
  src.connect(n.I);n.O.connect(g);g.connect(master);src.start();fs.aud={src,n,g,kind}}
function cfxRestartAud(){if(fs.aud){const k=fs.aud.kind;fsAud(k)}}
$f('fsAudA').onclick=()=>fsAud('a');$f('fsAudN').onclick=()=>fsAud('n');$f('fsStop').onclick=fsStopAud;
addEventListener('keydown',e=>{const o=$f('fxs');if(!o||o.hidden)return;const tg=e.target.tagName;
  if(e.key==='Escape'){if(DD.openNow())return;fsClose();e.stopImmediatePropagation();return}
  if(tg==='INPUT'||tg==='SELECT'||tg==='TEXTAREA')return;const k=(e.key||'').toLowerCase();
  if((e.ctrlKey||e.metaKey)&&(k==='z'||k==='y')){e.preventDefault();e.stopImmediatePropagation();(k==='y'||e.shiftKey)?fsRedo():fsUndo();return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();if(fs.selN)fsDelNode(fs.selN);else if(fs.selE)fsDelEdge(fs.selE);return}
  if(e.code==='Space')e.stopImmediatePropagation()},true);
/* ---------- パネルの出し入れ(編集エリアを広く使う) ---------- */
const PN={tr:['トラック欄','aside'],tb:['ツールバー','.bar2'],mx:['ミキサー','#mx'],vl:['ベロシティ','#vlw'],al:['音声レーン','#alw']};
let pnState={tr:true,tb:true,mx:true,vl:true,al:true},pnPrev=null;
try{const sv=JSON.parse(localStorage.getItem('daw-panels')||'null');if(sv&&typeof sv==='object')for(const k in pnState)if(typeof sv[k]==='boolean')pnState[k]=sv[k]}catch(_){}
try{if(!localStorage.getItem('daw-panels')&&matchMedia('(max-width:700px)').matches){pnState.tr=false;pnState.mx=false;pnState.vl=false;pnState.al=false}}catch(_){} // 初回かつ狭い画面: 編集エリアを広く(ドックから出せる)
function applyPanels(){for(const k in PN){const show=pnState[k];document.querySelectorAll(PN[k][1]).forEach(el=>el.classList.toggle('hid',!show));
    const b=document.querySelector('#dock [data-pn="'+k+'"]');if(b){b.classList.toggle('on',show);b.dataset.tip=PN[k][0]+(show?'をしまう':'を出す');b.setAttribute('aria-label',b.dataset.tip)}}
  const all=Object.values(pnState).every(v=>!v);const fb=$('pnFocus');if(fb){fb.classList.toggle('on',all);fb.querySelector('.lb').textContent=all?'戻す':'集中';fb.dataset.tip=all?'パネルを元に戻す':'すべてのパネルをしまう(集中)';fb.setAttribute('aria-label',fb.dataset.tip)}
  try{localStorage.setItem('daw-panels',JSON.stringify(pnState))}catch(_){}
  draw()}
document.querySelectorAll('#dock [data-pn]').forEach(b=>b.onclick=()=>{pnState[b.dataset.pn]=!pnState[b.dataset.pn];pnPrev=null;applyPanels()});
$('pnFocus').onclick=()=>{const all=Object.values(pnState).every(v=>!v);
  if(all){pnState=Object.assign({tr:true,tb:true,mx:true,vl:true,al:true},pnPrev||{});pnPrev=null}
  else{pnPrev=Object.assign({},pnState);for(const k in pnState)pnState[k]=false}applyPanels()};
/* ---------- SoundFontライブラリ ---------- */
const LIB={folders:[],files:new Map(),pfav:new Set(),order:'name',selFile:null,selFolder:null,q:'',favOnly:false,autoStore:true,limit:200,log:[],open:new Set(),tgt:-1};
let LIBVER=0,libT=null;const SFRC=new WeakMap();
const MB=n=>(n/1048576).toFixed(n>=10485760?0:1)+'MB';
async function idbS(store,op,key,val){const db=await dbp;return new Promise((res,rej)=>{const st=db.transaction(store,op==='get'?'readonly':'readwrite').objectStore(store),r=op==='get'?st.get(key):op==='del'?st.delete(key):st.put(val,key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
// 内容で同一性を判定(ファイル名に依存しない): サイズ+先頭/末尾/等間隔サンプルのハッシュ
function sfFp(buf){const u=new Uint8Array(buf),n=u.length;let h1=2166136261>>>0,h2=5381>>>0;const mx=b=>{h1^=b;h1=Math.imul(h1,16777619)>>>0;h2=(Math.imul(h2,33)+b)>>>0};
  for(let k=0;k<4;k++)mx((n>>>(k*8))&255);const A=Math.min(n,65536);for(let i=0;i<A;i++)mx(u[i]);for(let i=Math.max(A,n-65536);i<n;i++)mx(u[i]);
  const st=Math.max(1,Math.floor(n/4096));for(let i=A;i<n-65536;i+=st)mx(u[i]);return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0')+n.toString(16)}
const libEntry=o=>Object.assign({id:'',name:'',dn:'',size:0,folder:null,fav:false,stored:false,added:Date.now(),sf:null,state:'unloaded',err:''},o);
function libAttach(f,sf){sf.pmap=new Map(sf.presets.map(p=>[p.b+':'+p.p,p]));f.sf=sf;f.state='loaded';f.err='';LIBVER++}
function libMem(f){if(!f.sf)return 0;let d=0;for(const s of f.sf.samples)if(s.buf)d+=s.buf.length*4;return f.size+d}
function sfRes(t){const q=t.sf;if(!q)return null;const c=SFRC.get(t);if(c&&c.v===LIBVER&&c.k===q)return c.r;
  let f=null;if(q.f)f=LIB.files.get(q.f)||null;else{const all=[...LIB.files.values()];f=all.find(x=>x.sf&&x.name===S.sf2)||all.find(x=>x.sf)||null}
  let r=null;if(f&&f.sf){const pr=f.sf.pmap.get(q.b+':'+q.p);if(pr)r={sf:f.sf,pr,file:f}}SFRC.set(t,{v:LIBVER,k:q,r});return r}
function sfParse(v){const a=v.split('|'),fl=LIB.files.get(a[0]),pr=fl&&fl.sf&&fl.sf.pmap.get(a[1]+':'+a[2]);return{f:a[0],b:+a[1],p:+a[2],n:pr?pr.name:'',fn:fl?(fl.dn||fl.name):''}}
function libBindLegacy(){let ch=false;for(const t of S.tracks){const q=t.sf;if(!q||q.f)continue;const all=[...LIB.files.values()],f=all.find(x=>x.sf&&x.name===S.sf2)||all.find(x=>x.sf);if(!f)continue;
    const pr=f.sf.pmap.get(q.b+':'+q.p);if(!pr)continue;t.sf={f:f.id,b:q.b,p:q.p,n:pr.name,fn:f.dn||f.name};ch=true}if(ch)dirty()}
const libFolderList=()=>LIB.order==='name'?[...LIB.folders].sort((a,b)=>a.name.localeCompare(b.name,'ja')):LIB.folders.slice();
const libFilesIn=fid=>[...LIB.files.values()].filter(f=>(f.folder||null)===fid).sort(LIB.order==='name'?(a,b)=>(a.dn||a.name).localeCompare(b.dn||b.name,'ja'):(a,b)=>a.added-b.added);
function libSorted(){const o=[];for(const fo of libFolderList())o.push(...libFilesIn(fo.id));o.push(...libFilesIn(null));return o}
function libRows(q,fileId,favOnly){const toks=String(q||'').trim().toLowerCase().split(/\s+/).filter(Boolean),rows=[];
  const add=F=>{if(!F||!F.sf)return;const FO=LIB.folders.find(x=>x.id===F.folder);
    for(const p of F.sf.presets){const key=F.id+'|'+p.b+'|'+p.p;if(favOnly&&!LIB.pfav.has(key))continue;
      if(toks.length){const hay=(p.name+' '+F.name+' '+(F.dn||'')+' '+(FO?FO.name:'')+' '+p.b+':'+p.p).toLowerCase();if(!toks.every(x=>hay.includes(x)))continue}rows.push({F,FO,p,key})}};
  if(toks.length)for(const F of libSorted())add(F);else add(LIB.files.get(fileId));return rows}
function libFolderName(n,ex){n=String(n||'').trim();if(!n)return'フォルダー名を入力してください';if(n.length>30)return'フォルダー名は30文字以内にしてください';
  if(LIB.folders.some(x=>x.id!==ex&&x.name.toLowerCase()===n.toLowerCase()))return'同じ名前のフォルダーがあります';return null}
function libMeta(){return{v:1,folders:LIB.folders,files:[...LIB.files.values()].map(f=>({id:f.id,name:f.name,dn:f.dn,size:f.size,folder:f.folder,fav:f.fav,stored:f.stored,added:f.added})),pfav:[...LIB.pfav],order:LIB.order,autoStore:LIB.autoStore,open:[...LIB.open]}}
function libApplyMeta(o){if(!o||typeof o!=='object')return;LIB.folders=(Array.isArray(o.folders)?o.folders:[]).filter(x=>x&&x.id&&x.name).map(x=>({id:String(x.id),name:String(x.name).slice(0,30)}));
  const fids=new Set(LIB.folders.map(x=>x.id));LIB.files=new Map();
  for(const x of (Array.isArray(o.files)?o.files:[])){if(!x||!x.id)continue;LIB.files.set(String(x.id),libEntry({id:String(x.id),name:String(x.name||''),dn:String(x.dn||x.name||''),size:+x.size||0,folder:fids.has(x.folder)?x.folder:null,fav:!!x.fav,stored:!!x.stored,added:+x.added||0}))}
  LIB.pfav=new Set(Array.isArray(o.pfav)?o.pfav.map(String):[]);if(o.order==='folder'||o.order==='name')LIB.order=o.order;LIB.autoStore=o.autoStore!==false;LIB.open=new Set(Array.isArray(o.open)?o.open:[])}
function libSave(){clearTimeout(libT);libT=setTimeout(async()=>{try{await idbS('sfl','put','meta',JSON.stringify(libMeta()))}catch(e){libLog('ライブラリ情報を保存できませんでした: '+e.message,'err')}},300)}
function libLog(m,c){const L={msg:m,cls:c||''};LIB.log.unshift(L);if(LIB.log.length>40)LIB.log.length=40;if(!$f('sfl').hidden)libRenderLog();return L}
async function libAddFiles(files){
  for(const file of files){const L=libLog(file.name+': 読み込み中…');
    try{if(!/\.(sf2|sf3)$/i.test(file.name))throw new Error('SF2ファイルではありません(拡張子)');if(file.size>500*1048576)throw new Error('ファイルが大きすぎます(500MB超)');
      const buf=await file.arrayBuffer(),id=sfFp(buf);let ent=LIB.files.get(id);
      if(ent&&ent.sf){L.msg=file.name+': 重複 — すでに「'+(ent.dn||ent.name)+'」として登録済みです(追加しませんでした)';L.cls='warn';libRenderLog();continue}
      const sf=parseSF2(buf);if(!sf.presets.length)throw new Error('プリセットがありません');
      const re=!!ent;if(!ent){ent=libEntry({id,name:file.name,dn:file.name,size:file.size,folder:LIB.selFolder});LIB.files.set(id,ent)}else ent.name=file.name;
      libAttach(ent,sf);let note='';
      if(LIB.autoStore&&!ent.stored){try{await idbS('sfb','put',id,buf);ent.stored=true;if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){note=' ※ブラウザへの保存に失敗('+(e.name||e.message)+')。次回は再選択が必要です'}}
      L.msg=file.name+': '+(re?'再接続しました':'追加しました')+' — '+sf.presets.length+'プリセット / '+MB(file.size)+(ent.stored?' / ブラウザに保存済み':' / 保存なし(再起動後は再選択が必要)')+note;L.cls=note?'warn':'ok';
      if(!S.sf2)S.sf2=file.name;LIB.selFile=ent.id;
      const t=S.tracks[sel];if(t&&!t.sf){const pr=sf.pmap.get('0:0')||sf.presets[0];t.sf={f:id,b:pr.b,p:pr.p,n:pr.name,fn:ent.dn||ent.name};dirty()}
      libBindLegacy();renderTracks()}
    catch(e){L.msg=file.name+': 失敗 — '+e.message;L.cls='err'}
    libRender()}
  libSave()}
async function libLoadStored(f){f.state='loading';libRender();
  try{const buf=await idbS('sfb','get',f.id);if(!buf){f.stored=false;throw new Error('ブラウザ内に保存データがありません。SF2を再選択してください')}libAttach(f,parseSF2(buf))}
  catch(e){f.state='unloaded';f.err=e.message;libLog((f.dn||f.name)+': '+e.message,'err')}libRender()}
async function libEnsureForProject(){const ids=new Set(S.tracks.filter(t=>t.sf&&t.sf.f).map(t=>t.sf.f));
  if(S.tracks.some(t=>t.sf&&!t.sf.f)){const f=[...LIB.files.values()].find(x=>x.name===S.sf2&&x.stored);if(f)ids.add(f.id)}
  for(const id of ids){const f=LIB.files.get(id);if(f&&!f.sf&&f.stored)await libLoadStored(f)}
  libBindLegacy();LIBVER++;renderTracks();libRender()}
async function libInit(){try{const m=await idbS('sfl','get','meta');if(m)libApplyMeta(JSON.parse(m))}catch(e){libLog('ライブラリ情報を読み込めませんでした: '+e.message,'err')}await libEnsureForProject()}
function libUnload(f){const used=S.tracks.filter(t=>t.sf&&t.sf.f===f.id).map(t=>t.name);
  if(used.length&&!confirm('トラック('+used.join(', ')+')がこのSF2を使っています。解放すると、読み込み直すまで内蔵シンセで鳴ります。続けますか?'))return;
  f.sf=null;f.state='unloaded';LIBVER++;renderTracks();libRender()}
async function libUnreg(f){if(!confirm('「'+(f.dn||f.name)+'」をライブラリから登録解除します。\n(元のSF2ファイルは削除されません)'))return;
  let del=false;if(f.stored)del=confirm('このブラウザ内に保存したSF2のコピーも削除しますか?\nOK=コピーも削除 / キャンセル=コピーは残して登録だけ解除');
  if(del){try{await idbS('sfb','del',f.id)}catch(e){libLog('保存データを削除できませんでした: '+e.message,'err')}}
  const used=S.tracks.filter(t=>t.sf&&t.sf.f===f.id).map(t=>t.name);LIB.files.delete(f.id);if(LIB.selFile===f.id)LIB.selFile=null;LIBVER++;
  if(used.length)libLog('注意: トラック('+used.join(', ')+')がこのSF2を参照しています。再追加するまで内蔵シンセで鳴ります','warn');libLog('登録解除しました: '+(f.dn||f.name)+(f.stored&&!del?'(保存データは残してあります)':''),'ok');libSave();renderTracks();libRender()}
async function libStore(f,on){try{if(on){if(!f.sf||!f.sf.buf)throw new Error('先にSF2を読み込んでください');await idbS('sfb','put',f.id,f.sf.buf);f.stored=true;libLog('ブラウザに保存しました: '+(f.dn||f.name),'ok')}
    else{if(!confirm('ブラウザ内に保存したコピーを削除します(登録と、元のファイルは残ります)。よろしいですか?'))return;await idbS('sfb','del',f.id);f.stored=false;libLog('保存データを削除しました: '+(f.dn||f.name),'ok')}}
  catch(e){libLog('保存操作に失敗: '+(e.name||'')+' '+e.message,'err')}libSave();libRender()}
function libMove(fid,folder){const f=LIB.files.get(fid);if(!f)return;f.folder=folder||null;if(folder)LIB.open.add(folder);libSave();renderTracks();libRender()}
function libAssign(fid,b,p){const f=LIB.files.get(fid),pr=f&&f.sf&&f.sf.pmap.get(b+':'+p);if(!pr)return;const ti=(LIB.tgt>=0&&S.tracks[LIB.tgt])?LIB.tgt:sel,t=S.tracks[ti];if(!t)return;
  pushUndo();t.sf={f:fid,b,p,n:pr.name,fn:f.dn||f.name};if(!S.sf2)S.sf2=f.name;dirty();renderTracks();libLog('トラック「'+t.name+'」に設定: '+(f.dn||f.name)+' / '+pr.name,'ok');libRender()}
const AUDT={sf:null,vol:.85,mute:false,solo:false,wave:'sine',cut:6000,pan:0,fx:[],id:'__aud'};
function libAud(fid,b,p){const f=LIB.files.get(fid);if(!f||!f.sf)return;initAudio();AUDT.sf={f:fid,b,p};voice(AUDT,b===128?38:60,100,ctx.currentTime+.02,.9)}
const libBadge=f=>(f.sf?'読込済 '+MB(libMem(f)):f.state==='loading'?'読込中…':f.stored?'未読込(保存済)':'要再選択')+(f.err&&!f.sf?' ⚠':'');
function libTree(){const fileRow=f=>'<div class="sff'+(LIB.selFile===f.id?' sel':'')+'" data-f="'+f.id+'" draggable="true"><span title="'+fsEsc(f.name)+'">♪ '+fsEsc(f.dn||f.name)+'</span><small>'+libBadge(f)+'</small><button data-fav="'+f.id+'" title="お気に入り">'+(f.fav?'★':'☆')+'</button></div>';
  const favs=[...LIB.files.values()].filter(f=>f.fav);let h='';if(favs.length)h+='<div class="sfd"><span>★ お気に入り ('+favs.length+')</span></div>'+favs.map(fileRow).join('');
  for(const fo of libFolderList()){const fl=libFilesIn(fo.id),op=LIB.open.has(fo.id);
    h+='<div class="sfd" data-drop="'+fo.id+'"><span data-tg="'+fo.id+'">'+(op?'▾':'▸')+' 📁 '+fsEsc(fo.name)+' ('+fl.length+')'+(LIB.selFolder===fo.id?' ←追加先':'')+'</span><button data-fr="'+fo.id+'" title="名前変更">✎</button><button data-fd="'+fo.id+'" title="削除">🗑</button></div>'+(op?fl.map(fileRow).join(''):'')}
  const un=libFilesIn(null);h+='<div class="sfd" data-drop="" ><span data-tg="">▾ 未分類 ('+un.length+')'+(!LIB.selFolder?' ←追加先':'')+'</span></div>'+un.map(fileRow).join('');
  if(!LIB.files.size)h+='<div style="color:var(--mut);padding:8px;font-size:12px">SF2が登録されていません。「SF2追加」から、複数ファイルをまとめて選べます。</div>';return h}
function libFileHead(f){const fo=LIB.folders.find(x=>x.id===f.folder);
  return '<div class="sfh"><b>'+fsEsc(f.dn||f.name)+'</b><span style="color:var(--mut);font-size:12px">'+fsEsc(f.name)+' · '+MB(f.size)+(f.sf?' · '+f.sf.presets.length+'プリセット · メモリ約'+MB(libMem(f)):'')+' · '+(fo?'📁'+fsEsc(fo.name):'未分類')+'</span></div>'
  +'<div class="sfh"><button data-a="fav">'+(f.fav?'★ お気に入り解除':'☆ お気に入り')+'</button><button data-a="ren">表示名を変更</button><select data-a="mv"><option value="">移動: 未分類</option>'+LIB.folders.map(x=>'<option value="'+x.id+'"'+(x.id===f.folder?' selected':'')+'>移動: '+fsEsc(x.name)+'</option>').join('')+'</select>'
  +(f.sf?'<button data-a="unload">解放(メモリから外す)</button><button data-a="cache">キャッシュ解放</button>':(f.stored?'<button data-a="load">読み込む</button>':''))
  +(f.stored?'<button data-a="unstore">保存データを削除</button>':(f.sf?'<button data-a="store">ブラウザに保存</button>':''))+'<button data-a="unreg">登録解除</button></div>'
  +(f.sf?'':'<div class="sfh" style="color:var(--mut)">'+(f.err?fsEsc(f.err)+'<br>':'')+(f.stored?'ブラウザに保存済みです。「読み込む」で使えます。':'このSF2はブラウザに保存されていません。「SF2追加」で同じファイルを再選択すると、この登録に接続されます。')+'</div>')}
function libRight(){const f=LIB.files.get(LIB.selFile),searching=!!LIB.q.trim(),rows=libRows(LIB.q,LIB.selFile,LIB.favOnly);let h='';
  if(searching)h+='<div class="sfh"><b>検索結果: '+rows.length+'件</b><span style="color:var(--mut);font-size:12px">(読み込み済みの全SF2が対象)</span></div>';
  else if(f)h+=libFileHead(f);else h+='<div class="sfh" style="color:var(--mut)">左の一覧からSF2を選んでください。</div>';
  const shown=rows.slice(0,LIB.limit);
  h+=shown.map(r=>'<div class="plr" data-k="'+r.key+'"><button class="pa" title="試聴">▶</button><span class="pn"><b>'+fsEsc(r.p.name)+'</b><br><span class="pm">'+String(r.p.b).padStart(3,'0')+':'+String(r.p.p).padStart(3,'0')+' · '+fsEsc(r.F.dn||r.F.name)+(r.FO?' · 📁'+fsEsc(r.FO.name):'')+'</span></span><button class="pf" title="お気に入り">'+(LIB.pfav.has(r.key)?'★':'☆')+'</button><button class="ps" title="設定先トラックに設定">設定</button></div>').join('');
  if(rows.length>shown.length)h+='<button data-more="1" style="width:100%;min-height:42px;margin-top:6px">さらに表示 (残り'+(rows.length-shown.length)+'件)</button>';
  if(!rows.length&&(searching||LIB.favOnly)&&(f&&f.sf||searching))h+='<div class="sfh" style="color:var(--mut)">該当するプリセットがありません。</div>';return h}
function libRenderLog(){$f('sflLog').innerHTML=LIB.log.map(l=>'<div class="'+l.cls+'">'+fsEsc(l.msg)+'</div>').join('')}
function libRender(){if($f('sfl').hidden)return;const sl=sflL.scrollTop,sr=sflR.scrollTop;sflL.innerHTML=libTree();sflR.innerHTML=libRight();sflL.scrollTop=sl;sflR.scrollTop=sr;libRenderLog();
  const set=(id,k,v)=>{const el=$f(id);if(document.activeElement!==el)el[k]=v};set('sflOrd','value',LIB.order);set('sflFav','checked',LIB.favOnly);set('sflAuto','checked',LIB.autoStore);
  const tg=$f('sflTgt');if(document.activeElement!==tg){tg.innerHTML=S.tracks.map((t,i)=>'<option value="'+i+'">'+(i+1)+'. '+fsEsc(t.name)+'</option>').join('');tg.value=String((LIB.tgt>=0&&S.tracks[LIB.tgt])?LIB.tgt:sel)}
  let mem=0,n=0;for(const x of LIB.files.values())if(x.sf){mem+=libMem(x);n++}const fo=LIB.folders.find(x=>x.id===LIB.selFolder),el=$f('sflInfo'),base='登録 '+LIB.files.size+'件 / 読込中 '+n+'件 / メモリ約'+MB(mem)+' / 追加先: '+(fo?'📁'+fo.name:'未分類');
  el.textContent=base;if(navigator.storage&&navigator.storage.estimate)navigator.storage.estimate().then(e=>{el.textContent=base+' / ブラウザ保存領域 '+MB(e.usage||0)+' / '+MB(e.quota||0)}).catch(()=>{})}
const sflL=$f('sflL'),sflR=$f('sflR');
function openLib(){LIB.tgt=sel;$f('sfl').hidden=false;document.body.classList.add('fxopen');libRender()}
function closeLib(){$f('sfl').hidden=true;document.body.classList.remove('fxopen');renderTracks()}
$('sflB').onclick=openLib;$f('sflClose').onclick=closeLib;$f('sflAdd').onclick=()=>$('sf2f').click();
$f('sflQ').oninput=e=>{LIB.q=e.target.value;LIB.limit=200;libRender()};
$f('sflOrd').onchange=e=>{LIB.order=e.target.value;libSave();renderTracks();libRender()};
$f('sflFav').onchange=e=>{LIB.favOnly=e.target.checked;libRender()};$f('sflAuto').onchange=e=>{LIB.autoStore=e.target.checked;libSave()};
$f('sflTgt').onchange=e=>{LIB.tgt=+e.target.value};
$f('sflNewF').onclick=()=>{const n=prompt('新しいフォルダー名');if(n===null)return;const er=libFolderName(n);if(er){alert(er);return}const fo={id:uid(),name:n.trim()};LIB.folders.push(fo);LIB.open.add(fo.id);LIB.selFolder=fo.id;libSave();libRender()};
sflL.addEventListener('click',e=>{const t=e.target;
  if(t.dataset.fav){const f=LIB.files.get(t.dataset.fav);if(f){f.fav=!f.fav;libSave();libRender()}return}
  if(t.dataset.fr){const fo=LIB.folders.find(x=>x.id===t.dataset.fr);if(!fo)return;const n=prompt('フォルダー名を変更',fo.name);if(n===null)return;const er=libFolderName(n,fo.id);if(er){alert(er);return}fo.name=n.trim();libSave();renderTracks();libRender();return}
  if(t.dataset.fd){const fo=LIB.folders.find(x=>x.id===t.dataset.fd);if(!fo)return;const c=libFilesIn(fo.id).length;
    if(!confirm('フォルダー「'+fo.name+'」を削除します。\n中のSF2('+c+'件)は削除されず、「未分類」へ移動します(音源データは消えません)。よろしいですか?'))return;
    for(const f of LIB.files.values())if(f.folder===fo.id)f.folder=null;LIB.folders=LIB.folders.filter(x=>x!==fo);LIB.open.delete(fo.id);if(LIB.selFolder===fo.id)LIB.selFolder=null;libSave();renderTracks();libRender();return}
  const sp=t.closest('[data-tg]'),dr=t.closest('[data-drop]');
  if(sp&&dr){const id=sp.dataset.tg;if(id){LIB.open.has(id)&&LIB.selFolder===id?LIB.open.delete(id):LIB.open.add(id);LIB.selFolder=id}else LIB.selFolder=null;libSave();libRender();return}
  const r=t.closest('.sff');if(r){LIB.selFile=r.dataset.f;LIB.q='';$f('sflQ').value='';LIB.limit=200;libRender()}});
sflL.addEventListener('dragstart',e=>{const r=e.target.closest&&e.target.closest('.sff');if(r){e.dataTransfer.setData('text/plain',r.dataset.f);e.dataTransfer.effectAllowed='move'}});
sflL.addEventListener('dragover',e=>{const d=e.target.closest&&e.target.closest('[data-drop]');if(d){e.preventDefault();document.querySelectorAll('.sfd.drop').forEach(x=>x.classList.remove('drop'));d.classList.add('drop')}});
sflL.addEventListener('dragleave',e=>{const d=e.target.closest&&e.target.closest('[data-drop]');if(d)d.classList.remove('drop')});
sflL.addEventListener('drop',e=>{const d=e.target.closest&&e.target.closest('[data-drop]');if(!d)return;e.preventDefault();d.classList.remove('drop');const id=e.dataTransfer.getData('text/plain');if(id)libMove(id,d.dataset.drop||null)});
sflR.addEventListener('click',async e=>{const t=e.target,f=LIB.files.get(LIB.selFile);if(t.dataset.more){LIB.limit+=200;libRender();return}
  const row=t.closest('.plr');if(row&&!t.dataset.a){const k=row.dataset.k.split('|');
    if(t.classList.contains('pf')){LIB.pfav.has(row.dataset.k)?LIB.pfav.delete(row.dataset.k):LIB.pfav.add(row.dataset.k);libSave();libRender();return}
    if(t.classList.contains('ps')){libAssign(k[0],+k[1],+k[2]);return}libAud(k[0],+k[1],+k[2]);return}
  const a=t.dataset.a;if(!a||!f)return;
  if(a==='fav'){f.fav=!f.fav;libSave();libRender()}
  else if(a==='ren'){const n=prompt('表示名を変更(元のファイル名: '+f.name+')',f.dn||f.name);if(n===null)return;f.dn=n.trim().slice(0,60)||f.name;libSave();renderTracks();libRender()}
  else if(a==='unload')libUnload(f);else if(a==='load')libLoadStored(f).then(()=>{renderTracks();libSave()});
  else if(a==='cache'){if(f.sf)f.sf.samples.forEach(s=>{s.buf=undefined});libLog('キャッシュを解放しました: '+(f.dn||f.name),'ok');libRender()}
  else if(a==='store')libStore(f,true);else if(a==='unstore')libStore(f,false);else if(a==='unreg')libUnreg(f)});
sflR.addEventListener('change',e=>{if(e.target.dataset.a==='mv')libMove(LIB.selFile,e.target.value||null)});
addEventListener('keydown',e=>{const o=$f('sfl');if(o&&!o.hidden&&e.key==='Escape'&&!DD.openNow()){closeLib();e.stopImmediatePropagation()}},true);
/* ---------- カスタムプルダウン(共通コンポーネント DD) ----------
   既存の<select>を「データの置き場」として残し(value / onchange / 動的な選択肢更新はそのまま動く)、見た目と操作だけを自作に置き換える。
   機能: 開閉アニメ / 選択中のチェック・ハイライト / 検索 / アイコン(data-icon) / 説明文(data-desc) / optgroup の階層開閉(" / " 区切りで入れ子) / キーボード / ARIA / 画面端の補正
   新規に使うときは DD.create({items:[{value,label,group,icon,desc,disabled}],value,search,onChange}) */
const DD=(()=>{
const SEP='\u0001',st={open:null,pop:null,rows:[],act:-1,q:'',items:[],state:new Map(),input:null,list:null,uid:0,key:'',ta:'',tat:0};
const HS=typeof HTMLSelectElement!=='undefined'?HTMLSelectElement.prototype:null,vd=HS&&Object.getOwnPropertyDescriptor(HS,'value'),sd=HS&&Object.getOwnPropertyDescriptor(HS,'selectedIndex');
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// ---- 純粋ロジック ----
function model(sel){const out=[];let idx=0;const grp=n=>String(n||'').split(' / ').map(x=>x.trim()).filter(Boolean);
  const add=(o,path)=>{if(o.hidden)return;const ds=o.dataset||{};out.push({t:'o',i:idx,v:o.value,label:String(o.textContent||'').trim(),desc:ds.desc||'',icon:ds.icon||'',dis:!!o.disabled,path,selected:!!o.selected})};
  for(const c of Array.from(sel.children)){if(c.tagName==='OPTGROUP'){const p=grp(c.label);for(const o of Array.from(c.children)){add(o,p);idx++}}else{add(c,[]);idx++}}return out}
function rows(items,isOpen,q,cap){cap=cap||400;const toks=String(q||'').toLowerCase().split(/\s+/).filter(Boolean),S_=toks.length>0,out=[];
  const ok=it=>!S_||toks.every(t=>(it.label+' '+it.desc+' '+it.path.join(' ')).toLowerCase().includes(t));
  const keys=it=>it.path.map((_,l)=>it.path.slice(0,l+1).join(SEP)),cnt=new Map();
  for(const it of items)if(ok(it))for(const k of keys(it))cnt.set(k,(cnt.get(k)||0)+1);
  let prev=[],shown=0,cut=0;
  for(const it of items){if(!ok(it))continue;const ks=keys(it),op=ks.map(k=>S_||!!isOpen(k));
    for(let l=0;l<ks.length;l++)if(prev[l]!==ks[l]&&op.slice(0,l).every(Boolean))out.push({t:'g',key:ks[l],name:it.path[l],level:l,n:cnt.get(ks[l]),open:op[l]});
    prev=ks;if(op.every(Boolean)){if(shown<cap){shown++;out.push(Object.assign({},it,{level:ks.length}))}else cut++}}
  return{rows:out,cut}}
function nav(R,cur,key){const n=R.length;if(!n)return -1;const ok=i=>!(R[i].t==='o'&&R[i].dis);
  const first=()=>{for(let i=0;i<n;i++)if(ok(i))return i;return -1},last=()=>{for(let i=n-1;i>=0;i--)if(ok(i))return i;return -1};
  const step=(i,d)=>{let j=i;while(true){j+=d;if(j<0||j>=n)return i;if(ok(j))return j}};
  if(key==='Home')return first();if(key==='End')return last();
  if(cur<0||cur>=n)return key==='ArrowUp'||key==='PageUp'?last():first();
  if(key==='ArrowDown')return step(cur,1);if(key==='ArrowUp')return step(cur,-1);
  if(key==='PageDown'){let j=cur;for(let c=0;c<8;c++)j=step(j,1);return j}if(key==='PageUp'){let j=cur;for(let c=0;c<8;c++)j=step(j,-1);return j}return cur}
function place(r,vw,vh,pw,ph,m){m=m==null?8:m;const below=vh-r.bottom-m,above=r.top-m,want=Math.min(ph,380),up=below<Math.min(want,220)&&above>below;
  const avail=Math.max(120,up?above:below),h=Math.min(want,avail);pw=Math.min(pw,vw-2*m);
  const left=Math.min(Math.max(m,r.left),Math.max(m,vw-pw-m));let top=up?r.top-h-4:r.bottom+4;top=Math.max(m,Math.min(top,vh-h-m));return{left,top,h,up}}
function defOpen(items){const s=new Set();for(const it of items)if(it.selected)for(let l=0;l<it.path.length;l++)s.add(it.path.slice(0,l+1).join(SEP));return s}
const keyOf=s=>s.dataset.ddKey||s.id||(s.hasAttribute('data-src')?'src':(s.dataset.k?'k:'+s.dataset.k:'sel'));
// ---- DOM ----
function sync(d){const sel=d.sel,o=sel.options[sel.selectedIndex],lab=o?String(o.textContent||'').trim():'';d.b.querySelector('.dl').textContent=lab||'—';
  const ic=d.b.querySelector('.ddic');ic.textContent=(o&&o.dataset.icon)||'';ic.style.display=ic.textContent?'':'none';d.b.disabled=sel.disabled;
  const al=sel.getAttribute('aria-label');if(al)d.b.setAttribute('aria-label',al+': '+lab);if(sel.title)d.b.title=sel.title}
function enhance(sel){if(!sel||sel._dd||sel.multiple||sel.size>1||sel.dataset.native==='1'||!sel.parentNode)return null;
  const w=document.createElement('span');w.className='dd';const b=document.createElement('button');b.type='button';b.setAttribute('aria-haspopup','listbox');b.setAttribute('aria-expanded','false');
  b.innerHTML='<span class="ddic"></span><span class="dl"></span><span class="dc" aria-hidden="true">▾</span>';w.appendChild(b);sel.parentNode.insertBefore(w,sel.nextSibling);
  sel.classList.add('dd-native');sel.tabIndex=-1;const d={sel,w,b,def:new Set()};sel._dd=d;
  Object.defineProperty(sel,'value',{configurable:true,get(){return vd.get.call(sel)},set(v){vd.set.call(sel,v);sync(d)}});
  Object.defineProperty(sel,'selectedIndex',{configurable:true,get(){return sd.get.call(sel)},set(v){sd.set.call(sel,v);sync(d)}});
  new MutationObserver(()=>{sync(d);if(st.open===d)renderPop()}).observe(sel,{childList:true,subtree:true,attributes:true,characterData:true});
  b.addEventListener('click',()=>st.open===d?close(true):open(d));
  b.addEventListener('keydown',e=>{e.stopPropagation();if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();if(st.open!==d)open(d)}else if(e.key==='Escape'&&st.open===d){e.preventDefault();close(true)}});
  b.addEventListener('focus',()=>{try{sel.dispatchEvent(new FocusEvent('focus'))}catch(_){}});sync(d);return d}
function open(d){close(false);const sel=d.sel;if(sel.disabled)return;st.items=model(sel);st.key=keyOf(sel);st.q='';
  const p=document.createElement('div');p.className='ddp';const hasS=sel.dataset.ddSearch==='1'||(sel.dataset.ddSearch!=='0'&&st.items.length>=12);
  p.innerHTML=(hasS?'<div class="dds"><input type="search" class="ddsi" autocomplete="off" spellcheck="false" placeholder="検索…" aria-label="項目を検索" role="combobox" aria-expanded="true" aria-autocomplete="list"></div>':'')+'<div class="ddl" role="listbox" tabindex="0"></div>';
  document.body.appendChild(p);st.open=d;st.pop=p;st.input=p.querySelector('.ddsi');st.list=p.querySelector('.ddl');d.b.setAttribute('aria-expanded','true');
  const lid='ddl'+(++st.uid);st.list.id=lid;st.list.setAttribute('aria-label',sel.getAttribute('aria-label')||sel.title||'選択肢');if(st.input)st.input.setAttribute('aria-controls',lid);
  d.def=defOpen(st.items);renderPop(true);
  p.addEventListener('keydown',e=>onKey(d,e));
  st.list.addEventListener('click',e=>{const r=e.target.closest('[data-r]');if(!r)return;const row=st.rows[+r.dataset.r];if(!row)return;row.t==='g'?toggle(row.key):choose(d,row)});
  st.list.addEventListener('mousemove',e=>{const r=e.target.closest('[data-r]');if(r&&+r.dataset.r!==st.act){st.act=+r.dataset.r;paint(false)}});
  if(st.input)st.input.addEventListener('input',()=>{st.q=st.input.value;renderPop(false,true)});
  requestAnimationFrame(()=>{if(st.pop===p)p.classList.add('open')});(st.input||st.list).focus({preventScroll:true})}
function close(focus){const d=st.open,p=st.pop;if(!d)return;st.open=null;st.pop=null;st.input=null;st.list=null;d.b.setAttribute('aria-expanded','false');
  p.classList.remove('open');setTimeout(()=>p.remove(),150);if(focus&&d.b.isConnected)d.b.focus({preventScroll:true})}
const isOpenKey=k=>{const sk=st.key+'|'+k;return st.state.has(sk)?st.state.get(sk):(st.open&&st.open.def.has(k))};
function toggle(k){st.state.set(st.key+'|'+k,!isOpenKey(k));renderPop();const i=st.rows.findIndex(r=>r.t==='g'&&r.key===k);if(i>=0){st.act=i;paint(false)}}
function renderPop(first,resetAct){const d=st.open;if(!d)return;if(!first)st.items=model(d.sel);const R=rows(st.items,isOpenKey,st.q,400);st.rows=R.rows;let h='';
  R.rows.forEach((r,i)=>{const pad=8+r.level*14;
    if(r.t==='g')h+='<div class="ddg" role="button" aria-expanded="'+r.open+'" id="ddr'+i+'" data-r="'+i+'" style="padding-left:'+pad+'px"><span class="dtg">'+(r.open?'▾':'▸')+'</span><span class="dt">'+esc(r.name)+'</span><small>'+r.n+'</small></div>';
    else h+='<div class="ddi'+(r.selected?' sel':'')+'" role="option" id="ddr'+i+'" data-r="'+i+'" aria-selected="'+r.selected+'"'+(r.dis?' aria-disabled="true"':'')+' style="padding-left:'+pad+'px"><span class="dk">'+(r.selected?'✓':'')+'</span>'+(r.icon?'<span class="dic">'+esc(r.icon)+'</span>':'')+'<span class="dt">'+esc(r.label)+(r.desc?'<small>'+esc(r.desc)+'</small>':'')+'</span></div>'});
  if(R.cut)h+='<div class="ddg" style="cursor:default">他に'+R.cut+'件あります。検索で絞り込んでください</div>';if(!R.rows.length)h='<div class="ddg" style="cursor:default">該当する項目がありません</div>';
  const top=st.list.scrollTop;st.list.innerHTML=h;st.list.scrollTop=top;
  const si=R.rows.findIndex(r=>r.t==='o'&&r.selected),fo=R.rows.findIndex(r=>r.t==='o'&&!r.dis);
  if(first||resetAct||st.act<0||st.act>=R.rows.length)st.act=(!resetAct&&si>=0)?si:(fo>=0?fo:-1);
  paint(!!first);reposition()}
function paint(scroll){if(!st.list)return;st.list.querySelectorAll('.act').forEach(e=>e.classList.remove('act'));const el=st.act>=0?st.list.querySelector('[data-r="'+st.act+'"]'):null;
  if(el){el.classList.add('act');if(scroll)el.scrollIntoView({block:'nearest'})}const f=st.input||st.list;if(el)f.setAttribute('aria-activedescendant',el.id);else f.removeAttribute('aria-activedescendant')}
function reposition(){const d=st.open,p=st.pop;if(!d||!p)return;if(!d.b.isConnected){close(false);return}const r=d.b.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
  p.style.maxHeight='';p.style.minWidth=Math.max(r.width,170)+'px';p.style.maxWidth=Math.min(vw-16,440)+'px';
  const q=place(r,vw,vh,p.offsetWidth,p.offsetHeight+2,8);p.style.left=q.left+'px';p.style.top=q.top+'px';p.style.maxHeight=q.h+'px';p.classList.toggle('up',q.up)}
function choose(d,row){if(row.dis)return;const sel=d.sel;if(sel.selectedIndex!==row.i){sel.selectedIndex=row.i;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}))}close(true)}
function onKey(d,e){e.stopPropagation();const k=e.key,R=st.rows,inInput=e.target===st.input;
  if(k==='Escape'){e.preventDefault();close(true);return}
  if(k==='Tab'){close(true);return}
  if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(k)){if(inInput&&(k==='Home'||k==='End'))return;e.preventDefault();st.act=nav(R,st.act,k);paint(true);return}
  if(k==='Enter'||(k===' '&&!inInput)){e.preventDefault();const r=R[st.act];if(r)r.t==='g'?toggle(r.key):choose(d,r);return}
  if(!inInput&&(k==='ArrowRight'||k==='ArrowLeft')){const r=R[st.act];e.preventDefault();if(r&&r.t==='g'){if((k==='ArrowRight')!==r.open)toggle(r.key)}else if(r&&k==='ArrowLeft'){for(let i=st.act-1;i>=0;i--)if(R[i].t==='g'&&R[i].level<r.level){st.act=i;paint(true);break}}return}
  if(!inInput&&k.length===1&&!e.ctrlKey&&!e.metaKey){const now=Date.now();st.ta=(now-st.tat>700?'':st.ta)+k.toLowerCase();st.tat=now;const i=R.findIndex((r,j)=>r.t==='o'&&!r.dis&&j>=(st.ta.length>1?st.act:st.act+1)&&r.label.toLowerCase().startsWith(st.ta))
    ,j=i>=0?i:R.findIndex(r=>r.t==='o'&&!r.dis&&r.label.toLowerCase().startsWith(st.ta));if(j>=0){st.act=j;paint(true)}}}
function create(o){o=o||{};const s=document.createElement('select');if(o.label)s.setAttribute('aria-label',o.label);if(o.search!=null)s.dataset.ddSearch=o.search?'1':'0';if(o.key)s.dataset.ddKey=o.key;
  const gs=new Map();for(const it of (o.items||[])){let par=s;if(it.group){if(!gs.has(it.group)){const g=document.createElement('optgroup');g.label=it.group;s.appendChild(g);gs.set(it.group,g)}par=gs.get(it.group)}
    const op=document.createElement('option');op.value=it.value;op.textContent=it.label;if(it.desc)op.dataset.desc=it.desc;if(it.icon)op.dataset.icon=it.icon;if(it.disabled)op.disabled=true;par.appendChild(op)}
  if(o.value!=null)s.value=o.value;const host=document.createElement('span');host.appendChild(s);enhance(s);if(o.onChange)s.addEventListener('change',()=>o.onChange(s.value));
  return{el:host,select:s,get value(){return s.value},set value(v){s.value=v},open:()=>s._dd&&open(s._dd),close:()=>close(true)}}
function init(){document.querySelectorAll('select').forEach(enhance);
  new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(n.tagName==='SELECT')enhance(n);else if(n.querySelectorAll)n.querySelectorAll('select').forEach(enhance)}}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('pointerdown',e=>{if(!st.open)return;if(st.pop.contains(e.target)||st.open.w.contains(e.target))return;close(false)},true);
  addEventListener('resize',reposition);addEventListener('scroll',e=>{if(st.pop&&!st.pop.contains(e.target))reposition()},true);
  addEventListener('blur',()=>close(false))}
return{model,rows,nav,place,defOpen,enhance,create,close:()=>close(true),openNow:()=>!!st.open,init}})();
DD.init();
/* ---------- SE(取り込んだ音声)の編集・削除 / プロジェクトのリセット ----------
   元の音声データ(AFILES)は変更せず、編集設定だけを S.se[ファイルID]={vol,start,end} に分離して保持する(何度編集しても劣化しない) */
const seo=$('sepo'),seEd={tr:null,fid:null,dur:0,prev:null,pushed:false,ret:null,rt:0};
function seOf(fid,dur){const e=S.se&&S.se[fid];if(!e)return null;return{vol:e.vol==null?1:e.vol,start:Math.max(0,+e.start||0),end:e.end==null?dur:Math.min(dur,+e.end)}}
function seClean(){const src=(S.se&&typeof S.se==='object')?S.se:{},used=new Set(),o={};for(const tr of (Array.isArray(S.atracks)?S.atracks:[]))for(const c of (tr&&Array.isArray(tr.clips)?tr.clips:[]))if(c)used.add(c.f);
  for(const k of used){const e=src[k];if(!e||typeof e!=='object')continue;let v=+e.vol,a=+e.start,b=e.end==null?null:+e.end;v=isFinite(v)?Math.max(0,Math.min(1,v)):1;a=isFinite(a)&&a>0?a:0;if(b!=null&&(!isFinite(b)||b<=a+.01))b=null;o[k]={vol:v,start:a,end:b}}S.se=o}
const seLabel=tr=>(seEd.tr===tr&&!seo.hidden)?'<label style="color:var(--acc);font-weight:bold">● 編集中</label>':'<label>♪ 音声</label>';
function seEff(){const f=AFILES.get(seEd.fid),d=f.buf.duration,e=(S.se&&S.se[seEd.fid])||{};return{vol:e.vol==null?1:e.vol,start:Math.max(0,e.start||0),end:e.end==null?d:Math.min(d,e.end),dur:d,f}}
function seMsg(t,c){const e=$('seMsg');e.textContent=t||'';e.className=c||''}
function seOpen(tr){const c=tr.clips[0];if(!c){alert('このSEにはクリップがありません');return}const f=AFILES.get(c.f);
  if(!f||!f.buf){alert('このSEの音声データが読み込まれていません。音声ファイルを読み込み直してください');return}
  seEd.tr=tr;seEd.fid=c.f;seEd.dur=f.buf.duration;seEd.pushed=false;seEd.ret=document.activeElement;
  const used=AT().reduce((n,t)=>n+t.clips.filter(x=>x.f===c.f).length,0);
  $('seName').textContent=tr.name;$('seFile').textContent='元ファイル: '+f.name+' / 全体 '+seEd.dur.toFixed(2)+'秒 / 使用中のクリップ '+used+'個(この設定はすべてのクリップに適用されます)';
  for(const id of ['seS','seE','seSN','seEN']){const el=$(id);el.min=0;el.max=seEd.dur.toFixed(3)}
  seSync();seMsg('');seo.hidden=false;document.body.classList.add('fxopen');renderATracks();$('sePrev').focus()}
function seSync(){const e=seEff();$('seVol').value=Math.round(e.vol*100);$('seVolN').value=Math.round(e.vol*100);$('seS').value=e.start;$('seSN').value=e.start.toFixed(2);$('seE').value=e.end;$('seEN').value=e.end.toFixed(2);
  $('seInfo').textContent='再生範囲 '+e.start.toFixed(2)+' – '+e.end.toFixed(2)+' 秒(長さ '+(e.end-e.start).toFixed(2)+' 秒 / 全体 '+e.dur.toFixed(2)+' 秒)・音量 '+Math.round(e.vol*100)+'%';seDraw()}
function seSet(patch){if(!seEd.tr)return;if(!seEd.pushed){pushUndo();seEd.pushed=true}
  S.se=S.se||{};const e=S.se[seEd.fid]||(S.se[seEd.fid]={vol:1,start:0,end:null}),d=seEd.dur,cur=seEff();
  if('vol' in patch){const v=+patch.vol;if(isFinite(v))e.vol=Math.max(0,Math.min(1,v/100))}
  const rng=('start' in patch)||('end' in patch);
  if(rng){let a='start' in patch?+patch.start:cur.start,b='end' in patch?+patch.end:cur.end;if(!isFinite(a))a=cur.start;if(!isFinite(b))b=cur.end;
    a=Math.max(0,Math.min(a,d-.02));b=Math.min(d,Math.max(b,.02));
    if('start' in patch&&a>b-.02)a=Math.max(0,b-.02);if('end' in patch&&b<a+.02)b=Math.min(d,a+.02);
    e.start=Math.round(a*1000)/1000;e.end=b>=d-.0005?null:Math.round(b*1000)/1000}
  dirty();seSync();drawAL();
  if(rng){if(seEd.prev){clearTimeout(seEd.rt);seEd.rt=setTimeout(sePlay,150)}}else if(seEd.prev)seEd.prev.vg.gain.value=seEff().vol}
function seStop(){const p=seEd.prev;seEd.prev=null;clearTimeout(seEd.rt);if(p){try{p.src.onended=null;p.src.stop()}catch(_){}try{p.vg.disconnect()}catch(_){}}$('sePrev').textContent='▶ 試聴';$('seBar').firstChild.style.width='0'}
async function sePlay(){seStop();if(!seEd.tr)return;const f=AFILES.get(seEd.fid);if(!f||!f.buf){seMsg('音声データがありません','err');return}
  try{initAudio();await ctx.resume();const e=seEff(),src=ctx.createBufferSource(),env=ctx.createGain(),vg=ctx.createGain(),len=e.end-e.start,t0=ctx.currentTime+.03;
    src.buffer=f.buf;env.gain.setValueAtTime(0,t0);env.gain.linearRampToValueAtTime(1,t0+Math.min(.004,len/2));env.gain.setValueAtTime(1,t0+Math.max(.004,len-.006));env.gain.linearRampToValueAtTime(0,t0+len);
    vg.gain.value=e.vol;src.connect(env);env.connect(vg);vg.connect(ctx.destination);src.start(t0,e.start,len);
    seEd.prev={src,vg,t0,len};src.onended=()=>{if(seEd.prev&&seEd.prev.src===src)seStop()};$('sePrev').textContent='■ 停止';seTick();seMsg('')}
  catch(er){seMsg('試聴できません: '+er.message,'err')}}
function seTick(){const p=seEd.prev;if(!p)return;$('seBar').firstChild.style.width=Math.round(Math.max(0,Math.min(1,(ctx.currentTime-p.t0)/p.len))*100)+'%';requestAnimationFrame(seTick)}
function seDraw(){const cv2=$('seCv'),f=AFILES.get(seEd.fid);if(!f||!cv2)return;const r=devicePixelRatio||1,w=Math.max(100,cv2.clientWidth),h=70;
  if(cv2.width!==Math.round(w*r)||cv2.height!==Math.round(h*r)){cv2.width=Math.round(w*r);cv2.height=Math.round(h*r)}
  const g=cv2.getContext('2d');g.setTransform(r,0,0,r,0,0);const C={bg:css('--bg'),acc:css('--acc'),fg:css('--fg')};g.fillStyle=C.bg;g.fillRect(0,0,w,h);
  const pk=f.peaks,nb=pk.length/2,e=seEff(),mid=h/2;g.fillStyle=C.acc;
  for(let x=0;x<w;x++){const b0=Math.floor(x/w*nb),b1=Math.max(b0,Math.floor((x+1)/w*nb)-1);let mn=1,mx=-1;for(let b=b0;b<=Math.min(nb-1,b1);b++){if(pk[b*2]<mn)mn=pk[b*2];if(pk[b*2+1]>mx)mx=pk[b*2+1]}if(mx>=mn)g.fillRect(x,mid-mx*(mid-4),1,Math.max(1,(mx-mn)*(mid-4)))}
  const xa=e.start/e.dur*w,xb=e.end/e.dur*w;g.globalAlpha=.65;g.fillStyle=C.bg;g.fillRect(0,0,xa,h);g.fillRect(xb,0,w-xb,h);g.globalAlpha=1;g.fillStyle=C.fg;g.fillRect(Math.max(0,xa-1),0,2,h);g.fillRect(Math.min(w-2,xb-1),0,2,h)}
function seClose(){seStop();seo.hidden=true;document.body.classList.remove('fxopen');seEd.tr=null;seEd.fid=null;renderATracks();if(seEd.ret&&seEd.ret.isConnected)seEd.ret.focus()}
function seDelete(tr){const i=AT().indexOf(tr);if(i<0)return;
  if(!confirm('SE「'+tr.name+'」を一覧から削除します。\n(このSEのクリップもタイムラインから取り除かれます。元の音声ファイルは変更されません。「元に戻す(↶)」で取り消せます)\n\nよろしいですか?'))return;
  if(seEd.tr===tr){seStop();seo.hidden=true;document.body.classList.remove('fxopen');seEd.tr=null;seEd.fid=null}
  ASRC.forEach(x=>{if(x._tr===tr){try{x.stop()}catch(_){}ASRC.delete(x)}});const g=AG.get(tr);if(g){try{g.disconnect()}catch(_){}AG.delete(tr)}
  pushUndo();AT().splice(i,1);if(aSel&&aSel.tr===tr)aSel=null;seClean();renderATracks();draw();dirty();$('st').textContent='SE「'+tr.name+'」を削除しました'}
$('seVol').oninput=e=>seSet({vol:e.target.value});$('seVolN').onchange=e=>{seSet({vol:Math.max(0,Math.min(100,+e.target.value||0))});seEd.pushed=false};
$('seS').oninput=e=>seSet({start:e.target.value});$('seE').oninput=e=>seSet({end:e.target.value});
$('seSN').onchange=e=>{seSet({start:e.target.value});seEd.pushed=false};$('seEN').onchange=e=>{seSet({end:e.target.value});seEd.pushed=false};
['seVol','seS','seE'].forEach(id=>$(id).onchange=()=>{seEd.pushed=false});
$('sePrev').onclick=()=>seEd.prev?seStop():sePlay();$('seClose').onclick=seClose;
$('seRst').onclick=()=>{if(!seEd.tr)return;pushUndo();S.se=S.se||{};S.se[seEd.fid]={vol:1,start:0,end:null};seEd.pushed=false;dirty();seSync();drawAL();if(seEd.prev)sePlay();seMsg('初期値(音量100%・全体を再生)に戻しました')};
seo.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab'){const f=[...seo.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(x=>x.offsetParent!==null);if(f.length){const i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}}});
addEventListener('keydown',e=>{if(seo.hidden||e.key!=='Escape'||(typeof DD!=='undefined'&&DD.openNow()))return;e.stopImmediatePropagation();seClose()},true);
function resetProject(){
  if(!confirm('プロジェクトをリセットします。\n\n【初期状態に戻るもの】\n・トラック、音符、パターン、ソングの配置\n・追加したSE(音声)と、その編集内容\n・オートメーション、自作エフェクト\n・ミキサー、エフェクト、BPM、小節数の設定\n\n【残るもの】SF2ライブラリ、画面の表示設定\n\n実行後も「元に戻す(↶)」で取り消せます。実行しますか?'))return;
  stop(true);seStop();if(!seo.hidden){seo.hidden=true;document.body.classList.remove('fxopen')}seEd.tr=null;seEd.fid=null;
  pushUndo();
  for(const t of S.tracks){for(const e of (t.fx||[])){const n=FXN.get(e);if(n&&n.ds){try{n.ds()}catch(_){}}}const c=CH.get(t);if(c){for(const k of ['pan','vg','eg']){try{c[k]&&c[k].disconnect()}catch(_){}}}}
  for(const tr of AT()){const g=AG.get(tr);if(g){try{g.disconnect()}catch(_){}}}
  S=fresh();updateTabTitle();sel=0;selNote=null;selSet.clear();sSel=null;selA=null;aSel=null;asel=new Set();EA=null;EQ=null;eaId=null;eqId=null;drag=null;playBeat=0;lastDur=1;bufObj=null;
  normS();LIBVER++;$('bpm').value=S.bpm;roll.scrollLeft=0;renderTracks();draw();dirty();upPos();$('st').textContent='プロジェクトをリセットしました(↶ で元に戻せます)'}
$('reset').onclick=resetProject;
/* ---------- アイコンボタン: 状態表示 / ツールチップ / アクセシビリティ ---------- */
const ico=n=>'<svg class="ic" aria-hidden="true"><use href="#i-'+n+'"/></svg>';
function setPlayUI(on){const b=$('play');if(!b)return;b.innerHTML=ico(on?'pause':'play');b.classList.toggle('on',!!on);const t=on?'一時停止':'再生';b.setAttribute('aria-label',t);b.dataset.tip=on?'一時停止(再生中)':'再生 / 一時停止'}
function tipPos(r,tw,th,vw,vh,m){m=m==null?6:m;let top=r.bottom+8,up=false;if(top+th>vh-m){top=r.top-th-8;up=true}top=Math.max(m,Math.min(top,vh-th-m));const left=Math.max(m,Math.min(r.left+r.width/2-tw/2,vw-tw-m));return{left,top,up}}
(function(){const tip=document.createElement('div');tip.id='tip';tip.setAttribute('role','tooltip');document.body.appendChild(tip);let T=null,cur=null;
  const ea=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function hide(){clearTimeout(T);tip.classList.remove('show');if(cur){cur.removeAttribute('aria-describedby');cur=null}}
  function show(el){const t=el.dataset.tip;if(!t||!el.isConnected)return;cur=el;tip.innerHTML=ea(t)+(el.dataset.key?'<kbd>'+ea(el.dataset.key)+'</kbd>':'');el.setAttribute('aria-describedby','tip');
    tip.style.left='0px';tip.style.top='0px';const p=tipPos(el.getBoundingClientRect(),tip.offsetWidth,tip.offsetHeight,innerWidth,innerHeight);tip.style.left=p.left+'px';tip.style.top=p.top+'px';tip.classList.add('show')}
  document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=e.target.closest&&e.target.closest('[data-tip]');if(!el||el===cur)return;hide();T=setTimeout(()=>show(el),350)});
  document.addEventListener('pointerout',e=>{const el=e.target.closest&&e.target.closest('[data-tip]');if(el&&!el.contains(e.relatedTarget))hide()});
  document.addEventListener('focusin',e=>{const el=e.target.closest&&e.target.closest('[data-tip]');if(el&&el.matches&&el.matches(':focus-visible')){hide();show(el)}});
  document.addEventListener('focusout',hide);document.addEventListener('pointerdown',hide,true);addEventListener('scroll',hide,true);addEventListener('resize',hide);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide()},true)})();
// トグル状態(.on)を aria-pressed に反映(既存コードが classList で切り替える処理はそのまま)
(function(){const els=[...document.querySelectorAll('[data-toggle]')],sync=el=>el.setAttribute('aria-pressed',el.classList.contains('on')?'true':'false');
  els.forEach(sync);const mo=new MutationObserver(ms=>{for(const m of ms)sync(m.target)});els.forEach(el=>mo.observe(el,{attributes:true,attributeFilter:['class']}));
  const seg=[$('vSong'),$('vRoll')].filter(Boolean);const sy=()=>seg.forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('on')?'true':'false'));sy();const m2=new MutationObserver(sy);seg.forEach(b=>m2.observe(b,{attributes:true,attributeFilter:['class']}))})();
/* ---------- ソングブロック: 配置位置(s) / 表示幅(w) / 再生範囲(l) の分離 ----------
   s = 配置位置(拍)   … 移動でのみ変更
   l = 再生範囲(拍)   … 再生エンジン(songNotes)が参照する唯一の長さ。パターンより長ければ繰り返し、短ければ範囲外は鳴らさない(音符データは消さない)
   w = 表示幅(拍)     … 見た目だけ。再生・書き出しには一切使わない。拍単位なので、ズームしても位置・再生範囲との関係は変わらない */
const DEFW=4;let RANGEMODE=false;
const qw=q=>(q.w>0?q.w:q.l),qpx=q=>Math.max(qw(q)*BW,32),defW=q=>Math.min(q.l,DEFW);
const sgG=()=>{const g=+$('sgSnap').value;return g>0?g:0};
function sgSnap(v){const g=sgG();return g>0?Math.round(v/g)*g:Math.round(v*1000)/1000}
function sgHit(x,ri){for(let i=S.place.length-1;i>=0;i--){const q=S.place[i];if(q.ti===ri&&x>=q.s*BW&&x<=q.s*BW+qpx(q))return q}return null}
function fitText(g,t,mw){if(g.measureText(t).width<=mw)return t;let a=t;while(a.length>1&&g.measureText(a+'…').width>mw)a=a.slice(0,-1);return a.length>1?a+'…':''}
function setRangeMode(on){RANGEMODE=!!on;const b=$('sgRange');b.classList.toggle('on',RANGEMODE);b.dataset.tip=RANGEMODE?'再生範囲編集モード: ON(オレンジの取っ手で再生範囲だけを変更)':'再生範囲編集モード: OFF(右端ドラッグでブロック長と再生範囲を同時に変更)';draw()}
$('sgRange').onclick=()=>setRangeMode(!RANGEMODE);
function sbDo(q,kind){if(!q)return;pushUndo();const width=kind==='fit'?Math.max(.5,q.l):Math.max(.5,defW(q));q.w=width;if(kind==='reset'){q.l=Math.max(.25,Math.min(MAXBARS*4-q.s,width));NC=null}dirty();draw();if(sbEd.q===q)sbSync()}
// ---- コンテキストメニュー(右クリック / 長押し)。位置決めとキー操作は共通プルダウン(DD)の関数を再利用 ----
let ctxM=null;function ctxClose(){if(ctxM){ctxM.el.remove();ctxM=null}}
function menuAction(k,q){if(!S.place.includes(q))return;sSel=q;selA=null;
  if(k==='w')sbOpen(q,'w');else if(k==='r'){setRangeMode(true);sbOpen(q,'r')}else if(k==='fit'||k==='reset')sbDo(q,k);else if(k==='open')openPattern(q);else if(k==='dup')dupPl(false);else if(k==='del')delPl()}
function openBlockMenu(cx,cy,q){ctxClose();sSel=q;selA=null;syncSongBar();draw();
  const items=[['w','ブロック長を変更…'],['r','再生範囲を編集…'],['fit','表示幅を再生範囲に合わせる'],['reset','表示幅を初期値に戻す'],['open','ピアノロールで開く'],['dup','複製(同じパターンを参照)'],['del','ブロックを削除']];
  const el=document.createElement('div');el.className='ddp ctxm';el.setAttribute('role','menu');el.setAttribute('aria-label','ブロックのメニュー');
  el.innerHTML='<div class="ddl" tabindex="-1">'+items.map((it,i)=>'<div class="ddi" role="menuitem" tabindex="-1" data-i="'+i+'"><span class="dt">'+it[1]+'</span></div>').join('')+'</div>';document.body.appendChild(el);
  const pw=Math.max(el.offsetWidth,200),pos=DD.place({left:cx,top:cy,right:cx,bottom:cy,width:0},innerWidth,innerHeight,pw,el.offsetHeight,8);el.style.left=pos.left+'px';el.style.top=pos.top+'px';el.style.maxHeight=pos.h+'px';el.style.minWidth=pw+'px';
  const st={el,act:0,q},rows=[...el.querySelectorAll('.ddi')],paint=()=>rows.forEach((r,i)=>r.classList.toggle('act',i===st.act));ctxM=st;paint();requestAnimationFrame(()=>el.classList.add('open'));
  const run=i=>{ctxClose();menuAction(items[i][0],q)},R=items.map(()=>({t:'o'}));
  el.addEventListener('click',e=>{const r=e.target.closest('.ddi');if(r)run(+r.dataset.i)});el.addEventListener('mousemove',e=>{const r=e.target.closest('.ddi');if(r){st.act=+r.dataset.i;paint()}});
  el.addEventListener('keydown',e=>{e.stopPropagation();const k=e.key;if(k==='Escape'||k==='Tab'){e.preventDefault();ctxClose();return}
    if(['ArrowDown','ArrowUp','Home','End'].includes(k)){e.preventDefault();st.act=DD.nav(R,st.act,k);paint()}else if(k==='Enter'||k===' '){e.preventDefault();run(st.act)}});
  el.querySelector('.ddl').focus({preventScroll:true})}
document.addEventListener('pointerdown',e=>{if(ctxM&&!ctxM.el.contains(e.target))ctxClose()},true);
addEventListener('keydown',e=>{if(ctxM&&e.key==='Escape'){e.stopImmediatePropagation();ctxClose()}},true);
// ---- 数値で編集するパネル ----
const sbo=$('sbpo'),sbEd={q:null,pushed:false,ret:null};
function sbOpen(q,focus){sbEd.q=q;sbEd.pushed=false;sbEd.ret=document.activeElement;const p=patOf(q),t=S.tracks[q.ti];$('sbName').textContent=(p?p.name:'?')+(t?' ／ '+t.name:'');sbMsg('');sbSync();sbo.hidden=false;document.body.classList.add('fxopen');$(focus==='r'?'sbR':'sbW').focus()}
function sbMsg(t){$('sbMsg').textContent=t||''}
function sbSync(){const q=sbEd.q;if(!q)return;const p=patOf(q),w=qw(q),mxw=Math.max(.5,S.len-q.s);$('sbWs').max=mxw;$('sbWs').value=Math.min(w,mxw);$('sbW').value=+w.toFixed(3);$('sbR').value=+q.l.toFixed(3);
  $('sbRb').textContent='= '+(q.l/4).toFixed(2)+' 小節(ブロック長 '+(w/4).toFixed(2)+' 小節)';
  let t='';if(p){if(q.l>p.len+1e-9)t='再生範囲がパターン('+p.len+'拍)より長いため、パターンを '+(q.l/p.len).toFixed(2)+' 回繰り返して再生します(音符は複製されません)。';
    else if(q.l<p.len-1e-9)t='パターン先頭の '+(+q.l.toFixed(3))+' 拍だけ再生します。後ろの '+(+(p.len-q.l).toFixed(3))+' 拍の音符は再生されませんが、削除もされません。';else t='パターンを1回、そのまま再生します。'}
  if(qw(q)<q.l-1e-9)t+=' 表示幅が再生範囲より短いので、ブロックの外(破線)まで再生されます。';else if(qw(q)>q.l+1e-9)t+=' 表示幅が再生範囲より長いので、右側の暗い部分は再生されません。';$('sbInfo').textContent=t}
function sbSet(k,v){const q=sbEd.q;if(!q||!S.place.includes(q))return;v=+v;if(!isFinite(v))return;if(!sbEd.pushed){pushUndo();sbEd.pushed=true}
  if(k==='w'){const width=Math.round(Math.max(.5,Math.min(Math.max(.5,S.len-q.s),v))*1000)/1000;q.w=width;q.l=Math.max(.25,Math.min(MAXBARS*4-q.s,width));NC=null;fitSong()}else{q.l=Math.round(Math.max(.25,Math.min(MAXBARS*4-q.s,v))*1000)/1000;NC=null;fitSong()}
  dirty();draw();sbSync()}
$('sbWs').oninput=e=>sbSet('w',e.target.value);$('sbW').onchange=e=>{sbSet('w',e.target.value);sbEd.pushed=false};$('sbR').onchange=e=>{sbSet('l',e.target.value);sbEd.pushed=false};$('sbWs').onchange=()=>{sbEd.pushed=false};
$('sbFit').onclick=()=>{sbDo(sbEd.q,'fit');sbMsg('ブロック長を再生範囲に合わせました')};$('sbReset').onclick=()=>{sbDo(sbEd.q,'reset');sbMsg('ブロック長を初期値に戻しました')};
function sbClose(){sbo.hidden=true;document.body.classList.remove('fxopen');sbEd.q=null;if(sbEd.ret&&sbEd.ret.isConnected)sbEd.ret.focus()}
$('sbClose').onclick=sbClose;
$('sgSizes').onclick=()=>{if(!sSel){$('st').textContent='ブロック長・再生範囲を編集するブロックを選んでください';return}sbOpen(sSel,'w')};
sbo.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab'){const f=[...sbo.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(x=>x.offsetParent!==null);if(f.length){const i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}}});
addEventListener('keydown',e=>{if(sbo.hidden||e.key!=='Escape'||(typeof DD!=='undefined'&&DD.openNow()))return;e.stopImmediatePropagation();sbClose()},true);

/* ---------- 固定タップ操作 / 携帯(タッチ端末)の初期設定 ---------- */
// 音符のない場所を1回タップで追加、既存音符を再度タップで削除。切り替え機能は設けない。
try{if(matchMedia('(pointer:coarse)').matches)zoomV(1.5)}catch(_){}   // タッチ端末は音符の行を大きく(押し間違い防止)
normS();
updateTabTitle();
applyPanels();
/* ---------- 小節数の変更 ---------- */
const minBars=()=>{let mx=0;for(const pl of S.place)mx=Math.max(mx,pl.s+pl.l);for(const pl of S.aplace||[])mx=Math.max(mx,pl.s+pl.l);for(const tr of AT())for(const c of tr.clips)mx=Math.max(mx,c.s+cbt(c));return Math.max(1,Math.ceil(mx/4-1e-9))};
function setBars(n,toEnd){n=Math.round(n);if(!isFinite(n))return;const mn=minBars();
  if(n<mn){n=mn;$('st').textContent='音符があるため'+mn+'小節より短くできません'}
  n=Math.min(MAXBARS,n);if(n*4===S.len){draw();return}
  pushUndo();S.len=n*4;draw();dirty();if(toEnd)roll.scrollLeft=roll.scrollWidth}
$('bars').onchange=e=>setBars(+e.target.value);
$('bm').onclick=()=>setBars(S.len/4-1);$('bp').onclick=()=>setBars(S.len/4+1,true);$('bp4').onclick=()=>setBars(S.len/4+4,true);
roll.addEventListener('scroll',()=>draw());
addEventListener('resize',()=>draw());
if(window.ResizeObserver)new ResizeObserver(()=>draw()).observe(roll);
loadDB().then(()=>{$('roll').scrollTop=(HI-1-76)*RH;loadAudioFiles();libInit()});

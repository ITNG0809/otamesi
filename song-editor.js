/* song-editor.js — Song Editor の LMMS 風拡張
   既存の再生エンジン/データ構造(S.tracks / S.patterns / S.place / S.autotr / S.aplace)はそのまま使い、
   次の UI を追加する(script.js の後に読み込む):
   ・トラックヘッダー(左側のDOM列): 名前/アイコン/折りたたみ/ミュート/ソロ/音量/パン/メニュー/並べ替え
   ・ブロック・オートメーションクリップの複数選択(Shift/Ctrl+クリック、範囲選択)とグループ移動
   ・ブロックのコピー/切り取り/貼り付け、右クリック(長押し)メニューの拡充、矢印キー移動
   ・タイムライン操作(横/縦ズーム、小節の追加/削除) */
(function(){
'use strict';
if(typeof S==='undefined'||typeof EMBED_AUTO==='undefined'||EMBED_AUTO)return; // オートメーション専用窓では使わない
const rt=document.getElementById('rt'),rc=document.getElementById('rc');
if(!rt||!rc)return;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const st=m=>{try{$('st').textContent=m}catch(_){}};
const tags=['INPUT','SELECT','TEXTAREA'];

/* ================= 共通: メニュー / 入力ポップアップ ================= */
function menu(cx,cy,label,items){
  ctxClose();
  const el=document.createElement('div');el.className='ddp ctxm';el.setAttribute('role','menu');el.setAttribute('aria-label',label);
  el.innerHTML='<div class="ddl" tabindex="-1">'+items.map((it,i)=>it.sep?'<div class="sgm-sep" role="separator"></div>':'<div class="ddi'+(it.off?' sgm-off':'')+'" role="menuitem" tabindex="-1" data-i="'+i+'"'+(it.off?' aria-disabled="true"':'')+'><span class="dt">'+esc(it.t)+'</span></div>').join('')+'</div>';
  document.body.appendChild(el);
  const pw=Math.max(el.offsetWidth,210),pos=DD.place({left:cx,top:cy,right:cx,bottom:cy,width:0},innerWidth,innerHeight,pw,el.offsetHeight,8);
  el.style.left=pos.left+'px';el.style.top=pos.top+'px';el.style.maxHeight=pos.h+'px';el.style.minWidth=pw+'px';
  const rows=[...el.querySelectorAll('.ddi')],R=rows.map(()=>({t:'o'})),state={el,act:Math.max(0,rows.findIndex(r=>!r.classList.contains('sgm-off')))};
  const paint=()=>rows.forEach((r,i)=>r.classList.toggle('act',i===state.act));ctxM=state;paint();requestAnimationFrame(()=>el.classList.add('open'));
  const run=i=>{const it=items[i];if(!it||it.off||!it.run)return;ctxClose();it.run()};
  el.addEventListener('click',e=>{const r=e.target.closest('.ddi');if(r)run(+r.dataset.i)});
  el.addEventListener('mousemove',e=>{const r=e.target.closest('.ddi');if(r){state.act=rows.indexOf(r);paint()}});
  el.addEventListener('keydown',e=>{e.stopPropagation();const k=e.key;if(k==='Escape'||k==='Tab'){e.preventDefault();ctxClose();return}
    if(['ArrowDown','ArrowUp','Home','End'].includes(k)){e.preventDefault();state.act=DD.nav(R,state.act,k);paint()}
    else if(k==='Enter'||k===' '){e.preventDefault();const r=rows[state.act];if(r)run(+r.dataset.i)}});
  el.querySelector('.ddl').focus({preventScroll:true});
}
function popInput(cx,cy,label,val,cb){
  const el=document.createElement('div');el.className='sg-pop';el.setAttribute('role','dialog');el.setAttribute('aria-label',label);
  el.innerHTML='<label>'+esc(label)+'</label><input type="text" maxlength="60"><button type="button">OK</button>';
  document.body.appendChild(el);
  const w=el.offsetWidth,h=el.offsetHeight;el.style.left=Math.max(4,Math.min(innerWidth-w-4,cx))+'px';el.style.top=Math.max(4,Math.min(innerHeight-h-4,cy))+'px';
  const inp=el.querySelector('input'),btn=el.querySelector('button');inp.value=val||'';inp.focus();inp.select();
  let done=false;const fin=ok=>{if(done)return;done=true;document.removeEventListener('pointerdown',away,true);const v=inp.value.trim();el.remove();if(ok&&v)cb(v)};
  const away=e=>{if(!el.contains(e.target))fin(false)};
  inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();fin(true)}else if(e.key==='Escape'){e.preventDefault();fin(false)}});
  btn.onclick=()=>fin(true);setTimeout(()=>document.addEventListener('pointerdown',away,true),0);
}
function pickColor(cur,cb){
  const ci=document.createElement('input');ci.type='color';ci.value=/^#[0-9a-f]{6}$/i.test(cur||'')?cur:'#2f6fed';ci.className='sg-colorpick';
  document.body.appendChild(ci);ci.oninput=()=>cb(ci.value);ci.onchange=()=>{cb(ci.value);ci.remove()};ci.addEventListener('blur',()=>setTimeout(()=>ci.remove(),300));ci.click();
}

/* ================= トラック操作 ================= */
function dupTrack(i){
  const t=S.tracks[i];if(!t)return;syncBuf();bufObj=null;pushUndo();
  const c=JSON.parse(JSON.stringify(Object.assign({},t,{notes:[]})));c.id=uid();c.name=t.name+' (コピー)';
  const src=S.place.filter(q=>q.ti===i);
  S.place.forEach(q=>{if(q.ti>i)q.ti++});
  S.tracks.splice(i+1,0,c);
  const map=new Map();
  for(const q of src){const P0=S.patterns.find(p=>p.id===q.pid);if(!P0)continue;let pid=map.get(P0.id);
    if(!pid){const P=JSON.parse(JSON.stringify(P0));P.id=uid();S.patterns.push(P);pid=P.id;map.set(P0.id,pid)}
    S.place.push({id:uid(),pid,ti:i+1,s:q.s,l:q.l,w:qw(q)})}
  sel=i+1;selNote=null;selSet.clear();fixAuto();dirty();renderTracks();draw();st('トラック「'+t.name+'」を複製しました(ブロックは独立したパターンとして複製)');
}
function delTrack(i){
  const t=S.tracks[i];if(!t)return;if(S.tracks.length<2){alert('最後のトラックは削除できません');return}
  if(!confirm(t.name+' を削除しますか？'))return;pushUndo();syncBuf();S.tracks.splice(i,1);S.place=S.place.filter(p=>p.ti!==i);S.place.forEach(p=>{if(p.ti>i)p.ti--});
  fixAuto();sel=Math.max(0,Math.min(sel,S.tracks.length-1));sSel=null;sSels=new Set();dirty();renderTracks();draw();
}
const ICONS=[['auto','自動(音源で判定)'],['SF2','SF2'],['SYN','シンセ'],['🎹','ピアノ'],['🎸','ギター'],['🔊','ベース'],['🥁','ドラム'],['🎻','ストリングス'],['🎺','ブラス'],['🎤','ボーカル'],['♪','メロディ']];
function iconOf(t){const v=t.icon&&t.icon!=='auto'?t.icon:(t.sf?'SF2':'SYN');return{txt:v,cls:v==='SF2'?'ic-sf':v==='SYN'?'ic-syn':'ic-em'}}
function iconMenu(cx,cy,t){menu(cx,cy,'アイコンの選択',ICONS.map(([v,l])=>({t:(v==='auto'?'':v+'  ')+l+((t.icon||'auto')===v?'  ✓':''),run:()=>{t.icon=v;dirty();draw()}})))}
function foldTrack(t){t.collapsed=!t.collapsed;dirty();draw()}
function trackMenu(cx,cy,i){
  const t=S.tracks[i];if(!t)return;const T=S.tracks.length;
  menu(cx,cy,'トラックのメニュー',[
    {t:'音源設定…',off:!window.BGMInst,run:()=>window.BGMInst&&window.BGMInst.open(t.id)},
    {t:'名前を変更…',run:()=>{const inp=inner.querySelector('.sgh-row[data-i="'+i+'"] .sgh-name');if(inp){inp.focus();inp.select()}}},
    {t:'色を変更…',run:()=>pickColor(t.color,v=>{t.color=v;dirty();renderTracks();draw()})},
    {t:'アイコンを変更…',run:()=>iconMenu(cx,cy,t)},
    {t:t.collapsed?'展開する':'折りたたむ',run:()=>foldTrack(t)},
    {sep:1},
    {t:'トラックを複製',run:()=>dupTrack(i)},
    {t:'上へ移動',off:i===0,run:()=>{pushUndo();moveTrack(i,-1)}},
    {t:'下へ移動',off:i===T-1,run:()=>{pushUndo();moveTrack(i,1)}},
    {sep:1},
    {t:'トラックを追加',run:()=>$('add').click()},
    {t:'トラックを削除…',off:T<2,run:()=>delTrack(i)}]);
}
function autoRowMenu(cx,cy,i){
  const r=S.autotr[i];if(!r)return;
  menu(cx,cy,'オートメーショントラックのメニュー',[
    {t:'名前を変更…',run:()=>{const inp=inner.querySelector('.sgh-row[data-ai="'+i+'"] .sgh-name');if(inp){inp.focus();inp.select()}}},
    {t:'オートメーショントラックを追加',run:()=>$('sgAT').click()},
    {sep:1},
    {t:'このトラックを削除…',run:()=>{const n=S.aplace.filter(q=>q.tr===r.id).length;if(!confirm('オートメーショントラック「'+(r.name||'Auto')+'」'+(n?'と、その上の'+n+'個のクリップ':'')+'を削除しますか?'))return;
      pushUndo();const id=r.id;S.autotr=S.autotr.filter(x=>x.id!==id);S.aplace=S.aplace.filter(q=>q.tr!==id);selOne(null);fixAuto();dirty();draw()}}]);
}

/* ================= トラックヘッダー(DOM) ================= */
const hd=document.createElement('div');hd.id='sgh';hd.setAttribute('role','group');hd.setAttribute('aria-label','トラックヘッダー');
hd.innerHTML='<div class="sgh-corner"><button type="button" id="sghAdd" title="トラックを追加" aria-label="トラックを追加">＋ トラック</button></div><div class="sgh-in" id="sghIn"></div>';
rt.insertBefore(hd,document.getElementById('roll'));
const inner=hd.querySelector('#sghIn');
$('sghAdd').onclick=()=>$('add').click();
hd.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;e.preventDefault();roll.scrollTop+=e.deltaY},{passive:false});
let Hsig='',Hsrc=null;
const sigNow=()=>S.tracks.map(t=>[t.id,t.name,t.color,t.mute?1:0,t.solo?1:0,t.collapsed?1:0,t.icon||'',t.sf?1:0,instDesc(t)].join('~')).join('|')+'#'+S.autotr.map(r=>r.id+'~'+(r.name||'')).join('|')+'#'+rowBase();

function rowEl(t0,i){
  const tid=t0.id,T=()=>S.tracks.find(x=>x.id===tid)||S.tracks[i]||t0,t=t0;
  const el=document.createElement('div');el.className='sgh-row'+(t.collapsed?' col':'')+(t.mute?' muted':'');el.dataset.i=i;
  el.style.top=rowTop(i)+'px';el.style.height=rowH(i)+'px';
  const ic=iconOf(t);
  el.innerHTML='<span class="sgh-grip" title="ドラッグでトラックを並べ替え" style="background:'+esc(t.color||'#17793b')+'"></span>'+
   '<button type="button" class="sgh-ic '+ic.cls+'" data-a="inst" title="音源設定を開く: '+esc(instDesc(t))+'(アイコンの変更はメニューから)" aria-label="音源設定を開く">'+esc(ic.txt)+'</button>'+
   '<button type="button" class="sgh-fold" data-a="fold" aria-expanded="'+(!t.collapsed)+'" title="'+(t.collapsed?'展開する':'折りたたむ')+'" aria-label="'+(t.collapsed?'展開する':'折りたたむ')+'">'+(t.collapsed?'▸':'▾')+'</button>'+
   '<input class="sgh-name" data-k="name" value="'+esc(t.name)+'" aria-label="トラック名" maxlength="40">'+
   '<button type="button" class="sgh-m'+(t.mute?' on':'')+'" data-a="mute" aria-pressed="'+!!t.mute+'" title="ミュート">M</button>'+
   '<button type="button" class="sgh-s'+(t.solo?' on':'')+'" data-a="solo" aria-pressed="'+!!t.solo+'" title="ソロ">S</button>'+
   '<input class="sgh-vol" data-k="vol" type="range" min="0" max="1" step=".01" title="音量" aria-label="音量">'+
   '<input class="sgh-pan" data-k="pan" type="range" min="-1" max="1" step=".05" title="パン" aria-label="パン">'+
   '<button type="button" class="sgh-menu" data-a="menu" aria-haspopup="menu" title="トラックのメニュー" aria-label="トラックのメニュー">⋯</button>';
  el.querySelector('.sgh-vol').value=t.vol;el.querySelector('.sgh-pan').value=t.pan||0;
  const pick=()=>{if(sel!==S.tracks.indexOf(T())&&S.tracks.indexOf(T())>=0){sel=S.tracks.indexOf(T());selNote=null;selSet.clear();renderTracks();draw()}else if(false){sel=i;selNote=null;selSet.clear();renderTracks();draw()}};
  el.addEventListener('pointerdown',e=>{if(e.target.closest('.sgh-grip'))return;pick()});
  const nm=el.querySelector('.sgh-name');
  nm.addEventListener('input',()=>{T().name=nm.value||'Track';Hsig=sigNow();dirty()});
  nm.addEventListener('change',()=>{if(!nm.value.trim()){nm.value='Track';T().name='Track'}renderTracks();draw()});
  nm.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'||e.key==='Escape')nm.blur()});
  const vol=el.querySelector('.sgh-vol'),pan=el.querySelector('.sgh-pan');
  vol.addEventListener('input',()=>{const t=T();t.vol=+vol.value;if(ctx&&!AUTOLIVE.has('trk:'+t.id+':vol'))getCh(t).in.gain.value=t.vol;dirty()});
  vol.addEventListener('change',()=>renderTracks());
  pan.addEventListener('input',()=>{const t=T();t.pan=+pan.value;if(ctx&&!AUTOLIVE.has('trk:'+t.id+':pan'))getCh(t).pan.pan.value=t.pan;dirty()});
  pan.addEventListener('change',()=>{renderTracks();if(sel===i&&typeof renderMx==='function')renderMx()});
  pan.addEventListener('dblclick',()=>{pan.value=0;pan.dispatchEvent(new Event('input'));pan.dispatchEvent(new Event('change'))});
  el.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
    if(a==='mute'){T().mute=!T().mute;dirty();renderTracks();draw()}
    else if(a==='solo'){T().solo=!T().solo;dirty();renderTracks();draw()}
    else if(a==='fold')foldTrack(T());
    else if(a==='inst'){if(window.BGMInst)window.BGMInst.open(T().id);else{const r=b.getBoundingClientRect();iconMenu(r.left,r.bottom,T())}}
    else if(a==='icon'){const r=b.getBoundingClientRect();iconMenu(r.left,r.bottom,T())}
    else if(a==='menu'){const r=b.getBoundingClientRect();trackMenu(r.left,r.bottom,i)}});
  el.addEventListener('contextmenu',e=>{if(e.target.closest('input[type=text]'))return;e.preventDefault();trackMenu(e.clientX,e.clientY,i)});
  el.querySelector('.sgh-grip').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();startReorder(e,i)});
  return el;
}
function autoRowEl(r0,k){
  const rid=r0.id,R=()=>S.autotr.find(x=>x.id===rid)||S.autotr[k]||r0,r=r0;
  const i=S.tracks.length+k,el=document.createElement('div');el.className='sgh-row auto';el.dataset.ai=k;el.style.top=rowTop(i)+'px';el.style.height=rowH(i)+'px';
  el.innerHTML='<span class="sgh-grip nogrip"></span><span class="sgh-ic ic-auto" title="オートメーショントラック">⟲</span><input class="sgh-name" value="'+esc(r.name||'Auto')+'" aria-label="オートメーショントラック名" maxlength="40"><button type="button" class="sgh-menu" data-a="menu" aria-haspopup="menu" title="メニュー" aria-label="オートメーショントラックのメニュー">⋯</button>';
  const nm=el.querySelector('.sgh-name');
  nm.addEventListener('input',()=>{R().name=nm.value;Hsig=sigNow();dirty()});
  nm.addEventListener('change',()=>{if(!nm.value.trim()){nm.value='Auto';R().name='Auto'}draw()});
  nm.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'||e.key==='Escape')nm.blur()});
  el.querySelector('[data-a="menu"]').addEventListener('click',e=>{const b=e.currentTarget.getBoundingClientRect();autoRowMenu(b.left,b.bottom,k)});
  el.addEventListener('contextmenu',e=>{if(e.target.closest('input[type=text]'))return;e.preventDefault();autoRowMenu(e.clientX,e.clientY,k)});
  return el;
}
function rebuild(){
  const keep=document.activeElement&&hd.contains(document.activeElement)?document.activeElement:null;
  if(keep&&keep.classList.contains('sgh-name'))return false;           // 入力中は作り直さない
  inner.textContent='';inner.style.height=rowTop(rowCount())+'px';
  S.tracks.forEach((t,i)=>inner.appendChild(rowEl(t,i)));S.autotr.forEach((r,k)=>inner.appendChild(autoRowEl(r,k)));
  return true;
}
function syncHeader(){
  const on=VIEW==='song';rc.classList.toggle('sg-hdr-on',on);if(!on)return;
  const sg=sigNow();if((sg!==Hsig||Hsrc!==S)&&rebuild()){Hsig=sg;Hsrc=S}
  inner.style.transform='translateY('+(-roll.scrollTop)+'px)';
  const act=document.activeElement;
  inner.querySelectorAll('.sgh-row[data-i]').forEach(el=>{const i=+el.dataset.i,t=S.tracks[i];if(!t)return;el.classList.toggle('sel',i===sel);
    const v=el.querySelector('.sgh-vol'),p=el.querySelector('.sgh-pan');if(v&&v!==act&&+v.value!==t.vol)v.value=t.vol;if(p&&p!==act&&+p.value!==(t.pan||0))p.value=t.pan||0});
}
roll.addEventListener('scroll',()=>{if(VIEW==='song')inner.style.transform='translateY('+(-roll.scrollTop)+'px)'},{passive:true});
/* Undo/Redo・同期でSが差し替わっても、選択中のブロックをIDで引き継ぐ */
function remapSel(){
  if(sSel&&!S.place.includes(sSel)){const n=S.place.find(q=>q.id===sSel.id);sSel=n||null}
  if(sSels.size){const ids=new Set([...sSels].map(q=>q.id));sSels=new Set(S.place.filter(q=>ids.has(q.id)));if(!sSels.size)sSels=new Set()}
  if(selA&&!S.aplace.includes(selA)){const n=S.aplace.find(q=>q.id===selA.id);selA=n||null}
  if(selAs.size&&[...selAs].some(q=>!S.aplace.includes(q))){const ids=new Set([...selAs].map(q=>q.id));selAs=new Set(S.aplace.filter(q=>ids.has(q.id)))}
}
const _draw=draw;draw=function(){try{remapSel()}catch(_){}const r=_draw.apply(this,arguments);try{syncHeader()}catch(e){console.warn('song header',e)}return r};

/* トラックの並べ替え(グリップのドラッグ) */
function startReorder(e0,i0){
  let cur=i0,moved=false;const rect=()=>hd.getBoundingClientRect();
  const mv=e=>{const y=e.clientY-rect().top-RULER+roll.scrollTop;let tgt=Math.max(0,Math.min(S.tracks.length-1,rowAt(y)));
    while(cur!==tgt){if(!moved){pushUndo();moved=true}const d=tgt>cur?1:-1;moveTrack(cur,d);cur+=d}};
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up)};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up);
}

/* ================= 選択(ブロック + オートメーションクリップ) ================= */
const selBlocks=()=>{const set=(sSels.size&&sSels.has(sSel))?sSels:new Set(sSel?[sSel]:[]);return S.place.filter(q=>set.has(q))};
const selClips=()=>selA?S.aplace.filter(q=>selAs.has(q)):[];
const hasSel=()=>selBlocks().length+selClips().length>0;
function clearSel(){sSel=null;sSels=new Set();selOne(null)}
function hitAt(e){
  const r=cv.getBoundingClientRect();if(e.clientY-r.top<RULER)return null;
  const{x,y}=pt(e),ri=rowAt(y);if(ri<0)return null;
  if(ri<S.tracks.length){const q=sgHit(x,ri);return{k:q?'p':null,q,x,y,ri}}
  const ai=ri-S.tracks.length;if(ai>=S.autotr.length)return{k:null,x,y,ri};
  const row=S.autotr[ai];for(let i=S.aplace.length-1;i>=0;i--){const q=S.aplace[i];if(q.tr===row.id&&x>=q.s*BW&&x<=(q.s+q.l)*BW)return{k:'a',q,x,y,ri}}
  return{k:null,x,y,ri};
}
let SELMODE=false,gdrag=null,gLast={q:null,t:0},band=null,alp=null;
function applyBand(){
  const xa=Math.min(band.x0,band.x1),xb=Math.max(band.x0,band.x1),ya=Math.min(band.y0,band.y1),yb=Math.max(band.y0,band.y1);
  const P=new Set(band.addP),A=new Set(band.addA);
  S.place.forEach(q=>{const x0=q.s*BW,x1=x0+qpx(q),y0=rowTop(q.ti),y1=y0+rowH(q.ti);if(x1>=xa&&x0<=xb&&y1>=ya&&y0<=yb)P.add(q)});
  S.aplace.forEach(q=>{const k=S.autotr.findIndex(r=>r.id===q.tr);if(k<0)return;const x0=q.s*BW,x1=(q.s+q.l)*BW,y0=rowTop(S.tracks.length+k),y1=y0+rowH(S.tracks.length+k);if(x1>=xa&&x0<=xb&&y1>=ya&&y0<=yb)A.add(q)});
  const pl=S.place.filter(q=>P.has(q)),al=S.aplace.filter(q=>A.has(q));
  sSels=new Set(pl);sSel=pl[0]||null;selAs=new Set(al);selA=al[0]||null;
}
cv.addEventListener('pointerdown',e=>{
  if(VIEW!=='song'||e.button>0)return;
  const h=hitAt(e);if(!h)return;
  const mod=e.shiftKey||e.ctrlKey||e.metaKey;
  // 1) Shift/Ctrl+クリック: 選択の追加・解除
  if(mod&&h.k){e.stopImmediatePropagation();e.preventDefault();
    if(h.k==='p'){const cur=selBlocks();const set=new Set(cur);if(set.has(h.q))set.delete(h.q);else set.add(h.q);sSels=set;sSel=set.has(h.q)?h.q:([...set][0]||null)}
    else{const cur=selClips();const set=new Set(cur);if(set.has(h.q))set.delete(h.q);else set.add(h.q);selAs=set;selA=set.has(h.q)?h.q:([...set][0]||null)}
    syncSongBar();draw();return}
  // 2) 範囲選択(モードON、または Shift+空き領域)
  if(!h.k&&(SELMODE||e.shiftKey)){e.stopImmediatePropagation();e.preventDefault();cv.setPointerCapture(e.pointerId);
    band={x0:h.x,y0:h.y,x1:h.x,y1:h.y,addP:mod?selBlocks():[],addA:mod?selClips():[]};sband={x0:h.x,y0:h.y,x1:h.x,y1:h.y};
    if(!mod){sSel=null;sSels=new Set();selOne(null)}syncSongBar();draw();return}
  // 3) 複数選択された項目のドラッグ=グループ移動
  const B=selBlocks(),C=selClips();
  if(h.k&&B.length+C.length>1&&(h.k==='p'?B.includes(h.q):C.includes(h.q))){
    e.stopImmediatePropagation();e.preventDefault();cv.setPointerCapture(e.pointerId);
    const now=Date.now();
    if(gLast.q===h.q&&now-gLast.t<400){gLast={q:null,t:0};if(h.k==='p')openPattern(h.q);else openAuto(h.q);return}
    gLast={q:h.q,t:now};
    const items=[...B.map(q=>({k:'p',q,s:q.s,ti:q.ti})),...C.map(q=>({k:'a',q,s:q.s,ri:S.autotr.findIndex(r=>r.id===q.tr)}))];
    const ref=items.find(o=>o.q===h.q);
    gdrag={items,ref,ox:h.x/BW-ref.s,row0:rowAt(h.y),before:snap(),moved:false,cx:e.clientX,cy:e.clientY};return}
  // 通常のクリック: 以前の複数選択を持ち越さない(元の単一選択処理に任せる)
  if(h.k==='a')sSels=new Set();else{sSels=new Set();selAs=new Set()}
  // タッチ: オートメーションクリップの長押しでメニュー
  if(h.k==='a'&&e.pointerType==='touch'){const q=h.q,cx=e.clientX,cy=e.clientY;clearTimeout(alp);alp=setTimeout(()=>{alp=null;autoClipMenu(cx,cy,q)},560)}
},true);
cv.addEventListener('pointermove',e=>{
  if(alp&&e.pointerType==='touch'){/* 少しでも動いたら長押し扱いにしない(ドラッグ優先) */clearTimeout(alp);alp=null}
  if(VIEW!=='song')return;
  if(band){const{x,y}=pt(e);band.x1=x;band.y1=y;sband.x1=x;sband.y1=y;edgeScroll(e);applyBand();draw();return}
  if(gdrag){
    if(!gdrag.moved&&Math.hypot(e.clientX-gdrag.cx,e.clientY-gdrag.cy)<8)return;
    if(!gdrag.moved){gdrag.moved=true;pushUndoSnap(gdrag.before)}
    edgeScroll(e);const{x,y}=pt(e),G=gdrag,T=S.tracks.length,A=S.autotr.length;
    let ds=sgSnap(x/BW-G.ox)-G.ref.s;
    ds=Math.max(ds,-Math.min(...G.items.map(o=>o.s)));ds=Math.min(ds,Math.min(...G.items.map(o=>MAXBARS*4-o.q.l-o.s)));
    let dr=rowAt(y)-G.row0;
    for(const o of G.items){const base=o.k==='p'?o.ti:o.ri;const lo=0,hi=(o.k==='p'?T:A)-1;dr=Math.max(dr,lo-base);dr=Math.min(dr,hi-base)}
    for(const o of G.items){o.q.s=o.s+ds;if(o.k==='p')o.q.ti=o.ti+dr;else o.q.tr=S.autotr[o.ri+dr].id}
    NC=null;fitSong();draw()}
});
const gEnd=()=>{
  clearTimeout(alp);alp=null;
  if(band){band=null;sband=null;syncSongBar();draw();const n=selBlocks().length+selClips().length;if(n)st(n+'個を選択しました(Ctrl+C/X でコピー・切り取り、Delete で削除、ドラッグで移動)')}
  if(gdrag){const m=gdrag.moved;gdrag=null;if(m)dirty();draw()}
};
cv.addEventListener('pointerup',gEnd);cv.addEventListener('pointercancel',gEnd);

/* ================= コピー / 切り取り / 貼り付け / 削除 / 複製 ================= */
let BLK=null;
function songCopy(cut){
  const B=selBlocks(),C=selClips();if(!B.length&&!C.length){st('コピーするブロックまたはクリップを選択してください');return}
  syncBuf();
  if(B.length){const s0=Math.min(...B.map(q=>q.s)),pats=new Map();
    for(const q of B){const P=patOf(q);if(P&&!pats.has(P.id))pats.set(P.id,JSON.parse(JSON.stringify(P)))}
    BLK={cut:!!cut,items:B.map(q=>({pid:q.pid,ti:q.ti,ds:q.s-s0,l:q.l,w:qw(q)})),pats}}else BLK=null;
  if(C.length)aClipCopy(false);else ACBUF=null;
  const n=B.length+C.length;
  if(cut)songDelete();
  st(n+'個を'+(cut?'切り取り':'コピー')+'しました(Ctrl+V で再生位置に貼り付け)');
}
function songPaste(){
  if(!BLK&&!ACBUF){st('貼り付けるものがありません');return}
  let pushed=false;
  if(ACBUF&&ACBUF.items&&ACBUF.items.length){aClipPaste();pushed=true}
  if(BLK){
    if(!pushed)pushUndo();
    const base=Math.max(0,sgSnap(playBeat)),idMap=new Map(),nq=[];
    for(const it of BLK.items){const P0=BLK.pats.get(it.pid);if(!P0)continue;
      let pid=idMap.get(it.pid);
      if(!pid){const P=JSON.parse(JSON.stringify(P0));P.id=uid();if(!BLK.cut)P.name=P0.name+' (コピー)';S.patterns.push(P);pid=P.id;idMap.set(it.pid,pid)}
      const s=base+it.ds;if(s+it.l>MAXBARS*4)continue;
      const q={id:uid(),pid,ti:Math.max(0,Math.min(it.ti,S.tracks.length-1)),s,l:it.l,w:it.w};S.place.push(q);nq.push(q)}
    if(nq.length){sSels=new Set(nq);sSel=nq[0];selA=null;selAs=new Set()}
    fitSong();dirty();syncSongBar();draw();st(nq.length+'個のブロックを貼り付けました')}
}
function songDelete(){
  const B=selBlocks(),C=selClips();if(!B.length&&!C.length)return;pushUndo();
  if(B.length){const pats=[...new Set(B.map(q=>patOf(q)).filter(Boolean))];S.place=S.place.filter(q=>!B.includes(q));
    for(const P of pats)if(P!==EP&&!S.place.some(q=>q.pid===P.id))S.patterns=S.patterns.filter(p=>p!==P);sSel=null;sSels=new Set()}
  if(C.length){const aids=new Set(C.map(q=>q.aid));S.aplace=S.aplace.filter(q=>!C.includes(q));if(EQ&&C.includes(EQ)){EQ=null;eqId=null}selOne(null);
    S.autos=S.autos.filter(a=>!aids.has(a.id)||a===EA||S.aplace.some(q=>q.aid===a.id))}
  dirty();syncSongBar();draw();
}
function groupDup(){
  const B=selBlocks(),C=selClips(),all=[...B,...C];if(!all.length)return;
  const s0=Math.min(...all.map(q=>q.s)),e0=Math.max(...all.map(q=>q.s+q.l)),span=e0-s0;
  if(e0+span>MAXBARS*4){alert('最大小節数を超えるため複製できません');return}
  pushUndo();const nb=[],nc=[];
  for(const q of B){const n={id:uid(),pid:q.pid,ti:q.ti,s:q.s+span,l:q.l,w:qw(q)};S.place.push(n);nb.push(n)}
  for(const q of C){const n={id:uid(),aid:q.aid,tr:q.tr,s:q.s+span,l:q.l};S.aplace.push(n);nc.push(n)}
  sSels=new Set(nb);sSel=nb[0]||null;selAs=new Set(nc);selA=nc[0]||null;fitSong();dirty();syncSongBar();draw();st(all.length+'個を複製しました');
}
function selectAllSong(){
  sSels=new Set(S.place);sSel=S.place[0]||null;selAs=new Set(S.aplace);selA=S.aplace[0]||null;syncSongBar();draw();
  st((S.place.length+S.aplace.length)+'個を選択しました');
}
function moveSel(dx,dy){
  const B=selBlocks(),C=selClips(),all=[...B,...C];if(!all.length)return;
  let ds=dx;ds=Math.max(ds,-Math.min(...all.map(q=>q.s)));ds=Math.min(ds,Math.min(...all.map(q=>MAXBARS*4-q.l-q.s)));
  let dr=dy;if(B.length){dr=Math.max(dr,-Math.min(...B.map(q=>q.ti)));dr=Math.min(dr,S.tracks.length-1-Math.max(...B.map(q=>q.ti)))}
  if(C.length){const ri=C.map(q=>S.autotr.findIndex(r=>r.id===q.tr));if(!B.length){dr=Math.max(dr,-Math.min(...ri));dr=Math.min(dr,S.autotr.length-1-Math.max(...ri))}else dr=0}
  if(!ds&&!dr)return;pushUndo();
  for(const q of B){q.s+=ds;q.ti+=dr}
  for(const q of C){q.s+=ds;if(dr&&!B.length){const k=S.autotr.findIndex(r=>r.id===q.tr);q.tr=S.autotr[k+dr].id}}
  NC=null;fitSong();dirty();draw();
}
addEventListener('keydown',e=>{
  if(VIEW!=='song'||tags.includes(e.target.tagName)||e.isComposing)return;
  if(ctxM||(typeof sbo!=='undefined'&&!sbo.hidden))return;
  const mod=e.ctrlKey||e.metaKey,k=e.key,stop=()=>{e.preventDefault();e.stopImmediatePropagation()};
  if(mod&&!e.altKey&&!e.shiftKey){
    const l=k.toLowerCase();
    if(l==='c'&&hasSel()){stop();songCopy(false)}
    else if(l==='x'&&hasSel()){stop();songCopy(true)}
    else if(l==='v'&&(BLK||ACBUF)){stop();songPaste()}
    else if(l==='a'){stop();selectAllSong()}
    else if(l==='d'&&selBlocks().length+selClips().length>1){stop();groupDup()}
    return}
  if((k==='Delete'||k==='Backspace')&&hasSel()){stop();songDelete();return}
  if(k==='Escape'&&hasSel()){clearSel();syncSongBar();draw();return}
  if(!mod&&!e.altKey&&hasSel()&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k)){
    stop();const g=sgG()||.25;moveSel(k==='ArrowLeft'?-g:k==='ArrowRight'?g:0,k==='ArrowUp'?-1:k==='ArrowDown'?1:0)}
},true);

/* ================= 右クリック / 長押しメニュー ================= */
function renameBlock(cx,cy,q){const P=patOf(q);if(!P)return;popInput(cx,cy,'パターン名',P.name,v=>{pushUndo();P.name=v;dirty();syncSongBar();draw()})}
function recolorBlock(q){const P=patOf(q);if(!P)return;let first=true;pickColor(P.color,v=>{if(first){pushUndo();first=false}P.color=v;dirty();syncSongBar();draw()})}
openBlockMenu=function(cx,cy,q){
  ctxClose();if(!selBlocks().includes(q)){sSels=new Set();sSel=q}selA=null;syncSongBar();draw();
  const multi=selBlocks().length+selClips().length>1;
  menu(cx,cy,'ブロックのメニュー',[
    {t:'ピアノロールで開く',run:()=>openPattern(q)},
    {t:'名前を変更…',off:multi,run:()=>renameBlock(cx,cy,q)},
    {t:'色を変更…',off:multi,run:()=>recolorBlock(q)},
    {sep:1},
    {t:'コピー (Ctrl+C)',run:()=>songCopy(false)},
    {t:'切り取り (Ctrl+X)',run:()=>songCopy(true)},
    {t:'貼り付け (Ctrl+V)',off:!(BLK||ACBUF),run:songPaste},
    {sep:1},
    {t:'複製(同じパターンを参照)',run:()=>{if(multi)groupDup();else{sSel=q;dupPl(false)}}},
    {t:'独立コピーを作成',off:multi,run:()=>{sSel=q;dupPl(true)}},
    {sep:1},
    {t:'ブロック長を変更…',off:multi,run:()=>menuAction('w',q)},
    {t:'再生範囲を編集…',off:multi,run:()=>menuAction('r',q)},
    {t:'表示幅を再生範囲に合わせる',off:multi,run:()=>menuAction('fit',q)},
    {t:'表示幅を初期値に戻す',off:multi,run:()=>menuAction('reset',q)},
    {sep:1},
    {t:multi?'選択した項目を削除':'ブロックを削除',run:songDelete},
    {t:'パターンを削除…',off:multi,run:()=>{sSel=q;delPat()}}]);
};
function autoClipMenu(cx,cy,q){
  const a=S.autos.find(x=>x.id===q.aid);if(!a)return;
  if(!selClips().includes(q)){selOne(q)}selA=q;sSel=null;sSels=new Set();syncSongBar();draw();
  const multi=selBlocks().length+selClips().length>1;
  menu(cx,cy,'オートメーションクリップのメニュー',[
    {t:'オートメーションエディターで開く',run:()=>openAuto(q)},
    {t:'名前を変更…',off:multi,run:()=>popInput(cx,cy,'クリップ名',a.name,v=>{pushUndo();a.name=v;dirty();syncSongBar();draw()})},
    {t:'色を変更…',off:multi,run:()=>{let f=true;pickColor(a.color,v=>{if(f){pushUndo();f=false}a.color=v;dirty();syncSongBar();draw()})}},
    {sep:1},
    {t:'コピー (Ctrl+C)',run:()=>songCopy(false)},
    {t:'切り取り (Ctrl+X)',run:()=>songCopy(true)},
    {t:'貼り付け (Ctrl+V)',off:!(BLK||ACBUF),run:songPaste},
    {sep:1},
    {t:'複製(同じクリップを参照)',run:()=>{if(multi)groupDup();else dupAblk(false)}},
    {t:'独立コピーを作成',off:multi,run:()=>dupAblk(true)},
    {sep:1},
    {t:multi?'選択した項目を削除':'クリップを削除',run:songDelete}]);
}
cv.addEventListener('contextmenu',e=>{
  if(VIEW!=='song')return;const h=hitAt(e);
  if(h&&h.k==='a'){e.preventDefault();autoClipMenu(e.clientX,e.clientY,h.q)}
  else if(h&&!h.k&&h.ri>=0&&h.ri<S.tracks.length){e.preventDefault();
    menu(e.clientX,e.clientY,'ソングエディターのメニュー',[
      {t:'ここに貼り付け(再生位置)',off:!(BLK||ACBUF),run:songPaste},
      {t:'すべて選択 (Ctrl+A)',run:selectAllSong},
      {sep:1},
      {t:'トラックを追加',run:()=>$('add').click()},
      {t:'オートメーショントラックを追加',run:()=>$('sgAT').click()}])}
});

/* ================= タイムライン / 表示の操作 ================= */
function addBars(n){
  let end=0;for(const q of S.place)end=Math.max(end,q.s+q.l);for(const q of S.aplace)end=Math.max(end,q.s+q.l);
  const lo=Math.max(16,Math.ceil(end/4)*4),want=Math.max(lo,Math.min(MAXBARS*4,S.len+n*4));
  if(want===S.len){st(n>0?'これ以上小節を追加できません':'ブロック・クリップのある位置より前には縮められません');return}
  pushUndo();S.len=want;fitLen();dirty();draw();st('曲の長さ: '+(S.len/4)+' 小節');
}
function zoomTrackH(f){SZV=Math.max(.6,Math.min(2,SZV*f));try{localStorage.setItem('daw-szv',String(SZV))}catch(_){}draw()}
const sgbar=document.getElementById('sgbar');
if(sgbar){
  const bar2=document.createElement('div');bar2.className='sgbar2';
  bar2.innerHTML='<button type="button" id="sgSelMode" aria-pressed="false" title="範囲選択モード: 空き領域のドラッグでブロック・クリップを範囲選択(ONの間は空きをタップしてもブロックを作りません)。Shift+ドラッグでも可">範囲選択</button><span class="sep"></span>'+
   '<span class="sl">時間</span><button type="button" id="sgZhm" title="横ズームアウト (Ctrl+ホイール)" aria-label="横ズームアウト">−</button><button type="button" id="sgZhp" title="横ズームイン (Ctrl+ホイール)" aria-label="横ズームイン">＋</button>'+
   '<span class="sl">高さ</span><button type="button" id="sgZvm" title="トラックを低く" aria-label="トラックの高さを小さく">−</button><button type="button" id="sgZvp" title="トラックを高く" aria-label="トラックの高さを大きく">＋</button>'+
   '<span class="sl">小節</span><button type="button" id="sgBm" title="曲の終わりを1小節短くする(使用中の範囲まで)" aria-label="小節を減らす">−</button><button type="button" id="sgBp" title="曲の終わりを1小節延ばす" aria-label="小節を増やす">＋</button>'+
   '<span class="sl hintline">Shift/Ctrl+クリック:複数選択 / Ctrl+C・X・V・A・D / Delete / 矢印:移動 / Ctrl+ホイール:ズーム / Shift+ホイール:横スクロール</span>';
  bar2.title='Shift/Ctrl+クリック:複数選択 / Ctrl+C・X・V・A・D / Delete / 矢印キー:移動 / Ctrl+ホイール:ズーム / Shift+ホイール:横スクロール';
  sgbar.appendChild(bar2);
  const selBtn=$('sgSelMode');
  selBtn.onclick=()=>{SELMODE=!SELMODE;selBtn.classList.toggle('on',SELMODE);selBtn.setAttribute('aria-pressed',SELMODE);st(SELMODE?'範囲選択モード ON: 空き領域をドラッグして選択':'範囲選択モード OFF')};
  $('sgZhm').onclick=()=>zoomH(zh/1.25);$('sgZhp').onclick=()=>zoomH(zh*1.25);
  $('sgZvm').onclick=()=>zoomTrackH(1/1.2);$('sgZvp').onclick=()=>zoomTrackH(1.2);
  $('sgBm').onclick=()=>addBars(-1);$('sgBp').onclick=()=>addBars(1);
}
roll.addEventListener('wheel',e=>{if(VIEW==='song'&&e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();roll.scrollLeft+=(e.deltaY||e.deltaX)}},{passive:false});

window.SongEditorExt={trackMenu,dupTrack,delTrack,songCopy,songPaste,songDelete,groupDup,selectAllSong,selBlocks,selClips,addBars,zoomTrackH};
draw();
})();

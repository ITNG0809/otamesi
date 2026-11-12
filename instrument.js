/* instrument.js — トラックごとの音源設定ウィンドウ / Browser の「音源」セクション (LMMS方式)
   ・既存の再生エンジンとデータ構造(S.tracks[i].wave / cut / sf …)をそのまま使う。新しいデータは任意項目だけ:
       t.atk / t.rel : 内蔵シンセのアタック/リリース(秒)。未設定なら従来値(0.01 / 0.12)
       t.sfStash     : SF2 → 内蔵シンセへ切り替えたときだけ、元のSF2指定を退避(SF2へ戻すと復元)
   ・音源を変えても、パターン・音符・ソングの配置(S.patterns / S.place)には一切触れない。
   ・SF2は既存ライブラリ(LIB / sfRes / warmTracks)の遅延読み込みをそのまま使う。このファイルはSF2本体を読まない。
   ・読み込み順: script.js → song-editor.js → … → lmms-ui.js → instrument.js */
(function(){
'use strict';
if(typeof S==='undefined'||typeof EMBED_AUTO==='undefined'||EMBED_AUTO||(typeof PIANO_EMBED!=='undefined'&&PIANO_EMBED))return;
const UI=window.BGMNotpcLMMSUI,mainEl=document.querySelector('main');
if(!UI||!UI.makeWindow||!mainEl)return;
const esc=fsEsc;
const trackById=id=>S.tracks.find(t=>t.id===id)||null;
const note=m=>{try{$('st').textContent=m}catch(_){}};

/* ================= 音源の変更(すべてUndo対象。音符には触れない) ================= */
function audition(t,p){try{sfPreview(t,p||60,100,.5)}catch(e){console.warn('audition',e)}}
function refreshAll(){renderTracks();draw()}
function setWave(t,w){
  if(!WAVE_JA[w])return;
  if(t.sf){pushUndo();t.sfStash=t.sf;t.sf=null}else if(t.wave!==w)pushUndo();else{audition(t);return}
  t.wave=w;dirty();refreshAll();audition(t)}
function useSynth(t){ // SF2 → 内蔵シンセ(SF2の指定は t.sfStash に残す)
  if(!t.sf)return;pushUndo();t.sfStash=t.sf;t.sf=null;dirty();refreshAll();audition(t)}
function useSF2(t){ // 内蔵シンセ → SF2(退避してあった指定を復元。なければ何もしない=プリセット選択待ち)
  if(t.sf||!t.sfStash)return false;pushUndo();t.sf=t.sfStash;delete t.sfStash;dirty();refreshAll();warmTracks();try{libSyncProject().catch(()=>{})}catch(_){}audition(t);return true}
function assignSF(t,fid,b,p){
  const f=LIB.files.get(fid),pr=f&&f.sf&&f.sf.pmap.get(b+':'+p);
  if(!pr){note('このSF2はまだ読み込まれていません。先に「読み込む」を押してください');return false}
  const c=t.sf;if(c&&c.f===fid&&c.b===b&&c.p===p){audition(t);return true}
  pushUndo();t.sf={f:fid,b,p,n:pr.name,fn:f.dn||f.name};delete t.sfStash;if(!S.sf2)S.sf2=f.name;
  dirty();refreshAll();warmTracks();try{libSyncProject().catch(()=>{})}catch(_){}
  try{libLog('トラック「'+t.name+'」に設定: '+(f.dn||f.name)+' / '+pr.name,'ok')}catch(_){}
  audition(t);return true}

/* ================= 音源設定ウィンドウ ================= */
const W=new Map(); // trackId -> window state
const WAVES=[['sine','サイン波','M1 10C6 -2 11 -2 17 10S28 22 33 10'],['triangle','三角波','M1 10L9 3L25 17L33 10'],['square','矩形波','M1 16V4H12V16H23V4H33'],['sawtooth','ノコギリ波','M1 16L13 4V16L25 4V16L33 8']];
/* スライダー位置(0..1000)⇔値の対数マッピング */
const LOGP={cut:[200,12000],atk:[.001,2],rel:[.005,3]};
const toPos=(k,v)=>{const [a,b]=LOGP[k];v=Math.max(a,Math.min(b,v));return Math.round(1000*Math.log(v/a)/Math.log(b/a))};
const fromPos=(k,x)=>{const [a,b]=LOGP[k];return a*Math.pow(b/a,x/1000)};
const fmtV={cut:v=>Math.round(v)+' Hz',atk:v=>v<1?Math.round(v*1000)+' ms':v.toFixed(2)+' s',rel:v=>v<1?Math.round(v*1000)+' ms':v.toFixed(2)+' s'};
const curVal=(t,k)=>k==='cut'?(t.cut==null?6000:+t.cut):synEnv(t,k);
const taskbar=document.getElementById('lmmsTaskbar');

function keysHTML(){ // C4(60)〜B5(83)
  const wn=[0,2,4,5,7,9,11],blk={1:0,3:1,6:3,8:4,10:5};let h='',wi=0;const N=14,w=100/N;
  for(let o=0;o<2;o++)for(const s of wn){h+='<div class="k" data-p="'+(60+o*12+s)+'" style="left:'+(wi*w)+'%;width:'+w+'%"></div>';wi++}
  for(let o=0;o<2;o++)for(const [s,idx] of Object.entries(blk)){const x=(o*7+idx+1)*w-w*.3;h+='<div class="k b" data-p="'+(60+o*12+ +s)+'" style="left:'+x+'%;width:'+(w*.6)+'%"></div>'}
  return h}

function createWindow(t){
  const el=document.createElement('section');el.className='inst-window';el.dataset.tid=t.id;
  el.innerHTML='<div class="iw">'+
   '<div class="iw-head"><span class="iw-badge" data-r="badge">SYN</span><input class="iw-name" data-r="name" maxlength="40" aria-label="トラック名"></div>'+
   '<div class="iw-tabs" role="tablist" aria-label="音源の種類"><button type="button" role="tab" data-tab="synth">内蔵シンセ</button><button type="button" role="tab" data-tab="sf2">SoundFont (SF2)</button></div>'+
   '<div class="iw-body">'+
    '<div class="iw-pane" data-pane="synth">'+
     '<div class="iw-sec"><h4>波形</h4><div class="iw-waves">'+WAVES.map(([k,l,d])=>'<button type="button" data-wave="'+k+'" title="'+l+'" aria-label="'+l+'"><svg viewBox="0 0 34 20" aria-hidden="true"><path d="'+d+'"/></svg><span>'+l+'</span></button>').join('')+'</div></div>'+
     '<div class="iw-sec"><h4>フィルター / エンベロープ</h4>'+
      [['cut','カットオフ'],['atk','アタック'],['rel','リリース']].map(([k,l])=>'<div class="iw-prm"><label for="iw'+t.id+k+'">'+l+'</label><input id="iw'+t.id+k+'" type="range" min="0" max="1000" step="1" data-p="'+k+'" aria-label="'+l+'"><output data-o="'+k+'"></output></div>').join('')+
      '<div class="iw-act"><button type="button" data-act="reset">初期値に戻す</button></div>'+
      '<div class="iw-note">カットオフはローパスフィルターです。つまみを右クリックすると、オートメーションクリップを作成できます。</div></div>'+
    '</div>'+
    '<div class="iw-pane" data-pane="sf2" hidden>'+
     '<div class="iw-cur" data-r="cur"></div>'+
     '<div class="iw-files" data-r="files" role="listbox" aria-label="SoundFont"></div>'+
     '<input class="iw-q" data-r="q" type="search" placeholder="プリセットを検索(名前 / バンク:番号)" aria-label="プリセットを検索">'+
     '<div class="iw-presets" data-r="presets" role="listbox" aria-label="プリセット"></div>'+
     '<div class="iw-note" data-r="sfnote"></div>'+
     '<div class="iw-act"><button type="button" data-act="addsf">SF2を追加…</button><button type="button" data-act="lib">SF2ライブラリを開く</button></div>'+
    '</div>'+
    '<div class="iw-sec"><h4>トラック</h4>'+
     '<div class="iw-prm"><label for="iw'+t.id+'v">音量</label><input id="iw'+t.id+'v" type="range" min="0" max="1" step=".01" data-tk="vol" aria-label="音量"><output data-o="vol"></output></div>'+
     '<div class="iw-prm"><label for="iw'+t.id+'p">パン</label><input id="iw'+t.id+'p" type="range" min="-1" max="1" step=".05" data-tk="pan" aria-label="パン"><output data-o="pan"></output></div></div>'+
   '</div>'+
   '<div class="iw-kb"><small>試し弾き(タップ / クリック。2オクターブ)</small><div class="iw-keys" data-r="keys">'+keysHTML()+'</div></div>'+
  '</div>';
  mainEl.appendChild(el);
  const n=W.size,win=UI.makeWindow(el,{id:'inst-'+t.id,title:'Instrument',subtitle:'',
    initial:{left:(300+n*26)+'px',top:(34+n*26)+'px',width:'min(470px, calc(100% - 24px))',height:'min(620px, calc(100vh - 260px))'},
    closeAction:()=>closeWin(t.id)});
  const w={tid:t.id,el,win,r:{},tabBtn:null,fileId:null,q:'',limit:150,pending:false,sig:'',scrollCur:true,gest:false};
  el.querySelectorAll('[data-r]').forEach(x=>w.r[x.dataset.r]=x);
  w.title=win.bar.querySelector('strong');w.sub=win.bar.querySelector('small');
  W.set(t.id,w);wire(w);
  if(taskbar){const b=document.createElement('button');b.type='button';b.title='音源設定ウィンドウを開く';b.onclick=()=>{open(w.tid)};
    const sp=taskbar.querySelector('.lmms-task-spacer');taskbar.insertBefore(b,sp||null);w.tbtn=b}
  return w}

function closeWin(tid){
  const w=W.get(tid);if(!w)return;W.delete(tid);try{w.el.remove()}catch(_){}try{w.tbtn&&w.tbtn.remove()}catch(_){}
  try{UI.syncWindowButtons()}catch(_){}}

function wire(w){
  const el=w.el,T=()=>trackById(w.tid);
  /* タブ: 内蔵シンセ / SF2(実際に音源を切り替える。SF2はプリセット未選択なら選択待ち) */
  el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{const t=T();if(!t)return;
    if(b.dataset.tab==='synth'){w.pending=false;useSynth(t);syncWin(w)}
    else{if(!t.sf&&!useSF2(t)){w.pending=true}syncWin(w)}});
  el.querySelectorAll('[data-wave]').forEach(b=>b.onclick=()=>{const t=T();if(t)setWave(t,b.dataset.wave)});
  /* 内蔵シンセのつまみ: 1回の操作につきUndoは1つ */
  el.querySelectorAll('[data-p]').forEach(inp=>{const k=inp.dataset.p;
    markAuto(inp,'trk:'+w.tid+':'+k);
    inp.addEventListener('input',()=>{const t=T();if(!t)return;if(!w.gest){pushUndo();w.gest=true}
      const v=fromPos(k,+inp.value);t[k]=k==='cut'?Math.round(v):+v.toFixed(4);
      const o=el.querySelector('[data-o="'+k+'"]');if(o)o.textContent=fmtV[k](curVal(t,k));dirty()});
    inp.addEventListener('change',()=>{w.gest=false;const t=T();if(t)audition(t)})});
  el.querySelector('[data-act="reset"]').onclick=()=>{const t=T();if(!t)return;pushUndo();t.cut=6000;delete t.atk;delete t.rel;dirty();syncWin(w)};
  /* 音量 / パン(トラック一覧・ミキサーと同じ値) */
  el.querySelectorAll('[data-tk]').forEach(inp=>{const k=inp.dataset.tk;markAuto(inp,'trk:'+w.tid+':'+k);
    inp.addEventListener('input',()=>{const t=T();if(!t)return;t[k]=+inp.value;
      if(ctx&&!AUTOLIVE.has('trk:'+t.id+':'+k)){const c=getCh(t);if(k==='vol')c.in.gain.value=t.vol;else c.pan.pan.value=t.pan}
      dirty();const o=el.querySelector('[data-o="'+k+'"]');if(o)o.textContent=fmtTk(k,t);syncRows(t)});
    inp.addEventListener('change',()=>{const t=T();if(t&&k==='pan'&&S.tracks[sel]===t)renderMx()});
    if(k==='pan')inp.addEventListener('dblclick',()=>{inp.value=0;inp.dispatchEvent(new Event('input'));inp.dispatchEvent(new Event('change'))})});
  /* トラック名 */
  w.r.name.addEventListener('input',()=>{const t=T();if(!t)return;t.name=w.r.name.value||'Track';dirty();draw();syncRows(t);titleOf(w,t)});
  w.r.name.addEventListener('change',()=>{const t=T();if(!t)return;if(!w.r.name.value.trim()){w.r.name.value='Track';t.name='Track'}renderTracks();draw()});
  w.r.name.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'||e.key==='Escape')w.r.name.blur()});
  /* SF2 */
  w.r.q.addEventListener('input',()=>{w.q=w.r.q.value;w.limit=150;w.sig='';syncWin(w)});
  w.r.q.addEventListener('keydown',e=>e.stopPropagation());
  w.r.files.addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;w.fileId=b.dataset.f;w.limit=150;w.scrollCur=true;w.sig='';syncWin(w)});
  w.r.presets.addEventListener('click',e=>{const t=T();if(!t)return;
    if(e.target.closest('[data-more]')){w.limit+=200;w.sig='';syncWin(w);return}
    if(e.target.closest('[data-load]')){const f=LIB.files.get(w.fileId);if(f)libLoadStored(f).then(()=>{refreshAll();try{libSave()}catch(_){}}).catch(()=>{});w.sig='';return}
    const b=e.target.closest('[data-b]');if(!b||!w.fileId)return;w.pending=false;assignSF(t,w.fileId,+b.dataset.b,+b.dataset.p)});
  el.querySelector('[data-act="addsf"]').onclick=()=>$('sf2f').click();
  el.querySelector('[data-act="lib"]').onclick=()=>{try{openLib()}catch(_){UI.restoreSF2Library&&UI.restoreSF2Library()}};
  /* 試し弾きキーボード(マウス/タッチ/ペン。複数指OK) */
  const keys=w.r.keys,down=new Map();
  const off=pid=>{const k=down.get(pid);if(k){k.classList.remove('on');down.delete(pid)}};
  keys.addEventListener('pointerdown',e=>{const k=e.target.closest('.k');if(!k)return;e.preventDefault();const t=T();if(!t)return;
    try{keys.setPointerCapture(e.pointerId)}catch(_){}
    k.classList.add('on');down.set(e.pointerId,k);audition(t,+k.dataset.p)});
  keys.addEventListener('pointermove',e=>{if(!down.has(e.pointerId))return;const o=document.elementFromPoint(e.clientX,e.clientY),k=o&&o.closest&&o.closest('.iw-keys .k');
    if(k&&k!==down.get(e.pointerId)){off(e.pointerId);const t=T();if(!t)return;k.classList.add('on');down.set(e.pointerId,k);audition(t,+k.dataset.p)}});
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>keys.addEventListener(ev,e=>off(e.pointerId)));
  el.addEventListener('keydown',e=>{if(e.key==='Escape'&&!['INPUT'].includes(e.target.tagName)){closeWin(w.tid)}},false);
}
const fmtTk=(k,t)=>k==='vol'?Math.round((t.vol==null?.7:t.vol)*100)+'%':(()=>{const p=t.pan||0;return p===0?'C':(p<0?'L':'R')+Math.round(Math.abs(p)*100)})();
function titleOf(w,t){w.title.textContent='Instrument — '+t.name;w.sub.textContent=instType(t)==='sf2'?'SOUNDFONT':'SYNTH';
  if(w.tbtn)w.tbtn.textContent='⚙ '+t.name}
/* トラック一覧(左)・ミキサーの表示を、再構築せずに値だけ更新 */
function syncRows(t){
  const row=document.querySelector('#tl .trk[data-tid="'+t.id+'"]');if(!row)return;
  const act=document.activeElement,nm=row.querySelector('[data-k="name"]');if(nm&&nm!==act&&nm.value!==t.name)nm.value=t.name;
  const v=row.querySelector('[data-k="vol"]'),p=row.querySelector('[data-k="pan"]');
  if(v&&v!==act&&+v.value!==t.vol)v.value=t.vol;if(p&&p!==act&&+p.value!==(t.pan||0))p.value=t.pan||0}

function setRange(inp,val){if(!inp)return;const a=document.activeElement;if(a===inp)return;if(Math.abs(+inp.value-val)>1e-9)inp.value=val}
function syncWin(w){
  const t=trackById(w.tid);if(!t){closeWin(w.tid);return}
  const type=instType(t);if(type==='sf2')w.pending=false;
  const tab=type==='sf2'||w.pending?'sf2':'synth';
  titleOf(w,t);
  const ic=instIconTxt(t),bd=w.r.badge;bd.textContent=ic;bd.className='iw-badge'+(ic==='SF2'?' sf2':ic==='SYN'?'':' em');
  if(document.activeElement!==w.r.name&&w.r.name.value!==t.name)w.r.name.value=t.name;
  w.el.querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  w.el.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==tab);
  const cw=WAVE_JA[t.wave]?t.wave:'sawtooth';
  w.el.querySelectorAll('[data-wave]').forEach(b=>{const on=b.dataset.wave===cw&&type==='synth';b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  for(const k of ['cut','atk','rel']){const inp=w.el.querySelector('[data-p="'+k+'"]'),pos=toPos(k,curVal(t,k));
    if(inp&&document.activeElement!==inp&&Math.abs(+inp.value-pos)>1)inp.value=pos;
    const o=w.el.querySelector('[data-o="'+k+'"]');if(o)o.textContent=fmtV[k](curVal(t,k))}
  for(const k of ['vol','pan']){setRange(w.el.querySelector('[data-tk="'+k+'"]'),k==='vol'?(t.vol==null?.7:t.vol):(t.pan||0));
    const o=w.el.querySelector('[data-o="'+k+'"]');if(o)o.textContent=fmtTk(k,t)}
  if(w.tbtn)w.tbtn.classList.toggle('active',!w.el.classList.contains('lmms-minimized')&&!w.el.classList.contains('lmms-hidden'));
  if(tab==='sf2')renderSF(w,t)}

function fileMatchesDefault(w,t){
  if(w.fileId&&LIB.files.has(w.fileId))return;
  const c=t.sf&&LIB.files.has(t.sf.f)?t.sf.f:null;
  w.fileId=c||((libSorted().find(f=>f.sf)||libSorted()[0]||{}).id)||null;w.scrollCur=true}
function renderSF(w,t){
  fileMatchesDefault(w,t);
  const sig=[LIBVER,t.sf?t.sf.f+':'+t.sf.b+':'+t.sf.p:'-',w.fileId,w.q,w.limit,[...LIB.files.values()].map(f=>f.id+(f.sf?'L':f.state)+(f.dn||f.name)+(f.prog||'')).join(',')].join('|');
  if(sig===w.sig)return;w.sig=sig;
  const cur=t.sf,R=cur?sfRes(t):null,r=w.r;
  r.cur.innerHTML=cur?'<b>'+esc(cur.n||('Bank'+cur.b+':'+cur.p))+'</b><small>'+esc(cur.fn||'SF2')+' · '+String(cur.b).padStart(3,'0')+':'+String(cur.p).padStart(3,'0')+(R?'':' · ⚠ 未読込(読み込むまで内蔵シンセで鳴ります)')+'</small>'
    :'<b>(プリセット未選択)</b><small>下のリストからプリセットを選ぶと、このトラックはSF2で鳴ります</small>';
  const files=libSorted();
  r.files.innerHTML=files.length?files.map(f=>'<button type="button" class="iw-file'+(f.id===w.fileId?' sel':'')+(cur&&cur.f===f.id?' cur':'')+'" data-f="'+esc(f.id)+'" role="option" aria-selected="'+(f.id===w.fileId)+'"><span class="iw-fn" title="'+esc(f.name)+'">♪ '+esc(f.dn||f.name)+'</span><small>'+esc(libBadge(f))+'</small></button>').join(''):'<div class="iw-empty">SF2がライブラリに登録されていません。「SF2を追加…」から読み込んでください(ファイルはこのアプリに埋め込まず、必要な音色だけ後から展開します)。</div>';
  const f=w.fileId?LIB.files.get(w.fileId):null,sp=r.presets,top=sp.scrollTop;let h='';
  if(!f)h='<div class="iw-empty">SoundFontを選んでください。</div>';
  else if(!f.sf){
    h='<div class="iw-empty">'+(f.state==='loading'?'読み込み中… '+Math.round((f.prog||0)*100)+'%':f.stored?'このSF2はまだ読み込んでいません。':'このSF2はブラウザに保存されていません。「SF2を追加…」で同じファイルを選び直してください。')+'</div>'+(f.stored&&f.state!=='loading'?'<div style="padding:0 10px 10px"><button type="button" class="iw-btn" data-load="1">このSF2を読み込む</button></div>':'')}
  else{
    const q=w.q.trim().toLowerCase(),all=f.sf.presets.filter(p=>!q||p.name.toLowerCase().includes(q)||(String(p.b).padStart(3,'0')+':'+String(p.p).padStart(3,'0')).includes(q));
    let lim=w.limit;if(cur&&cur.f===f.id&&!q&&w.scrollCur){const i=all.findIndex(p=>p.b===cur.b&&p.p===cur.p);if(i>=lim)lim=w.limit=i+60}
    h=all.slice(0,lim).map(p=>{const on=!!cur&&cur.f===f.id&&cur.b===p.b&&cur.p===p.p;return '<button type="button" class="iw-pre'+(on?' cur':'')+'" data-b="'+p.b+'" data-p="'+p.p+'" role="option" aria-selected="'+on+'"><small>'+String(p.b).padStart(3,'0')+':'+String(p.p).padStart(3,'0')+'</small><span>'+esc(p.name)+'</span></button>'}).join('');
    if(!all.length)h='<div class="iw-empty">該当するプリセットがありません。</div>';
    if(all.length>lim)h+='<button type="button" class="iw-more" data-more="1">さらに表示(残り'+(all.length-lim)+'件)</button>'}
  sp.innerHTML=h;sp.scrollTop=top;
  if(w.scrollCur){w.scrollCur=false;const c=sp.querySelector('.iw-pre.cur');if(c&&sp.scrollTo)sp.scrollTop=Math.max(0,c.offsetTop-sp.clientHeight/2+16)}
  r.sfnote.textContent=f&&f.sf?'メモリ: このSF2 約'+MB(libMem(f))+'(サンプルは鳴らす音色だけ遅延読み込み・キャッシュ管理)':'';
}

function open(tid){
  const t=trackById(tid);if(!t)return null;
  const i=S.tracks.indexOf(t);if(sel!==i){sel=i;selNote=null;selSet.clear();refreshAll()}
  let w=W.get(tid);if(!w)w=createWindow(t);
  w.win.restore();w.sig='';syncWin(w);try{UI.syncWindowButtons()}catch(_){}return w}
function syncAll(){for(const w of [...W.values()])syncWin(w)}

/* ================= Browser: 音源(内蔵シンセ / SoundFont)を探して選択トラックに割り当てる ================= */
const ibr=document.getElementById('ibr');
const BR={open:new Set(),limit:new Map(),pick:null,sig:''};
const tmpSyn={name:'__ibsyn',wave:'sine',vol:.8,mute:false,solo:false,cut:6000,sf:null,pan:0,fx:[],id:'__ibsyn'};
function brQuery(){const s=document.getElementById('lmmsBrowserSearch');return (s&&s.value||'').trim().toLowerCase()}
function renderBrowser(force){
  if(!ibr)return;
  const t=S.tracks[sel],q=brQuery(),cur=t&&t.sf?t.sf:null;
  const sig=[LIBVER,sel,t?t.name+'|'+instType(t)+'|'+(t.wave)+'|'+(cur?cur.f+':'+cur.b+':'+cur.p:''):'',q,[...BR.open].join(),[...BR.limit].join(),BR.pick||'',[...LIB.files.values()].map(f=>f.id+(f.sf?'L':f.state)+(f.dn||f.name)).join(',')].join('#');
  if(!force&&sig===BR.sig)return;BR.sig=sig;
  const top=ibr.scrollTop;let h='<div class="ib-target">割り当て先: <b>'+(t?(sel+1)+'. '+esc(t.name):'-')+'</b><br>音源を選んで「→」(ダブルクリック / ドラッグでも可)</div><div class="ib-grp">内蔵シンセ</div>';
  for(const [k,l] of WAVES){if(q&&!(l.toLowerCase().includes(q)||'シンセ synth'.includes(q)))continue;
    const on=t&&!t.sf&&t.wave===k;
    h+='<div class="ib-row syn'+(on?' cur':'')+'" draggable="true" data-syn="'+k+'"><span class="ib-badge">SYN</span><span class="ib-n">'+l+'</span><button type="button" data-ibp title="試聴" aria-label="試聴">▶</button><button type="button" data-iba title="選択トラックに割り当て" aria-label="選択トラックに割り当て">→</button></div>'}
  h+='<div class="ib-grp">SoundFont</div>';
  const files=libSorted();let any=false;
  for(const f of files){
    const nameHit=!q||(f.dn||f.name).toLowerCase().includes(q);
    let pres=[];
    if(f.sf){const open=BR.open.has(f.id)||!!q;if(open){pres=f.sf.presets.filter(p=>!q||nameHit||p.name.toLowerCase().includes(q))}}
    if(q&&!nameHit&&!pres.length)continue;any=true;
    const isOpen=BR.open.has(f.id)||(!!q&&pres.length>0),lim=BR.limit.get(f.id)||40;
    h+='<div class="ib-row file" data-f="'+esc(f.id)+'" title="'+esc(f.name)+'"><span class="ib-tw">'+(isOpen?'▾':'▸')+'</span><span class="ib-n">♪ '+esc(f.dn||f.name)+'</span><small>'+esc(libBadge(f))+'</small></div>';
    if(isOpen){
      if(!f.sf)h+='<div class="ib-empty">'+(f.state==='loading'?'読み込み中…':f.stored?'<button type="button" class="ib-btn" data-ibload="'+esc(f.id)+'">このSF2を読み込む</button>':'未読込。「SF2を追加」で選び直してください')+'</div>';
      for(const p of pres.slice(0,lim)){const on=!!cur&&cur.f===f.id&&cur.b===p.b&&cur.p===p.p,pk=f.id+'|'+p.b+'|'+p.p;
        h+='<div class="ib-row ib-pre sf2'+(on?' cur':'')+(BR.pick===pk?' cur':'')+'" draggable="true" data-f="'+esc(f.id)+'" data-b="'+p.b+'" data-p="'+p.p+'"><span class="ib-n" title="'+esc(p.name)+'">'+esc(p.name)+'</span><small>'+String(p.b).padStart(3,'0')+':'+String(p.p).padStart(3,'0')+'</small><button type="button" data-ibp title="試聴" aria-label="試聴">▶</button><button type="button" data-iba title="選択トラックに割り当て" aria-label="選択トラックに割り当て">→</button></div>'}
      if(pres.length>lim)h+='<button type="button" class="ib-more" data-ibmore="'+esc(f.id)+'">さらに表示(残り'+(pres.length-lim)+'件)</button>'}
  }
  if(!files.length)h+='<div class="ib-empty">SF2が未登録です。下のボタンから追加できます。</div>';
  else if(q&&!any)h+='<div class="ib-empty">該当する音源がありません。</div>';
  h+='<div class="ib-foot"><button type="button" class="ib-btn" data-ibfoot="add">SF2を追加</button><button type="button" class="ib-btn" data-ibfoot="lib">ライブラリ</button></div>';
  ibr.innerHTML=h;ibr.scrollTop=top}
function assignFromRow(row,toTrack){
  const t=toTrack||S.tracks[sel];if(!t)return;
  if(row.dataset.syn){setWave(t,row.dataset.syn);note('「'+t.name+'」の音源: '+WAVE_JA[row.dataset.syn])}
  else if(row.dataset.b!=null&&row.dataset.f){if(assignSF(t,row.dataset.f,+row.dataset.b,+row.dataset.p))note('「'+t.name+'」の音源: '+(LIB.files.get(row.dataset.f)?.dn||'SF2'))}}
if(ibr){
  ibr.addEventListener('click',e=>{
    const ld=e.target.closest('[data-ibload]');if(ld){const f=LIB.files.get(ld.dataset.ibload);if(f)libLoadStored(f).then(()=>{refreshAll();try{libSave()}catch(_){}}).catch(()=>{});return}
    const mo=e.target.closest('[data-ibmore]');if(mo){BR.limit.set(mo.dataset.ibmore,(BR.limit.get(mo.dataset.ibmore)||40)+80);renderBrowser(true);return}
    const ft=e.target.closest('[data-ibfoot]');if(ft){if(ft.dataset.ibfoot==='add')$('sf2f').click();else{try{openLib()}catch(_){UI.restoreSF2Library&&UI.restoreSF2Library()}}return}
    const row=e.target.closest('.ib-row');if(!row)return;
    if(row.classList.contains('file')){const id=row.dataset.f;BR.open.has(id)?BR.open.delete(id):BR.open.add(id);renderBrowser(true);return}
    const add=e.target.closest('[data-iba]');
    if(add){assignFromRow(row);return}
    if(row.dataset.syn){tmpSyn.wave=row.dataset.syn;audition(tmpSyn);BR.pick='syn|'+row.dataset.syn;return}
    if(row.dataset.b!=null){BR.pick=row.dataset.f+'|'+row.dataset.b+'|'+row.dataset.p;try{libAud(row.dataset.f,+row.dataset.b,+row.dataset.p)}catch(_){}renderBrowser(true)}});
  ibr.addEventListener('dblclick',e=>{const row=e.target.closest('.ib-row');if(row&&!row.classList.contains('file')&&!e.target.closest('button'))assignFromRow(row)});
  ibr.addEventListener('dragstart',e=>{const row=e.target.closest&&e.target.closest('.ib-row[draggable]');if(!row)return;
    const d=row.dataset.syn?{k:'syn',w:row.dataset.syn}:{k:'sf2',f:row.dataset.f,b:+row.dataset.b,p:+row.dataset.p};
    e.dataTransfer.setData('application/x-bgm-inst',JSON.stringify(d));e.dataTransfer.setData('text/plain',row.textContent.trim());e.dataTransfer.effectAllowed='copy';row.classList.add('dragging')});
  ibr.addEventListener('dragend',e=>{const row=e.target.closest&&e.target.closest('.ib-row');if(row)row.classList.remove('dragging');document.querySelectorAll('.trk.drop-target').forEach(x=>x.classList.remove('drop-target'))});
  const tl=document.getElementById('tl');
  if(tl){
    const has=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('application/x-bgm-inst');
    tl.addEventListener('dragover',e=>{if(!has(e))return;const r=e.target.closest('.trk');if(!r)return;e.preventDefault();e.dataTransfer.dropEffect='copy';
      tl.querySelectorAll('.drop-target').forEach(x=>x!==r&&x.classList.remove('drop-target'));r.classList.add('drop-target')});
    tl.addEventListener('dragleave',e=>{const r=e.target.closest&&e.target.closest('.trk');if(r&&!r.contains(e.relatedTarget))r.classList.remove('drop-target')});
    tl.addEventListener('drop',e=>{if(!has(e))return;const r=e.target.closest('.trk');if(!r)return;e.preventDefault();r.classList.remove('drop-target');
      let d=null;try{d=JSON.parse(e.dataTransfer.getData('application/x-bgm-inst'))}catch(_){}const t=trackById(r.dataset.tid);if(!d||!t)return;
      const i=S.tracks.indexOf(t);if(sel!==i){sel=i;selNote=null;selSet.clear()}
      if(d.k==='syn')setWave(t,d.w);else if(d.k==='sf2')assignSF(t,d.f,d.b,d.p)})}
  const bs=document.getElementById('lmmsBrowserSearch');if(bs)bs.addEventListener('input',()=>renderBrowser(true));
}

/* renderTracks の後に、開いている音源ウィンドウとBrowserの表示を同期する(UIの再構築はしない) */
const _rt=renderTracks;
renderTracks=function(){const r=_rt.apply(this,arguments);try{syncAll();renderBrowser(false)}catch(e){console.warn('instrument sync',e)}return r};
window.BGMInst={open,close:closeWin,sync:syncAll,assignSF,useSynth,useSF2,setWave,refreshBrowser:()=>renderBrowser(true),windows:W};
renderBrowser(true);
})();

/* piano-keys.js — Piano Roll の左側に縦型ピアノ鍵盤を追加する (script.js / song-editor.js の後に読み込む)
   ・既存のグリッド定数(RH / HI / LO / RULER)と roll のスクロール位置をそのまま使うので、鍵盤と音符の行は常に一致する
   ・試聴は既存の sfPreview(選択中トラックの SF2 / シンセ)を使用
   ・再生中の音符は、本体の再生エンジンが親ウィンドウ側にあるため、親から届く transport(位置/再生中)と
     この窓自身の再生状態(playing / playBeat)から求める
   ・表示 / 非表示、鍵盤の幅、音名表示は Piano Roll のツールバーから変更でき、localStorage に保存する */
(function(){
'use strict';
if(typeof S==='undefined'||typeof EMBED_AUTO==='undefined'||EMBED_AUTO)return;
const rt=document.getElementById('rt'),rc=document.getElementById('rc'),rollEl=document.getElementById('roll');
if(!rt||!rc||!rollEl)return;

/* ---------- 設定 ---------- */
const KEY='daw-pk-cfg',W_MIN=40,W_MAX=160,W_STEP=12;
let cfg={show:true,w:76,labels:'all'};
try{const o=JSON.parse(localStorage.getItem(KEY)||'null');if(o&&typeof o==='object'){
  if(typeof o.show==='boolean')cfg.show=o.show;
  if(+o.w>=W_MIN&&+o.w<=W_MAX)cfg.w=Math.round(+o.w);
  if(['all','c','off'].includes(o.labels))cfg.labels=o.labels}}catch(_){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(cfg))}catch(_){}};

/* ---------- 鍵盤キャンバス ---------- */
const pk=document.createElement('canvas');
pk.id='pk';pk.setAttribute('role','group');pk.setAttribute('aria-label','ピアノ鍵盤(クリック/タッチで試聴)');
rt.insertBefore(pk,rollEl);
const g=pk.getContext('2d');
const WHITE='#d3d9e1',WHITE_LINE='#8b95a3',BLACK='#1b1f22',ACT_W='#0bd556',ACT_B='#0a9b43',LBL='#262b30';

const pressed=new Map();   // pointerId -> pitch(押している間)
const lit=new Map();       // pitch -> 消灯する時刻(試聴で一瞬光らせる)
let tr={playing:false,beat:0}; // 親ウィンドウの再生状態
let raf=0;

function activePitches(){
  const A=new Set();
  for(const p of pressed.values())A.add(p);
  const now=performance.now();
  for(const[p,t]of lit){if(t>now)A.add(p);else lit.delete(p)}
  let beat=null;
  if(typeof playing!=='undefined'&&playing)beat=playBeat;else if(tr.playing)beat=tr.beat;
  if(beat!=null&&S&&S.tracks){
    const t=S.tracks[sel];
    if(t){try{for(const e of songNotes()){if(e.t===t&&beat>=e.s-1e-6&&beat<e.s+e.d-1e-6)A.add(e.p)}}catch(_){}}}
  return A;
}

function drawKeys(){
  if(!rc.classList.contains('pk-on'))return;
  const dpr=devicePixelRatio||1,w=cfg.w,h=Math.max(1,rollEl.clientHeight);
  const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
  if(pk.width!==cw||pk.height!==ch){pk.width=cw;pk.height=ch}
  pk.style.width=w+'px';pk.style.height=h+'px';
  g.setTransform(dpr,0,0,dpr,0,0);
  const sy=rollEl.scrollTop,A=activePitches(),bw=Math.round(w*.62);
  g.fillStyle='#262b30';g.fillRect(0,0,w,h);
  g.save();g.beginPath();g.rect(0,RULER,w,h-RULER);g.clip();
  g.textBaseline='alphabetic';
  const showTxt=RH>=9&&cfg.labels!=='off';
  g.font='bold '+Math.max(8,Math.min(11,RH-4))+'px system-ui,sans-serif';
  for(let p=LO;p<HI;p++){
    const y=RULER+(HI-1-p)*RH-sy;
    if(y>h||y+RH<RULER)continue;
    const black=isBlack(p),act=A.has(p);
    // 白鍵(黒鍵の行も、背面に白鍵が通っている)
    // 黒鍵の行も、背面には白鍵色を敷く(黒鍵は左側に重ねる)
    g.fillStyle=(!black&&act)?ACT_W:WHITE;g.fillRect(0,y,w,RH);
    if(black){
      g.fillStyle=act?ACT_B:BLACK;g.fillRect(0,y+.5,bw,RH-1);
      // 黒鍵の右側に、上下の白鍵の境目を引く
      g.fillStyle=WHITE_LINE;g.fillRect(bw,Math.round(y+RH/2),w-bw,1);
    }else{
      // E-F / B-C は黒鍵がないので、行の境目に線
      const pc=p%12;if(pc===0||pc===5){g.fillStyle=WHITE_LINE;g.fillRect(0,Math.round(y+RH)-1,w,1)}
    }
    if(showTxt&&!black){
      const pc=p%12;
      if(pc===0){g.fillStyle=LBL;g.textAlign='right';g.fillText('C'+(p/12-1),w-4,y+RH-4)}
      else if(cfg.labels==='all'){g.fillStyle='#5b6573';g.textAlign='right';g.fillText(NN[pc],w-4,y+RH-4)}
    }
  }
  g.restore();
  // 左上(ルーラー部分)
  g.fillStyle=css('--panel')||'#3b424a';g.fillRect(0,0,w,RULER);
  g.strokeStyle=css('--line')||'#14171a';g.beginPath();g.moveTo(0,RULER-.5);g.lineTo(w,RULER-.5);g.moveTo(w-.5,0);g.lineTo(w-.5,h);g.stroke();
  g.fillStyle=css('--mut')||'#8e99ab';g.font='10px system-ui,sans-serif';g.textAlign='left';g.fillText('KEYS',5,RULER-8);
  // 再生・試聴の光りが消える時刻に再描画
  if(lit.size&&!raf){let nx=Infinity;for(const t of lit.values())nx=Math.min(nx,t);if(isFinite(nx))setTimeout(()=>drawKeys(),Math.max(16,nx-performance.now()+16))}
}
const redrawSoon=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;drawKeys()})};

/* ---------- 表示の切り替え(VIEW が 'roll' のときだけ) ---------- */
function applyVisibility(){
  const on=VIEW==='roll'&&cfg.show;
  if(rc.classList.contains('pk-on')!==on)rc.classList.toggle('pk-on',on);
}

/* ---------- draw() に連動(スクロール・縦ズーム・トラック切替・再生で毎回更新) ---------- */
const _draw=draw;
draw=function(){const r=_draw.apply(this,arguments);try{applyVisibility();drawKeys()}catch(e){console.warn('piano keys',e)}return r};
if(window.ResizeObserver)new ResizeObserver(()=>redrawSoon()).observe(rollEl);
addEventListener('resize',redrawSoon);
rollEl.addEventListener('scroll',redrawSoon,{passive:true});

/* ---------- クリック / タッチで試聴 ---------- */
function pitchAt(e){
  const r=pk.getBoundingClientRect(),y=e.clientY-r.top;
  if(y<RULER)return -1;
  const p=HI-1-Math.floor((y-RULER+rollEl.scrollTop)/RH);
  return p>=LO&&p<HI?p:-1;
}
function press(p){
  const t=S.tracks[sel];if(!t)return;
  try{sfPreview(t,p,100,.6)}catch(e){console.warn('preview',e)}
  lit.set(p,performance.now()+450);drawKeys();
}
pk.addEventListener('pointerdown',e=>{
  if(e.button>0)return;const p=pitchAt(e);if(p<0)return;
  e.preventDefault();try{pk.setPointerCapture(e.pointerId)}catch(_){}
  pressed.set(e.pointerId,p);press(p);
});
pk.addEventListener('pointermove',e=>{
  if(!pressed.has(e.pointerId))return;const p=pitchAt(e);
  if(p>=0&&p!==pressed.get(e.pointerId)){pressed.set(e.pointerId,p);press(p)}
});
const rel=e=>{if(pressed.delete(e.pointerId))drawKeys()};
pk.addEventListener('pointerup',rel);pk.addEventListener('pointercancel',rel);pk.addEventListener('lostpointercapture',rel);
pk.addEventListener('contextmenu',e=>e.preventDefault());
pk.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;e.preventDefault();rollEl.scrollTop+=e.deltaY},{passive:false});

/* ---------- 親ウィンドウの再生状態(位置・再生中) ---------- */
if(typeof PIANO_EMBED!=='undefined'&&PIANO_EMBED){
  const OPEN=location.protocol==='file:'||location.origin==='null';
  addEventListener('message',e=>{
    if(e.source!==window.parent)return;
    if(!OPEN&&e.origin!==location.origin)return;
    const m=e.data;
    if(!m||typeof m!=='object'||m.ns!=='bgm-piano'||m.v!==1||m.type!=='transport')return;
    if(typeof m.beat!=='number'||!isFinite(m.beat))return;
    tr={playing:!!m.playing,beat:Math.max(0,Math.min(1e6,m.beat))};redrawSoon();
  });
}

/* ---------- Piano Roll ツールバーに操作を追加 ---------- */
const bar=document.getElementById('pianoTools');
if(bar){
  const box=document.createElement('span');box.className='pk-ctl';
  box.innerHTML='<span class="sep"></span>'+
   '<button type="button" id="pkToggle" class="ib lbl" aria-pressed="true" data-tip="ピアノ鍵盤の表示 / 非表示" aria-label="ピアノ鍵盤の表示 / 非表示"><span class="lb">鍵盤</span></button>'+
   '<span class="sl pk-opt">鍵盤幅</span><button type="button" id="pkWm" class="ib sq pk-opt" data-tip="鍵盤を細く" aria-label="鍵盤を細く"><svg class="ic" aria-hidden="true"><use href="#i-minus"/></svg></button>'+
   '<b id="pkWl" class="zv pk-opt"></b><button type="button" id="pkWp" class="ib sq pk-opt" data-tip="鍵盤を太く" aria-label="鍵盤を太く"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg></button>'+
   '<select id="pkLb" class="pk-opt" aria-label="鍵盤の音名表示" data-tip="鍵盤の音名表示" data-dd-search="0"><option value="all">音名: すべて</option><option value="c">音名: Cのみ</option><option value="off">音名: なし</option></select>';
  const anchor=document.getElementById('patAuto'); // やり直しボタンの隣(ツールバー左側)に置く
  if(anchor&&anchor.parentNode===bar)bar.insertBefore(box,anchor);else bar.appendChild(box);
  const $$=id=>document.getElementById(id);
  const sync=()=>{
    $$('pkToggle').classList.toggle('on',cfg.show);$$('pkToggle').setAttribute('aria-pressed',String(cfg.show));
    $$('pkWl').textContent=cfg.w+'px';$$('pkLb').value=cfg.labels;
    box.querySelectorAll('.pk-opt').forEach(el=>{el.style.display=cfg.show?'':'none'});
    $$('pkWm').disabled=cfg.w<=W_MIN;$$('pkWp').disabled=cfg.w>=W_MAX;
    applyVisibility();drawKeys();
  };
  $$('pkToggle').onclick=()=>{cfg.show=!cfg.show;save();sync();draw()};
  $$('pkWm').onclick=()=>{cfg.w=Math.max(W_MIN,cfg.w-W_STEP);save();sync();draw()};
  $$('pkWp').onclick=()=>{cfg.w=Math.min(W_MAX,cfg.w+W_STEP);save();sync();draw()};
  $$('pkLb').onchange=e=>{cfg.labels=e.target.value;save();sync()};
  sync();
}
applyVisibility();
window.PianoKeys={get cfg(){return Object.assign({},cfg)},redraw:drawKeys,press};
})();

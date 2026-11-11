"use strict";
/* ================= SF2 音色抽出・書き出し(画面) =================
   コアは sf2-extract.js(SF2X)。ここは「SF2を選ぶ → 音色にチェック → 名前を付けて書き出す」画面だけ。
   既存の仕組みを再利用: LIB(SF2ライブラリ) / libAud(試聴) / dl(ダウンロード) / libAddFiles(再読み込み) / libLog(ログ)
   ・元のSF2は読み取り専用(Blob.slice)。ここでも書き換えない
   ・書き出しは File System Access API(対応ブラウザ)で、ディスクへ直接ストリーム書き込み(大きくてもメモリを使わない)。非対応ならダウンロード */
(function(){
if(typeof SF2X==='undefined'||typeof LIB==='undefined'||typeof EMBED_AUTO==='undefined')return;
if(EMBED_AUTO||PIANO_EMBED)return; // オートメーション窓・ピアノロール窓では使わない(本体だけ)
const X={open:false,fid:null,st:null,pres:[],sel:new Set(),q:'',limit:300,plan:null,busy:false,ac:null,pT:0,tok:0,nameEdited:false,lastFile:null,lastName:''};
const STC=new WeakMap(); // sf(解析済みSF2) → 生構造(pdta)のキャッシュ
let root=null;const g=id=>document.getElementById(id),esc=t=>fsEsc(t);
const MBs=n=>n<1048576?Math.max(1,Math.round(n/1024))+'KB':MB(n);
const pad3=n=>String(n).padStart(3,'0');

function build(){
  root=document.createElement('div');root.id='sfxo';root.hidden=true;
  root.innerHTML=`<div class="xdlg" role="dialog" aria-modal="true" aria-labelledby="sfxTtl">
 <h2 id="sfxTtl">♪ SF2 音色の抽出・書き出し</h2>
 <label>元のSF2(読み込み済みのもの)<select id="sfxSrc" data-dd-search="0" aria-label="元のSF2"></select></label>
 <div class="sfx-tools"><input id="sfxQ" placeholder="音色名・番号で絞り込み(例: piano / 000:024)" autocomplete="off" spellcheck="false">
  <button id="sfxAll" title="絞り込み結果をすべて選択">表示中を全選択</button><button id="sfxNone" title="絞り込み結果の選択を解除">表示中を解除</button><button id="sfxClr">すべて解除</button></div>
 <div id="sfxList" class="sfx-list" role="group" aria-label="音色一覧"></div>
 <div id="sfxCnt" class="sfx-note"></div>
 <label>出力ファイル名<span class="xr"><input id="sfxName" maxlength="100" autocomplete="off" spellcheck="false"><span class="xext">.sf2</span></span></label>
 <div id="sfxInfo" class="sfx-info" role="status" aria-live="polite"></div>
 <label class="sfx-chk"><input type="checkbox" id="sfxReload" checked>書き出した後、SF2ライブラリへ読み込む(元のSF2とは別の項目として追加されます)</label>
 <div class="xbar" id="sfxBar" hidden><i></i></div>
 <div id="sfxMsg" class="sfx-msg" role="status" aria-live="polite"></div>
 <div class="xb"><button id="sfxLoad" hidden>書き出したSF2をライブラリへ読み込む</button><button id="sfxCancel">キャンセル</button><button id="sfxGo" class="pri">SF2形式で書き出す</button></div></div>`;
  document.body.appendChild(root);
  g('sfxSrc').onchange=e=>selectSource(e.target.value);
  g('sfxQ').oninput=e=>{X.q=e.target.value;X.limit=300;renderList()};
  g('sfxAll').onclick=()=>{for(const p of filtered())X.sel.add(p.idx);renderList();planSoon()};
  g('sfxNone').onclick=()=>{for(const p of filtered())X.sel.delete(p.idx);renderList();planSoon()};
  g('sfxClr').onclick=()=>{X.sel.clear();renderList();planSoon()};
  g('sfxName').oninput=()=>{X.nameEdited=true;planSoon()};
  g('sfxGo').onclick=doExport;g('sfxCancel').onclick=()=>{if(X.busy){X.ac&&X.ac.abort();setMsg('書き出しを中止しています…')}else close()};
  g('sfxLoad').onclick=()=>reloadLast();
  const L=g('sfxList');
  L.addEventListener('change',e=>{const t=e.target;if(t.dataset.i===undefined)return;const i=+t.dataset.i;t.checked?X.sel.add(i):X.sel.delete(i);planSoon()});
  L.addEventListener('click',e=>{const t=e.target;
    if(t.dataset.more){X.limit+=300;renderList();return}
    if(t.dataset.aud!==undefined){e.preventDefault();const p=X.pres.find(x=>x.idx===+t.dataset.aud);if(p&&typeof libAud==='function')libAud(X.fid,p.bank,p.preset)}});
  addEventListener('keydown',e=>{if(!X.open||e.key!=='Escape')return;if(typeof DD!=='undefined'&&DD.openNow&&DD.openNow())return;
    e.stopImmediatePropagation();e.preventDefault();if(X.busy){X.ac&&X.ac.abort()}else close()},true);
}
const setMsg=(m,cls)=>{const el=g('sfxMsg');el.textContent=m||'';el.className='sfx-msg'+(cls?' '+cls:'')};
function loadedFiles(){return libSorted().filter(f=>f.sf&&f.sf.alive!==false)}
function open(fid){
  if(!root)build();
  const fl=loadedFiles();
  if(!fl.length){alert('音色を抽出するには、先にSF2ライブラリでSF2を読み込んでください。\n(未読み込みのSF2は「読み込む」を押すと使えます)');return}
  X.open=true;X.lastFile=null;g('sfxLoad').hidden=true;setMsg('');g('sfxBar').hidden=true;
  const sel=fid&&fl.find(f=>f.id===fid)?fid:(fl.find(f=>f.id===LIB.selFile)||fl[0]).id;
  g('sfxSrc').innerHTML=fl.map(f=>'<option value="'+f.id+'">'+esc((f.dn||f.name)+' ('+MBs(f.size)+')')+'</option>').join('');
  g('sfxSrc').value=sel;root.hidden=false;document.body.classList.add('sfx-open');selectSource(sel,true)}
function close(){if(!root)return;X.open=false;root.hidden=true;document.body.classList.remove('sfx-open');X.st=null;X.pres=[];X.sel.clear();X.plan=null;X.tok++}
async function getStruct(f){let p=STC.get(f.sf);if(!p){p=SF2X.readStructure(f.sf.blob);STC.set(f.sf,p);p.catch(()=>STC.delete(f.sf))}return p}
async function selectSource(fid,keepName){
  const f=LIB.files.get(fid);if(!f||!f.sf)return;const tok=++X.tok;
  X.fid=fid;X.st=null;X.pres=[];X.sel.clear();X.plan=null;X.q='';g('sfxQ').value='';X.limit=300;
  if(!keepName||!X.nameEdited){X.nameEdited=false;g('sfxName').value=SF2X.safeName((f.dn||f.name).replace(/\.(sf2|sf3)$/i,'')+'_extract')}
  g('sfxList').innerHTML='<div class="sfx-empty">音色一覧を読み込み中…</div>';g('sfxInfo').textContent='';setMsg('');updGo();
  try{const st=await getStruct(f);if(tok!==X.tok)return;X.st=st;
    X.pres=SF2X.listPresets(st).sort((a,b)=>a.bank-b.bank||a.preset-b.preset||a.idx-b.idx);
    for(const w of st.warnings||[])setMsg(w,'warn')}
  catch(e){if(tok!==X.tok)return;g('sfxList').innerHTML='<div class="sfx-empty">このSF2の音色一覧を読み取れませんでした: '+esc(e.message||e)+'</div>';return}
  renderList();planNow()}
function filtered(){const toks=X.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(!toks.length)return X.pres;return X.pres.filter(p=>{const h=(pad3(p.bank)+':'+pad3(p.preset)+' '+p.name+' '+p.bank+':'+p.preset).toLowerCase();return toks.every(t=>h.includes(t))})}
function renderList(){
  const L=g('sfxList');if(!X.st){return}
  const fl=filtered(),shown=fl.slice(0,X.limit);
  L.innerHTML=shown.map(p=>'<label class="sfx-row"><input type="checkbox" data-i="'+p.idx+'"'+(X.sel.has(p.idx)?' checked':'')+'><span class="sfx-n"><b>'+esc(p.name||'(名前なし)')+'</b><small>'+pad3(p.bank)+':'+pad3(p.preset)+(p.bank===128?' · ドラム':'')+'</small></span><button type="button" data-aud="'+p.idx+'" title="試聴">▶</button></label>').join('')
    +(fl.length>shown.length?'<button type="button" class="sfx-more" data-more="1">さらに表示 (残り'+(fl.length-shown.length)+'件)</button>':'')
    +(!fl.length?'<div class="sfx-empty">該当する音色がありません。</div>':'');
  g('sfxCnt').textContent='全'+X.pres.length+'音色'+(X.q.trim()?' / 絞り込み '+fl.length+'件':'')+' / 選択中 '+X.sel.size+'件'}
const infoOpts=()=>{const f=LIB.files.get(X.fid),nm=SF2X.safeName(g('sfxName').value,'extracted');return{name:nm,comment:'Extracted by BGM-notpc from '+(f?(f.dn||f.name):'SF2')}};
function planSoon(){clearTimeout(X.pT);X.pT=setTimeout(planNow,90);g('sfxCnt').textContent=g('sfxCnt').textContent.replace(/選択中 \d+件/,'選択中 '+X.sel.size+'件')}
function planNow(){clearTimeout(X.pT);const info=g('sfxInfo');
  if(!X.st){info.textContent='';updGo();return}
  if(!X.sel.size){X.plan=null;info.innerHTML='選択した音色: <b>0</b> 音色 — 書き出す音色にチェックを入れてください';updGo();renderCnt();return}
  try{const pl=SF2X.plan(X.st,[...X.sel]);X.plan=pl;const f=LIB.files.get(X.fid),size=pl.presetCount?SF2X.totalSize(X.st,pl,infoOpts()):0,src=f?f.size:X.st.size;
    info.innerHTML='選択した音色: <b>'+pl.presetCount+'</b> 音色 ／ 収録Instrument <b>'+pl.instCount+'</b> ／ 収録サンプル <b>'+pl.sampleCount+'</b>(複数で共有 '+pl.sharedSamples+')'
      +'<br>推定ファイルサイズ: <b>'+MBs(size)+'</b>'+(src?'(元のSF2 '+MBs(src)+' の '+Math.max(0.01,size/src*100).toFixed(size/src>=.1?0:1)+'%)':'')
      +'<br><span class="sfx-sub">使わないInstrument・サンプルは収録しません。共有サンプルは1つだけ収録します。</span>'
      +(pl.warnings.length?'<br><span class="sfx-warn">⚠ '+pl.warnings.slice(0,4).map(esc).join('<br>⚠ ')+(pl.warnings.length>4?'<br>…ほか'+(pl.warnings.length-4)+'件':'')+'</span>':'')}
  catch(e){X.plan=null;info.innerHTML='<span class="sfx-warn">選択内容を解析できませんでした: '+esc(e.message||e)+'</span>'}
  updGo();renderCnt()}
function renderCnt(){const el=g('sfxCnt');if(el&&X.st)el.textContent=el.textContent.replace(/選択中 \d+件/,'選択中 '+X.sel.size+'件')}
function updGo(){const b=g('sfxGo');b.disabled=X.busy||!X.plan||!X.plan.presetCount||!SF2X.safeName(g('sfxName').value,'')}
function lock(on){X.busy=on;for(const id of['sfxSrc','sfxQ','sfxAll','sfxNone','sfxClr','sfxName','sfxReload','sfxLoad'])g(id).disabled=on;g('sfxList').classList.toggle('lock',on);g('sfxCancel').textContent=on?'書き出しを中止':'キャンセル';updGo()}
const bar=v=>{const b=g('sfxBar');b.hidden=v==null;if(v!=null)b.firstElementChild.style.width=Math.round(v*100)+'%'};

/* ---- 書き出し ---- */
async function doExport(){
  if(X.busy||!X.plan||!X.st)return;
  const f=LIB.files.get(X.fid);if(!f||!f.sf){setMsg('元のSF2が解放されています。もう一度読み込んでから実行してください','err');return}
  const o=infoOpts(),fname=o.name+'.sf2',pl=X.plan,st=X.st;
  // ※保存先ダイアログは、ボタンを押した直後(ユーザー操作の有効期間内)に出す
  let handle=null;
  if(typeof window.showSaveFilePicker==='function'){
    try{handle=await window.showSaveFilePicker({suggestedName:fname,types:[{description:'SoundFont 2',accept:{'application/octet-stream':['.sf2']}}]})}
    catch(e){if(e&&e.name==='AbortError'){setMsg('保存先の選択をキャンセルしました');return}handle=null}}
  X.ac=new AbortController();lock(true);setMsg('SF2を組み立てています…');bar(0);X.lastFile=null;g('sfxLoad').hidden=true;
  try{
    await new Promise(r=>setTimeout(r,0));
    const out=SF2X.build(st,pl,o);
    let file=null,saved='';
    if(handle){
      const w=await handle.createWritable();let n=0,t0=performance.now(),last=0;
      try{
        const counter=new TransformStream({transform(c,ctl){n+=c.byteLength;const now=performance.now();if(now-last>120){last=now;bar(n/out.size);setMsg('書き込み中… '+MBs(n)+' / '+MBs(out.size))}ctl.enqueue(c)}});
        await out.blob.stream().pipeThrough(counter).pipeTo(w,{signal:X.ac.signal})}
      catch(e){try{await w.abort()}catch(_){}throw e}
      file=await handle.getFile();saved=handle.name||fname}
    else{dl(fname,out.blob,'application/octet-stream');file=new File([out.blob],fname,{type:'application/octet-stream'});saved=fname}
    bar(1);
    // 書き出した内容の検査: サイズ + 再解析(構造が読めて、数が一致するか)
    if(file.size!==out.size)throw new Error('書き込まれたサイズが一致しません('+file.size+' ≠ '+out.size+')');
    const chk=await SF2X.readStructure(file);
    if(chk.n.phdr-1!==pl.presetCount||chk.n.inst-1!==pl.instCount||chk.n.shdr-1!==pl.sampleCount)throw new Error('書き出したSF2の再解析結果が一致しません');
    X.lastFile=file;X.lastName=saved;
    setMsg('書き出しました: '+saved+' — '+pl.presetCount+'音色 / '+pl.instCount+'Instrument / '+pl.sampleCount+'サンプル / '+MBs(out.size)+'(再解析で構造を確認済み)'+(handle?'':' ※ダウンロードフォルダに保存されます'),'ok');
    libLog('SF2を書き出しました: '+saved+' ('+pl.presetCount+'音色 / '+MBs(out.size)+')','ok');
    g('sfxLoad').hidden=false;
    if(g('sfxReload').checked){lock(false);await reloadLast(true)}
  }catch(e){
    if(e&&(e.name==='AbortError'||X.ac&&X.ac.signal.aborted)){setMsg('書き出しを中止しました(ファイルは作られていません)','warn')}
    else{console.warn('SF2 export',e);setMsg('書き出しに失敗しました: '+(e&&e.message||e),'err')}
    bar(null)}
  finally{X.ac=null;lock(false)}}
async function reloadLast(auto){
  const file=X.lastFile;if(!file)return;
  try{lock(true);setMsg((auto?'書き出し完了。':'')+'ライブラリへ読み込み中…');
    // 内容で同一性を判定(ライブラリ本体と同じ方式)。同じ内容がすでに読み込み済みなら追加しない
    const id=await sfFpBlob(file),had=LIB.files.get(id);
    if(had&&had.sf){setMsg('同じ内容のSF2「'+(had.dn||had.name)+'」がすでにライブラリに読み込まれているため、追加はしませんでした','warn');g('sfxLoad').hidden=true;return}
    await libAddFiles([file]);
    const ent=LIB.files.get(id);
    if(ent&&ent.sf){setMsg('書き出して「'+(ent.dn||ent.name)+'」をSF2ライブラリへ読み込みました('+ent.sf.presets.length+'プリセット)。ライブラリの音色一覧から試聴・設定できます','ok');g('sfxLoad').hidden=true}
    else setMsg('ライブラリへの読み込みに失敗しました。ライブラリのログを確認してください','err')}
  catch(e){setMsg('ライブラリへの読み込みに失敗しました: '+(e&&e.message||e),'err')}
  finally{lock(false)}}
window.SF2XUI={open,close,isOpen:()=>X.open};
const tb=g('sflExtract');if(tb)tb.onclick=()=>open(LIB.selFile);
})();

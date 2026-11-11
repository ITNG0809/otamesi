"use strict";
/* ================= SF2 音色抽出・書き出し(コア) =================
   読み込み済みSF2から、選んだプリセットだけを含む新しい SoundFont 2 (RIFF 'sfbk') を生成する。
   ・元のSF2は読み取るだけ(Blob.slice)。書き換えない
   ・サンプル本体はメモリに載せない: 元Blobのスライスを、そのまま新しいBlobの部品として連結(ブラウザがディスクから直接コピー)
   ・メモリを使うのは「曲データ(pdta)」だけ(選んだ分のレコードを作り直す)
   ・Preset → Instrument → Sample の参照番号(pbag/pgen/ibag/igen/shdr/sampleLink)はすべて作り直す
   ・Generator / Modulator は1バイトも変えずにコピー(参照番号 41=instrument, 53=sampleID だけ付け替え)
   ・サンプルは元の長さ+ループ位置(sample先頭からの相対位置)を保ち、各サンプルの後ろに仕様どおり46点のゼロを置く
   ・24bit拡張(sm24)がある元ファイルは、同じ範囲を sm24 にもコピーする
   このファイルは DOM に依存しない(Node.js でもテストできる)。 */
(function(root){
const U32MAX=4294967295;
const ZERO92=new Uint8Array(92); // 46点(16bit) = 92バイトのゼロ
const te=new TextEncoder();
const s4=(u,o)=>String.fromCharCode(u[o],u[o+1],u[o+2],u[o+3]);
const cstr=(u,o,n)=>{let s='';for(let i=0;i<n;i++){const c=u[o+i];if(!c)break;s+=String.fromCharCode(c)}return s};
const rdSlice=async(blob,o,n)=>{const e=Math.min(blob.size,o+n);return o>=e?new Uint8Array(0):new Uint8Array(await blob.slice(o,e).arrayBuffer())};

/* ---------- 1. 元SF2の「生の」構造を読む(サンプル本体は読まない) ---------- */
async function readStructure(blob){
  const L=blob.size;
  const head=await rdSlice(blob,0,12);
  if(L<12||s4(head,0)!=='RIFF'||s4(head,8)!=='sfbk')throw new Error('SoundFontファイルではありません');
  const st={blob,size:L,info:[],ifil:{major:2,minor:1},smplOff:-1,smplLen:0,sm24Off:-1,sm24Len:0,pd:null,dv:null,ch:{},warnings:[]};
  let o=12,havePdta=false;
  while(o+8<=L){
    const h=await rdSlice(blob,o,12),id=s4(h,0),sz=new DataView(h.buffer).getUint32(4,true);
    if(id==='LIST'&&o+12<=L){
      const ty=s4(h,8),end=Math.min(L,o+8+sz);
      if(ty==='INFO'){
        const u=await rdSlice(blob,o+12,Math.max(0,end-(o+12)));let p=0;const dv=new DataView(u.buffer);
        while(p+8<=u.length){const cid=s4(u,p),cs=dv.getUint32(p+4,true),d=u.slice(p+8,Math.min(u.length,p+8+cs));
          st.info.push({id:cid,data:d});if(cid==='ifil'&&d.length>=4){st.ifil={major:d[0]|(d[1]<<8),minor:d[2]|(d[3]<<8)}}
          p+=8+cs+(cs&1)}}
      else if(ty==='sdta'){let p=o+12;
        while(p+8<=end){const hh=await rdSlice(blob,p,8),cid=s4(hh,0),cs=new DataView(hh.buffer).getUint32(4,true),len=Math.max(0,Math.min(cs,end-(p+8)));
          if(cid==='smpl'){st.smplOff=p+8;st.smplLen=len}else if(cid==='sm24'){st.sm24Off=p+8;st.sm24Len=len}
          p+=8+cs+(cs&1)}}
      else if(ty==='pdta'){
        const u=await rdSlice(blob,o+12,Math.max(0,end-(o+12))),dv=new DataView(u.buffer);let p=0;
        while(p+8<=u.length){const cid=s4(u,p),cs=dv.getUint32(p+4,true);st.ch[cid]=[p+8,Math.min(cs,Math.max(0,u.length-(p+8)))];p+=8+cs+(cs&1)}
        st.pd=u;st.dv=dv;havePdta=true}}
    o+=8+sz+(sz&1)}
  if(st.ifil.major>=3)throw new Error('SF3(圧縮形式)は未対応です。SF2のみ抽出できます');
  if(st.smplOff<0)throw new Error('サンプルデータ(smpl)が見つかりません');
  if(!havePdta)throw new Error('プリセットデータ(pdta)が見つかりません');
  const sizes={phdr:38,pbag:4,pmod:10,pgen:4,inst:22,ibag:4,imod:10,igen:4,shdr:46};
  for(const k of ['phdr','pbag','pgen','inst','ibag','igen','shdr'])if(!st.ch[k])throw new Error('必要なデータ('+k+')がありません');
  st.n={};for(const k in sizes){const c=st.ch[k];st.n[k]=c?Math.floor(c[1]/sizes[k]):0}
  if(st.n.phdr<1||st.n.inst<1||st.n.shdr<1||st.n.pbag<1||st.n.ibag<1)throw new Error('SoundFontの構造が不正です(終端レコードがありません)');
  // 圧縮サンプル(SF3)の検出
  for(let i=0;i<st.n.shdr-1;i++)if(shType(st,i)&0x10)throw new Error('圧縮サンプル(SF3)は未対応です');
  return st}
/* レコードの読み取り(pdtaの生バイトから直接) */
const R16=(st,k,i,sz,off)=>st.dv.getUint16(st.ch[k][0]+i*sz+off,true);
const R32=(st,k,i,sz,off)=>st.dv.getUint32(st.ch[k][0]+i*sz+off,true);
const phBag=(st,i)=>R16(st,'phdr',i,38,24), phName=(st,i)=>cstr(st.pd,st.ch.phdr[0]+i*38,20);
const phPreset=(st,i)=>R16(st,'phdr',i,38,20), phBank=(st,i)=>R16(st,'phdr',i,38,22);
const pbGen=(st,i)=>R16(st,'pbag',i,4,0), pbMod=(st,i)=>R16(st,'pbag',i,4,2);
const ibGen=(st,i)=>R16(st,'ibag',i,4,0), ibMod=(st,i)=>R16(st,'ibag',i,4,2);
const inBag=(st,i)=>R16(st,'inst',i,22,20), inName=(st,i)=>cstr(st.pd,st.ch.inst[0]+i*22,20);
const pgOp=(st,i)=>R16(st,'pgen',i,4,0), pgAmt=(st,i)=>R16(st,'pgen',i,4,2);
const igOp=(st,i)=>R16(st,'igen',i,4,0), igAmt=(st,i)=>R16(st,'igen',i,4,2);
const shStart=(st,i)=>R32(st,'shdr',i,46,20), shEnd=(st,i)=>R32(st,'shdr',i,46,24), shSL=(st,i)=>R32(st,'shdr',i,46,28), shEL=(st,i)=>R32(st,'shdr',i,46,32);
const shLink=(st,i)=>R16(st,'shdr',i,46,42), shType=(st,i)=>R16(st,'shdr',i,46,44), shName=(st,i)=>cstr(st.pd,st.ch.shdr[0]+i*46,20);

/* プリセット一覧(phdrの並び順の番号 idx つき)。終端(EOP)は含まない */
function listPresets(st){const out=[];for(let i=0;i<st.n.phdr-1;i++)out.push({idx:i,name:phName(st,i),bank:phBank(st,i),preset:phPreset(st,i)});return out}

/* ---------- 2. 選んだプリセットから「何を収録するか」を決める ---------- */
function plan(st,idxs){
  const W=[],nPre=st.n.phdr-1,nInst=st.n.inst-1,nSamp=st.n.shdr-1;
  const sel=[...new Set(idxs)].filter(i=>Number.isInteger(i)&&i>=0&&i<nPre).sort((a,b)=>a-b);
  const nPgen=st.n.pgen,nIgen=st.n.igen,nPmod=st.n.pmod,nImod=st.n.imod;
  const sampleOK=new Map(); // 元サンプル番号 → 使えるか(結果をキャッシュ)
  const badSamp=new Set();
  const usable=i=>{let r=sampleOK.get(i);if(r!==undefined)return r;
    const t=shType(st,i),a=shStart(st,i),e=shEnd(st,i);r=true;
    if(t&0x8000){r=false;W.push('ROMサンプル「'+shName(st,i)+'」は収録できないため、それを使うゾーンを除外しました')}
    else if(e<a||e*2>st.smplLen||st.smplOff+e*2>st.size){r=false;W.push('サンプル「'+shName(st,i)+'」のデータが範囲外(破損)のため、それを使うゾーンを除外しました')}
    sampleOK.set(i,r);return r};
  // --- プリセットのゾーン ---
  const presets=[],instUsed=new Set();let linkedMods=0;
  for(const p of sel){
    const b0=phBag(st,p),b1=phBag(st,p+1),zones=[];
    if(b1<b0||b1>st.n.pbag-1){W.push('プリセット「'+phName(st,p)+'」のゾーン範囲が不正なため、空にしました');presets.push({p,zones});continue}
    for(let b=b0;b<b1;b++){
      const g0=pbGen(st,b),g1=pbGen(st,b+1),m0=pbMod(st,b),m1=pbMod(st,b+1);
      if(g1<g0||g1>nPgen||m1<m0||m1>nPmod){W.push('プリセット「'+phName(st,p)+'」のゾーン'+(b-b0)+'が不正なため除外しました');continue}
      let ok=true,has=false;const refs=[];
      for(let g=g0;g<g1;g++)if(pgOp(st,g)===41){has=true;const v=pgAmt(st,g);if(v>=nInst){ok=false;break}refs.push(v)}
      if(!ok){W.push('プリセット「'+phName(st,p)+'」のゾーン'+(b-b0)+'は存在しないInstrumentを指すため除外しました');continue}
      for(const v of refs)instUsed.add(v);
      for(let m=m0;m<m1;m++)if(st.dv.getUint16(st.ch.pmod[0]+m*10+2,true)&0x8000)linkedMods++;
      zones.push({g0,g1,m0,m1})}
    presets.push({p,zones})}
  // --- Instrument のゾーン ---
  const insts=[...instUsed].sort((a,b)=>a-b),instPlans=[],sampUsed=new Set();
  for(const i of insts){
    const b0=inBag(st,i),b1=inBag(st,i+1),zones=[];
    if(b1<b0||b1>st.n.ibag-1){W.push('Instrument「'+inName(st,i)+'」のゾーン範囲が不正なため、空にしました');instPlans.push({i,zones});continue}
    for(let b=b0;b<b1;b++){
      const g0=ibGen(st,b),g1=ibGen(st,b+1),m0=ibMod(st,b),m1=ibMod(st,b+1);
      if(g1<g0||g1>nIgen||m1<m0||m1>nImod){W.push('Instrument「'+inName(st,i)+'」のゾーン'+(b-b0)+'が不正なため除外しました');continue}
      let ok=true;const refs=[];
      for(let g=g0;g<g1;g++)if(igOp(st,g)===53){const v=igAmt(st,g);if(v>=nSamp||!usable(v)){ok=false;break}refs.push(v)}
      if(!ok){continue}
      for(const v of refs)sampUsed.add(v);
      for(let m=m0;m<m1;m++)if(st.dv.getUint16(st.ch.imod[0]+m*10+2,true)&0x8000)linkedMods++;
      zones.push({g0,g1,m0,m1})}
    instPlans.push({i,zones})}
  // --- ステレオ等の関連(sampleLink)の相手も収録する(参照番号を壊さないため) ---
  const stack=[...sampUsed];let linkAdded=0;
  while(stack.length){const s=stack.pop(),t=shType(st,s)&0x7fff;
    if(t===2||t===4||t===8){const l=shLink(st,s);
      if(l<nSamp&&!sampUsed.has(l)&&l!==s){if(usable(l)){sampUsed.add(l);stack.push(l);linkAdded++}else W.push('ステレオの相手サンプルを収録できないため「'+shName(st,s)+'」はモノラル扱いにしました')}}}
  const samps=[...sampUsed].sort((a,b)=>a-b);
  // --- 新しい番号 ---
  const instMap=new Map(insts.map((v,k)=>[v,k])),sampMap=new Map(samps.map((v,k)=>[v,k]));
  // --- 寸法 ---
  const cnt=(arr,f)=>arr.reduce((s,x)=>s+x.zones.reduce((a,z)=>a+f(z),0),0);
  const nPZ=cnt(presets,z=>1),nPG=cnt(presets,z=>z.g1-z.g0),nPM=cnt(presets,z=>z.m1-z.m0);
  const nIZ=cnt(instPlans,z=>1),nIG=cnt(instPlans,z=>z.g1-z.g0),nIM=cnt(instPlans,z=>z.m1-z.m0);
  let pts=0;const sampLay=[];
  for(const s of samps){const n=shEnd(st,s)-shStart(st,s);sampLay.push({s,n,at:pts});pts+=n+46}
  const use24=st.sm24Off>=0&&st.ifil.major===2;
  const smplBytes=pts*2,sm24Bytes=use24?pts+(pts&1):0;
  const pdtaChunks=[['phdr',(presets.length+1)*38],['pbag',(nPZ+1)*4],['pmod',(nPM+1)*10],['pgen',(nPG+1)*4],['inst',(insts.length+1)*22],['ibag',(nIZ+1)*4],['imod',(nIM+1)*10],['igen',(nIG+1)*4],['shdr',(samps.length+1)*46]];
  const pdtaBytes=4+pdtaChunks.reduce((s,c)=>s+8+c[1],0);
  const sdtaBytes=4+8+smplBytes+(use24?8+sm24Bytes:0);
  // 共有サンプル(2つ以上のInstrumentが参照)の数
  const refCount=new Map();for(const ip of instPlans){const seen=new Set();for(const z of ip.zones)for(let g=z.g0;g<z.g1;g++)if(igOp(st,g)===53){const v=igAmt(st,g);if(!seen.has(v)){seen.add(v);refCount.set(v,(refCount.get(v)||0)+1)}}}
  let shared=0;for(const c of refCount.values())if(c>1)shared++;
  if(linkedMods)W.push('リンク型Modulatorが'+linkedMods+'件あります(参照先は元のゾーン内の相対位置のまま保持します)');
  return {sel,presets,insts:instPlans,samps,sampLay,instMap,sampMap,nPZ,nPG,nPM,nIZ,nIG,nIM,pts,use24,smplBytes,sm24Bytes,pdtaChunks,pdtaBytes,sdtaBytes,
    presetCount:presets.length,instCount:insts.length,sampleCount:samps.length,sharedSamples:shared,linkAdded,warnings:W,
    srcPresets:nPre,srcInsts:nInst,srcSamples:nSamp}}

/* ---------- 3. INFO(メタ情報) ---------- */
const zs=(str,max)=>{let b=te.encode(String(str)).slice(0,max-1);const n=b.length+1,len=n+(n&1),u=new Uint8Array(len);u.set(b);return u}; // 0終端+偶数長
function buildInfo(st,pl,o){
  const keep=id=>st.info.find(x=>x.id===id);
  const chunks=[];const put=(id,data)=>chunks.push([id,data]);
  const minor=pl.use24?4:(st.ifil.major===2&&st.ifil.minor>=1?st.ifil.minor:1);
  put('ifil',new Uint8Array([2,0,minor&255,minor>>8]));
  const isng=keep('isng');put('isng',isng&&isng.data.length?pad2(isng.data):zs('EMU8000',256));
  put('INAM',zs(o.name||'Extracted',256));
  for(const x of st.info){ // 元の著作権・作者情報などは残す(ROM参照 irom/iver は無効なので捨てる)
    if(['ifil','isng','INAM','irom','iver','ISFT','ICMT'].includes(x.id))continue;put(x.id,pad2(x.data))}
  const old=keep('ICMT'),oc=old?cstr(old.data,0,old.data.length):'';
  put('ICMT',zs((oc?oc+' | ':'')+(o.comment||''),65536));
  put('ISFT',zs('BGM-notpc SF2 Extractor',256));
  let size=4;for(const[,d]of chunks)size+=8+d.length;
  return {chunks,size}}
const pad2=d=>{if(!(d.length&1))return d;const r=new Uint8Array(d.length+1);r.set(d);return r};
/* 実際のファイルサイズ(推定ではなく構造から正確に計算) */
function totalSize(st,pl,o){const inf=buildInfo(st,pl,o||{});
  // 'RIFF'(4)+size(4)+'sfbk'(4) + LIST(INFO) + LIST(sdta) + LIST(pdta)
  return 12+(8+inf.size)+(8+pl.sdtaBytes)+(8+pl.pdtaBytes)}

/* ---------- 4. 組み立て ---------- */
function build(st,pl,o){
  o=o||{};
  if(!pl.presetCount)throw new Error('音色が選択されていません');
  const inf=buildInfo(st,pl,o),total=totalSize(st,pl,o);
  if(total>U32MAX)throw new Error('書き出すSF2が4GBを超えるため、音色を減らしてください');
  const parts=[];
  // ---- 先頭: RIFF + INFO + sdta見出し + smpl見出し ----
  const hb=new Uint8Array(12+(8+inf.size)+12+8),hv=new DataView(hb.buffer);let q=0;
  const w4=s=>{for(let i=0;i<4;i++)hb[q+i]=s.charCodeAt(i);q+=4},wu32=v=>{hv.setUint32(q,v,true);q+=4};
  w4('RIFF');wu32(total-8);w4('sfbk');
  w4('LIST');wu32(inf.size);w4('INFO');for(const[id,d]of inf.chunks){w4(id);wu32(d.length);hb.set(d,q);q+=d.length}
  w4('LIST');wu32(pl.sdtaBytes);w4('sdta');w4('smpl');wu32(pl.smplBytes);
  parts.push(hb);
  // ---- smpl: サンプル本体(元Blobのスライスを連結。メモリには載せない) ----
  for(const L of pl.sampLay){const a=shStart(st,L.s);
    if(L.n>0)parts.push(st.blob.slice(st.smplOff+a*2,st.smplOff+(a+L.n)*2));
    parts.push(ZERO92)}
  // ---- sm24(24bit拡張の下位バイト): 元にある場合だけ ----
  if(pl.use24){const h2=new Uint8Array(8),v2=new DataView(h2.buffer);for(let i=0;i<4;i++)h2[i]='sm24'.charCodeAt(i);v2.setUint32(4,pl.sm24Bytes,true);parts.push(h2);
    const Z46=new Uint8Array(46);
    for(const L of pl.sampLay){const a=shStart(st,L.s),avail=Math.max(0,Math.min(L.n,st.sm24Len-a));
      if(avail>0)parts.push(st.blob.slice(st.sm24Off+a,st.sm24Off+a+avail));
      if(avail<L.n)parts.push(new Uint8Array(L.n-avail));
      parts.push(Z46)}
    if(pl.sm24Bytes&1)parts.push(new Uint8Array(1))}
  // ---- pdta ----
  const pd=new Uint8Array(8+pl.pdtaBytes),pv=new DataView(pd.buffer);let p=0;
  const pw4=s=>{for(let i=0;i<4;i++)pd[p+i]=s.charCodeAt(i);p+=4},pu32=v=>{pv.setUint32(p,v,true);p+=4},pu16=v=>{pv.setUint16(p,v,true);p+=2};
  pw4('LIST');pu32(pl.pdtaBytes);pw4('pdta');
  const sizeOf=Object.fromEntries(pl.pdtaChunks);
  const ch=id=>{pw4(id);pu32(sizeOf[id])};
  const rawName=(srcOff)=>{pd.set(st.pd.subarray(srcOff,srcOff+20),p);p+=20};
  const termName=n=>{for(let i=0;i<n.length;i++)pd[p+i]=n.charCodeAt(i);p+=20};
  // phdr
  ch('phdr');{let bag=0;for(const pr of pl.presets){const so=st.ch.phdr[0]+pr.p*38;rawName(so);
      pu16(phPreset(st,pr.p));pu16(phBank(st,pr.p));pu16(bag);pu32(R32(st,'phdr',pr.p,38,26));pu32(R32(st,'phdr',pr.p,38,30));pu32(R32(st,'phdr',pr.p,38,34));bag+=pr.zones.length}
    termName('EOP');pu16(0);pu16(0);pu16(bag);pu32(0);pu32(0);pu32(0)}
  // pbag
  ch('pbag');{let g=0,m=0;for(const pr of pl.presets)for(const z of pr.zones){pu16(g);pu16(m);g+=z.g1-z.g0;m+=z.m1-z.m0}pu16(g);pu16(m)}
  // pmod (10バイトを元のまま)
  ch('pmod');for(const pr of pl.presets)for(const z of pr.zones)for(let m=z.m0;m<z.m1;m++){const so=st.ch.pmod[0]+m*10;pd.set(st.pd.subarray(so,so+10),p);p+=10}
  p+=10; // 終端レコード(ゼロ)
  // pgen (instrument番号 41 だけ付け替え)
  ch('pgen');for(const pr of pl.presets)for(const z of pr.zones)for(let g=z.g0;g<z.g1;g++){const op=pgOp(st,g);pu16(op);pu16(op===41?pl.instMap.get(pgAmt(st,g)):pgAmt(st,g))}
  p+=4;
  // inst
  ch('inst');{let bag=0;for(const ip of pl.insts){rawName(st.ch.inst[0]+ip.i*22);pu16(bag);bag+=ip.zones.length}termName('EOI');pu16(bag)}
  // ibag
  ch('ibag');{let g=0,m=0;for(const ip of pl.insts)for(const z of ip.zones){pu16(g);pu16(m);g+=z.g1-z.g0;m+=z.m1-z.m0}pu16(g);pu16(m)}
  // imod
  ch('imod');for(const ip of pl.insts)for(const z of ip.zones)for(let m=z.m0;m<z.m1;m++){const so=st.ch.imod[0]+m*10;pd.set(st.pd.subarray(so,so+10),p);p+=10}
  p+=10;
  // igen (sampleID 53 だけ付け替え)
  ch('igen');for(const ip of pl.insts)for(const z of ip.zones)for(let g=z.g0;g<z.g1;g++){const op=igOp(st,g);pu16(op);pu16(op===53?pl.sampMap.get(igAmt(st,g)):igAmt(st,g))}
  p+=4;
  // shdr (サンプル位置・ループ位置・関連サンプル番号を再計算)
  ch('shdr');for(const L of pl.sampLay){const s=L.s,a=shStart(st,s),n=L.n,so=st.ch.shdr[0]+s*46;
    rawName(so);
    const rel=v=>Math.max(0,Math.min(n,v-a)); // サンプル先頭からの相対位置(範囲外は端に丸める)
    const sl=rel(shSL(st,s)),el=Math.max(sl,rel(shEL(st,s)));
    pu32(L.at);pu32(L.at+n);pu32(L.at+sl);pu32(L.at+el);
    pd.set(st.pd.subarray(so+36,so+42),p);p+=6; // sampleRate(4) + originalPitch(1) + pitchCorrection(1) はそのまま
    let t=shType(st,s),lk=shLink(st,s);const tt=t&0x7fff;
    if(tt===2||tt===4||tt===8){if(pl.sampMap.has(lk)&&lk!==s)lk=pl.sampMap.get(lk);else{lk=0;t=1}}else lk=0; // モノラルのlinkは使われない値なので0にする
    pu16(lk);pu16(t)}
  termName('EOS');p+=26;
  parts.push(pd);
  const blob=new Blob(parts,{type:'application/octet-stream'});
  if(blob.size!==total)throw new Error('内部エラー: 生成サイズが計算と一致しません ('+blob.size+' ≠ '+total+')');
  return {blob,size:total}}

/* ---------- 5. 補助 ---------- */
function safeName(n,fallback){n=String(n||'').replace(/\.(sf2)$/i,'').replace(/[\\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/^[\s.]+|[\s.]+$/g,'').slice(0,100);return n||fallback||'extracted'}
const api={readStructure,listPresets,plan,build,totalSize,safeName,
  names:{phName,inName,shName},
  _x:{shStart,shEnd,shSL,shEL,shLink,shType,phBag,pbGen,pbMod,ibGen,ibMod,inBag,pgOp,pgAmt,igOp,igAmt}};
root.SF2X=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

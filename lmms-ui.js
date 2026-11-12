/* LMMS-inspired desktop/window layer. Existing DAW engine and editor controls remain intact. */
(()=>{
  const __params=new URLSearchParams(location.search);
  if(__params.get('pianoEmbed')==='1'){document.documentElement.dataset.lmms='1';document.body.classList.add('piano-embed');return;}
  if(__params.get('autoEmbed')==='1'){document.documentElement.dataset.lmms='1';document.body.classList.add('automation-embed');return;}
  const $=s=>document.querySelector(s);
  const main=$('main'), browser=$('aside'), editor=$('#rc'), header=$('header');
  if(!main||!browser||!editor||!header)return;
  document.documentElement.dataset.lmms='1';
  window.__BGMAutoWindowed=true; // オートメーションは専用iframeで編集(親の表示は切り替えない)

  const menu=document.createElement('nav');
  menu.id='lmmsMenu';
  menu.innerHTML=`<div class="lmms-brand"><span class="lmms-logo">♫</span><span>BGM-notpc</span><small>STUDIO</small></div>
    <div class="lmms-menus"><button data-menu="project">ファイル</button><button data-menu="edit">編集</button><button data-menu="view">表示</button><button data-menu="tools">ツール</button><button data-menu="help">ヘルプ</button></div>
    <div class="lmms-menuright"><span class="lmms-led"></span><span>PROJECT</span><b id="lmmsProjectLabel">BGM</b></div>`;
  document.body.insertBefore(menu,header);
  const dropdown=document.createElement('div');dropdown.id='lmmsDropdown';dropdown.hidden=true;document.body.appendChild(dropdown);
  const menus={
    project:[['新規プロジェクト','lmms-new'],['プロジェクトを開く…','lmms-open'],['最近使ったプロジェクトを開く','lmms-open-recent'],['プロジェクトを保存','lmms-save'],['名前を付けて保存…','lmms-saveas'],['区切り','separator'],['音声を書き出す…','lmms-export-audio'],['MIDIを書き出す','mexp'],['MIDIを読み込む…','mimp']],
    edit:[['元に戻す','undo'],['やり直す','redo'],['全選択','sall'],['選択項目を削除','del']],
    view:[['Song Editor を開く','lmms-song-window'],['Piano Roll を開く','lmms-roll-window'],['選択トラックの音源設定','lmms-inst-window'],['Browser を表示 / 非表示','lmms-browser'],['Mixer を表示 / 非表示','lmms-mixer'],['編集ツールバー','lmms-toolbar'],['ベロシティレーン','lmms-velocity']],
    tools:[['SoundFont ライブラリ','sflB'],['自作エフェクト','fxs'],['MIDI 読み込み','mimp'],['MIDI 書き出し','mexp']],
    help:[['BGM-notpcについて','lmms-about']]
  };
  function runAction(id){
    if(id==='lmms-song-window'){openEditorView('song');return}
    if(id==='lmms-roll-window'){openEditorView('roll');return}
    if(id==='lmms-new'){document.getElementById('reset')?.click();return}
    if(id==='lmms-open'){window.BGMProjectIO?.open();return}
    if(id==='lmms-save'){window.BGMProjectIO?.save();return}
    if(id==='lmms-saveas'){window.BGMProjectIO?.saveAs();return}
    if(id==='lmms-open-recent'){window.BGMProjectIO?.openRecent();return}
    if(id==='lmms-export-audio'){window.BGMProjectIO?.exportAudio();return}
    if(id==='lmms-inst-window'){try{const tr=S.tracks[sel];if(tr&&window.BGMInst)window.BGMInst.open(tr.id)}catch(_){}return}
    if(id==='lmms-browser'){browser.classList.remove('hid');browser.classList.toggle('lmms-hidden');syncWindowButtons();return}
    if(id==='lmms-mixer'){const el=$('#mx');if(el)el.classList.toggle('hid');return}
    if(id==='lmms-toolbar'){document.querySelectorAll('.bar2').forEach(e=>e.classList.toggle('hid'));return}
    if(id==='lmms-velocity'){const el=$('#vlw');if(el)el.classList.toggle('hid');return}
    if(id==='lmms-about'){alert('BGM-notpc Studio\nブラウザで動く音楽制作ツール');return}
    if(id==='fxs'){window.BGMNotpcLMMSUI?.restoreEffects();return}
    if(id==='sflB'){window.BGMNotpcLMMSUI?.restoreSF2Library();return}
    const el=document.getElementById(id);if(el)el.click();
  }
  menu.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.menu,items=menus[key]||[];
    if(!dropdown.hidden&&dropdown.dataset.open===key){dropdown.hidden=true;return}
    dropdown.innerHTML='';dropdown.dataset.open=key;
    items.forEach(([label,id])=>{if(id==='separator'){const hr=document.createElement('div');hr.className='lmms-menu-separator';dropdown.appendChild(hr);return}const b=document.createElement('button');b.textContent=label;b.addEventListener('click',()=>{dropdown.hidden=true;runAction(id)});dropdown.appendChild(b)});
    const r=btn.getBoundingClientRect();dropdown.style.left=Math.max(8,Math.min(r.left,innerWidth-220))+'px';dropdown.style.top=(r.bottom+3)+'px';dropdown.hidden=false;
  }));
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!dropdown.contains(e.target))dropdown.hidden=true});

  function makeWindow(el,{id,title,subtitle,initial,closeAction}={}){
    el.classList.add('lmms-window');el.dataset.window=id;
    const bar=document.createElement('div');bar.className='lmms-titlebar';
    bar.innerHTML=`<span class="lmms-window-icon">${id==='browser'?'▤':'♫'}</span><strong>${title}</strong><small>${subtitle||''}</small><span class="lmms-window-spacer"></span><button class="lmms-winbtn lmms-min" title="最小化" aria-label="最小化">−</button><button class="lmms-winbtn lmms-max" title="最大化 / 元に戻す" aria-label="最大化 / 元に戻す">□</button><button class="lmms-winbtn lmms-close" title="閉じる" aria-label="閉じる">×</button>`;
    el.insertBefore(bar,el.firstChild);
    if(initial){el.style.left=initial.left;el.style.top=initial.top;el.style.width=initial.width;el.style.height=initial.height}
    let z=20,restore=null;
    const front=()=>{document.querySelectorAll('.lmms-window').forEach(w=>w.classList.remove('lmms-active'));el.classList.add('lmms-active');el.style.zIndex=String(++window.__lmmsZ||((window.__lmmsZ=30),30))};
    el.addEventListener('pointerdown',front);
    bar.addEventListener('pointerdown',e=>{
      if(e.target.closest('button'))return;
      if(el.classList.contains('lmms-maximized'))return;
      front();const sx=e.clientX,sy=e.clientY,rect=el.getBoundingClientRect();
      const parent=main.getBoundingClientRect();const ox=rect.left-parent.left,oy=rect.top-parent.top;
      bar.setPointerCapture(e.pointerId);bar.classList.add('dragging');
      const move=ev=>{el.style.left=Math.max(-el.offsetWidth+90,Math.min(parent.width-90,ox+ev.clientX-sx))+'px';el.style.top=Math.max(0,Math.min(parent.height-36,oy+ev.clientY-sy))+'px'};
      const end=()=>{bar.classList.remove('dragging');bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',end);bar.removeEventListener('pointercancel',end)};
      bar.addEventListener('pointermove',move);bar.addEventListener('pointerup',end);bar.addEventListener('pointercancel',end);e.preventDefault();
    });
    bar.querySelector('.lmms-min').onclick=()=>{el.classList.add('lmms-minimized');el.dataset.minimized='1';syncWindowButtons()};
    bar.querySelector('.lmms-max').onclick=()=>{
      if(el.classList.contains('lmms-maximized')){el.classList.remove('lmms-maximized');if(restore){el.style.left=restore.left;el.style.top=restore.top;el.style.width=restore.width;el.style.height=restore.height}}
      else{restore={left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height};el.classList.add('lmms-maximized');el.classList.remove('lmms-minimized')}
    };
    bar.querySelector('.lmms-close').onclick=()=>{if(closeAction)closeAction();else el.classList.add('lmms-hidden');syncWindowButtons()};
    return {el,bar,restore:()=>{el.classList.remove('lmms-hidden','lmms-minimized','hid');front();syncWindowButtons()}};
  }
  const browserWin=makeWindow(browser,{id:'browser',title:'Browser',subtitle:'MY SAMPLES / TRACKS',initial:{left:'8px',top:'8px',width:'246px',height:'calc(100% - 46px)'},closeAction:()=>browser.classList.add('lmms-hidden')});


  // Browser redesign: retain the original track/audio containers and their handlers.
  // Only add presentation controls around them; never replace the engine-owned DOM.
  const browserTitle=browser.querySelector('.lmms-titlebar');
  const browserActions=browser.querySelector('.aact');
  const trackList=browser.querySelector('#tl');
  const audioList=browser.querySelector('#atl');
  if(browserTitle&&browserActions&&trackList&&audioList){
    const browserTools=document.createElement('div');
    browserTools.className='lmms-browser-tools';
    browserTools.innerHTML=`
      <div class="lmms-browser-search"><span aria-hidden="true">⌕</span><input id="lmmsBrowserSearch" type="search" placeholder="Search tracks and audio…" aria-label="トラックと音声を検索"><button type="button" id="lmmsBrowserClear" title="検索をクリア">×</button></div>
      <div class="lmms-browser-tabs" role="tablist" aria-label="Browser category">
        <button type="button" class="active" data-browser-tab="all" role="tab" aria-selected="true">All</button>
        <button type="button" data-browser-tab="tracks" role="tab" aria-selected="false">Tracks</button>
        <button type="button" data-browser-tab="inst" role="tab" aria-selected="false">Inst</button>
        <button type="button" data-browser-tab="audio" role="tab" aria-selected="false">Audio</button>
      </div>`;
    browserActions.insertAdjacentElement('afterend',browserTools);
    const trackCaption=document.createElement('div');
    trackCaption.className='lmms-browser-section-title';
    trackCaption.innerHTML='<span class="lmms-browser-section-icon">♫</span><span>INSTRUMENT TRACKS</span><span class="lmms-browser-count" id="lmmsTrackCount">0</span>';
    trackList.insertAdjacentElement('beforebegin',trackCaption);
    const instList=browser.querySelector('#ibr');
    const instCaption=document.createElement('div');
    instCaption.className='lmms-browser-section-title lmms-inst-section-title';
    instCaption.innerHTML='<span class="lmms-browser-section-icon">♪</span><span>INSTRUMENTS</span>';
    if(instList)instList.insertAdjacentElement('beforebegin',instCaption);
    const audioCaption=document.createElement('div');
    audioCaption.className='lmms-browser-section-title lmms-audio-section-title';
    audioCaption.innerHTML='<span class="lmms-browser-section-icon">▧</span><span>AUDIO CLIPS</span><span class="lmms-browser-count" id="lmmsAudioCount">0</span>';
    audioList.insertAdjacentElement('beforebegin',audioCaption);
    let browserTab='all';
    const search=browserTools.querySelector('#lmmsBrowserSearch');
    const clear=browserTools.querySelector('#lmmsBrowserClear');
    function refreshBrowser(){
      const q=(search.value||'').trim().toLocaleLowerCase();
      const rows=(root)=>[...root.querySelectorAll('.trk')];
      const tracks=rows(trackList),audio=rows(audioList);
      tracks.forEach(row=>row.hidden=!!q&&!row.textContent.toLocaleLowerCase().includes(q));
      audio.forEach(row=>row.hidden=!!q&&!row.textContent.toLocaleLowerCase().includes(q));
      trackCaption.hidden=browserTab==='audio'||browserTab==='inst';
      trackList.hidden=browserTab==='audio'||browserTab==='inst';
      audioCaption.hidden=browserTab==='tracks'||browserTab==='inst';
      audioList.hidden=browserTab==='tracks'||browserTab==='inst';
      instCaption.hidden=browserTab==='audio'||browserTab==='tracks';
      if(instList){instList.hidden=browserTab==='audio'||browserTab==='tracks';instList.style.maxHeight=browserTab==='inst'?'none':'';instList.style.flex=browserTab==='inst'?'1 1 auto':''}
      if(browserTab==='tracks')trackList.style.flex='1 1 auto';
      else if(browserTab==='audio')audioList.style.flex='1 1 auto';
      else {trackList.style.flex='1 1 auto';audioList.style.flex='0 1 auto'}
      const tc=browser.querySelector('#lmmsTrackCount'),ac=browser.querySelector('#lmmsAudioCount');
      if(tc)tc.textContent=String(tracks.filter(x=>!x.hidden).length);
      if(ac)ac.textContent=String(audio.filter(x=>!x.hidden).length);
    }
    search.addEventListener('input',refreshBrowser);
    clear.addEventListener('click',()=>{search.value='';search.focus();refreshBrowser();search.dispatchEvent(new Event('input'))});
    browserTools.querySelectorAll('[data-browser-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      browserTab=btn.dataset.browserTab;
      browserTools.querySelectorAll('[data-browser-tab]').forEach(b=>{const on=b===btn;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
      refreshBrowser();
    }));
    // The original engine rebuilds rows after add/delete/rename. Observe only for counts/filtering.
    const browserObserver=new MutationObserver(refreshBrowser);
    browserObserver.observe(trackList,{childList:true,subtree:true});
    browserObserver.observe(audioList,{childList:true,subtree:true});
    refreshBrowser();
  }

  // Two real editor instances: the original editor engine stays live in Song Editor,
  // while a second full app instance runs the original Piano Roll input handlers in an iframe.
  const songWinEl=document.createElement('section');songWinEl.id='lmms-song-window';songWinEl.className='lmms-editor-host';main.appendChild(songWinEl);
  const rollWinEl=document.createElement('section');rollWinEl.id='lmms-roll-window';rollWinEl.className='lmms-editor-host';main.appendChild(rollWinEl);
  songWinEl.appendChild(editor);
  // 横スクロールバー(#hs)はソングエディターのウィンドウ内(下端)へ移す。ドラッグ/追従のロジックは script.js のまま共通
  {const hsEl=document.getElementById('hs');if(hsEl)editor.appendChild(hsEl);try{if(window.ResizeObserver&&hsEl)new ResizeObserver(()=>window.dispatchEvent(new Event('resize'))).observe(songWinEl)}catch(_){}}
  const rollFrame=document.createElement('iframe');rollFrame.id='lmms-piano-frame';rollFrame.title='Piano Roll editor';const rollUrl=new URL(location.href);rollUrl.searchParams.set('pianoEmbed','1');rollFrame.src=rollUrl.href;
  rollWinEl.appendChild(rollFrame);
  const autoWinEl=document.createElement('section');autoWinEl.id='lmms-auto-window';autoWinEl.className='lmms-editor-host';main.appendChild(autoWinEl);
  const autoFrame=document.createElement('iframe');autoFrame.id='lmms-auto-frame';autoFrame.title='Automation editor';const autoUrl=new URL(location.href);autoUrl.searchParams.set('autoEmbed','1');autoFrame.src=autoUrl.href;autoWinEl.appendChild(autoFrame);
  const songWin=makeWindow(songWinEl,{id:'song-editor',title:'Song Editor',subtitle:'ARRANGEMENT',initial:{left:'264px',top:'8px',width:'min(900px, calc(100% - 280px))',height:'calc(100% - 46px)'},closeAction:()=>songWinEl.classList.add('lmms-hidden')});
  const songBar=$('#sgbar'),autoBar=$('#abar');if(songBar){const openAutoBtn=document.createElement('button');openAutoBtn.id='sgOpenAutomation';openAutoBtn.textContent='オートメーションを開く ↗';openAutoBtn.title='オートメーションを独立ウィンドウで開く';openAutoBtn.addEventListener('click',()=>openAutomationWindow());songBar.appendChild(openAutoBtn);songWinEl.insertBefore(songBar,editor)}
  const rollWin=makeWindow(rollWinEl,{id:'piano-roll',title:'Piano Roll',subtitle:'NOTE EDITOR',initial:{left:'310px',top:'42px',width:'min(1000px, calc(100% - 330px))',height:'min(760px, calc(100% - 80px))'},closeAction:()=>rollWinEl.classList.add('lmms-hidden')});
  const autoWin=makeWindow(autoWinEl,{id:'automation-editor',title:'Automation Editor',subtitle:'CONTROL CURVES',initial:{left:'340px',top:'70px',width:'min(1050px, calc(100% - 360px))',height:'min(700px, calc(100% - 110px))'},closeAction:()=>autoWinEl.classList.add('lmms-hidden')});
  // Keep the existing SF2 library and custom-effect DOM/handlers intact; only host them in movable windows.
  const sf2WinEl=$('#sfl'),fxWinEl=$('#fxs');
  if(sf2WinEl)main.appendChild(sf2WinEl);
  if(fxWinEl)main.appendChild(fxWinEl);
  const sf2Win=sf2WinEl?makeWindow(sf2WinEl,{id:'sf2-library',title:'SF2 Library',subtitle:'SOUNDFONTS',initial:{left:innerWidth<=760?'8px':'180px',top:innerWidth<=760?'8px':'70px',width:'min(980px, calc(100% - 200px))',height:'min(720px, calc(100% - 100px))'},closeAction:()=>{sf2WinEl.hidden=true;document.body.classList.remove('fxopen');syncWindowButtons()}}):null;
  const fxWin=fxWinEl?makeWindow(fxWinEl,{id:'custom-effects',title:'Custom Effects',subtitle:'NODE WORKSPACE',initial:{left:innerWidth<=760?'8px':'220px',top:innerWidth<=760?'8px':'44px',width:'min(1100px, calc(100% - 240px))',height:'min(780px, calc(100% - 80px))'},closeAction:()=>{window.BGMNotpcCloseEffects?.();fxWinEl.hidden=true;document.body.classList.remove('fxopen');syncWindowButtons()}}):null;
  /* ---- オートメーション専用ウィンドウ ⇄ 親画面のメッセージ連携(送信側・受信側とも検証) ---- */
  const AUTO_NS='bgm-auto',AUTO_OPEN=location.protocol==='file:'||location.origin==='null',AUTO_TARGET=AUTO_OPEN?'*':location.origin;
  let autoReady=false,lastTransport='';
  const postAuto=(type,extra)=>{try{autoFrame.contentWindow&&autoFrame.contentWindow.postMessage(Object.assign({ns:AUTO_NS,v:1,type},extra||{}),AUTO_TARGET)}catch(_){}};
  const pushAutoSelection=()=>{const s=window.__BGMGetAutoSelection?.();postAuto('select',s?{qid:s.qid,aid:s.aid}:{qid:null,aid:null})};
  window.__BGMOnAutoSelection=()=>pushAutoSelection();
  window.__BGMOnProjectPost=(data,seq,sender)=>{if(autoReady)postAuto('project',{data,seq,sender})};
  const AUTO_CMDS=new Set(['undo','redo','toggle-play','stop','rewind']);
  addEventListener('message',e=>{
    if(e.source!==autoFrame.contentWindow)return;
    if(!AUTO_OPEN&&e.origin!==location.origin)return;
    const m=e.data,api=window.__BGMAutoApi;
    if(!m||typeof m!=='object'||m.ns!==AUTO_NS||m.v!==1||typeof m.type!=='string'||!api)return;
    switch(m.type){
      case 'ready':autoReady=true;lastTransport='';api.flush();pushAutoSelection();break;
      case 'need-sync':api.flush();pushAutoSelection();break;
      case 'project':api.applyShared(m.data,m.sender,m.seq);break;
      case 'pick':api.pickClip(m.qid);break;
      case 'undo-push':api.undoPush(m.snap);break;
      case 'seek':if(typeof m.beat==='number'&&isFinite(m.beat))api.seek(m.beat);break;
      case 'cmd':if(typeof m.cmd==='string'&&AUTO_CMDS.has(m.cmd))api.command(m.cmd);break;
    }
  });
  // 再生位置・再生状態をiframeへ配信(ウィンドウが見えている間だけ、変化があったときのみ)
  (function tick(){requestAnimationFrame(tick);
    if(!autoReady||autoWinEl.classList.contains('lmms-hidden')||autoWinEl.classList.contains('lmms-minimized'))return;
    const t=window.__BGMAutoApi?.getTransport();if(!t)return;const k=(t.playing?1:0)+'|'+t.beat.toFixed(4);
    if(k===lastTransport)return;lastTransport=k;postAuto('transport',{playing:t.playing,beat:t.beat})})();
  // Piano Roll 窓へ再生状態(位置・再生中)を配信: 鍵盤の「再生中の音符を光らせる」用。窓が見えている間だけ、変化があったときのみ
  let lastPianoTr='';
  (function tickPiano(){requestAnimationFrame(tickPiano);
    if(rollWinEl.classList.contains('lmms-hidden')||rollWinEl.classList.contains('lmms-minimized'))return;
    const t=window.__BGMAutoApi?.getTransport();if(!t)return;const k=(t.playing?1:0)+'|'+t.beat.toFixed(4);
    if(k===lastPianoTr)return;lastPianoTr=k;
    try{rollFrame.contentWindow&&rollFrame.contentWindow.postMessage({ns:'bgm-piano',v:1,type:'transport',playing:t.playing,beat:t.beat},AUTO_TARGET)}catch(_){}})();
  function openAutomationWindow(){autoWin.restore();lastTransport='';pushAutoSelection();syncWindowButtons()}
  function openEditorView(view){
    if(view==='song'){
      ensureSong();
      songWin.restore();
    }else{
      rollWin.restore();
      try{rollFrame.contentWindow?.postMessage({type:'bgm-focus-roll'},location.origin)}catch(_){}
    }
    syncWindowButtons();
  }
  const task=document.createElement('div');task.id='lmmsTaskbar';task.innerHTML=`<button data-restore="browser">▤ My Samples</button><button data-restore="song">♫ Song Editor</button><button data-restore="roll">♫ Piano Roll</button><button data-restore="automation">⌁ Automation</button><button data-restore="sf2">♫ SF2 Library</button><button data-restore="effects">◇ Custom FX</button><button data-restore="mixer">▥ FX Mixer</button><span class="lmms-task-spacer"></span>`;main.appendChild(task);
  task.querySelector('[data-restore="browser"]').onclick=()=>browserWin.restore();
  task.querySelector('[data-restore="song"]').onclick=()=>openEditorView('song');
  task.querySelector('[data-restore="roll"]').onclick=()=>openEditorView('roll');
  task.querySelector('[data-restore="automation"]').onclick=()=>openAutomationWindow();
  task.querySelector('[data-restore="sf2"]').onclick=()=>sf2Win?.restore();
  task.querySelector('[data-restore="effects"]').onclick=()=>fxWin?.restore();
  task.querySelector('[data-restore="mixer"]').onclick=()=>{const mx=$('#mx');if(mx){mx.classList.remove('hid');mx.scrollIntoView({block:'nearest'})}};
  function syncWindowButtons(){
    task.querySelector('[data-restore="automation"]')?.classList.toggle('active',!autoWinEl.classList.contains('lmms-hidden')&&!autoWinEl.classList.contains('lmms-minimized'));
    task.querySelector('[data-restore="browser"]')?.classList.toggle('active',!browser.classList.contains('lmms-hidden')&&!browser.classList.contains('lmms-minimized'));
    task.querySelector('[data-restore="song"]')?.classList.toggle('active',!songWinEl.classList.contains('lmms-hidden')&&!songWinEl.classList.contains('lmms-minimized'));
    task.querySelector('[data-restore="roll"]')?.classList.toggle('active',!rollWinEl.classList.contains('lmms-hidden')&&!rollWinEl.classList.contains('lmms-minimized'));
    task.querySelector('[data-restore="sf2"]')?.classList.toggle('active',!!sf2WinEl&&!sf2WinEl.hidden&&!sf2WinEl.classList.contains('lmms-minimized'));
    task.querySelector('[data-restore="effects"]')?.classList.toggle('active',!!fxWinEl&&!fxWinEl.hidden&&!fxWinEl.classList.contains('lmms-minimized'));
  }
  // Keep the parent instance on the arrangement view; the Piano Roll iframe owns its own live canvas.
  const ensureSong=()=>{if(window.__BGMGetView?.()!=='song')window.__BGMShowSong?.()};
  ensureSong();
  window.__BGMOnViewChanged=v=>{if(v==='roll'){setTimeout(()=>{openEditorView('roll');ensureSong()},0)}else if(v==='auto'){setTimeout(()=>{openAutomationWindow(window.__BGMGetAutoSelection?.());ensureSong()},0)}};
  const trBtn=document.querySelector('#dock [data-pn="tr"]');if(trBtn)trBtn.addEventListener('click',()=>{browser.classList.toggle('lmms-hidden',browser.classList.contains('hid'));syncWindowButtons()});
  addEventListener('resize',()=>{const r=main.getBoundingClientRect();[browser,songWinEl,rollWinEl,autoWinEl,sf2WinEl,fxWinEl].filter(Boolean).forEach(el=>{if(el.classList.contains('lmms-maximized'))return;const left=parseFloat(el.style.left)||0,top=parseFloat(el.style.top)||0;if(left>r.width-90)el.style.left=Math.max(0,r.width-220)+'px';if(top>r.height-40)el.style.top=Math.max(0,r.height-120)+'px'});});
  window.BGMNotpcLMMSUI={makeWindow,restoreBrowser:browserWin.restore,restoreSongEditor:()=>openEditorView('song'),restorePianoRoll:()=>openEditorView('roll'),restoreAutomation:()=>openAutomationWindow(),restoreSF2Library:()=>{if(sf2Win){sf2Win.restore();sf2WinEl.hidden=false;syncWindowButtons()}},restoreEffects:()=>{if(fxWin){fxWin.restore();fxWinEl.hidden=false;syncWindowButtons()}},syncWindowButtons,openSongEditor:()=>openEditorView('song'),openPianoRoll:()=>openEditorView('roll')};
  const name=$('#projectName');const label=$('#lmmsProjectLabel');const syncName=()=>{if(label)label.textContent=(name?.value||'BGM').slice(0,28)};name?.addEventListener('input',syncName);syncName();
})();

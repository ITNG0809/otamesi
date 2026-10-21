/* LMMS-inspired desktop/window layer. Existing DAW engine and editor controls remain intact. */
(()=>{
  const $=s=>document.querySelector(s);
  const main=$('main'), browser=$('aside'), editor=$('#rc'), header=$('header');
  if(!main||!browser||!editor||!header)return;
  document.documentElement.dataset.lmms='1';

  const menu=document.createElement('nav');
  menu.id='lmmsMenu';
  menu.innerHTML=`<div class="lmms-brand"><span class="lmms-logo">♫</span><span>BGM-notpc</span><small>STUDIO</small></div>
    <div class="lmms-menus"><button data-menu="project">ファイル</button><button data-menu="edit">編集</button><button data-menu="view">表示</button><button data-menu="tools">ツール</button><button data-menu="help">ヘルプ</button></div>
    <div class="lmms-menuright"><span class="lmms-led"></span><span>PROJECT</span><b id="lmmsProjectLabel">BGM</b></div>`;
  document.body.insertBefore(menu,header);
  const dropdown=document.createElement('div');dropdown.id='lmmsDropdown';dropdown.hidden=true;document.body.appendChild(dropdown);
  const menus={
    project:[['新規プロジェクト','lmms-new'],['プロジェクトを開く…','lmms-open'],['プロジェクトを保存','lmms-save'],['名前を付けて保存…','lmms-saveas'],['ブラウザ内に保存','lmms-browser-save'],['区切り','separator'],['音声を書き出す…','lmms-export-audio'],['MIDIを書き出す','mexp'],['MIDIを読み込む…','mimp']],
    edit:[['元に戻す','undo'],['やり直す','redo'],['全選択','sall'],['選択項目を削除','del']],
    view:[['Song Editor','vSong'],['Piano Roll','vRoll'],['Browser を表示 / 非表示','lmms-browser'],['Mixer を表示 / 非表示','lmms-mixer'],['編集ツールバー','lmms-toolbar'],['ベロシティレーン','lmms-velocity']],
    tools:[['SoundFont ライブラリ','sflB'],['自作エフェクト','fxs'],['MIDI 読み込み','mimp'],['MIDI 書き出し','mexp']],
    help:[['BGM-notpcについて','lmms-about']]
  };
  function runAction(id){
    if(id==='lmms-new'){document.getElementById('reset')?.click();return}
    if(id==='lmms-open'){window.BGMProjectIO?.open();return}
    if(id==='lmms-save'){window.BGMProjectIO?.save();return}
    if(id==='lmms-saveas'){window.BGMProjectIO?.saveAs();return}
    if(id==='lmms-browser-save'){window.BGMProjectIO?.saveBrowser();return}
    if(id==='lmms-export-audio'){window.BGMProjectIO?.exportAudio();return}
    if(id==='lmms-browser'){browser.classList.remove('hid');browser.classList.toggle('lmms-hidden');syncWindowButtons();return}
    if(id==='lmms-mixer'){const el=$('#mx');if(el)el.classList.toggle('hid');return}
    if(id==='lmms-toolbar'){document.querySelectorAll('.bar2').forEach(e=>e.classList.toggle('hid'));return}
    if(id==='lmms-velocity'){const el=$('#vlw');if(el)el.classList.toggle('hid');return}
    if(id==='lmms-about'){alert('BGM-notpc Studio\nブラウザで動く音楽制作ツール');return}
    if(id==='fxs'){const el=$('#fxs');if(el)el.hidden=false;return}
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
  const browserWin=makeWindow(browser,{id:'browser',title:'My Samples',subtitle:'BROWSER',initial:{left:'8px',top:'8px',width:'246px',height:'calc(100% - 46px)'},closeAction:()=>browser.classList.add('lmms-hidden')});
  const editorWin=makeWindow(editor,{id:'editor',title:'Piano Roll / Song Editor',subtitle:'ARRANGEMENT',initial:{left:'264px',top:'8px',width:'calc(100% - 272px)',height:'calc(100% - 46px)'},closeAction:()=>editor.classList.add('lmms-hidden')});
  // Browser title changes with the active editing view; the underlying editor remains the same functional component.
  const refreshTitle=()=>{const song=$('#vSong')?.classList.contains('on');editorWin.bar.querySelector('strong').textContent=song?'Song Editor':'Piano Roll';editorWin.bar.querySelector('small').textContent=song?'ARRANGEMENT':'NOTE EDITOR'};
  $('#vSong')?.addEventListener('click',()=>setTimeout(refreshTitle,0));$('#vRoll')?.addEventListener('click',()=>setTimeout(refreshTitle,0));refreshTitle();

  const task=document.createElement('div');task.id='lmmsTaskbar';task.innerHTML=`<span class="lmms-task-label">WINDOWS</span><button data-restore="browser">▤ Browser</button><button data-restore="editor">♫ Editor</button><button data-restore="mixer">▥ Mixer</button><span class="lmms-task-spacer"></span><span class="lmms-task-status"><i></i> AUDIO ENGINE READY</span>`;main.appendChild(task);
  task.querySelector('[data-restore="browser"]').onclick=()=>browserWin.restore();task.querySelector('[data-restore="editor"]').onclick=()=>editorWin.restore();task.querySelector('[data-restore="mixer"]').onclick=()=>{const mx=$('#mx');if(mx){mx.classList.remove('hid');mx.scrollIntoView({block:'nearest'})}};
  function syncWindowButtons(){task.querySelector('[data-restore="browser"]').classList.toggle('active',!browser.classList.contains('lmms-hidden')&&!browser.classList.contains('lmms-minimized'));task.querySelector('[data-restore="editor"]').classList.toggle('active',!editor.classList.contains('lmms-hidden')&&!editor.classList.contains('lmms-minimized'))}
  task.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',syncWindowButtons));
  const name=$('#projectName');const label=$('#lmmsProjectLabel');const syncName=()=>{if(label)label.textContent=(name?.value||'BGM').slice(0,28)};name?.addEventListener('input',syncName);syncName();
  // Existing panel dock can still control the browser panel, but its window is not destroyed.
  const trBtn=document.querySelector('#dock [data-pn="tr"]');if(trBtn)trBtn.addEventListener('click',()=>{browser.classList.toggle('lmms-hidden',browser.classList.contains('hid'));syncWindowButtons()});
  // Keep the desktop useful after viewport changes and preserve the MDI-style floating layout.
  addEventListener('resize',()=>{const r=main.getBoundingClientRect();[browser,editor].forEach(el=>{if(el.classList.contains('lmms-maximized'))return;const left=parseFloat(el.style.left)||0,top=parseFloat(el.style.top)||0;if(left>r.width-90)el.style.left=Math.max(0,r.width-220)+'px';if(top>r.height-40)el.style.top=Math.max(0,r.height-120)+'px'})});
  // expose only for basic diagnostics
  window.BGMNotpcLMMSUI={restoreBrowser:browserWin.restore,restoreEditor:editorWin.restore};
})();

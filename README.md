# BGM-notpc Studio — LMMS-inspired UI

Static HTML/CSS/JavaScript music workstation. Open `index.html` in a modern browser or publish the folder as a static site.

## UI updates in this build
- Keeps the existing song editor, piano roll, audio lanes, MIDI/SF2 workflows, effects, and project actions.
- Song Editor shows horizontal arrangement lanes per track with the track name and a pink SF2-style instrument tile.
- SF2 load/library controls use matching pink SF2 badges.
- LMMS-inspired top menu and toolbar layout remain above the editor.
- Project save/open and audio export menu actions are included where supported by the current browser and application code.

This is an LMMS-inspired interface, not a native LMMS project format implementation.

## LMMS-style separate editor windows

- Song Editor and Piano Roll have separate movable/resizable floating windows.
- Both views remain visible: the active editor is live and the other view is rendered as a refreshed preview.
- Tap/click the preview to activate that editor; pointer input is forwarded to the live editing surface. This reuses the existing single editor engine to preserve project data, playback, undo/redo, and save/load behavior.
- On smaller screens, the windows may overlap; use the title bars or taskbar buttons to bring the desired window forward.


## 独立した Song Editor / Piano Roll

LMMS風の Song Editor と Piano Roll は、それぞれ別のフローティングウィンドウで動作します。Piano Roll は元の `script.js` のキャンバスとポインター操作処理を、独立したアプリインスタンス内で使用するため、プレビュー上の疑似ドラッグ転送には依存しません。両画面は同一オリジンの `BroadcastChannel` でプロジェクト内容を同期します（通常は GitHub Pages / localhost など HTTP(S) で利用してください）。

### オートメーション 追加機能 (第2弾)
- **ピッチのリアルタイム化**: トラックごとのピッチバス(ConstantSource)を全ボイスの detune に接続。発音中の音にも曲線が効き、再生中の編集は約40msで反映。ブロック/パターン再生中にも有効。
- **ツール**: 選択 / 追加 / 削除 / 直線 / 自由描画(軌跡をRDPで間引き)。現在のツールはバーに表示。
- **量子化**: なし / 1小節 / 1/1〜1/32拍 / 三連(1/3・1/6・1/12拍)。スナップON/OFF。
- **ガイド**: マウス位置の時間(小節・拍・tick)と値、選択点の時刻と値、パラメータの範囲と単位、再生位置追従、全体表示、再生位置へ/選択へ移動。
- **補間**: クリップ全体 + 制御点ごとの区間指定(ステップ/線形/滑らか)。同時刻の点は後の点が優先、順序逆転は自動で整列。
- **LFO**: サイン/三角/矩形/ノコギリ、拍同期またはHz、振幅・オフセット・位相。クリップ種別「LFO」で作成(ソング上のクリップ種類セレクト、またはつまみの右クリック)。
- **クリップ**: Shift/Ctrl+クリックで複数選択、一括移動、Ctrl+C/X/V(貼り付けは独立コピーで重なりは別行へ)、開始〜終了位置を表示。
- **音源パラメータ**: SF2以外のトラックのフィルターカットオフ(対数スケール)に対応。

### オートメーション専用ウィンドウ (第1弾の改修)
- オートメーションウィンドウはオートメーション専用です(Song Editor / Piano Roll は表示されません)。
- クリップ未選択時は「オートメーションが選択されていません」の案内画面を表示し、クリップを選択すると編集画面に切り替わります。選択解除で案内画面へ戻ります。
- 親画面(lmms-ui.js)とiframeは `postMessage` で連携します(名前空間 `bgm-auto`、`origin` と `source` を両側で検証):
  - 親→iframe: `select`(選択中クリップ `qid`/`aid` または null)、`transport`(再生位置・再生状態)
  - iframe→親: `ready` / `need-sync` / `undo-push` / `seek` / `cmd`(undo, redo, toggle-play, stop, rewind のみ許可)
- 再生・Undo/Redo・シークは親の単一エンジン/履歴に委譲します(iframe側は独自に音を出しません)。
- ショートカット(オートメーション編集中): S 選択 / D 追加 / E 削除 / L 直線 / F 自由描画、矢印キーで選択点を移動(Shiftで値を粗く)。
- `file://` で直接開いた場合も動作するよう、プロジェクト同期は `BroadcastChannel` と `postMessage` の両方で行います(`file://` では `origin` が不透明になるため、`source` 検証のみで受信)。
- 未選択画面には既存クリップの一覧を表示し、クリックで選択できます(Song Editor がウィンドウに隠れていても選べます)。

### 配色 (LMMS 現行デフォルトテーマ準拠)
- 窓背景 `#3b424a` / 基調 `#262b30` / 文字 `#d1d8e4` / ハイライト `#17793b` / 緑 `#0bd556`・`#078f3a` / ホバー `#3c444e` / クリップ背景 `#373d48`。
- LMMS表示時は常にダーク配色です(OSのライト設定でも変わりません)。色のみの変更で、機能は変更していません。

### オートメーション LMMS 1.2.2 外観の再現 (第1弾・最新版対応)
- 外観: グラフ背景 `#222423`、曲線下の半透明紫塗りつぶし、紫の制御点(選択中は白)、LMMS風グリッド(小節=明るい紫 / 拍=紫 / 量子化=灰、横は点線)、ルーラー、再生位置の細い縦線、ダークなツールバー。緑テーマは使用しません(`style.css` 末尾の `body.automation-embed` ブロック)。
- 塗りつぶし: `autoVal()`(再生と同じ関数)で曲線を標本化し、同じ点列から塗りと線を描画。ステップは段差を垂直に描画。
- Tension: 既存の `a.smooth`(Hermite接線の係数, 0〜1, 既定1)をつまみ(`#tnKnob`)で操作。ドラッグ / ホイール / 矢印キー、ダブルクリックで1。滑らか(Hermite)以外では無効表示。変更はUndo対象。
- 補間方式: ステップ / 線形 / Hermite のアイコンボタン(実体は既存の `#aint`)。
- 描画は `requestAnimationFrame` で1フレームにまとめます。

## UI修正・機能追加 (今回)
- 上部ツールバーの「ソング / ピアノロール」切り替えボタンを削除(各エディターはタスクバー・メニューから開く)。
- Song Editor: ウィンドウのタイトルバー → 操作ツールバー → 編集領域 の順に修正(CSSの `order:-1` が原因)。
- Song Editor: 横スクロールバー(`#hs`)をウィンドウ内の下端へ移動。幅は編集領域に一致(トラックヘッダー幅・縦スクロールバー分を除く)。
- モーダル(書き出し / SE編集 / ブロック長): `main` を独立スタッキングコンテキストにして内部の z-index を閉じ込め、モーダルは `z-index:100000`。モーダル内ドロップダウンとツールチップはさらに前面。
- Piano Roll: 左側に縦型ピアノ鍵盤(`piano-keys.js`)。音符グリッドと同じ `RH` / `roll.scrollTop` から描画するため位置は常に一致。
  クリック/タッチで `sfPreview`(選択トラックのSF2)により試聴。再生中の音符(選択トラック)の鍵盤を発光。
  ツールバーで 表示/非表示・鍵盤幅・音名表示(すべて / Cのみ / なし)を変更可(localStorageに保存)。

## UI修正・機能追加 (今回)
- 上部ツールバーの「ソング / ピアノロール」切り替えボタンを削除(各エディターはタスクバー・メニューから開く)。
- Song Editor: ウィンドウのタイトルバー → 操作ツールバー → 編集領域 の順に修正(CSSの `order:-1` が原因)。
- Song Editor: 横スクロールバー(`#hs`)をウィンドウ内の下端へ移動。幅は編集領域に一致(トラックヘッダー幅・縦スクロールバー分を除く)。
- モーダル(書き出し / SE編集 / ブロック長): `main` を独立スタッキングコンテキストにして内部の z-index を閉じ込め、モーダルは `z-index:100000`。モーダル内ドロップダウンとツールチップはさらに前面。
- Piano Roll: 左側に縦型ピアノ鍵盤(`piano-keys.js`)。音符グリッドと同じ `RH` / `roll.scrollTop` から描画するため位置は常に一致。
  クリック/タッチで `sfPreview`(選択トラックのSF2)により試聴。再生中の音符(選択トラック)の鍵盤を発光。
  ツールバーで 表示/非表示・鍵盤幅・音名表示(すべて / Cのみ / なし)を変更可(localStorageに保存)。

## Piano Roll 改修 第2弾
- 旧「ブロック内オートメーション」の編集UI(`patAuto` ボタン / `patAutoKind` 選択欄 / 編集用オーバーレイ・ポインタ処理)を撤去。独立した Automation Editor は未変更。
  既存プロジェクトの `pattern.automation`(vol/pitch/echo 曲線)は **データ・保存・複製・リアルタイム再生への反映をそのまま残している**(曲の音が変わらないようにするため)。
  なお書き出し(`renderMix`)は元々この曲線を使っていない(リアルタイム再生のみ)。
- ベロシティレーン(`#vlw` / `drawVL`):
  - 範囲を 0〜127 に(0 は無音。MIDI書き出しでは 0 のノートは出力しない)。旧形式で未設定の音符は 100。
  - 上端のハンドルで高さを調整(56〜300px、localStorageに保存、ダブルクリックで既定に戻す、キーボードの上下でも可)。
  - Piano Roll ツールバーに「ベロシティ」表示切替ボタンを追加。
  - 鍵盤を表示している間は、レーンと音声レーンを鍵盤幅だけ右へ寄せ、音符グリッドと位置を一致。
  - 新規音符の初期ベロシティは、直近にレーンで編集した値(初期値100)。
  - 値が実際に変わったときだけ Undo 履歴を積む。タッチ時はバーの当たり判定を広げた。

## SF2 音色抽出・書き出し (新機能)
読み込み済みSF2から必要な音色だけを選び、新しい SoundFont 2 ファイルとして書き出します。
- 開き方: SF2ライブラリのツールバー「音色を抽出してSF2書き出し」、または選択中SF2の操作欄の同名ボタン。
- 画面: 元SF2の選択 / 音色一覧(絞り込み・試聴▶・複数選択・表示中を全選択/解除) / 出力ファイル名 / 選択音色数・収録Instrument数・収録サンプル数 / 推定ファイルサイズ / 「SF2形式で書き出す」 / キャンセル(書き込み中は中止)。
- 書き出し: 対応ブラウザでは保存先を選んでディスクへ直接ストリーム書き込み(File System Access API)。非対応ブラウザではダウンロード。書き出し後に再解析で構造を検査し、既定でSF2ライブラリへ読み込みます(同内容が登録済みなら追加しません)。
- 実装: `sf2-extract.js`(コア。DOM非依存)、`sf2-extract-ui.js`(画面)。`script.js` の既存パーサー(`parseSF2`)は変更せず、別に生のpdta(phdr/pbag/pmod/pgen/inst/ibag/imod/igen/shdr)を読み直します。
- 抽出内容: 選んだPresetが使う Instrument と、そのゾーンが使う Sample だけを収録。共有サンプルは1つだけ。ステレオ対の相手サンプルも収録。Generator/Modulatorは1バイトも変えず(参照番号41/53のみ付け替え)、ループ位置はサンプル先頭からの相対位置を維持、各サンプルの後ろに仕様どおり46点のゼロを付加。元にsm24(24bit拡張)があれば同じ範囲をコピー。INFOは著作権・作者等を引き継ぎ、名前とコメントを更新。
- メモリ: サンプル本体は元Blobのスライスを連結するだけでJSメモリに載せません(約400MBのSF2でもJSヒープ増加は数MB)。
- 既知の制限: SF3(圧縮)・ROMサンプルは非対応(ROMを使うゾーンは除外して警告)。リンク型Modulator(ゾーン内の他Modulatorを参照するもの)は参照を元の相対位置のまま保持するだけで、実SF2での検証はしていません。

---

## トラックと音源の管理(LMMS方式)

- **トラック一覧(左のBrowser)**: 1トラック=1行。音源アイコン / 名前 / M / S / 「⋯」メニュー、音源名ボタン、音量・パン。
  アイコンまたは音源名を押すと、そのトラック専用の **音源設定ウィンドウ** が開きます(トラックごとに独立、複数同時に開けます)。
  追加・複製・上下移動・削除・色・アイコン変更は「⋯」メニュー(Song Editorのヘッダーメニューと共通)から。
- **音源設定ウィンドウ** (`instrument.js`): タブで「内蔵シンセ」「SoundFont (SF2)」を切り替え。
  - 内蔵シンセ: 波形、カットオフ(右クリックでオートメーション)、アタック、リリース。
  - SF2: ライブラリのSF2一覧 → プリセット検索/選択。トラックごとに別々のSF2・プリセットを使えます。
  - 音量・パン、試し弾きキーボード(タッチ対応)。
- **Browser の「Inst」タブ/INSTRUMENTS**: 内蔵シンセとSF2のプリセットを探して試聴し、「→」・ダブルクリック・ドラッグで選択トラックに割り当て。
- **データ**: 既存の形式のまま(`t.wave / t.cut / t.sf`)。追加は任意項目のみ: `t.atk` / `t.rel`(秒。未設定は従来の0.01/0.12)、
  `t.sfStash`(SF2→内蔵シンセに切り替えたときだけ元のSF2指定を退避。SF2に戻すと復元)。旧プロジェクトはそのまま開けます。
  音源を変えても、パターン・音符・ソングの配置には触れません。
- SF2本体はこのアプリに埋め込まず、読み込みは既存の遅延読み込み・キャッシュ管理のままです。

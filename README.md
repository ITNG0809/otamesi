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

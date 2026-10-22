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

# mdediter メンテナンスガイド

作成: 2026-04-17 / 対象バージョン: v0.3.0（Web 版対応。§14 参照）

---

## 1. プロジェクト概要

Markdown ビューア兼エディタ（Windows ネイティブ / 単一 exe 配布）。

- **プロジェクトルート**: `G:\マイドライブ\mdediter\`
- **ビルド作業ディレクトリ**: `C:\dev\mdediter\`（Google Drive 上では npm install が EBADF で失敗するため）
- **配布 zip**: `G:\マイドライブ\mdediter\dist\mdediter-v*.*.*.zip`

## 2. 技術スタック

| レイヤ | 採用 | 備考 |
|---|---|---|
| バックエンド | **Go 1.26.2** | winget で導入 (`C:\Program Files\Go\`) |
| フレームワーク | **Wails v2.12.0** | `%USERPROFILE%\go\bin\wails.exe` |
| UIランタイム | Microsoft Edge WebView2 | Win10 1803+ / Win11 標準搭載 |
| フロント | **Svelte 3 + TypeScript + Vite 3** | `frontend/` 配下 |
| エディタ | **CodeMirror 6** | `@codemirror/lang-markdown` |
| パーサ | **markdown-it 14** | GFM拡張・task-lists・KaTeX（v0.2.1 で 13 → 14、ReDoS 対策） |
| 数式 | **KaTeX 0.16** | `@vscode/markdown-it-katex` |
| コードHL | **highlight.js 11** | `github.css` テーマ |

## 3. ディレクトリ構成

```
G:\マイドライブ\mdediter\
├── app.go               # Wails バックエンド（File I/O, Dialog, Config）
├── main.go              # エントリポイント（ウィンドウ設定）
├── go.mod / go.sum      # Go 依存
├── wails.json           # Wails プロジェクト設定
├── .gitignore
├── build.sh             # ローカル経由ビルドスクリプト
├── README.md
├── mdediterメンテナンスガイド.md  (本ファイル)
│
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── svelte.config.js
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.ts              # エントリ（CSS 読み込み含む）
│   │   ├── App.svelte           # UI 本体（タブ・エディタ・プレビュー・モード）
│   │   ├── style.css            # グローバル CSS
│   │   └── lib/
│   │       ├── editor.ts        # CodeMirror 6 ラッパ
│   │       ├── markdown.ts      # markdown-it + GFM + KaTeX + hljs
│   │       ├── tabs.ts          # タブ管理 Svelte store
│   │       └── scrollsync.ts    # エディタ⇔プレビュー スクロール同期
│   └── wailsjs/                 # `wails build` 時に自動生成（Go→JS bindings）
│
├── build/
│   └── bin/
│       ├── mdediter.exe         # ビルド成果物
│       └── README.txt           # 配布時のユーザー向け説明
│
├── dist/
│   └── mdediter-v*.*.*.zip      # 配布用 zip
│
└── docs/
    ├── 仕様書.md
    └── 開発メモ.md
```

## 4. ビルド方法（★重要）

### 4.1 なぜ直接ビルドできないか

Google Drive File Stream (G:) は仮想ファイルシステムで、`node_modules` のような大量の小ファイル書き込みで `EBADF` / `EPERM` を起こす。junction (`mklink /J`) も G: をまたぐと不可。

### 4.2 標準手順

```bash
# プロジェクトルートで
bash build.sh
```

`build.sh` が以下を自動実行:

1. `G:\マイドライブ\mdediter\` のソース（Go・Svelte 一式）を `C:\dev\mdediter\` にコピー
2. `build/appicon.png` と `build/windows/icon.ico` を `C:\dev\mdediter\build\` にコピー
3. `C:\dev\mdediter\` で `wails build -platform windows/amd64` 実行
4. 生成された `mdediter.exe` を `G:\マイドライブ\mdediter\build\bin\` に書き戻す
5. `frontend/wailsjs/` の自動生成 bindings も G: 側に同期

### 4.3 手動ビルド（build.sh が使えない時）

```bash
export PATH="/c/Program Files/Go/bin:$HOME/go/bin:/c/Program Files/nodejs:$PATH"

# 差分を C: にコピー（編集したファイルのみ）
cp "G:/マイドライブ/mdediter/frontend/src/App.svelte" "C:/dev/mdediter/frontend/src/"

# ビルド
cd "C:/dev/mdediter" && wails build -platform windows/amd64

# exe を戻す
cp "C:/dev/mdediter/build/bin/mdediter.exe" "G:/マイドライブ/mdediter/build/bin/"
```

### 4.4 ビルド前のクリーンアップ

```bash
# 起動中の mdediter があれば kill
taskkill //F //IM mdediter.exe

# コピーで Permission denied が出たら、Google Drive のファイルロックか exe 起動中が原因
```

## 5. 配布 zip の作り方

```bash
VER=v0.2.7
rm -rf "C:/tmp/mdediter-dist/mdediter-$VER"
mkdir -p "C:/tmp/mdediter-dist/mdediter-$VER"
cp "G:/マイドライブ/mdediter/build/bin/mdediter.exe" \
   "G:/マイドライブ/mdediter/build/bin/README.txt" \
   "C:/tmp/mdediter-dist/mdediter-$VER/"
cd "C:/tmp/mdediter-dist"
powershell -Command "Compress-Archive -Path 'mdediter-$VER' -DestinationPath 'mdediter-$VER.zip' -Force"
cp "mdediter-$VER.zip" "G:/マイドライブ/mdediter/dist/"
```

古いバージョンの zip は `dist/` から削除してよい。

## 6. 機能マップ

### 6.1 ファイル操作（Go 側）
実装は `app.go` に集約:
- `OpenFileDialog()` — ネイティブ開くダイアログ
- `ReadFile(path)` — 任意パスを読み込み
- `SaveFile(path, content)` — 既存パスに保存（**v0.2.1 でアトミック書き込み化**: 一時ファイル `*.mdediter.tmp` に書いて `os.Rename` でリプレース。書き込み中断時の元ファイル破損を防ぐ）
- `SaveFileDialog(name, content)` — 名前を付けて保存
- `GetRecentFiles()` — 履歴 10件（`%APPDATA%\mdediter\config.json`）
- `ConfirmUnsavedClose(title)` — 未保存確認ダイアログ

フロントからは `../wailsjs/go/main/App.js` 経由で Promise として呼び出す。

### 6.1.1 ファイルドロップ（Wails v2.12 API）
`main.go` の `options.App` 直下に `OnFileDrop` フィールドは**存在しない**（Wails v2.12 の仕様）。代わりに `app.startup` 内で次のように登録する:

```go
runtime.OnFileDrop(ctx, a.onFileDrop)
```

`a.onFileDrop(_, _ int, paths []string)` は `runtime.EventsEmit(ctx, "files-dropped", paths)` で JS 側へ転送し、`App.svelte` の `EventsOn('files-dropped', ...)` がタブを開く。`options.App.DragAndDrop.EnableFileDrop = true` の指定は別途必須。

### 6.1.2 起動時引数（v0.2.4 で追加、v0.2.5 で強化）
`mdediter.exe path1.md path2.md` のようにコマンドライン引数でファイルパスを渡すと、起動時に自動でタブとして開く。

- `app.go` の `NewApp()` で `os.Args[1:]` をキャプチャし、`-` で始まるフラグは除外、`filepath.Abs` で絶対化、**`os.Stat` でファイルとして実在するパスのみ採用**（v0.2.5 〜）して `App.startupArgs` に保持
- フロント (`App.svelte` の `onMount`) で `GetStartupFiles()` を呼び、既存の `openDroppedPaths()` を再利用してタブ化（D&D 経路と同じ）
- 起動時に `ReadFile` が失敗した場合は `alert` でエラー内容を通知（v0.2.5 〜）
- 引数で開けたタブが 1 つでもある場合は Welcome タブを抑制。全部失敗または引数なしなら従来通り Welcome を表示
- 用途: エクスプローラの「プログラムから開く」、ファイル関連付け、ショートカット起動

### 6.2 表示モード（`App.svelte`）
`viewMode: 'split' | 'edit' | 'preview'` の3択。
- ツールバー「編集 / 分割 / 表示」ボタンで切替
- `Ctrl+/` でローテート

`preview` モードのときは `scrollSync.detach()` される。

### 6.3 スクロール同期（`scrollsync.ts`）
- **方式: スクロールバー全体の相対位置（パーセンテージ）同期**（v0.2.3 で行アンカー方式から変更）
- `ratio = scrollTop / (scrollHeight - clientHeight)` を計算し、相手側に同じ比率を適用
- 行アンカー方式は画像・数式・コードブロックなど描画高が大きく変わる要素で大きくズレるため、シンプルで予測可能なパーセンテージ方式を採用
- `markdown.ts` の `data-line` 属性は将来のデバッグ・別方式同期の余地として残置（描画には影響なし）
- フィードバックループ防止に 120ms ロック

### 6.4 KaTeX（数式）
`markdown.ts` に `md.use(katex, { throwOnError: false })`。
- `$...$` インライン
- `$$...$$` ブロック
- `main.ts` で `katex/dist/katex.min.css` を読み込み（フォント込みで +500KB）

### 6.5 タブ管理（`tabs.ts`）
Svelte writable store:
- `tabs: Tab[]` / `activeTabId: string`
- `newTab / closeTab / updateTabContent / markSaved / findTabByPath`
- 未保存状態は `dirty = content !== savedContent` で判定、タイトル横に ● 表示

### 6.6 キーボードショートカット

### アプリ全体（`App.svelte` の `handleKeydown`）
| キー | 動作 |
|---|---|
| Ctrl+O | 開く |
| Ctrl+S | 保存 |
| Ctrl+Shift+S | 名前を付けて保存 |
| Ctrl+N | 新規タブ |
| Ctrl+W | タブを閉じる |
| Ctrl+/ | 表示モード切替 |

### エディタ内（CodeMirror 6 / `editor.ts`）
`defaultKeymap` + `historyKeymap` + `searchKeymap` (v0.2.6 〜) を組み込み。

| キー | 動作 |
|---|---|
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+A | 全選択 |
| Ctrl+←/→ | 単語単位移動 |
| Ctrl+Backspace / Delete | 単語単位削除 |
| Home / End | 行頭・行末 |
| Ctrl+Home / Ctrl+End | 文書頭・文書末 |
| Ctrl+X | 切り取り |
| Ctrl+C | コピー |
| Ctrl+V | 貼り付け |
| Ctrl+F | 検索パネルを開く（右クリックメニューからも可）|
| Ctrl+H | 置換パネルを開く |
| F3 / Shift+F3 | 次へ / 前へ |
| Enter（検索中） | 次のマッチ |
| Escape（検索中） | 検索パネルを閉じる |

## 7. よくあるメンテナンス作業

### 7.1 Svelte フロントのコードを直すとき
1. `G:\マイドライブ\mdediter\frontend\src\` のファイルを編集
2. `bash build.sh` でビルド → G: の exe が更新される

### 7.2 Go バックエンドの関数を追加するとき
1. `app.go` にメソッド追加（`*App` レシーバ）
2. `bash build.sh` 実行（自動で bindings 再生成）
3. フロント側は `../wailsjs/go/main/App.js` から新メソッドを import

### 7.3 npm パッケージを追加するとき
1. `frontend/package.json` に追記
2. `build.sh` 内で `C:/dev/mdediter/frontend` に同期後、wails が自動で `npm install`
3. 手動試行なら: `cd C:/dev/mdediter/frontend && npm install <pkg>`

### 7.4 Go モジュールを追加するとき
```bash
cd "C:/dev/mdediter"
go get <module>
# 変更された go.mod / go.sum を G: に戻す
cp go.mod go.sum "G:/マイドライブ/mdediter/"
```

### 7.5 アイコンを変更するとき

アイコンは2ファイルで管理される:
- `build/appicon.png` — Wails が内部アセット生成に使う PNG（256×256 推奨）
- `build/windows/icon.ico` — exe に埋め込まれる ICO（16/32/48/256 px マルチサイズ）

**再生成手順**（デザインを変えたい場合）:

```powershell
# 1. 生成スクリプトを編集して再実行（PowerShell）
powershell -ExecutionPolicy Bypass -File "C:\Users\user\AppData\Local\Temp\make_icon.ps1"
```

```bash
# 2. 生成物を G: にコピー（Bash）
cp "C:/dev/mdediter/build/appicon.png"      "G:/マイドライブ/mdediter/build/"
cp "C:/dev/mdediter/build/windows/icon.ico" "G:/マイドライブ/mdediter/build/windows/"
```

```bash
# 3. ビルドして exe に埋め込む
bash build.sh
```

**注意**: PowerShell スクリプト内で G: の日本語パスを直接指定すると PS5.1 のエンコーディング問題で文字化けするため、必ず C:\dev\ に書いてから Bash でコピーする。

**現行デザイン（v0.2.5 〜）**: 濃紺グラデーション背景 + 白太字「M」（Consolas）+ ティール（#00BCD4）下アクセントバー

### 7.6 新バージョンをリリースするとき

1. ソースを編集 → `bash build.sh` でビルド
2. 配布 zip を作成して `dist/` に置く（セクション5参照）
3. `mooma.style/app/` のファイルを更新（セクション12参照）
4. GitHub に push（セクション12参照）
5. メンテナンスガイドの変更履歴・VER を更新

### 7.7 Wails・Go のバージョン更新
```bash
# Go 更新
winget upgrade GoLang.Go

# Wails CLI 更新
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# プロジェクトの wails ライブラリ更新
cd C:/dev/mdediter
go get -u github.com/wailsapp/wails/v2
go mod tidy
```

## 8. トラブルシューティング

### 8.1 `wails build` 時のエラー
| 症状 | 対策 |
|---|---|
| `EBADF` / `EPERM` が `node_modules` 周りで出る | Google Drive 上でビルドしていないか確認。`build.sh` 経由にする |
| bindings が古い | `C:/dev/mdediter/frontend/wailsjs/` を削除して再ビルド |
| `wails: command not found` | `export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH"` |
| `npm: command not found` | PATH に Node.js を追加: `export PATH="/c/Program Files/nodejs:$PATH"` |

### 8.2 exe コピー時 `Permission denied`
`mdediter.exe` が起動中、または Google Drive が同期ロック。
```bash
taskkill //F //IM mdediter.exe
```
数秒待ってから再度 `cp`。

### 8.3 起動しない
- "WebView2 がありません" → https://developer.microsoft.com/microsoft-edge/webview2/ から Evergreen をインストール
- 起動直後に落ちる → `%APPDATA%\mdediter\config.json` を削除してリセット

### 8.4 スクロール同期がずれる
- v0.2.3 以降は全体相対位置（パーセンテージ）同期。プレビュー側と編集側で「コンテンツ高比」が極端に違う場合、特定ブロックでの一致度は犠牲になる（端から端は必ず一致）
- ピンポイントで合わせたい場合は将来的に「行アンカー＋端固定」のハイブリッド導入を検討

### 8.5 KaTeX でエラー色の赤文字が出る
LaTeX 構文エラー。`throwOnError: false` で描画継続する設定。構文を直す。

### 8.6 `unknown field OnFileDrop in struct literal of type options.App`
Wails v2.12 では `options.App` に `OnFileDrop` フィールドはない。`6.1.1` を参照し、`startup` 内で `runtime.OnFileDrop(ctx, callback)` を呼ぶ形に書き換える。

## 9. 環境情報

| 項目 | 値 |
|---|---|
| OS | Windows 11 Pro (10.0.26200) |
| Go | 1.26.2 (`C:\Program Files\Go\`) |
| Wails | v2.12.0 (`C:\Users\user\go\bin\wails.exe`) |
| Node.js | v24.15.0 (`C:\Program Files\nodejs\`) |
| npm | v10.x（Node.js 24 同梱） |
| WebView2 Loader | new Go WebView2Loader（Wails v2.12 標準） |

## 10. 開発ルール

- **現行ファイル確認なしの編集禁止**（CLAUDE.md 準拠）
- **sed 禁止**（文字コード問題） → Edit/Write ツールを使う
- **日本語パス対応必須** — 文字列は UTF-8 を前提
- **バイナリ配布時は v*.*.* でバージョニング**、`dist/` に zip を置く

## 11. 変更履歴

| バージョン | 日付 | 変更 |
|---|---|---|
| v0.1.0 | 2026-04-17 | 初版（エディタ・プレビュー・タブ・GFM・シンタックスHL） |
| v0.1.1 | 2026-04-17 | 表示モード（編集／分割／表示） |
| v0.1.2 | 2026-04-17 | スクロール双方向同期 |
| v0.2.0 | 2026-04-17 | KaTeX 数式対応 |
| v0.2.1 | 2026-04-17 | コードレビュー指摘を一括修正: D&D を Wails 標準 `runtime.OnFileDrop` に切替 / `SaveFile` をアトミック書き込み化 / 保存処理の content スナップショット化（編集との競合防止）/ markdown-it 13→14（ReDoS 対策）/ 未使用 import 除去 / `main.go` のエラー出力を `log.Fatalln` に統一 |
| v0.2.2 | 2026-04-17 | UI を英語に切替（ボタン・tooltip・welcome・empty・statusbar・alert・OS ダイアログ）/ ツールバー右にバージョン表示 `v{VERSION}` 追加（`App.svelte` 内の `VERSION` 定数で一元管理）/ `frontend/package.json` バージョンを 0.2.2 に同期 |
| v0.2.3 | 2026-04-17 | スクロール同期方式を行アンカー線形補間からスクロールバー全体の相対位置（パーセンテージ）同期に変更。画像・数式・コードブロックなど描画高が大きく変わる要素でのズレを軽減 |
| v0.2.4 | 2026-04-27 | 起動時引数によるファイルオープンに対応 (`mdediter.exe foo.md bar.md` で複数タブ起動)。`app.go` の `NewApp()` で `os.Args[1:]` をフラグ除外・絶対パス化して保持し、フロントの `onMount` で `GetStartupFiles()` 経由で開く。引数で開けた場合は Welcome タブを抑制 |
| v0.2.5 | 2026-05-03 | ファイル関連付けバグ修正: `collectStartupArgs` に `os.Stat` チェック追加（実在ファイルのみ採用、スペース入りパスの分断を防止）/ 起動時 `ReadFile` 失敗を `alert` で通知 / アイコンをカスタムデザインに変更（濃紺グラデーション＋白太字「M」＋ティールアクセントバー）/ `build.sh` にアイコンファイル同期処理を追加 |
| v0.2.6 | 2026-05-15 | D&D 修正: `--wails-drop-target: drop` を Svelte コンポーネントスコープの `.app` から `:global(html, body, #app)` へ移動し、Wails ネイティブ層が `getComputedStyle` で値を確実に拾えるようにした（v0.2.5 まで Svelte scoping により一部ビルドで D&D が無反応）。エディタに検索/置換キーを追加: `@codemirror/search` を導入し `search({ top: true })` 拡張と `searchKeymap` を組み込み（Ctrl+F / Ctrl+H / F3 / Shift+F3 / Esc）。`frontend/package.json` と `App.svelte` の VERSION を 0.2.6 に同期 |
| v0.2.7 | 2026-05-18 | 右クリックで WebView2 標準コンテキストメニュー（Cut / Copy / Paste / Select All 等）を有効化。`main.go` に `EnableDefaultContextMenu: true` を追加（WebView2 COM レベルでのメニュー許可）。`App.svelte` の `.editor-pane` に CSS `--default-contextmenu: show` を追加（Wails runtime JS が CodeMirror 内の `contenteditable="false"` 要素で `preventDefault` するのを防ぐ）。Ctrl+X / Ctrl+C / Ctrl+V は CodeMirror ネイティブ処理で対応 |
| v0.3.0 | 2026-05-29 | **Web 版対応（`https://mdediter.mooma.style/`）。** 単一コードベース＋実行時プラットフォーム判定。新規 `frontend/src/lib/platform.ts` がファイル I/O を抽象化し、Wails 実行時は `window.go.main.App.*`／`window.runtime`、ブラウザ実行時は `<input type=file>`・Blob ダウンロード保存・HTML5 D&D・`window.confirm` を使う。`App.svelte` から `wailsjs` への静的 import を撤去（plain `vite build` が解決を試みないように）し、Web 時のみツールバーに Windows 版 DL リンク（`/download/mdediter-v0.3.0.zip`）を表示。Windows 版は shim 経由で従来動作を維持。詳細は §14 |

## 12. 配布・公開情報

### 配布ページ（mooma.style/app/）
- **URL**: https://mooma.style/app/
- **サーバーパス**: `/var/www/mooma/app/`
- **SSH 鍵**: `G:\マイドライブ\mooma\Kiyobo2.ppk`（PPK v3形式）
  - 初回のみ変換が必要: `C:\Users\user\.ssh\mooma.pem` に変換済み
- **zip 更新手順**:
  ```bash
  # 新バージョンの zip をサーバーにアップロード
  scp -i /c/Users/user/.ssh/mooma.pem \
    "G:/マイドライブ/mdediter/dist/mdediter-vX.X.X.zip" \
    root@210.131.214.128:/var/www/mooma/app/

  # index.html の Download リンクとバージョン表記を更新
  # （ローカルで編集後 scp でアップロード）
  scp -i /c/Users/user/.ssh/mooma.pem \
    /c/tmp/app_index.html \
    root@210.131.214.128:/var/www/mooma/app/index.html

  # 古い zip を削除
  ssh -i /c/Users/user/.ssh/mooma.pem root@210.131.214.128 \
    "rm /var/www/mooma/app/mdediter-v旧バージョン.zip"
  ```

### GitHub
- **URL**: https://github.com/ekiyo55/mdediter
- **ローカルリポジトリ**: `C:/dev/mdediter/`（ビルド作業ディレクトリ兼）
- **push 手順**:
  ```bash
  cd C:/dev/mdediter
  # build.sh 実行後、G: からの差分を手動 cp（build.sh が上書きするため）
  git add .
  git commit -m "vX.X.X: 変更内容"
  git push
  ```

### note
- **ログイン**: Google アカウント `eto@aicynap` でログイン
- 配布紹介記事を投稿済み（mdediter の使い方と配布について）

## 13. 関連ドキュメント

- `README.md` — プロジェクト入口（GitHub にも公開）
- `docs/仕様書.md` — 設計仕様
- `docs/開発メモ.md` — 開発中の決定事項・知見
- `build/bin/README.txt` — エンドユーザー向け同梱 README

## 14. Web 版（mdediter.mooma.style）— v0.3.0 〜

Windows ネイティブ版と**同一コードベース**から、静的 SPA としてビルドして配信する。

### 14.1 仕組み（プラットフォーム抽象）

- フロント（Svelte + CodeMirror + markdown-it + KaTeX + hljs）は元々ブラウザコード。Wails 依存はファイル I/O だけだった。
- `frontend/src/lib/platform.ts` がファイル I/O を抽象化し、実行時に環境を判定する:
  - **Wails 実行時**（`window.go.main.App` が注入されている）: `OpenFileDialog / SaveFile / SaveFileDialog / ReadFile / ConfirmUnsavedClose / GetStartupFiles` を `window.go` 経由で呼ぶ。D&D は `window.runtime.EventsOn('files-dropped')`。
  - **ブラウザ実行時**: Open=`<input type=file>`、Save/SaveAs=**Blob ダウンロード保存**（File System Access API は不使用）、D&D=HTML5 `drop`、未保存確認=`window.confirm`。`getStartupFiles()` は `[]`。
- `App.svelte` は `platform.*` を呼ぶだけ（`wailsjs` への**静的 import は無し**）。これにより plain `vite build` が `wailsjs` を解決しようとせず成功し、Wails ビルドは従来どおり `window.go` 注入で動く。
- Web 実行時のみ、ツールバー右に Windows 版 DL リンク（`platform.WIN_DOWNLOAD_URL = /download/mdediter-v0.3.0.zip`）を表示。

⚠️ **新バージョンを出すたびに `platform.ts` の `WIN_DOWNLOAD_URL` のバージョンを更新**し、対応する zip を `download/` に配置すること。

### 14.2 Web ビルド

Windows 版と同じく G: 上では npm 不可。`C:/dev/mdediter/frontend` でビルドする:

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # この環境(ekiyo)も nodejs はここ
# 編集ファイルを C: に同期（最低限 src/ と package.json）
cp -r "G:/マイドライブ/mdediter/frontend/src" "C:/dev/mdediter/frontend/"
cp "G:/マイドライブ/mdediter/frontend/package.json" "C:/dev/mdediter/frontend/"

cd "C:/dev/mdediter/frontend" && rm -rf dist && npm run build   # → dist/（静的 SPA）

# ★重要: 生成された dist を必ず C:/dev から G: に戻す（古い G:/dist を上げる事故を防ぐ）
rm -rf "G:/マイドライブ/mdediter/frontend/dist"
cp -r "C:/dev/mdediter/frontend/dist" "G:/マイドライブ/mdediter/frontend/"
```

- 出力は絶対パス（`/assets/...`）参照なので、サブドメイン直下配信でそのまま動く。
- ハッシュ付きアセット名なので、デプロイ時は **`assets/` を一度消してから**置き換えると孤児ファイルが残らない。

### 14.3 サーバ配置（mooma 210.131.214.128 / 鍵 `G:\マイドライブ\mooma\mooma.pem`）

- **配置先**: `/var/www/mdediter-web/`（純静的、FastAPI 等のバックエンド無し）
- **Windows zip**: `/var/www/mdediter-web/download/mdediter-vX.X.X.zip`（Web の DL リンク先）
- **Apache vhost**: `/etc/apache2/sites-available/mdediter-mooma.conf`(:80) と `mdediter-mooma-le-ssl.conf`(:443)。eng と同様 `mooma.style` 証明書を流用、`.html` は no-cache。ProxyPass は無し。
- **DNS/SSL**: `mooma.style` の権威 DNS は Cloudflare。`*.mooma.style` ワイルドカードは効いていないため、**サブドメインごとに Cloudflare 側で proxied レコードを個別追加**する必要がある（`mdediter` レコードは v0.3.0 リリース時に追加済み）。Cloudflare が公開 TLS を終端し origin へ :443 で接続するため origin に :443 vhost が必須。

デプロイ手順（更新時）:
```bash
KEY="G:/マイドライブ/mooma/mooma.pem"; HOST="root@210.131.214.128"
# 古いアセットを消してから新 dist を上げる（download/ は残す）
ssh -i "$KEY" "$HOST" "rm -rf /var/www/mdediter-web/assets /var/www/mdediter-web/index.html"
scp -i "$KEY" -r "G:/マイドライブ/mdediter/frontend/dist/assets" \
                 "G:/マイドライブ/mdediter/frontend/dist/index.html" \
                 "$HOST:/var/www/mdediter-web/"
# 新バージョン zip も配置
scp -i "$KEY" "G:/マイドライブ/mdediter/dist/mdediter-vX.X.X.zip" "$HOST:/var/www/mdediter-web/download/"
ssh -i "$KEY" "$HOST" "chown -R www-data:www-data /var/www/mdediter-web"
```

初回 vhost 作成時のみ:
```bash
ssh -i "$KEY" "$HOST" "a2ensite mdediter-mooma mdediter-mooma-le-ssl && apache2ctl configtest && systemctl reload apache2"
```

### 14.4 検証

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://mdediter.mooma.style/
curl -sSI https://mdediter.mooma.style/download/mdediter-v0.3.0.zip | head -1
# 配信中バンドルに DL リンクが含まれるか（古い dist を上げていないかの確認）
JS=$(curl -sS https://mdediter.mooma.style/ | grep -o '/assets/index\.[a-f0-9]*\.js')
curl -sS "https://mdediter.mooma.style$JS" | grep -o "/download/mdediter-v0.3.0.zip"
```

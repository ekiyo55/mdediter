# mdediter メンテナンスガイド

作成: 2026-04-17 / 対象バージョン: v0.2.3

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
2. `C:\dev\mdediter\` で `wails build -platform windows/amd64` 実行
3. 生成された `mdediter.exe` を `G:\マイドライブ\mdediter\build\bin\` に書き戻す
4. `frontend/wailsjs/` の自動生成 bindings も G: 側に同期

### 4.3 手動ビルド（build.sh が使えない時）

```bash
export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH"

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
VER=v0.2.3
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

### 6.6 キーボードショートカット（`App.svelte` の `handleKeydown`）
| キー | 動作 |
|---|---|
| Ctrl+O | 開く |
| Ctrl+S | 保存 |
| Ctrl+Shift+S | 名前を付けて保存 |
| Ctrl+N | 新規タブ |
| Ctrl+W | タブを閉じる |
| Ctrl+/ | 表示モード切替 |

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

### 7.5 Wails・Go のバージョン更新
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
| Wails | v2.12.0 (`C:\Users\ekiyo\go\bin\wails.exe`) |
| Node.js | v22.20.0 |
| npm | 11.6.1 |
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

## 12. 関連ドキュメント

- `README.md` — プロジェクト入口
- `docs/仕様書.md` — 設計仕様
- `docs/開発メモ.md` — 開発中の決定事項・知見
- `build/bin/README.txt` — エンドユーザー向け同梱 README

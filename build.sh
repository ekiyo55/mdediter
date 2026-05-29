#!/usr/bin/env bash
# mdediter ビルドスクリプト
# Google Drive 上では node_modules が EBADF エラーを起こすため、
# C:/dev/mdediter にミラー後ローカルでビルドし、exe だけ G: に戻す。

set -e

SRC="G:/マイドライブ/mdediter"
WORK="C:/dev/mdediter"

echo ">>> ソースを $WORK に同期..."
mkdir -p "$WORK"
cp "$SRC/app.go" "$SRC/main.go" "$SRC/go.mod" "$SRC/go.sum" "$SRC/wails.json" "$SRC/.gitignore" "$WORK/"

# アイコンを同期
mkdir -p "$WORK/build/windows"
[ -f "$SRC/build/appicon.png" ]         && cp "$SRC/build/appicon.png"         "$WORK/build/"
[ -f "$SRC/build/windows/icon.ico" ]    && cp "$SRC/build/windows/icon.ico"    "$WORK/build/windows/"

rm -rf "$WORK/frontend/src"
mkdir -p "$WORK/frontend"
cp "$SRC/frontend/package.json" "$SRC/frontend/index.html" "$WORK/frontend/"
cp "$SRC/frontend/svelte.config.js" "$SRC/frontend/vite.config.ts" "$WORK/frontend/"
cp "$SRC/frontend/tsconfig.json" "$SRC/frontend/tsconfig.node.json" "$WORK/frontend/"
cp -r "$SRC/frontend/src" "$WORK/frontend/"
if [ -d "$SRC/frontend/wailsjs" ]; then
  cp -r "$SRC/frontend/wailsjs" "$WORK/frontend/"
fi

echo ">>> ビルド中..."
export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH"
cd "$WORK"
wails build -platform windows/amd64

echo ">>> 成果物を $SRC に戻す..."
mkdir -p "$SRC/build/bin"
cp "$WORK/build/bin/mdediter.exe" "$SRC/build/bin/"
cp -r "$WORK/frontend/wailsjs" "$SRC/frontend/"

echo "完了: $SRC/build/bin/mdediter.exe"

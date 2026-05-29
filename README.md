# mdediter

A lightweight Markdown viewer and editor, available as a Windows desktop app (Go + Wails + Svelte) and as a browser app from the same codebase.

![version](https://img.shields.io/badge/version-0.3.0-blue)
![platform](https://img.shields.io/badge/platform-windows--amd64%20%7C%20web-lightgrey)
![license](https://img.shields.io/badge/license-MIT-green)

**Try it online:** [mdediter.mooma.style](https://mdediter.mooma.style/) — no install required.

## Features

- **Live preview** — editor on the left, rendered preview on the right
- **View modes** — Edit only / Split / Preview only (toggle with Ctrl+/)
- **Scroll sync** — bidirectional, overall-ratio based
- **GitHub Flavored Markdown** — tables, task lists, strikethrough
- **KaTeX math** — inline `$...$` and block `$$...$$`
- **Syntax highlighting** — both in the editor (CodeMirror) and preview (highlight.js)
- **Tabs** — open multiple files at once
- **Drag & drop** — drop `.md` files onto the window
- **CLI arguments** — `mdediter.exe a.md b.md` opens files at startup
- **Recent files** — last 10 files remembered
- **Atomic save** — temp-file + rename to prevent corruption on crash
- **Single-exe distribution** — no installer required

## Web version

Open [mdediter.mooma.style](https://mdediter.mooma.style/) in any modern browser — nothing to install.
It shares the editor, preview, tabs, GFM, KaTeX and search with the desktop app. File handling differs by
platform: the web version opens files via a file picker, saves by **downloading** the file, and supports
drag & drop of `.md` files. A link to download the Windows desktop app is shown in the toolbar.

## Installation (Windows desktop)

Download the latest zip from [mooma.style/app](https://mooma.style/app/) or [Releases](../../releases), unzip, and run `mdediter.exe`.

> **Windows SmartScreen warning**: the binary is unsigned, so on first launch you may see
> "Windows protected your PC". Click **More info** → **Run anyway**. This is expected for
> any unsigned Windows app.

### System requirements

- Windows 10 (1803+) or Windows 11
- Microsoft Edge WebView2 Runtime (pre-installed on Win11; auto-updated on Win10)

## Opening files

- **Double-click** the exe to launch with a Welcome tab
- **Drag & drop** `.md` files onto the window
- **Command line** — pass file paths as arguments:
  ```
  mdediter.exe README.md docs\spec.md
  ```
  Each path becomes a tab. Relative paths are resolved against the current directory.
- **File association** — associate `.md` with `mdediter.exe` in Windows to open by double-clicking files

## Keyboard shortcuts

| Key | Action |
|---|---|
| Ctrl+O | Open file |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+N | New tab |
| Ctrl+W | Close tab |
| Ctrl+/ | Cycle view mode |
| Ctrl+F | Search |
| Ctrl+H | Replace |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Right-click | Context menu (Cut / Copy / Paste) |

## Tech stack

- **Backend**: Go 1.23+ with [Wails v2](https://wails.io/)
- **Frontend**: Svelte 3 + TypeScript + Vite 3
- **Editor**: [CodeMirror 6](https://codemirror.net/)
- **Markdown**: [markdown-it](https://github.com/markdown-it/markdown-it) + GFM + task-lists + KaTeX
- **Syntax highlighting**: [highlight.js](https://highlightjs.org/)

## Building from source

### Prerequisites

- Windows 10/11
- Go 1.23+
- Node.js 18+
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails doctor    # verify environment
```

### Build

```bash
wails build -platform windows/amd64
```

Output: `build/bin/mdediter.exe`

### Build the web version

The frontend is a plain Vite app, so the browser build needs no Go/Wails:

```bash
cd frontend
npm install
npm run build      # → frontend/dist/ (static SPA)
```

Platform differences (native file dialogs vs. file picker + download) are handled at runtime in
`frontend/src/lib/platform.ts`, which detects the Wails runtime (`window.go`) and falls back to
browser APIs otherwise.

### Dev mode

```bash
wails dev
```

Hot-reload is enabled for frontend changes.

## License

MIT — see [LICENSE](./LICENSE).

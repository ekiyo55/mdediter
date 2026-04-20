# mdediter

A lightweight Markdown viewer and editor for Windows, built with Go + Wails + Svelte.

![version](https://img.shields.io/badge/version-0.2.3-blue)
![platform](https://img.shields.io/badge/platform-windows--amd64-lightgrey)
![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Live preview** — editor on the left, rendered preview on the right
- **View modes** — Edit only / Split / Preview only (toggle with Ctrl+/)
- **Scroll sync** — bidirectional, overall-ratio based
- **GitHub Flavored Markdown** — tables, task lists, strikethrough
- **KaTeX math** — inline `$...$` and block `$$...$$`
- **Syntax highlighting** — both in the editor (CodeMirror) and preview (highlight.js)
- **Tabs** — open multiple files at once
- **Drag & drop** — drop `.md` files onto the window
- **Recent files** — last 10 files remembered
- **Atomic save** — temp-file + rename to prevent corruption on crash
- **Single-exe distribution** — no installer required

## Installation

Grab the latest zip from [Releases](../../releases), unzip, and run `mdediter.exe`.

> **Windows SmartScreen warning**: the binary is unsigned, so on first launch you may see
> "Windows protected your PC". Click **More info** → **Run anyway**. This is expected for
> any unsigned Windows app.

### System requirements

- Windows 10 (1803+) or Windows 11
- Microsoft Edge WebView2 Runtime (pre-installed on Win11; auto-updated on Win10)

## Keyboard shortcuts

| Key | Action |
|---|---|
| Ctrl+O | Open file |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+N | New tab |
| Ctrl+W | Close tab |
| Ctrl+/ | Cycle view mode |

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

### Dev mode

```bash
wails dev
```

Hot-reload is enabled for frontend changes.

## License

MIT — see [LICENSE](./LICENSE).

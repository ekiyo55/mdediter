// Platform abstraction for file I/O.
//
// One codebase, two runtimes:
//   - Wails desktop (Windows): delegates to the Go bindings injected on
//     `window.go.main.App` and the event bus on `window.runtime`.
//   - Browser (mdediter.mooma.style): uses an <input type=file> to open and a
//     Blob download to save (download-only — no File System Access API), plus
//     HTML5 drag & drop and window.confirm.
//
// IMPORTANT: this module must NOT statically import from ../wailsjs, so that a
// plain `vite build` (web) does not try to resolve those generated bindings.
// The Wails bindings are reached at runtime via `window.go` / `window.runtime`.

export interface FileResult {
  path: string;
  content: string;
  error?: string;
}

interface WailsApp {
  OpenFileDialog(): Promise<FileResult>;
  ReadFile(path: string): Promise<FileResult>;
  SaveFile(path: string, content: string): Promise<FileResult>;
  SaveFileDialog(name: string, content: string): Promise<FileResult>;
  ConfirmUnsavedClose(title: string): Promise<boolean>;
  GetStartupFiles(): Promise<string[]>;
}

interface WailsRuntime {
  EventsOn(name: string, cb: (...data: any[]) => void): void;
}

function wailsApp(): WailsApp | null {
  return (window as any).go?.main?.App ?? null;
}

function wailsRuntime(): WailsRuntime | null {
  return (window as any).runtime ?? null;
}

/** true when running in a browser (not the Wails desktop shell). */
export const isWeb: boolean = wailsApp() == null;

/** Where the web UI links to the Windows desktop build. */
export const WIN_DOWNLOAD_URL = '/download/mdediter-v0.3.0.zip';

// --- web helpers ---------------------------------------------------------

const TEXT_ACCEPT = '.md,.markdown,.txt,text/*';

function looksLikeText(name: string): boolean {
  return /\.(md|markdown|txt|mdown|markdn|text)$/i.test(name);
}

function webPickFile(): Promise<FileResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = TEXT_ACCEPT;
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) {
        resolve({ path: '', content: '', error: 'cancelled' });
        return;
      }
      try {
        const content = await file.text();
        resolve({ path: file.name, content });
      } catch (e: any) {
        resolve({ path: file.name, content: '', error: String(e?.message ?? e) });
      }
    });
    // If the dialog is dismissed without choosing a file, no "change" event
    // fires; that simply leaves the promise pending, which is harmless here
    // (the caller treats it as "nothing opened").
    document.body.appendChild(input);
    input.click();
  });
}

function webDownload(name: string, content: string): FileResult {
  const safeName = name && name.trim() ? name.trim() : 'untitled.md';
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the download has had a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { path: safeName, content: '' };
}

// --- public API ----------------------------------------------------------

export function openFile(): Promise<FileResult> {
  const app = wailsApp();
  if (app) return app.OpenFileDialog();
  return webPickFile();
}

export function saveFile(path: string, content: string): Promise<FileResult> {
  const app = wailsApp();
  if (app) return app.SaveFile(path, content);
  // Web: download under the existing file name.
  return Promise.resolve(webDownload(path, content));
}

export function saveFileAs(name: string, content: string): Promise<FileResult> {
  const app = wailsApp();
  if (app) return app.SaveFileDialog(name, content);
  // Web: ask for a filename, then download.
  const chosen = window.prompt('Save as (file name):', name || 'untitled.md');
  if (chosen == null) return Promise.resolve({ path: '', content: '', error: 'cancelled' });
  return Promise.resolve(webDownload(chosen, content));
}

export function readPath(path: string): Promise<FileResult> {
  const app = wailsApp();
  if (app) return app.ReadFile(path);
  // Web has no path-based reads (drops carry their content directly).
  return Promise.resolve({ path, content: '', error: 'not supported on web' });
}

export function confirmUnsavedClose(title: string): Promise<boolean> {
  const app = wailsApp();
  if (app) return app.ConfirmUnsavedClose(title);
  return Promise.resolve(
    window.confirm(`${title || 'untitled'} has unsaved changes. Close anyway?`)
  );
}

export async function getStartupFiles(): Promise<string[]> {
  const app = wailsApp();
  if (app) return app.GetStartupFiles();
  return [];
}

/**
 * Register a handler for files dropped onto the window. The callback receives
 * fully-resolved {path, content, error} items on both platforms.
 */
export function onFilesDropped(cb: (items: FileResult[]) => void): void {
  const rt = wailsRuntime();
  if (rt) {
    rt.EventsOn('files-dropped', async (paths: string[]) => {
      if (!paths || paths.length === 0) return;
      const items = await Promise.all(paths.map((p) => readPath(p)));
      cb(items);
    });
    return;
  }

  // Web: read dropped File objects directly.
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const fileList = e.dataTransfer?.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => looksLikeText(f.name));
    if (files.length === 0) return;
    const items = await Promise.all(
      files.map(async (f): Promise<FileResult> => {
        try {
          return { path: f.name, content: await f.text() };
        } catch (err: any) {
          return { path: f.name, content: '', error: String(err?.message ?? err) };
        }
      })
    );
    cb(items);
  });
}

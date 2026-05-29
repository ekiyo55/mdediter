<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import * as platform from './lib/platform';
  import type { FileResult } from './lib/platform';
  import {
    tabs,
    activeTabId,
    newTab,
    closeTab,
    updateTabContent,
    markSaved,
    getActiveTab,
    findTabByPath,
  } from './lib/tabs';
  import { createEditor, type EditorHandle } from './lib/editor';
  import { renderMarkdown } from './lib/markdown';
  import { createScrollSync } from './lib/scrollsync';

  const VERSION = '0.3.0';

  let editorContainer: HTMLDivElement;
  let previewEl: HTMLDivElement;
  let editorHandle: EditorHandle | null = null;
  let previewHtml = '';
  let mountedTabId = '';
  const scrollSync = createScrollSync();

  type ViewMode = 'split' | 'edit' | 'preview';
  let viewMode: ViewMode = 'split';

  function setViewMode(mode: ViewMode) {
    viewMode = mode;
    tick().then(() => editorHandle?.view.requestMeasure());
  }

  $: currentTab = $tabs.find((t) => t.id === $activeTabId);
  $: if (currentTab) {
    previewHtml = renderMarkdown(currentTab.content);
  } else {
    previewHtml = '';
  }

  $: remountEditor($activeTabId);

  async function remountEditor(id: string) {
    await tick();
    if (!editorContainer) return;
    if (mountedTabId === id && editorHandle) return;
    if (editorHandle) {
      scrollSync.detach();
      editorHandle.destroy();
      editorHandle = null;
    }
    const tab = $tabs.find((t) => t.id === id);
    if (!tab) {
      mountedTabId = '';
      return;
    }
    editorHandle = createEditor(editorContainer, tab.content, (text) => {
      updateTabContent(tab.id, text);
    });
    mountedTabId = id;
    await tick();
    if (editorHandle && previewEl && viewMode === 'split') {
      scrollSync.attach(editorHandle.view, previewEl);
    }
  }

  $: viewMode, syncAttachment();
  async function syncAttachment() {
    await tick();
    scrollSync.detach();
    if (viewMode === 'split' && editorHandle && previewEl) {
      scrollSync.attach(editorHandle.view, previewEl);
    }
  }

  async function handleOpen() {
    const res = await platform.openFile();
    if (res.error) return;
    const existing = findTabByPath(res.path);
    if (existing) {
      activeTabId.set(existing.id);
      return;
    }
    newTab(res.content, res.path);
  }

  async function handleSave() {
    const tab = getActiveTab();
    if (!tab) return;
    if (!tab.path) {
      await handleSaveAs();
      return;
    }
    const snapshot = tab.content;
    const res = await platform.saveFile(tab.path, snapshot);
    if (res.error) {
      alert('Failed to save: ' + res.error);
      return;
    }
    markSaved(tab.id, tab.path, snapshot);
  }

  async function handleSaveAs() {
    const tab = getActiveTab();
    if (!tab) return;
    const snapshot = tab.content;
    const res = await platform.saveFileAs(tab.title || 'untitled.md', snapshot);
    if (res.error) return;
    markSaved(tab.id, res.path, snapshot);
  }

  function handleNew() {
    newTab('', '');
  }

  async function handleCloseTab(id: string) {
    const tab = $tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.dirty) {
      const ok = await platform.confirmUnsavedClose(tab.title || 'untitled');
      if (!ok) return;
    }
    closeTab(id);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      handleOpen();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (e.shiftKey) handleSaveAs();
      else handleSave();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      handleNew();
    } else if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      const id = get(activeTabId);
      if (id) handleCloseTab(id);
    } else if (e.key === '/' || (e.shiftKey && e.key === '?')) {
      e.preventDefault();
      const next: ViewMode = viewMode === 'split' ? 'preview' : viewMode === 'preview' ? 'edit' : 'split';
      setViewMode(next);
    }
  }

  function openResolvedFiles(items: FileResult[], reportErrors = false) {
    for (const res of items) {
      if (!res) continue;
      if (res.error) {
        if (reportErrors) alert('Failed to open: ' + (res.path || '') + '\n' + res.error);
        continue;
      }
      const existing = findTabByPath(res.path);
      if (existing) {
        activeTabId.set(existing.id);
      } else {
        newTab(res.content, res.path);
      }
    }
  }

  onMount(async () => {
    platform.onFilesDropped((items) => {
      openResolvedFiles(items);
    });
    const startupFiles = await platform.getStartupFiles();
    if (startupFiles && startupFiles.length > 0) {
      const items = await Promise.all(startupFiles.map((p) => platform.readPath(p)));
      openResolvedFiles(items, true);
    }
    if ($tabs.length === 0) {
      newTab(
        '# Welcome to mdediter\n\nLeft: editor / Right: preview.\n\n- **Ctrl+O** to open\n- **Ctrl+S** to save\n- **Ctrl+N** for a new tab\n- **Ctrl+W** to close the tab\n- **Ctrl+/** to switch view mode\n\n```js\nconsole.log("hello");\n```\n\n| Feature | Supported |\n|---|---|\n| GFM | Yes |\n| KaTeX | Yes ($E = mc^2$) |\n\n- [x] Task done\n- [ ] Task pending\n',
        ''
      );
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app">
  <header class="toolbar">
    <button on:click={handleNew} title="New (Ctrl+N)">New</button>
    <button on:click={handleOpen} title="Open (Ctrl+O)">Open</button>
    <button on:click={handleSave} title="Save (Ctrl+S)" disabled={!currentTab}>Save</button>
    <button on:click={handleSaveAs} title="Save As (Ctrl+Shift+S)" disabled={!currentTab}>Save As</button>
    <span class="sep"></span>
    <div class="mode-group" role="group" aria-label="View mode">
      <button class:active={viewMode === 'edit'} on:click={() => setViewMode('edit')} title="Editor only">Edit</button>
      <button class:active={viewMode === 'split'} on:click={() => setViewMode('split')} title="Split (Ctrl+/)">Split</button>
      <button class:active={viewMode === 'preview'} on:click={() => setViewMode('preview')} title="Preview only">Preview</button>
    </div>
    <span class="spacer"></span>
    {#if platform.isWeb}
      <a class="winapp" href={platform.WIN_DOWNLOAD_URL} title="Download the Windows desktop app">⬇ Windows app</a>
    {/if}
    <span class="title">mdediter <span class="version">v{VERSION}</span></span>
  </header>

  <div class="tabs">
    {#each $tabs as tab (tab.id)}
      <div
        class="tab"
        class:active={tab.id === $activeTabId}
        on:click={() => activeTabId.set(tab.id)}
      >
        <span class="tab-title">
          {tab.title || 'untitled'}
          {#if tab.dirty}<span class="dirty">●</span>{/if}
        </span>
        <button class="tab-close" on:click|stopPropagation={() => handleCloseTab(tab.id)}>×</button>
      </div>
    {/each}
    <button class="tab-add" on:click={handleNew}>+</button>
  </div>

  <div class="workspace mode-{viewMode}">
    {#if currentTab}
      <div class="pane editor-pane" class:hidden={viewMode === 'preview'}>
        <div class="editor" bind:this={editorContainer}></div>
      </div>
      <div class="pane preview-pane" class:hidden={viewMode === 'edit'} bind:this={previewEl}>
        <div class="preview markdown-body">{@html previewHtml}</div>
      </div>
    {:else}
      <div class="empty">
        No tab open. Press Ctrl+O or drag &amp; drop a file.
      </div>
    {/if}
  </div>

  <footer class="statusbar">
    {#if currentTab}
      <span>{currentTab.path || '(unsaved)'}</span>
      <span class="spacer"></span>
      <span>{currentTab.content.length.toLocaleString()} chars</span>
      <span>{currentTab.content.split('\n').length.toLocaleString()} lines</span>
    {/if}
  </footer>
</div>

<style>
  :global(html, body, #app) {
    height: 100%;
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #1f2328;
    font-family: 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
    --wails-drop-target: drop;
  }
  :global(*) {
    box-sizing: border-box;
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #f6f8fa;
    border-bottom: 1px solid #d1d9e0;
  }
  .toolbar button {
    padding: 4px 10px;
    border: 1px solid #d1d9e0;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .toolbar button:hover:not(:disabled) {
    background: #eef2f5;
  }
  .toolbar button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .spacer {
    flex: 1;
  }
  .sep {
    width: 1px;
    align-self: stretch;
    background: #d1d9e0;
    margin: 2px 6px;
  }
  .title {
    color: #656d76;
    font-size: 12px;
  }
  .version {
    color: #8b949e;
    font-size: 11px;
    margin-left: 2px;
  }
  .winapp {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    margin-right: 10px;
    border: 1px solid #d1d9e0;
    border-radius: 4px;
    background: #fff;
    color: #0969da;
    font-size: 12px;
    text-decoration: none;
    white-space: nowrap;
  }
  .winapp:hover {
    background: #eef2f5;
  }
  .mode-group {
    display: inline-flex;
    border: 1px solid #d1d9e0;
    border-radius: 4px;
    overflow: hidden;
  }
  .mode-group button {
    border: none;
    border-radius: 0;
    padding: 4px 10px;
    background: #fff;
    font-size: 13px;
    cursor: pointer;
  }
  .mode-group button + button {
    border-left: 1px solid #d1d9e0;
  }
  .mode-group button.active {
    background: #0969da;
    color: #fff;
  }
  .mode-group button:hover:not(.active) {
    background: #eef2f5;
  }

  .tabs {
    display: flex;
    align-items: stretch;
    background: #eef2f5;
    border-bottom: 1px solid #d1d9e0;
    overflow-x: auto;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-right: 1px solid #d1d9e0;
    background: #eef2f5;
    cursor: pointer;
    font-size: 13px;
    user-select: none;
    white-space: nowrap;
  }
  .tab.active {
    background: #ffffff;
    border-bottom: 2px solid #0969da;
  }
  .tab-title {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dirty {
    color: #bf8700;
    margin-left: 4px;
  }
  .tab-close {
    background: transparent;
    border: none;
    cursor: pointer;
    color: #656d76;
    font-size: 14px;
    padding: 0 4px;
    border-radius: 3px;
  }
  .tab-close:hover {
    background: #d1d9e0;
    color: #1f2328;
  }
  .tab-add {
    background: transparent;
    border: none;
    cursor: pointer;
    color: #656d76;
    padding: 0 12px;
    font-size: 16px;
  }
  .tab-add:hover {
    background: #d1d9e0;
  }

  .workspace {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .pane {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }
  .pane.hidden {
    display: none;
  }
  .editor-pane {
    border-right: 1px solid #d1d9e0;
    background: #fff;
    --default-contextmenu: show;
  }
  .workspace.mode-preview .preview-pane,
  .workspace.mode-edit .editor-pane {
    border-right: none;
  }
  .editor {
    height: 100%;
  }
  :global(.editor .cm-editor) {
    height: 100%;
    font-family: 'Consolas', 'Menlo', monospace;
    font-size: 14px;
  }
  :global(.editor .cm-scroller) {
    font-family: inherit;
  }
  .preview-pane {
    background: #fff;
  }
  .preview {
    padding: 24px 32px;
    max-width: 920px;
    margin: 0 auto;
    line-height: 1.7;
  }
  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #656d76;
  }

  .statusbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 10px;
    background: #f6f8fa;
    border-top: 1px solid #d1d9e0;
    font-size: 12px;
    color: #656d76;
    min-height: 22px;
  }

  :global(.markdown-body h1),
  :global(.markdown-body h2) {
    border-bottom: 1px solid #d1d9e0;
    padding-bottom: 0.3em;
  }
  :global(.markdown-body h1) { font-size: 2em; margin: 0.67em 0; }
  :global(.markdown-body h2) { font-size: 1.5em; }
  :global(.markdown-body h3) { font-size: 1.25em; }
  :global(.markdown-body code) {
    background: #eef2f5;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Consolas', monospace;
    font-size: 0.9em;
  }
  :global(.markdown-body pre.hljs) {
    background: #f6f8fa;
    padding: 12px 16px;
    border-radius: 6px;
    overflow-x: auto;
  }
  :global(.markdown-body pre.hljs code) {
    background: transparent;
    padding: 0;
    font-size: 0.9em;
  }
  :global(.markdown-body table) {
    border-collapse: collapse;
    margin: 8px 0;
  }
  :global(.markdown-body th),
  :global(.markdown-body td) {
    border: 1px solid #d1d9e0;
    padding: 6px 12px;
  }
  :global(.markdown-body th) {
    background: #f6f8fa;
  }
  :global(.markdown-body blockquote) {
    border-left: 4px solid #d1d9e0;
    margin: 0;
    padding: 0 16px;
    color: #656d76;
  }
  :global(.markdown-body ul.contains-task-list) {
    list-style: none;
    padding-left: 20px;
  }
  :global(.markdown-body li.task-list-item input) {
    margin-right: 6px;
  }
  :global(.markdown-body img) {
    max-width: 100%;
  }
  :global(.markdown-body a) {
    color: #0969da;
  }
</style>

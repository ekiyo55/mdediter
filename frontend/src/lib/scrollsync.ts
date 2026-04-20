import type { EditorView } from '@codemirror/view';

export interface ScrollSync {
  attach(editorView: EditorView, previewEl: HTMLElement): void;
  detach(): void;
}

export function createScrollSync(): ScrollSync {
  let view: EditorView | null = null;
  let preview: HTMLElement | null = null;
  let locked = false;
  let unlockTimer: number | null = null;

  function lock() {
    locked = true;
    if (unlockTimer) window.clearTimeout(unlockTimer);
    unlockTimer = window.setTimeout(() => {
      locked = false;
    }, 120);
  }

  function ratioOf(el: HTMLElement | { scrollTop: number; scrollHeight: number; clientHeight: number }) {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return 0;
    return el.scrollTop / max;
  }

  function applyRatio(el: HTMLElement | { scrollHeight: number; clientHeight: number }, ratio: number): number {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return 0;
    return Math.max(0, Math.min(max, max * ratio));
  }

  function onEditorScroll() {
    if (locked || !view || !preview) return;
    const scrollDOM = view.scrollDOM;
    const ratio = ratioOf(scrollDOM);
    const target = applyRatio(preview, ratio);
    lock();
    preview.scrollTop = target;
  }

  function onPreviewScroll() {
    if (locked || !view || !preview) return;
    const ratio = ratioOf(preview);
    const scrollDOM = view.scrollDOM;
    const target = applyRatio(scrollDOM, ratio);
    lock();
    scrollDOM.scrollTop = target;
  }

  return {
    attach(editorView: EditorView, previewEl: HTMLElement) {
      this.detach();
      view = editorView;
      preview = previewEl;
      view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true });
      preview.addEventListener('scroll', onPreviewScroll, { passive: true });
    },
    detach() {
      if (view) view.scrollDOM.removeEventListener('scroll', onEditorScroll);
      if (preview) preview.removeEventListener('scroll', onPreviewScroll);
      view = null;
      preview = null;
      if (unlockTimer) {
        window.clearTimeout(unlockTimer);
        unlockTimer = null;
      }
      locked = false;
    },
  };
}

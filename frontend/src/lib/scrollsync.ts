import type { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';

export interface ScrollSync {
  attach(editorView: EditorView, previewEl: HTMLElement): void;
  detach(): void;
}

// Preview-height weights per source line, in "text line" units. Headings and
// table rows render taller in the preview than in the editor, which is what
// made the plain percentage sync drift in the middle of the document.
const WEIGHT_H1 = 4;
const WEIGHT_H2 = 3;
const WEIGHT_H3 = 2;
const WEIGHT_TABLE_ROW = 1.5;
// The |---|---| separator row renders no row of its own (only borders/margins).
const WEIGHT_TABLE_SEPARATOR = 0.5;
const WEIGHT_DEFAULT = 1;

function lineWeight(text: string): number {
  const heading = /^ {0,3}(#{1,6})\s/.exec(text);
  if (heading) {
    const level = heading[1].length;
    if (level === 1) return WEIGHT_H1;
    if (level === 2) return WEIGHT_H2;
    if (level === 3) return WEIGHT_H3;
    return WEIGHT_DEFAULT;
  }
  if (/^ {0,3}\|/.test(text)) {
    return /^ {0,3}\|[\s:|-]+\|?\s*$/.test(text) ? WEIGHT_TABLE_SEPARATOR : WEIGHT_TABLE_ROW;
  }
  return WEIGHT_DEFAULT;
}

export function createScrollSync(): ScrollSync {
  let view: EditorView | null = null;
  let preview: HTMLElement | null = null;
  let locked = false;
  let unlockTimer: number | null = null;

  // Weighted-line model, cached per immutable document instance.
  let cachedDoc: Text | null = null;
  let cum: number[] = []; // cum[i] = total weight of lines 1..i (cum[0] = 0)
  let total = 0;

  function ensureModel(doc: Text) {
    if (doc === cachedDoc) return;
    cachedDoc = doc;
    cum = new Array(doc.lines + 1);
    cum[0] = 0;
    for (let i = 1; i <= doc.lines; i++) {
      cum[i] = cum[i - 1] + lineWeight(doc.line(i).text);
    }
    total = Math.max(cum[doc.lines], 1);
  }

  function lock() {
    locked = true;
    if (unlockTimer) window.clearTimeout(unlockTimer);
    unlockTimer = window.setTimeout(() => {
      locked = false;
    }, 120);
  }

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
  }

  // The anchor slides from the viewport top (at scroll start) to the viewport
  // bottom (at scroll end) so both panes always meet exactly at the ends.
  function onEditorScroll() {
    if (locked || !view || !preview) return;
    const scrollDOM = view.scrollDOM;
    const editorMax = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const previewMax = preview.scrollHeight - preview.clientHeight;
    if (editorMax <= 0 || previewMax <= 0) return;

    ensureModel(view.state.doc);
    const r = clamp(scrollDOM.scrollTop / editorMax, 0, 1);
    const padTop = view.documentPadding.top;
    const anchorY = scrollDOM.scrollTop + r * scrollDOM.clientHeight - padTop;
    const block = view.lineBlockAtHeight(Math.max(0, anchorY));
    const lineNo = view.state.doc.lineAt(block.from).number;
    const frac = block.height > 0 ? clamp((anchorY - block.top) / block.height, 0, 1) : 0;
    const p = (cum[lineNo - 1] + frac * (cum[lineNo] - cum[lineNo - 1])) / total;

    const target = clamp(p * preview.scrollHeight - r * preview.clientHeight, 0, previewMax);
    lock();
    preview.scrollTop = target;
  }

  function onPreviewScroll() {
    if (locked || !view || !preview) return;
    const scrollDOM = view.scrollDOM;
    const editorMax = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const previewMax = preview.scrollHeight - preview.clientHeight;
    if (editorMax <= 0 || previewMax <= 0) return;

    ensureModel(view.state.doc);
    const r = clamp(preview.scrollTop / previewMax, 0, 1);
    const p = clamp((preview.scrollTop + r * preview.clientHeight) / preview.scrollHeight, 0, 1);

    // Find the source line whose cumulative weight spans p * total.
    const w = p * total;
    let lo = 1;
    let hi = view.state.doc.lines;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < w) lo = mid + 1;
      else hi = mid;
    }
    const lineNo = lo;
    const span = cum[lineNo] - cum[lineNo - 1];
    const frac = span > 0 ? clamp((w - cum[lineNo - 1]) / span, 0, 1) : 0;

    const block = view.lineBlockAt(view.state.doc.line(lineNo).from);
    const y = block.top + frac * block.height + view.documentPadding.top;
    const target = clamp(y - r * scrollDOM.clientHeight, 0, editorMax);
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
      cachedDoc = null;
      cum = [];
      total = 0;
      if (unlockTimer) {
        window.clearTimeout(unlockTimer);
        unlockTimer = null;
      }
      locked = false;
    },
  };
}

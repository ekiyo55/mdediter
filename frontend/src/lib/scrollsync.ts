import type { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';

export interface ScrollSync {
  attach(editorView: EditorView, previewEl: HTMLElement): void;
  detach(): void;
}

// Measured-anchor sync: the preview renderer stamps each top-level block with
// its source line (`data-line`, 0-based). From those we build a piecewise
// mapping between editor pixel positions (CodeMirror line geometry) and
// preview pixel positions (actual rendered offsets), so block boundaries
// align exactly regardless of fonts, wrapping, images or math. Positions
// between anchors are linearly interpolated.
export function createScrollSync(): ScrollSync {
  let view: EditorView | null = null;
  let preview: HTMLElement | null = null;
  let locked = false;
  let unlockTimer: number | null = null;

  // Parallel monotonic arrays: eY[i] (editor scrollTop space) <-> pY[i]
  // (preview scrollTop space), with 0 and full scroll height as sentinels.
  let eY: number[] = [];
  let pY: number[] = [];
  let cachedDoc: Text | null = null;
  let cachedEH = -1;
  let cachedPH = -1;

  function ensureTable() {
    if (!view || !preview) return;
    const scrollDOM = view.scrollDOM;
    const doc = view.state.doc;
    if (
      doc === cachedDoc &&
      Math.abs(scrollDOM.scrollHeight - cachedEH) <= 4 &&
      Math.abs(preview.scrollHeight - cachedPH) <= 4
    ) {
      return;
    }
    cachedDoc = doc;
    cachedEH = scrollDOM.scrollHeight;
    cachedPH = preview.scrollHeight;

    const padTop = view.documentPadding.top;
    const previewTop = preview.getBoundingClientRect().top;
    const rawE: number[] = [0];
    const rawP: number[] = [0];
    preview.querySelectorAll('[data-line]').forEach((el) => {
      const n = Number(el.getAttribute('data-line'));
      if (!Number.isFinite(n) || !view || !preview) return;
      const lineNo = Math.max(1, Math.min(doc.lines, n + 1)); // data-line is 0-based
      const block = view.lineBlockAt(doc.line(lineNo).from);
      rawE.push(block.top + padTop);
      rawP.push(el.getBoundingClientRect().top - previewTop + preview.scrollTop);
    });
    rawE.push(scrollDOM.scrollHeight);
    rawP.push(preview.scrollHeight);

    // Keep only pairs that advance on both axes so interpolation stays sane.
    eY = [rawE[0]];
    pY = [rawP[0]];
    for (let i = 1; i < rawE.length; i++) {
      if (rawE[i] > eY[eY.length - 1] && rawP[i] > pY[pY.length - 1]) {
        eY.push(rawE[i]);
        pY.push(rawP[i]);
      }
    }
  }

  function mapY(from: number[], to: number[], y: number): number {
    const last = from.length - 1;
    if (last < 1 || y <= from[0]) return to[0] ?? 0;
    if (y >= from[last]) return to[last];
    let lo = 0;
    let hi = last;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (from[mid] <= y) lo = mid;
      else hi = mid;
    }
    const span = from[hi] - from[lo];
    const frac = span > 0 ? (y - from[lo]) / span : 0;
    return to[lo] + frac * (to[hi] - to[lo]);
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

  // The reference point slides from the viewport top (at scroll start) to the
  // viewport bottom (at scroll end) so both panes meet exactly at the ends.
  function onEditorScroll() {
    if (locked || !view || !preview) return;
    const scrollDOM = view.scrollDOM;
    const editorMax = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const previewMax = preview.scrollHeight - preview.clientHeight;
    if (editorMax <= 0 || previewMax <= 0) return;

    ensureTable();
    const r = clamp(scrollDOM.scrollTop / editorMax, 0, 1);
    const anchorY = scrollDOM.scrollTop + r * scrollDOM.clientHeight;
    const target = clamp(mapY(eY, pY, anchorY) - r * preview.clientHeight, 0, previewMax);
    lock();
    preview.scrollTop = target;
  }

  function onPreviewScroll() {
    if (locked || !view || !preview) return;
    const scrollDOM = view.scrollDOM;
    const editorMax = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const previewMax = preview.scrollHeight - preview.clientHeight;
    if (editorMax <= 0 || previewMax <= 0) return;

    ensureTable();
    const r = clamp(preview.scrollTop / previewMax, 0, 1);
    const anchorY = preview.scrollTop + r * preview.clientHeight;
    const target = clamp(mapY(pY, eY, anchorY) - r * scrollDOM.clientHeight, 0, editorMax);
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
      eY = [];
      pY = [];
      cachedDoc = null;
      cachedEH = -1;
      cachedPH = -1;
      if (unlockTimer) {
        window.clearTimeout(unlockTimer);
        unlockTimer = null;
      }
      locked = false;
    },
  };
}

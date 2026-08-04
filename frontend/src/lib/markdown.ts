import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import katex from '@vscode/markdown-it-katex';
import cjkFriendly from 'markdown-it-cjk-friendly';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const result = hljs.highlight(str, { language: lang, ignoreIllegals: true });
        return `<pre class="hljs"><code>${result.value}</code></pre>`;
      } catch (_) {}
    }
    const escaped = md.utils.escapeHtml(str);
    return `<pre class="hljs"><code>${escaped}</code></pre>`;
  },
});

md.use(taskLists, { enabled: true, label: true });
md.use(katex, { throwOnError: false, errorColor: '#cc0000' });
// CommonMark's flanking rules treat CJK brackets (「」（） etc.) as punctuation,
// so e.g. **「…」**を fails to close and renders literally. This plugin applies
// the proposed CJK-aware amendment to the emphasis rules.
md.use(cjkFriendly);

md.core.ruler.push('source_lines', (state) => {
  for (const token of state.tokens) {
    // Level 1 included so list items (<li>) also carry anchors — scrollsync
    // builds its editor<->preview position table from these.
    if (token.map && token.level <= 1) {
      token.attrSet('data-line', String(token.map[0]));
    }
  }
});

export function renderMarkdown(source: string): string {
  return md.render(source);
}

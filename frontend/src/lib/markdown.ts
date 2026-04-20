import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import katex from '@vscode/markdown-it-katex';
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

md.core.ruler.push('source_lines', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.level === 0) {
      token.attrSet('data-line', String(token.map[0]));
    }
  }
});

export function renderMarkdown(source: string): string {
  return md.render(source);
}

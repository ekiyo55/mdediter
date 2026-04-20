import './style.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import App from './App.svelte';

const app = new App({
  target: document.getElementById('app') as HTMLElement,
});

export default app;

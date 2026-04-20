import { writable, get } from 'svelte/store';

export interface Tab {
  id: string;
  path: string;
  title: string;
  content: string;
  savedContent: string;
  dirty: boolean;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function titleFromPath(path: string): string {
  if (!path) return 'untitled';
  const norm = path.replace(/\\/g, '/');
  const parts = norm.split('/');
  return parts[parts.length - 1] || path;
}

export const tabs = writable<Tab[]>([]);
export const activeTabId = writable<string>('');

export function newTab(content = '', path = ''): Tab {
  const tab: Tab = {
    id: makeId(),
    path,
    title: titleFromPath(path),
    content,
    savedContent: content,
    dirty: false,
  };
  tabs.update((list) => [...list, tab]);
  activeTabId.set(tab.id);
  return tab;
}

export function closeTab(id: string) {
  tabs.update((list) => list.filter((t) => t.id !== id));
  const rest = get(tabs);
  if (rest.length === 0) {
    activeTabId.set('');
  } else if (get(activeTabId) === id) {
    activeTabId.set(rest[rest.length - 1].id);
  }
}

export function updateTabContent(id: string, content: string) {
  tabs.update((list) =>
    list.map((t) => (t.id === id ? { ...t, content, dirty: content !== t.savedContent } : t))
  );
}

export function markSaved(id: string, path: string, content: string) {
  tabs.update((list) =>
    list.map((t) =>
      t.id === id ? { ...t, path, title: titleFromPath(path), savedContent: content, content, dirty: false } : t
    )
  );
}

export function getActiveTab(): Tab | undefined {
  const id = get(activeTabId);
  return get(tabs).find((t) => t.id === id);
}

export function findTabByPath(path: string): Tab | undefined {
  return get(tabs).find((t) => t.path === path);
}

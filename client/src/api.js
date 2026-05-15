const BASE = '/api';

export async function listThemes() {
  const res = await fetch(`${BASE}/themes`);
  if (!res.ok) throw new Error(`Failed to load themes (${res.status})`);
  return res.json();
}

export async function queryTheme(slug) {
  const res = await fetch(`${BASE}/themes/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`Failed to query theme "${slug}" (${res.status})`);
  return res.json();
}

export async function searchFreeText(query) {
  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
  return data;
}

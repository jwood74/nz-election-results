import { sourceTime } from './model.js';
export const $ = id => document.getElementById(id);
export const int = value => value == null ? '—' : value.toLocaleString('en-NZ');
export const pct = value => value == null ? '—' : `${value.toFixed(1)}%`;
export const clock = value => Number.isFinite(sourceTime(value)) ? new Date(sourceTime(value)).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
export function saved(key) { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value : []); } catch { return new Set(); } }
export function save(key, value) { try { localStorage.setItem(key, JSON.stringify([...value])); } catch { /* Storage is optional. */ } }
export function node(tag, text, className) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; }
export function cell(row, text, className) { const n = node('td', text, className); row.append(n); return n; }
export function message(body, text, cols) { const tr = node('tr'); const td = cell(tr, text); td.colSpan = cols; body.replaceChildren(tr); }
export async function get(path) {
  const response = await fetch(`/api/${path}`, { cache: 'no-cache', signal: AbortSignal.timeout(55_000) });
  if (!response.ok) throw new Error(`${path} unavailable`);
  return response.json();
}

'use client';
// app/dashboard/_ui.jsx — small shared UI pieces for every dashboard
// page: toasts with "เลิกทำ" (undo) for deletes, loading skeletons,
// an error state with retry, the mobile "+" button, and apiGet().

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- API helper ----------
// Throws on network failure / non-OK so pages can show <ErrorState>
// instead of silently staying on "loading" forever. 401 → login.
export async function apiGet(url) {
  let res;
  try { res = await fetch(url); } catch { throw new Error('network'); }
  if (res.status === 401) { window.location.href = '/login'; throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

// ---------- Deferred ("undo-able") deletes ----------
// A delete removes the item from the screen at once, but the real
// DELETE request only fires after UNDO_MS — until then the item's id is
// in `pendingDeletes`, which pages use to filter it out of any reload
// (otherwise the 8-second auto-refresh would bring it right back).
export const pendingDeletes = new Set();
export const withoutPending = list => (Array.isArray(list) ? list.filter(i => !pendingDeletes.has(String(i.id))) : list);
const UNDO_MS = 6000;

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const pending = useRef(new Map()); // toastId → { commit, timer, id }
  const seq = useRef(0);

  const dismiss = useCallback(toastId => setToasts(t => t.filter(x => x.toastId !== toastId)), []);

  const show = useCallback((message, opts = {}) => {
    const toastId = ++seq.current;
    setToasts(t => [...t.slice(-2), { toastId, message, tone: opts.tone || 'info', action: opts.action }]);
    if (!opts.sticky) setTimeout(() => dismiss(toastId), opts.duration || 3500);
    return toastId;
  }, [dismiss]);

  // remove(): hide the item from local state now. commit(): the real
  // network delete. restore(): put it back (called on undo).
  const undoableDelete = useCallback(({ id, label, remove, commit, restore }) => {
    const key = String(id);
    pendingDeletes.add(key);
    remove();
    const toastId = ++seq.current;
    const finish = async () => {
      const entry = pending.current.get(toastId);
      if (!entry) return;
      pending.current.delete(toastId);
      clearTimeout(entry.timer);
      try { await commit(); } finally { pendingDeletes.delete(key); }
      dismiss(toastId);
    };
    const timer = setTimeout(finish, UNDO_MS);
    pending.current.set(toastId, { timer, commit: finish });
    setToasts(t => [...t.slice(-2), {
      toastId, message: label || 'ลบแล้ว', tone: 'info',
      action: {
        label: 'เลิกทำ',
        onClick: () => {
          const entry = pending.current.get(toastId);
          if (!entry) return;
          clearTimeout(entry.timer);
          pending.current.delete(toastId);
          pendingDeletes.delete(key);
          restore();
          dismiss(toastId);
        },
      },
    }]);
  }, [dismiss]);

  // Leaving the page mid-undo-window must not lose the delete.
  useEffect(() => {
    const flush = () => { for (const e of [...pending.current.values()]) e.commit(); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  return (
    <ToastCtx.Provider value={{ show, undoableDelete }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.toastId} className={`toast toast-${t.tone}`}>
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action && <button type="button" className="toast-action" onClick={t.action.onClick}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  // Pages are always under the dashboard layout, but never crash if not.
  return ctx || { show: () => {}, undoableDelete: ({ remove, commit }) => { remove(); commit(); } };
}

// ---------- Loading / error ----------
export function ListSkeleton({ rows = 3, height = 64 }) {
  return (
    <div className="list-stack" aria-busy="true" aria-label="กำลังโหลด">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height }} />)}
    </div>
  );
}

export function ErrorState({ onRetry, message }) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div className="glass-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.8rem' }}>{offline ? '📡' : '⚠️'}</div>
      <p style={{ margin: '0.4rem 0 0.8rem' }}>
        {message || (offline ? 'ดูเหมือนออฟไลน์อยู่ครับ' : 'โหลดข้อมูลไม่สำเร็จ')}
      </p>
      <button type="button" className="glass-btn" onClick={onRetry}>🔄 ลองอีกครั้ง</button>
    </div>
  );
}

// ---------- Mobile "+" button ----------
export function Fab({ onClick, label }) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={label} title={label}>＋</button>
  );
}

// ---------- Share ----------
export async function shareText({ title, text }, toast) {
  try {
    if (navigator.share) { await navigator.share({ title: title || undefined, text }); return; }
    await navigator.clipboard.writeText(title ? `${title}\n\n${text}` : text);
    toast?.show('คัดลอกข้อความแล้ว');
  } catch (e) {
    if (e?.name !== 'AbortError') toast?.show('แชร์ไม่สำเร็จ', { tone: 'error' });
  }
}

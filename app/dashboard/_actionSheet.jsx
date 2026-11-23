'use client';
// app/dashboard/_actionSheet.jsx — the "⋯" menu: a bottom sheet with a grid of big icon + label buttons.
// Used on phones in place of a long row of small buttons (note editor, task cards). items:
//   [{ key, icon, label, onClick, danger?, disabled?, active? }]  — falsy entries are skipped.
// Tapping an item closes the sheet first, then runs its action.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDialogGuard, dialogGuard } from './_ui';

export function ActionSheet({ title, items, onClose }) {
  useDialogGuard();
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);
  const list = (items || []).filter(Boolean);
  return createPortal(
    // portal to <body>: an editor's click-outside handler must not see these clicks
    <div className="convert-overlay" {...dialogGuard(onClose)}>
      <div className="convert-sheet as-sheet" role="dialog" aria-modal="true" aria-label={title || 'เมนู'}>
        {title && <h2 className="convert-title as-title">{title}</h2>}
        <div className="as-grid">
          {list.map(it => (
            <button key={it.key} type="button" data-act={it.key} disabled={it.disabled}
              className={`as-item${it.danger ? ' danger' : ''}${it.active ? ' on' : ''}`}
              onClick={() => { onClose(); it.onClick?.(); }}>
              <span className="as-ico" aria-hidden="true">{it.icon}</span>
              <span className="as-label">{it.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="glass-btn-outline" style={{ width: '100%', marginTop: '0.8rem' }} onClick={onClose}>ปิด</button>
      </div>
    </div>,
    document.body
  );
}

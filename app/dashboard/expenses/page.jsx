'use client';
// app/dashboard/expenses/page.jsx — income/expense ledger as cards
// grouped by day (a wide table cut off the amount column on phones),
// with add / edit / delete-with-undo. Supports ?id=... (auto-open from
// a LIFF link) and ?new=1 (open the add form).

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashNav, CategorySelect, EXPENSE_CATEGORIES } from '../_components';
import { apiGet, ErrorState, Fab, ListSkeleton, useToast, withoutPending } from '../_ui';

export default function ExpensesPage() {
  return (
    <Suspense fallback={<main className="page"><ListSkeleton /></main>}>
      <ExpensesPageInner />
    </Suspense>
  );
}

const CAT_ICON = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c.key, c.label.split(' ')[0]]));
const catIcon = (cat, type) => CAT_ICON[cat] || (type === 'income' ? '💵' : '💸');
const money = n => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const dayKey = iso => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

function dayLabel(iso) {
  const d = new Date(iso), t = new Date();
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (dayKey(iso) === dayKey(t.toISOString())) return 'วันนี้';
  if (dayKey(iso) === dayKey(y.toISOString())) return 'เมื่อวาน';
  return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function ExpenseEditor({ expense, categories, onSave, onCancel, onDelete }) {
  const isNew = !expense.id;
  const [type, setType] = useState(expense.type || 'expense');
  const [amount, setAmount] = useState(isNew ? '' : String(expense.amount ?? ''));
  const [category, setCategory] = useState(expense.category || (type === 'income' ? 'salary' : 'food'));
  const [memo, setMemo] = useState(expense.memo || '');
  const [saving, setSaving] = useState(false);
  const valid = parseFloat(amount) > 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    await onSave(expense.id, { type, amount: parseFloat(amount), category, memo: memo || null });
    setSaving(false);
  }

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {[['expense', '💸 รายจ่าย'], ['income', '💵 รายรับ']].map(([val, label]) => (
          <button key={val} type="button" onClick={() => setType(val)}
            style={{ flex: 1, padding: '0.5rem', minHeight: 44, borderRadius: 10, border: type === val ? '2px solid var(--accent)' : '1px solid var(--border-strong)', background: type === val ? 'var(--accent-soft)' : 'var(--surface-muted)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: type === val ? 'bold' : 'normal', cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <input type="number" inputMode="decimal" className="glass-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="จำนวนเงิน" autoFocus={isNew} style={{ flex: 1, minWidth: 100 }} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <CategorySelect options={categories} value={category} onChange={setCategory} />
        </div>
      </div>
      <input className="glass-input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="รายละเอียด (ไม่บังคับ)" style={{ width: '100%', marginBottom: '0.6rem' }} />
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
        {isNew ? <span /> : <button className="note-icon-btn" onClick={() => onDelete(expense)}>🗑️ ลบ</button>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="glass-btn-outline" onClick={onCancel}>ยกเลิก</button>
          <button className="glass-btn" onClick={save} disabled={saving || !valid}>{saving ? 'กำลังบันทึก...' : isNew ? '➕ เพิ่มรายการ' : '✅ บันทึก'}</button>
        </div>
      </div>
    </div>
  );
}

function ExpensesPageInner() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState(false);
  const [editingId, setEditingId] = useState(searchParams.get('id'));
  const [adding, setAdding] = useState(searchParams.get('new') === '1');
  const [filter, setFilter] = useState('all'); // all | expense | income
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiGet('/api/expenses');
      setExpenses(withoutPending(data.expenses));
    } catch (e) { if (e.message !== 'unauthorized') setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function exportToSheet() {
    setExporting(true);
    try {
      const res = await fetch('/api/expenses/export-sheet', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
        toast.show(`✅ ส่งออก ${data.count} รายการไปที่ Google Sheets แล้วครับ`);
      } else if (data.error === 'not_connected' && data.connectUrl) {
        if (confirm('ต้องเชื่อมต่อ Google ก่อนถึงจะส่งออกได้ครับ ไปเชื่อมต่อตอนนี้เลยไหม?')) window.location.href = data.connectUrl;
      } else {
        toast.show('❌ ส่งออกไม่สำเร็จ ลองอีกครั้งครับ', { tone: 'error' });
      }
    } catch (e) {
      toast.show('❌ ส่งออกไม่สำเร็จ ลองอีกครั้งครับ', { tone: 'error' });
    } finally { setExporting(false); }
  }

  // Dropdown options = defaults + any custom category this user already
  // used (so a custom one stays selectable next time).
  const categoryOptions = (() => {
    const defaults = new Set(EXPENSE_CATEGORIES.map(c => c.key));
    const used = [...new Set((expenses || []).map(e => e.category).filter(Boolean))].filter(cat => !defaults.has(cat));
    return [...EXPENSE_CATEGORIES, ...used.map(cat => ({ key: cat, label: `🏷️ ${cat}` }))];
  })();

  async function saveExpense(id, payload) {
    const isNew = !id;
    const res = await fetch(isNew ? '/api/expenses' : `/api/expenses/${id}`, {
      method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('saveExpense failed:', await res.json().catch(() => ({})));
      toast.show(isNew ? '❌ เพิ่มรายการไม่สำเร็จ' : '❌ บันทึกไม่สำเร็จ', { tone: 'error' });
      return;
    }
    toast.show(isNew ? '✅ เพิ่มรายการแล้วครับ' : '✅ บันทึกเรียบร้อยแล้วครับ');
    setEditingId(null); setAdding(false);
    load();
  }

  function deleteExpense(exp) {
    toast.undoableDelete({
      id: exp.id,
      label: `ลบรายการ ${money(exp.amount)} บาทแล้ว`,
      remove: () => { setExpenses(prev => prev?.filter(x => x.id !== exp.id)); setEditingId(null); },
      commit: async () => {
        try {
          const res = await fetch(`/api/expenses/${exp.id}`, { method: 'DELETE', keepalive: true });
          if (!res.ok) throw new Error(String(res.status));
        } catch (e) { toast.show('❌ ลบไม่สำเร็จ', { tone: 'error' }); load(); }
      },
      restore: () => setExpenses(prev => prev ? [...prev, exp].sort((a, b) => b.created_at.localeCompare(a.created_at)) : prev),
    });
  }

  // ---- derived numbers ----
  const list = expenses || [];
  let net = 0, monthIn = 0, monthOut = 0;
  const now = new Date();
  for (const e of list) {
    const amt = parseFloat(e.amount) || 0;
    net += e.type === 'income' ? amt : -amt;
    const d = new Date(e.created_at);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      if (e.type === 'income') monthIn += amt; else monthOut += amt;
    }
  }
  const shown = filter === 'all' ? list : list.filter(e => e.type === filter);
  const groups = [];
  for (const e of shown) {
    const k = dayKey(e.created_at);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, label: dayLabel(e.created_at), items: [] });
    groups[groups.length - 1].items.push(e);
  }

  return (
    <main className="page">
      <DashNav />
      <div className="page-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>💰 รายรับ-รายจ่าย</h1>
        <button type="button" className="glass-btn" onClick={() => { setEditingId(null); setAdding(true); }}>➕ เพิ่ม</button>
      </div>

      {error && <ErrorState onRetry={() => { setExpenses(null); load(); }} />}
      {!error && expenses === null && <ListSkeleton />}

      {expenses && (
        <>
          <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '0.8rem' }}>
            <div className="muted">ยอดสุทธิทั้งหมด</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 700, color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {net >= 0 ? '' : '-'}{money(Math.abs(net))} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>บาท</span>
            </div>
            <div className="summary-split">
              <div><span className="muted">เดือนนี้ รับ</span><b style={{ color: 'var(--success)' }}>+{money(monthIn)}</b></div>
              <div><span className="muted">เดือนนี้ จ่าย</span><b style={{ color: 'var(--danger)' }}>-{money(monthOut)}</b></div>
            </div>
          </div>

          <div className="chip-row">
            {[['all', 'ทั้งหมด'], ['expense', '💸 รายจ่าย'], ['income', '💵 รายรับ']].map(([k, l]) => (
              <button key={k} type="button" className={`chip${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
            <button type="button" className="chip" onClick={exportToSheet} disabled={exporting} style={{ marginLeft: 'auto' }}>
              {exporting ? 'กำลังส่งออก...' : '📊 ส่งออก Sheets'}
            </button>
          </div>

          {adding && <div style={{ marginBottom: '0.8rem' }}><ExpenseEditor key="new" expense={{}} categories={categoryOptions} onSave={saveExpense} onCancel={() => setAdding(false)} /></div>}
          {list.length === 0 && !adding && <div className="glass-card"><p className="muted" style={{ margin: 0 }}>ยังไม่มีรายการครับ กด ➕ เพิ่ม หรือพิมพ์บอก Dee ในแชท LINE ได้เลย</p></div>}

          {groups.map(g => (
            <section key={g.k} style={{ marginBottom: '0.9rem' }}>
              <div className="group-label">{g.label}</div>
              <div className="list-stack">
                {g.items.map(e => editingId === String(e.id)
                  ? <ExpenseEditor key={e.id} expense={e} categories={categoryOptions} onSave={saveExpense} onCancel={() => setEditingId(null)} onDelete={deleteExpense} />
                  : (
                    <div key={e.id} className="glass-card exp-row" onClick={() => { setAdding(false); setEditingId(String(e.id)); }}>
                      <span className="exp-icon">{catIcon(e.category, e.type)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="exp-memo">{e.memo || e.category || '-'}</div>
                        <div className="muted">{e.category}{' · '}{new Date(e.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="exp-amount" style={{ color: e.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                        {e.type === 'income' ? '+' : '-'}{money(e.amount)}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
      {!adding && !editingId && <Fab onClick={() => { setEditingId(null); setAdding(true); }} label="เพิ่มรายการ" />}
    </main>
  );
}

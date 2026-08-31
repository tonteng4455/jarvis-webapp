'use client';
// app/dashboard/expenses/page.jsx — table view (Premium) with
// click-to-edit inline, matching the same edit/delete pattern already
// used for tasks/calendar. Supports ?id=... auto-open from a LIFF link
// the same way the other dashboard pages do.

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashNav, PremiumUpsell, formatDate } from '../_components';

export default function ExpensesPage() {
  return (
    <Suspense fallback={<main className="page"><p className="text-white-muted">กำลังโหลด...</p></main>}>
      <ExpensesPageInner />
    </Suspense>
  );
}

function ExpenseEditor({ expense, onSave, onCancel, onDelete }) {
  const [type, setType] = useState(expense.type || 'expense');
  const [amount, setAmount] = useState(String(expense.amount ?? ''));
  const [category, setCategory] = useState(expense.category || '');
  const [memo, setMemo] = useState(expense.memo || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(expense.id, { type, amount: parseFloat(amount) || 0, category, memo: memo || null });
    setSaving(false);
  }

  return (
    <tr>
      <td colSpan={4} style={{ padding: '0.8rem 0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
          {[['expense', '💸 รายจ่าย'], ['income', '💵 รายรับ']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => setType(val)}
              style={{ flex: 1, padding: '0.4rem', borderRadius: 8, border: type === val ? '2px solid #1DB4A6' : '1px solid rgba(0,0,0,0.15)', background: type === val ? '#1DB4A622' : 'rgba(0,0,0,0.05)', color: '#333', fontSize: '0.8rem', fontWeight: type === val ? 'bold' : 'normal' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <input type="number" inputMode="decimal" className="glass-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="จำนวนเงิน" style={{ flex: 1, minWidth: 100 }} />
          <input className="glass-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="หมวดหมู่" style={{ flex: 1, minWidth: 100 }} />
        </div>
        <input className="glass-input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="รายละเอียด (ไม่บังคับ)" style={{ width: '100%', marginBottom: '0.6rem' }} />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          <button className="note-icon-btn" onClick={() => { if (confirm('ลบรายการนี้ใช่ไหม?')) onDelete(expense.id); }}>🗑️ ลบ</button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="glass-btn-outline" onClick={onCancel} style={{ color: '#333', background: 'rgba(0,0,0,0.05)', borderColor: 'rgba(0,0,0,0.15)' }}>ยกเลิก</button>
            <button className="glass-btn" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก...' : '✅ บันทึก'}</button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ExpensesPageInner() {
  const [expenses, setExpenses] = useState(null);
  const [net, setNet] = useState(0);
  const [locked, setLocked] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setEditingId(id);
  }, [searchParams]);

  function load() {
    fetch('/api/expenses').then(async res => {
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.status === 403) { setLocked(true); return; }
      const data = await res.json();
      setExpenses(data.expenses);
      setNet(data.net);
    });
  }

  useEffect(() => { load(); }, []);

  async function saveExpense(id, patch) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!res.ok) { setStatus('❌ บันทึกไม่สำเร็จ'); return; }
    setStatus('✅ บันทึกเรียบร้อยแล้วครับ');
    setEditingId(null);
    load();
  }

  async function deleteExpense(id) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) { setStatus('❌ ลบไม่สำเร็จ'); return; }
    setEditingId(null);
    load();
  }

  return (
    <main className="page">
      <DashNav current="expenses" />
      <h1 className="page-title">💰 บัญชีรายรับ-รายจ่าย</h1>
      {locked && <PremiumUpsell />}
      {!locked && expenses === null && <p className="text-white-muted">กำลังโหลด...</p>}
      {!locked && expenses && (
        <>
          <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div className="muted">ยอดสุทธิ</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: net >= 0 ? '#2ECC71' : '#E74C3C' }}>
              {net.toLocaleString()} บาท
            </div>
          </div>
          {status && <p className="text-white-muted" style={{ marginBottom: '0.8rem' }}>{status}</p>}
          {expenses.length === 0 && <div className="glass-card"><p className="muted">ยังไม่มีรายการครับ</p></div>}
          {expenses.length > 0 && (
            <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                    <th style={thStyle}>วันที่</th>
                    <th style={thStyle}>รายการ</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>หมวดหมู่</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e, i) => editingId === String(e.id) ? (
                    <ExpenseEditor key={e.id} expense={e} onSave={saveExpense} onCancel={() => setEditingId(null)} onDelete={deleteExpense} />
                  ) : (
                    <tr key={e.id} style={{ borderBottom: i < expenses.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none', cursor: 'pointer' }}
                      onClick={() => setEditingId(String(e.id))}>
                      <td style={tdStyle}><span className="muted">{formatDate(e.created_at)}</span></td>
                      <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{e.memo || '-'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span className="muted">{e.type === 'income' ? '💵' : '💸'} {e.category}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: e.type === 'income' ? '#2ECC71' : '#E74C3C', whiteSpace: 'nowrap' }}>
                        {e.type === 'income' ? '+' : '-'}{parseFloat(e.amount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const thStyle = { textAlign: 'left', padding: '0.7rem 0.9rem', fontSize: '0.75rem', color: '#5a5d6d', fontWeight: 600 };
const tdStyle = { padding: '0.6rem 0.9rem', fontSize: '0.85rem', color: '#2c2f3d', verticalAlign: 'top' };

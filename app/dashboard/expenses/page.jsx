'use client';
// app/dashboard/expenses/page.jsx — read-only Expense view (Premium only).

import { useState, useEffect } from 'react';
import { DashNav, PremiumUpsell, formatDate } from '../_components';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState(null);
  const [net, setNet] = useState(0);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch('/api/expenses').then(async res => {
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.status === 403) { setLocked(true); return; }
      const data = await res.json();
      setExpenses(data.expenses);
      setNet(data.net);
    });
  }, []);

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
          {expenses.length === 0 && <div className="glass-card"><p className="muted">ยังไม่มีรายการครับ</p></div>}
          <div className="list-stack">
            {expenses.map(e => (
              <div key={e.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.9rem' }}>
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{e.type === 'income' ? '💵' : '💸'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem' }}>{e.memo || e.category}</div>
                  <div className="muted">{e.category} · {formatDate(e.created_at)}</div>
                </div>
                <div style={{ fontWeight: 'bold', color: e.type === 'income' ? '#2ECC71' : '#E74C3C', flexShrink: 0 }}>
                  {e.type === 'income' ? '+' : '-'}{parseFloat(e.amount).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

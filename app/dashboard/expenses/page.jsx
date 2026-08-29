'use client';
// app/dashboard/expenses/page.jsx — read-only Expense view (Premium
// only), shown as an actual table (not a card list) — easier to scan
// many transactions at a glance, and closer to how people expect to
// read a ledger.

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
          {expenses.length > 0 && (
            // Horizontal-scroll wrapper — on a narrow phone screen a
            // 4-column table would otherwise crush the memo column
            // unreadably; letting the table itself scroll sideways
            // keeps every column legible instead.
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
                  {expenses.map((e, i) => (
                    <tr key={e.id} style={{ borderBottom: i < expenses.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
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

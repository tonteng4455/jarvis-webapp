'use client';
// app/dashboard/tasks/page.jsx — read-only Tasks view (Premium only).

import { useState, useEffect } from 'react';
import { DashNav, PremiumUpsell } from '../_components';

const PRIORITY_COLOR = { high: '#E74C3C', medium: '#FFB84D', low: '#2ECC71' };
const PRIORITY_LABEL = { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' };

export default function TasksPage() {
  const [tasks, setTasks] = useState(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch('/api/tasks').then(async res => {
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.status === 403) { setLocked(true); return; }
      const data = await res.json();
      setTasks(data.tasks);
    });
  }, []);

  return (
    <main className="page">
      <DashNav current="tasks" />
      <h1 className="page-title">✅ งานของฉัน</h1>
      {locked && <PremiumUpsell />}
      {!locked && tasks === null && <p className="text-white-muted">กำลังโหลด...</p>}
      {!locked && tasks?.length === 0 && <div className="glass-card"><p className="muted">ไม่มีงานค้างครับ 🎉</p></div>}
      {!locked && tasks?.length > 0 && (
        <div className="list-stack">
          {tasks.map(t => (
            <div key={t.id} className="glass-card" style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.9rem', opacity: t.is_done ? 0.55 : 1,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[t.priority] || '#888', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', textDecoration: t.is_done ? 'line-through' : 'none' }}>{t.task_name}</div>
                <div className="muted">{t.category || 'general'} · ความสำคัญ: {PRIORITY_LABEL[t.priority] || t.priority}</div>
              </div>
              {t.is_done && <span style={{ fontSize: '0.75rem', color: '#2ECC71', flexShrink: 0 }}>เสร็จแล้ว</span>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

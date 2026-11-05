'use client';
// app/dashboard/group/page.jsx — the ⚙️ page of a group space: Google of the group, file saving, reminders for me, the 30-day trash.
// Everything the bot can do for a group from the chat ("@บอท เชื่อม google", "หยุดเก็บไฟล์"…) is here as buttons.

import { useState, useEffect, useCallback } from 'react';
import { DashNav } from '../_components';
import { SpaceBanner, useSpace } from '../_space';
import { useToast } from '../_ui';

const KIND_ICON = { note: '📝', task: '✅', event: '📅' };

export default function GroupPage() {
  const toast = useToast();
  const { loaded, space, group } = useSpace();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [trash, setTrash] = useState(null);       // null = loading, { items, unavailable }
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState(null);         // { url, replace } — the Google sign-in link to open

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      fetch('/api/space/settings').then(async r => (r.ok ? r.json() : { error: r.status })).catch(() => ({ error: 'network' })),
      fetch('/api/trash').then(r => (r.ok ? r.json() : { items: [], unavailable: true })).catch(() => ({ items: [], unavailable: true })),
    ]);
    if (s.error) setError(s.error === 400 ? 'not_group' : 'load'); else { setData(s); setError(''); }
    setTrash(t);
  }, []);
  useEffect(() => { if (loaded && space === 'group') load(); }, [loaded, space, load]);
  // coming back from the Google sign-in tab: look again
  useEffect(() => { const f = () => { if (document.visibilityState === 'visible' && space === 'group') load(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, [space, load]);

  const call = async (key, fn) => { setBusy(key); try { await fn(); } finally { setBusy(''); } };
  const patch = (body, okMsg) => call('patch', async () => {
    const r = await fetch('/api/space/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast.show(j.error === 'push_unsupported' ? 'ยังเปิดแจ้งเตือนกลุ่มไม่ได้ (ผู้ดูแลระบบต้องรัน group_trash.sql)' : 'บันทึกไม่สำเร็จ ลองอีกครั้ง', { tone: 'error' }); return; }
    if (okMsg) toast.show(okMsg);
    await load();
  });
  const connect = (replace) => call('connect', async () => {
    const r = await fetch('/api/space/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', replace }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show('ขอลิงก์เชื่อม Google ไม่ได้ ลองอีกครั้ง', { tone: 'error' }); return; }
    if (j.alreadyConnected) { await load(); return; }
    setLink({ url: j.url, replace });
  });
  const disconnect = () => { if (!window.confirm('ตัดการเชื่อม Google ของกลุ่ม?\nของที่เคยลงไว้ในปฏิทิน/ไดรฟ์ยังอยู่ในบัญชีนั้น แต่นัดหมายและไฟล์ใหม่จะไม่ถูกส่งไป')) return; call('disconnect', async () => {
    const r = await fetch('/api/space/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) });
    if (r.ok) { toast.show('ตัดการเชื่อมแล้ว'); await load(); } else toast.show('ทำไม่สำเร็จ ลองอีกครั้ง', { tone: 'error' });
  }); };
  const restore = (it) => call('r' + it.id, async () => {
    const r = await fetch('/api/trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) });
    if (r.ok) toast.show('กู้คืนแล้ว'); else toast.show('กู้คืนไม่สำเร็จ', { tone: 'error' });
    await load();
  });
  const purge = (it) => { if (!window.confirm(`ลบ “${it.label}” ถาวร? กู้คืนไม่ได้อีก`)) return; call('d' + it.id, async () => { await fetch('/api/trash?id=' + encodeURIComponent(it.id), { method: 'DELETE' }); await load(); }); };
  const emptyTrash = () => { if (!window.confirm('ล้างถังขยะทั้งหมด? กู้คืนไม่ได้อีก')) return; call('empty', async () => { await fetch('/api/trash?all=1', { method: 'DELETE' }); await load(); }); };

  if (loaded && space !== 'group') {
    return <main className="page"><DashNav /><h1 className="page-title">⚙️ กลุ่ม</h1><p className="muted">หน้านี้ใช้ในพื้นที่ของกลุ่มเท่านั้น — ในกลุ่ม LINE พิมพ์ <b>@บอท เว็บ</b> เพื่อเปิด</p></main>;
  }
  const st = data?.settings, push = data?.push;
  return (
    <main className="page">
      <DashNav />
      <SpaceBanner />
      <h1 className="page-title">⚙️ {group?.name || 'กลุ่ม'}</h1>
      {error === 'load' && <p role="alert" className="muted">โหลดการตั้งค่าไม่สำเร็จ ลองรีเฟรชหน้านี้</p>}

      <div className="glass-card" data-act="group-google">
        <b>📆 Google ของกลุ่ม</b>
        {!st ? <p className="muted">กำลังโหลด…</p> : st.connected ? (
          <>
            <p className="muted" style={{ margin: '0.3rem 0 0.6rem' }}>🟢 เชื่อมแล้ว{st.email ? ` · ${st.email}` : ''} — นัดหมายของกลุ่มลงปฏิทินบัญชีนี้ และไฟล์ที่ส่งในกลุ่มเก็บในโฟลเดอร์ Bot_file ของบัญชีนี้</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {st.driveFolderUrl && <a className="glass-btn-outline" style={{ color: 'var(--text-primary)' }} href={st.driveFolderUrl} target="_blank" rel="noopener noreferrer">📂 เปิดโฟลเดอร์ไดรฟ์</a>}
              <button className="glass-btn-outline" style={{ color: 'var(--text-primary)' }} data-act="switch-google" disabled={busy === 'connect'} onClick={() => connect(true)}>🔄 เปลี่ยนบัญชี Google</button>
              <button className="glass-btn-outline" style={{ color: 'var(--text-primary)' }} data-act="disconnect-google" disabled={busy === 'disconnect'} onClick={disconnect}>🔌 ตัดการเชื่อม</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: '0.3rem 0 0.6rem' }}>ยังไม่ได้เชื่อม — เชื่อมแล้วนัดหมายของกลุ่มจะลงปฏิทิน Google และเก็บรูป/ไฟล์ที่ส่งในกลุ่มลงไดรฟ์ ควรใช้บัญชี Google ที่สร้างไว้สำหรับกลุ่มโดยเฉพาะ</p>
            <button className="glass-btn" data-act="connect-google" disabled={busy === 'connect'} onClick={() => connect(false)}>📆 เชื่อม Google</button>
          </>
        )}
        {link && (
          <p className="guide-tip" style={{ margin: '0.7rem 0 0' }} data-act="google-link">
            {link.replace ? 'เลือกบัญชีใหม่ที่ลิงก์นี้ (ใช้ได้ 30 นาที) — ของที่เก็บไว้แล้วยังอยู่ในบัญชีเดิม ต่อไปนี้ของใหม่จะลงบัญชีที่เลือก: ' : 'ลงชื่อเข้าใช้ด้วยบัญชี Google ที่จะเป็นเจ้าของปฏิทินและไดรฟ์ของกลุ่ม (ลิงก์ใช้ได้ 30 นาที): '}
            <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setLink(null), 500)}>🔗 เปิดหน้าลงชื่อเข้าใช้ Google</a>
          </p>
        )}
      </div>

      <div className="glass-card" style={{ marginTop: '0.8rem' }} data-act="group-switches">
        <b>🤖 บอทในกลุ่ม</b>
        <label className="push-check"><input type="checkbox" className="big-check" data-act="files-switch" checked={st ? st.files : true} disabled={!st || busy === 'patch'} onChange={e => patch({ files: e.target.checked }, e.target.checked ? 'เริ่มเก็บรูป/ไฟล์ที่ส่งในกลุ่ม' : 'หยุดเก็บรูป/ไฟล์ที่ส่งในกลุ่ม')} /> เก็บรูป/ไฟล์ที่ส่งในกลุ่มลงไดรฟ์ของกลุ่มอัตโนมัติ</label>
        <label className="push-check"><input type="checkbox" className="big-check" data-act="quote-switch" checked={st ? st.quoteText : false} disabled={!st || busy === 'patch'} onChange={e => patch({ quoteText: e.target.checked }, e.target.checked ? 'เปิดการอ้างอิงข้อความแล้ว' : 'ปิดการอ้างอิงข้อความแล้ว')} /> จำข้อความของเพื่อนในกลุ่มไว้ 48 ชั่วโมง เพื่อให้ Quote ข้อความแล้วสั่งบอทจดโน้ต/เพิ่มนัดได้</label>
        <p className="muted" style={{ margin: '0.3rem 0 0' }}>สมาชิกทุกคนเปลี่ยนค่าเหล่านี้ได้ — ตรงกับคำสั่ง “หยุดเก็บไฟล์” และ “เปิดการอ้างอิงข้อความ” ในกลุ่ม LINE</p>
      </div>

      <div className="glass-card" style={{ marginTop: '0.8rem' }} data-act="group-push">
        <b>🔔 แจ้งเตือนของกลุ่ม (เฉพาะคุณ)</b>
        <label className="push-check"><input type="checkbox" className="big-check" data-act="push-switch" checked={!!push?.optIn} disabled={!push || busy === 'patch'} onChange={e => patch({ pushOptIn: e.target.checked }, e.target.checked ? 'จะแจ้งเตือนนัดหมายและงานของกลุ่มนี้' : 'ปิดแจ้งเตือนของกลุ่มนี้แล้ว')} /> แจ้งเตือนนัดหมายและงานที่ใกล้ครบกำหนดของกลุ่มนี้ที่เครื่องของฉัน</label>
        {push && !push.devices && <p className="guide-tip" style={{ margin: '0.5rem 0 0' }} data-act="push-need-device">ℹ️ ยังไม่มีเครื่องที่เปิดแจ้งเตือนไว้ — ไปที่ <a href="/dashboard/notifications">การแจ้งเตือน</a> เพื่อเปิดบนเครื่องนี้ก่อน (ใช้ช่วงเงียบเดียวกับของส่วนตัว)</p>}
        <p className="muted" style={{ margin: '0.4rem 0 0' }}>แต่ละคนเลือกเอง ไม่มีใครถูกเปิดให้ · ถ้าออกจากกลุ่ม LINE จะหยุดแจ้งเตือนโดยอัตโนมัติ</p>
      </div>

      <div className="glass-card" style={{ marginTop: '0.8rem' }} data-act="group-trash">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
          <b>🗑️ ถังขยะของกลุ่ม</b>
          {trash?.items?.length > 0 && <button className="glass-btn-outline" style={{ color: 'var(--text-primary)' }} data-act="empty-trash" disabled={busy === 'empty'} onClick={emptyTrash}>ล้างถังขยะ</button>}
        </div>
        <p className="muted" style={{ margin: '0.3rem 0 0.5rem' }}>โน้ต งาน และนัดหมายที่ลบ (จากเว็บหรือจากแชท) เก็บไว้ 30 วันแล้วลบเอง</p>
        {trash === null && <p className="muted">กำลังโหลด…</p>}
        {trash?.unavailable && <p className="muted">ยังไม่เปิดใช้ถังขยะ (ผู้ดูแลระบบต้องรัน group_trash.sql) — ตอนนี้ลบแล้วจะหายถาวร</p>}
        {trash && !trash.unavailable && !trash.items.length && <p className="muted" data-act="trash-empty">ถังขยะว่างเปล่า</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(trash?.items || []).map(it => (
            <li key={it.id} data-act="trash-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0', borderTop: '1px solid var(--border, rgba(128,128,128,.25))', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 12rem', minWidth: 0 }}>
                {KIND_ICON[it.kind]} <b>{it.label}</b>
                <div className="muted" style={{ fontSize: '0.85em' }}>{it.deleted_by_name ? `ลบโดย ${it.deleted_by_name} · ` : ''}เหลืออีก {it.days_left} วัน</div>
              </span>
              <button className="glass-btn" data-act="restore" disabled={busy === 'r' + it.id} onClick={() => restore(it)}>↩️ กู้คืน</button>
              <button className="glass-btn-outline" style={{ color: 'var(--text-primary)' }} data-act="purge" disabled={busy === 'd' + it.id} onClick={() => purge(it)}>ลบถาวร</button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

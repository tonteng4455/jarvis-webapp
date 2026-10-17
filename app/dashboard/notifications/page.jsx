'use client';
// app/dashboard/notifications/page.jsx — turn reminders (Web Push) on/off on THIS device and tune them.

import { useState, useEffect, useCallback } from 'react';
import { DashNav } from '../_components';
import { useToast } from '../_ui';
import { pushSupport, currentSubscription, enablePush, disablePush, resyncSubscription } from '../../../lib/pushClient';
import { LEAD_OPTIONS, normalizePrefs } from '../../../lib/pushPrefs';

const LEAD_LABEL = { 0: 'ไม่เตือนล่วงหน้า', 5: '5 นาที', 10: '10 นาที', 15: '15 นาที', 30: '30 นาที', 60: '1 ชั่วโมง', 120: '2 ชั่วโมง' };

export default function NotificationsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('loading');     // loading | ok_off | ok_on | denied | ios_install | in_line | unsupported | no_server
  const [prefs, setPrefs] = useState(normalizePrefs(null));
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState(null);
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    const sup = pushSupport();
    const [pr, cfg] = await Promise.all([
      fetch('/api/push/prefs').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/push/config').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (pr) { setPrefs(pr.prefs); setDevices(pr.devices); }
    setPublicKey(cfg?.publicKey || null);
    if (sup.state !== 'ok') { setStatus(sup.state); return; }
    if (!cfg?.publicKey) { setStatus('no_server'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }
    const sub = await currentSubscription().catch(() => null);
    if (sub && Notification.permission === 'granted') { setStatus('ok_on'); resyncSubscription(); } else setStatus('ok_off');
  }, []);
  useEffect(() => { load(); }, [load]);

  async function turnOn() {
    setBusy(true);
    try { await enablePush(publicKey); await load(); toast.show('เปิดแจ้งเตือนบนเครื่องนี้แล้ว'); }
    catch (e) {
      if (e.message === 'denied') setStatus('denied');
      else toast.show('เปิดแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง', { tone: 'error' });
    }
    setBusy(false);
  }
  async function turnOff() { setBusy(true); await disablePush(); await load(); setBusy(false); toast.show('ปิดแจ้งเตือนบนเครื่องนี้แล้ว'); }
  async function sendTest() {
    setBusy(true);
    const r = await fetch('/api/push/test', { method: 'POST' }).then(x => x.json()).catch(() => ({}));
    setBusy(false);
    if (r.ok) toast.show('ส่งแล้ว — ดูที่แถบแจ้งเตือนของเครื่อง');
    else toast.show(r.error === 'vapid_not_configured' ? 'ฝั่งเซิร์ฟเวอร์ยังไม่ได้ตั้งกุญแจแจ้งเตือน (VAPID)' : r.error === 'no_subscription' ? 'ยังไม่พบเครื่องที่เปิดแจ้งเตือนไว้' : 'ส่งไม่สำเร็จ', { tone: 'error' });
  }
  async function change(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(next); setSaved('');
    const res = await fetch('/api/push/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (res.ok) setSaved('บันทึกแล้ว'); else { setSaved(''); toast.show('บันทึกไม่สำเร็จ (ผู้ดูแลระบบต้องรัน push_notifications.sql)', { tone: 'error' }); }
  }

  const note = {
    loading: null,
    ok_off: null,
    ok_on: null,
    denied: 'เบราว์เซอร์บล็อกการแจ้งเตือนของเว็บนี้ไว้ — เปิดได้ที่ การตั้งค่าเว็บไซต์/การแจ้งเตือน ของเบราว์เซอร์ (หรือการตั้งค่าแอป Jarvis บนมือถือ) แล้วกลับมาหน้านี้',
    ios_install: 'บน iPhone/iPad ต้องเพิ่มเว็บไว้ที่หน้าจอโฮมก่อน: เปิดเว็บใน Safari → ปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอน Jarvis และกลับมาหน้านี้ (ต้องใช้ iOS 16.4 ขึ้นไป)',
    in_line: 'เบราว์เซอร์ที่อยู่ใน LINE เปิดแจ้งเตือนไม่ได้ — เปิดเว็บนี้ใน Safari/Chrome (หรือแอปที่ติดตั้งไว้) แล้วเปิดแจ้งเตือนจากที่นั่น',
    unsupported: 'เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือนจากเว็บ ลองใช้ Chrome/Edge/Safari รุ่นใหม่',
    no_server: 'ฝั่งเซิร์ฟเวอร์ยังไม่ได้ตั้งค่ากุญแจแจ้งเตือน (VAPID_PUBLIC_KEY) — แจ้งผู้ดูแลระบบ',
  }[status];

  return (
    <main className="page">
      <DashNav />
      <h1 className="page-title">🔔 การแจ้งเตือน</h1>
      <p className="muted" style={{ marginBottom: '0.9rem' }}>ให้ Jarvis เด้งเตือนงานที่ใกล้ครบกำหนดและสรุปตอนเช้า แม้ปิดเว็บอยู่</p>

      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div>
            <b>เครื่องนี้</b>
            <div className="muted" id="push-status">
              {status === 'loading' && 'กำลังตรวจสอบ…'}
              {status === 'ok_on' && '🟢 เปิดอยู่'}
              {status === 'ok_off' && '⚪ ยังไม่เปิด'}
              {status === 'denied' && '🔴 ถูกบล็อก'}
              {['ios_install', 'in_line', 'unsupported', 'no_server'].includes(status) && '⚪ เปิดไม่ได้ในตอนนี้'}
              {devices > 0 && status !== 'loading' && ` · ทั้งบัญชีเปิดไว้ ${devices} เครื่อง`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {status === 'ok_off' && <button className="glass-btn" onClick={turnOn} disabled={busy}>🔔 เปิดแจ้งเตือน</button>}
            {status === 'ok_on' && <>
              <button className="glass-btn-outline" onClick={sendTest} disabled={busy} style={{ color: 'var(--text-primary)' }}>ส่งทดสอบ</button>
              <button className="glass-btn-outline" onClick={turnOff} disabled={busy} style={{ color: 'var(--text-primary)' }}>ปิด</button>
            </>}
          </div>
        </div>
        {note && <p className="guide-tip" style={{ margin: '0.7rem 0 0' }}>ℹ️ {note}</p>}
      </div>

      <div className="glass-card" style={{ marginTop: '0.8rem' }}>
        <b>เตือนอะไร เมื่อไหร่</b>
        <div className="push-pref">
          <label>เตือนก่อนถึงกำหนด
            <select className="glass-input" value={prefs.lead} onChange={e => change({ lead: Number(e.target.value) })}>
              {LEAD_OPTIONS.map(m => <option key={m} value={m}>{LEAD_LABEL[m]}</option>)}
            </select></label>
        </div>
        <label className="push-check"><input type="checkbox" className="big-check" checked={prefs.atDue} onChange={e => change({ atDue: e.target.checked })} /> เตือนเมื่อถึงเวลา (ครบกำหนดแล้ว)</label>
        <label className="push-check"><input type="checkbox" className="big-check" checked={prefs.morning} onChange={e => change({ morning: e.target.checked })} /> สรุปตอนเช้า (งานเลยกำหนด/ครบวันนี้ + นัดหมายวันนี้)</label>
        {prefs.morning && (
          <div className="push-pref"><label>เวลาสรุปเช้า
            <input type="time" className="glass-input" value={prefs.morningTime} onChange={e => e.target.value && change({ morningTime: e.target.value })} /></label></div>
        )}
        <div className="push-pref two">
          <label>ช่วงเงียบ เริ่ม
            <input type="time" className="glass-input" value={prefs.quietFrom} onChange={e => e.target.value && change({ quietFrom: e.target.value })} /></label>
          <label>สิ้นสุด
            <input type="time" className="glass-input" value={prefs.quietTo} onChange={e => e.target.value && change({ quietTo: e.target.value })} /></label>
        </div>
        <p className="muted" style={{ margin: '0.4rem 0 0' }}>ในช่วงเงียบจะไม่ส่งแจ้งเตือน และจะส่งหลังช่วงเงียบสิ้นสุด · งานที่กำหนดเป็นวัน (ไม่มีเวลา) จะเตือนเวลา 09:00 ของวันนั้น · ตั้งค่านี้ใช้กับทุกเครื่องของบัญชี {saved && <b style={{ color: 'var(--success)' }}> · {saved}</b>}</p>
      </div>

      <div className="glass-card" style={{ marginTop: '0.8rem' }}>
        <b>ควรรู้</b>
        <ul className="muted" style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>เตือนได้คลาดเคลื่อนประมาณ 5 นาที เพราะระบบตรวจทุก 5 นาที</li>
          <li>นัดหมายที่ซิงก์ไป Google Calendar แล้ว แอป Google Calendar จะเตือนให้เองตามเวลาเตือนล่วงหน้าที่ตั้งไว้</li>
          <li>ถ้าเปลี่ยนเครื่อง ล้างข้อมูลเบราว์เซอร์ หรือลบแอป ต้องเปิดแจ้งเตือนใหม่ในเครื่องนั้น</li>
        </ul>
      </div>
    </main>
  );
}

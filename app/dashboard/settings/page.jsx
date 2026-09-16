'use client';
// app/dashboard/settings/page.jsx — voice + personality preferences
// for the voice assistant. Voice list comes from THIS BROWSER's own
// speechSynthesis.getVoices() — see VoiceAssistant's own comment on
// why Thai voice availability varies a lot device to device. The
// saved voiceName may simply not exist on a different device; the
// widget falls back to that device's default Thai voice (or the
// system default) when that happens, rather than erroring.

import { useState, useEffect } from 'react';
import { DashNav } from '../_components';

const PERSONALITY_PRESETS = [
  { label: 'กันเอง (ค่าเริ่มต้น)', value: '' },
  { label: 'เป็นทางการ', value: 'พูดสุภาพเป็นทางการ ใช้คำราชการ/ธุรกิจ ไม่ใช้คำแสลง' },
  { label: 'กระชับที่สุด', value: 'ตอบสั้นที่สุดเท่าที่จะทำได้ ไม่ต้องอธิบายเพิ่ม ไม่ต้องทักทาย' },
  { label: 'ร่าเริงเป็นกันเอง', value: 'พูดร่าเริง เป็นกันเองมาก ใช้มุกตลกเล็กน้อยได้บ้าง' },
];

export default function SettingsPage() {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [personality, setPersonality] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [assistantGender, setAssistantGender] = useState('male');
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function loadVoices() {
      const all = window.speechSynthesis?.getVoices() || [];
      // Thai voices first, then everything else — some browsers/OSes
      // genuinely have zero Thai voices, so don't hide the rest.
      const sorted = [...all].sort((a, b) => {
        const aTh = a.lang.startsWith('th') ? 0 : 1;
        const bTh = b.lang.startsWith('th') ? 0 : 1;
        return aTh - bTh;
      });
      setVoices(sorted);
    }
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices; // voice list loads async in some browsers
  }, []);

  useEffect(() => {
    fetch('/api/assistant/preferences')
      .then(r => r.json())
      .then(data => {
        setSelectedVoice(data.voiceName || '');
        setPersonality(data.personality || '');
        setAssistantName(data.assistantName || '');
        setAssistantGender(data.assistantGender || 'male');
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const [saveErrorDetail, setSaveErrorDetail] = useState(null);

  async function save() {
    setStatus('saving');
    setSaveErrorDetail(null);
    const voice = voices.find(v => v.name === selectedVoice);
    try {
      const res = await fetch('/api/assistant/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceName: selectedVoice || null, voiceLang: voice?.lang || null, personality,
          assistantName: assistantName.trim() || null, assistantGender,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSaveErrorDetail(data.detail || data.error || null); throw new Error(); }
      setStatus('saved');
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setStatus('error');
    }
  }

  function playSample() {
    if (!window.speechSynthesis) return;
    const name = assistantName.trim() || 'Jarvis';
    const particle = assistantGender === 'female' ? 'ค่ะ' : 'ครับ';
    const self = assistantGender === 'female' ? 'ฉัน' : 'ผม';
    const utterance = new SpeechSynthesisUtterance(`สวัสดี${particle} ${self}คือ ${name} ผู้ช่วยของคุณ${particle}`);
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'th-TH';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="page">
      <DashNav current="settings" />
      <h1 className="page-title">⚙️ ตั้งค่าผู้ช่วยเสียง</h1>

      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>🏷️ ชื่อเรียก + เพศของเลขา</h2>
        <input type="text" value={assistantName} onChange={e => setAssistantName(e.target.value)}
          placeholder="Jarvis (ค่าเริ่มต้น)" maxLength={40}
          style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.6rem', fontSize: '0.85rem' }} />
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.4rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
            <input type="radio" name="gender" checked={assistantGender === 'male'} onChange={() => setAssistantGender('male')} /> ชาย (ครับ)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
            <input type="radio" name="gender" checked={assistantGender === 'female'} onChange={() => setAssistantGender('female')} /> หญิง (ค่ะ)
          </label>
        </div>
        <p className="muted" style={{ fontSize: '0.75rem' }}>
          ใช้ได้เฉพาะในหน้าเว็บ/ผู้ช่วยเสียงนี้เท่านั้นครับ — ฝั่ง LINE ชื่อบัญชียังเป็น "Jarvis" เสมอ (เป็นข้อจำกัดของ LINE เอง เปลี่ยนต่อผู้ใช้แต่ละคนไม่ได้)
        </p>
      </div>

      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>🔊 เสียงพูด</h2>
        {voices.length === 0 && loaded && (
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            ไม่พบเสียงพูดในเครื่อง/เบราว์เซอร์นี้เลยครับ — จะใช้เสียง default ของระบบแทน (บางเครื่อง/เบราว์เซอร์ไม่มีเสียงภาษาไทยติดตั้งไว้)
          </p>
        )}
        {voices.length > 0 && (
          <>
            <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.6rem' }}>
              <option value="">(ค่าเริ่มต้นของเบราว์เซอร์)</option>
              {voices.map(v => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang}){v.lang.startsWith('th') ? ' 🇹🇭' : ''}</option>
              ))}
            </select>
            <button type="button" className="glass-btn-outline" onClick={playSample} style={{ fontSize: '0.8rem' }}>
              ▶️ ลองฟังเสียงนี้
            </button>
          </>
        )}
        <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>
          รายชื่อเสียงที่เลือกได้ขึ้นกับเครื่อง/เบราว์เซอร์ที่เปิดหน้านี้อยู่ — ถ้าเปิดจากเครื่องอื่นแล้วไม่มีเสียงชื่อเดียวกัน ระบบจะใช้เสียง default ของเครื่องนั้นแทนครับ
        </p>
      </div>

      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>🎭 บุคลิกการตอบ</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
          {PERSONALITY_PRESETS.map(p => (
            <button key={p.label} type="button"
              className={personality === p.value ? 'glass-btn' : 'glass-btn-outline'}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
              onClick={() => setPersonality(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        <textarea value={personality} onChange={e => setPersonality(e.target.value)}
          placeholder="หรือพิมพ์สไตล์ที่อยากได้เอง เช่น 'ตอบแบบทหาร ใช้คำว่าครับผม'"
          rows={3} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }} />
      </div>

      <button type="button" className="glass-btn" onClick={save} disabled={status === 'saving'}>
        {status === 'saving' ? 'กำลังบันทึก...' : status === 'saved' ? '✅ บันทึกแล้ว' : status === 'error' ? '⚠️ บันทึกไม่สำเร็จ ลองอีกครั้ง' : '💾 บันทึก'}
      </button>
      {saveErrorDetail && (
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.4rem' }}>🔧 debug: {saveErrorDetail}</p>
      )}
    </main>
  );
}

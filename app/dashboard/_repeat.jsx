'use client';
// app/dashboard/_repeat.jsx — repeating appointments in the calendar page.
//   RepeatPicker : the "🔁 ทำซ้ำ" part of the new-appointment form (every day / week / month, every N, which weekdays,
//                  day N / last day / "the 2nd Wednesday" of a month, and how it ends: never / on a date / after N times)
//   ScopeSheet   : "only this time / this and the following / the whole series" — asked before editing or cancelling one
//   The rule itself is built on the server (lib/calendarSeries.js · ruleFromForm); here we only describe it back in Thai.

import { createPortal } from 'react-dom';
import { useDialogGuard, dialogGuard } from './_ui';
import { describeRule, DAY_TH } from '../../lib/recur';
import { ruleFromForm } from '../../lib/calendarSeries';

export const EMPTY_REPEAT = { freq: '', interval: 1, days: [], monthMode: 'day', end: 'until', until: '', count: 10 };   // until '' = the default end for how often it repeats
const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_SHORT = { MO: 'จ', TU: 'อ', WE: 'พ', TH: 'พฤ', FR: 'ศ', SA: 'ส', SU: 'อา' };
const UNIT = { daily: 'วัน', weekly: 'สัปดาห์', monthly: 'เดือน' };

// the object the API takes (null = does not repeat)
export function repeatPayload(rep) {
  if (!rep?.freq) return null;
  return { freq: rep.freq, interval: rep.interval, days: rep.days, monthMode: rep.monthMode, until: rep.end === 'until' && rep.until ? rep.until : null, count: rep.end === 'count' ? rep.count : null };
}

// → { text } | { error } — a one-line summary of what the form means, from the date chosen
export function repeatSummary(rep, date) {
  if (!rep?.freq || !date) return null;
  const r = ruleFromForm(repeatPayload(rep), date);
  if (r.error) return { error: r.error === 'until_before_start' ? 'วันสิ้นสุดมาก่อนวันเริ่ม' : r.error === 'bad_count' ? 'จำนวนครั้งต้องอยู่ระหว่าง 1–999' : 'ตั้งการซ้ำไม่ได้' };
  return { text: r.text, first: r.first, defaulted: r.defaulted, until: r.until };
}

export function RepeatPicker({ value, onChange, date }) {
  const set = patch => onChange({ ...value, ...patch });
  const sum = repeatSummary(value, date);
  const dow = date ? DAY_ORDER[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] : null;
  const toggleDay = d => set({ days: value.days.includes(d) ? value.days.filter(x => x !== d) : [...value.days, d] });
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>🔁 ทำซ้ำ</label>
      <select className="glass-input" aria-label="ทำซ้ำ" value={value.freq} onChange={e => set({ freq: e.target.value, days: [], monthMode: 'day' })}>
        <option value="">ไม่ซ้ำ</option>
        <option value="daily">ทุกวัน</option>
        <option value="weekly">ทุกสัปดาห์</option>
        <option value="monthly">ทุกเดือน</option>
      </select>
      {value.freq && (
        <div className="glass-panel" style={{ marginTop: '0.5rem', display: 'grid', gap: '0.55rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>ทุก</span>
            <input type="number" min="1" max="99" className="glass-input" aria-label="ทุกกี่" style={{ width: '4.5rem' }} value={value.interval}
              onChange={e => set({ interval: Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)) })} />
            <span>{UNIT[value.freq]}</span>
          </div>
          {value.freq === 'weekly' && (
            <div>
              <div className="muted" style={{ marginBottom: '0.25rem' }}>ในวัน (ไม่เลือก = วัน{dow ? DAY_TH[dow] : 'ตามวันที่เริ่ม'})</div>
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                {DAY_ORDER.map(d => (
                  <button key={d} type="button" data-day={d} aria-pressed={value.days.includes(d)} title={`วัน${DAY_TH[d]}`}
                    className={value.days.includes(d) ? 'glass-btn' : 'glass-btn-outline'} style={{ padding: '0.35rem 0.6rem', minWidth: '2.6rem' }} onClick={() => toggleDay(d)}>{DAY_SHORT[d]}</button>
                ))}
              </div>
            </div>
          )}
          {value.freq === 'monthly' && (
            <select className="glass-input" aria-label="ทุกเดือนแบบไหน" value={value.monthMode} onChange={e => set({ monthMode: e.target.value })}>
              <option value="day">ตามวันที่ของเดือน (เช่น วันที่ {date ? +date.slice(8, 10) : 'เดียวกับที่เริ่ม'})</option>
              <option value="nth">ตามวันในสัปดาห์ (เช่น วัน{dow ? DAY_TH[dow] : ''}ที่ {date ? (+date.slice(8, 10) > 28 ? 'สุดท้าย' : Math.ceil(+date.slice(8, 10) / 7)) : '…'} ของเดือน)</option>
              <option value="last">ทุกสิ้นเดือน (วันสุดท้ายของเดือน)</option>
            </select>
          )}
          <div>
            <div className="muted" style={{ marginBottom: '0.25rem' }}>สิ้นสุด</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="glass-input" aria-label="สิ้นสุด" style={{ width: 'auto' }} value={value.end} onChange={e => set({ end: e.target.value })}>
                <option value="until">ถึงวันที่</option>
                <option value="count">ซ้ำกี่ครั้ง</option>
              </select>
              {value.end === 'until' && <input type="date" className="glass-input" aria-label="ถึงวันที่" style={{ width: 'auto' }} value={value.until || (sum?.until ?? '')} min={date || undefined} onChange={e => set({ until: e.target.value })} />}
              {value.end === 'count' && <><input type="number" min="1" max="999" className="glass-input" aria-label="กี่ครั้ง" style={{ width: '5rem' }} value={value.count} onChange={e => set({ count: parseInt(e.target.value, 10) || '' })} /><span>ครั้ง</span></>}
            </div>
          </div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>ต้องมีวันสิ้นสุดเสมอ — ถ้าไม่ระบุ จะซ้ำ{value.freq === 'daily' ? ' 3 เดือน' : value.freq === 'weekly' ? ' 6 เดือน' : ' 1 ปี'} แล้วต่ออายุได้ทีหลัง</div>
          {sum && <div data-testid="repeat-summary" style={{ fontSize: "0.9rem" }} className={sum.error ? 'muted' : ''}>{sum.error ? `⚠️ ${sum.error}` : `🔁 ${sum.text}`}</div>}
        </div>
      )}
    </div>
  );
}

// "which dates?" — resolves with the choice via onChoose('one' | 'following' | 'all'), onClose = nothing chosen
export function ScopeSheet({ title, verb, onChoose, onClose }) {
  useDialogGuard();
  const choose = (c, e) => { e?.stopPropagation(); onChoose(c); };
  return createPortal(
    <div className="convert-overlay" {...dialogGuard(onClose)}>
      <div className="convert-sheet" role="dialog" aria-label={`${verb}นัดซ้ำ`}>
        <div className="convert-title">🔁 {verb}นัดที่ซ้ำ</div>
        <p className="muted" style={{ margin: '0.3rem 0 0' }}>“{title}” — ให้{verb}กับครั้งไหนครับ?</p>
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.7rem' }}>
          <button type="button" className="convert-choice" data-scope="one" onClick={e => choose('one', e)}><b>1️⃣ เฉพาะครั้งนี้</b><span>ครั้งอื่น ๆ ในชุดเดิมไม่เปลี่ยน</span></button>
          <button type="button" className="convert-choice" data-scope="following" onClick={e => choose('following', e)}><b>2️⃣ ครั้งนี้เป็นต้นไป</b><span>ครั้งก่อนหน้านี้คงไว้ตามเดิม</span></button>
          <button type="button" className="convert-choice" data-scope="all" onClick={e => choose('all', e)}><b>3️⃣ ทั้งชุด</b><span>ทุกครั้งของนัดนี้ (รวมที่ผ่านมาแล้ว)</span></button>
        </div>
        <button type="button" className="glass-btn-outline" style={{ width: '100%', marginTop: '0.6rem' }} onClick={onClose}>ไม่ทำ</button>
      </div>
    </div>,
    document.body
  );
}

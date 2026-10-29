// dev/mockBot.js — fake of the LINE bot Worker's /internal/* endpoints
// for MOCK_MODE. Uploaded photo bytes are kept in memory and served by
// /api/dev/drive-image/[id] so thumbnails actually render offline.

import { mockSupabase } from './mockSupabase';

function store() {
  if (!globalThis.__mockDrive) globalThis.__mockDrive = new Map();
  return globalThis.__mockDrive;
}
export function getMockDriveFile(id) { return store().get(id); }

// Raw (binary) replies for the private-image proxy.
export async function mockBotInternalRaw(path, payload) {
  if (path === '/internal/note-image-download') {
    const f = store().get(payload.driveFileId);
    if (!f) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(Buffer.from(f.base64, 'base64'), { status: 200, headers: { 'content-type': f.mimeType } });
  }
  return new Response('{}', { status: 404 });
}

const WORK_ID = 'work@group.calendar.google.com', HOLIDAY_ID = 'holidays@group.v.calendar.google.com';
const MOCK_CALENDARS = [
  { id: 'primary', name: 'ส่วนตัว', color: '#0b8043', primary: true, writable: true },
  { id: WORK_ID, name: 'ที่ทำงาน', color: '#f6bf26', primary: false, writable: true },
  { id: HOLIDAY_ID, name: 'วันหยุดไทย', color: '#8e24aa', primary: false, writable: false },
];
function calState(userId) {
  if (!globalThis.__mockCal) globalThis.__mockCal = {};
  return (globalThis.__mockCal[userId] ||= { target: 'primary', display: ['primary', WORK_ID] });
}

export async function mockBotInternal(path, payload) {
  switch (path) {
    case '/internal/note-image-upload': {
      if (payload.userId === 'mock-nodrive') {
        return { ok: false, error: 'google_not_connected', connectUrl: 'https://example.invalid/google/connect?mock=1' };
      }
      const id = 'mock' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
      store().set(id, { mimeType: payload.mimeType, base64: payload.base64, name: payload.fileName });
      return { ok: true, driveFileId: id, name: payload.fileName };
    }
    case '/internal/file-rename': return { ok: !!(payload.driveFileId && payload.name) };
    case '/internal/file-upload': {
      if (payload.userId === 'mock-nodrive') return { ok: false, error: 'google_not_connected', connectUrl: 'https://example.invalid/google/connect?mock=1' };
      const id = 'mockf' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
      store().set(id, { mimeType: payload.mimeType || 'application/octet-stream', base64: payload.base64, name: payload.fileName });
      return { ok: true, driveFileId: id, name: payload.fileName, publicUrl: /^image\//.test(payload.mimeType || '') ? `/api/dev/drive-image/${id}` : `https://drive.google.com/file/d/${id}/view` };
    }
    case '/internal/note-image-delete': {
      let deleted = 0, skipped = 0;
      for (const id of (payload.driveFileIds || []).slice(0, 10)) {
        const f = store().get(id);
        if (!f) deleted++;                      // already gone counts as deleted (as in the real Worker)
        else if (/^image\//.test(f.mimeType)) { store().delete(id); (globalThis.__mockBin ||= []).push(id); deleted++; } else skipped++;
      }
      return { ok: true, deleted, skipped };
    }
    case '/internal/note-images-privatize': { globalThis.__mockPrivatized = [...(globalThis.__mockPrivatized || []), ...(payload.driveFileIds || [])]; return { ok: true, done: (payload.driveFileIds || []).length, failed: 0 }; }
    case '/internal/file-delete': {            // the real Worker deletes the Drive file and the row
      const { data } = await mockSupabase().from('user_files').select('id').eq('id', payload.fileId).eq('user_id', payload.userId).maybeSingle();
      if (!data) return { ok: false, error: 'not_found' };
      await mockSupabase().from('user_files').delete().eq('id', payload.fileId).eq('user_id', payload.userId);
      return { ok: true };
    }
    case '/internal/expense-sheet-export':
      if (payload.userId === 'mock-nodrive') return { ok: false, error: 'not_connected', connectUrl: 'https://example.invalid/google/connect?mock=1' };
      return { url: 'https://example.invalid/sheet', count: 2 };
    case '/internal/push-test': {
      const { data } = await mockSupabase().from('push_subscriptions').select('id').eq('user_id', payload.userId);
      return (data || []).length ? { ok: true, sent: data.length } : { ok: false, error: 'no_subscription' };
    }
    case '/internal/google-status': return payload.userId === 'mock-nodrive' ? { ok: true, connected: false, connectUrl: 'https://example.invalid/google/connect?mock=1' } : { ok: true, connected: true, connectUrl: null };
    // ---- calendars (several Google calendars: personal + a work one shared in + a read-only holiday one)
    case '/internal/calendar-calendars': {
      if (payload.userId === 'mock-nodrive') return { ok: true, connected: false, calendars: [] };
      const st = calState(payload.userId);
      // 'mock-solo' has only the personal calendar until the work one is "shared in" (3rd look onwards)
      if (payload.userId === 'mock-solo') { const n = (globalThis.__mockSoloLooks = (globalThis.__mockSoloLooks || 0) + 1); if (n < 3) return { ok: true, connected: true, calendars: [MOCK_CALENDARS[0]], targetCalendarId: 'primary', displayCalendarIds: ['primary'] }; }
      return { ok: true, connected: true, calendars: MOCK_CALENDARS, targetCalendarId: st.target, displayCalendarIds: st.display };
    }
    case '/internal/calendar-settings': {
      if (payload.userId === 'mock-nodrive') return { ok: false, error: 'not_connected' };
      const st = calState(payload.userId);
      if (payload.targetCalendarId !== undefined) { const c = MOCK_CALENDARS.find(x => x.id === payload.targetCalendarId); if (!c || !c.writable) return { ok: false, error: 'not_writable' }; st.target = c.id; }
      if (payload.displayCalendarIds !== undefined) { const ids = [...new Set((payload.displayCalendarIds || []).filter(x => MOCK_CALENDARS.some(c => c.id === x)))]; if (!ids.length) return { ok: false, error: 'need_one_calendar' }; st.display = ids; }
      return { ok: true, targetCalendarId: st.target, displayCalendarIds: st.display };
    }
    case '/internal/calendar-move': {
      const c = MOCK_CALENDARS.find(x => x.id === payload.calendarId);
      if (!c || !c.writable) return { ok: false, error: 'not_writable' };
      const { data: row } = await mockSupabase().from('calendar_events').select('*').eq('id', payload.eventId).eq('user_id', payload.userId).maybeSingle();
      if (!row) return { ok: false, error: 'not_found' };
      if ((row.calendar_id || calState(payload.userId).target) === c.id) return { ok: true, event: row, moved: false };
      const { data } = await mockSupabase().from('calendar_events').update({ calendar_id: c.id }).eq('id', payload.eventId).eq('user_id', payload.userId).select().maybeSingle();
      return { ok: true, event: data, moved: true };
    }
    case '/internal/calendar-google-events': {
      if (payload.userId === 'mock-nodrive') return { ok: true, events: [] };
      const st = calState(payload.userId);
      const day = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d; };
      const at = (n, h) => { const d = day(n); d.setHours(h); return d.toISOString(); };
      const all = [
        { google_event_id: 'gx-school', calendar_id: 'primary', title: 'ประชุมผู้ปกครอง (จาก Google)', start_time: at(1, 13), end_time: at(1, 14), all_day: false, location: 'โรงเรียน', htmlLink: 'https://example.invalid/gx-school' },
        { google_event_id: 'gx-work', calendar_id: WORK_ID, title: 'ส่งงบประมาณ (ปฏิทินที่ทำงาน)', start_time: at(2, 16), end_time: at(2, 17), all_day: false, location: null, htmlLink: 'https://example.invalid/gx-work' },
        { google_event_id: 'gx-hol', calendar_id: HOLIDAY_ID, title: 'วันหยุดพิเศษ', start_time: day(3).toISOString(), end_time: day(4).toISOString(), all_day: true, location: null, htmlLink: null },
      ];
      const from = Date.parse(payload.from), to = Date.parse(payload.to);
      return { ok: true, events: all.filter(e => st.display.includes(e.calendar_id) && Date.parse(e.start_time) >= from && Date.parse(e.start_time) < to) };
    }
    case '/internal/calendar-reconcile': return { ok: true };
    case '/internal/calendar-cancel': {
      // The real Worker soft-cancels the row (and removes the Google event).
      const { data } = await mockSupabase().from('calendar_events').update({ status: 'cancelled' })
        .eq('id', payload.eventId).eq('user_id', payload.userId).select().maybeSingle();
      return { ok: true, event: data };
    }
    case '/internal/calendar-sync':
    case '/internal/task-recurrence': return { ok: true, synced: true };
    default: return { ok: false, error: 'mock_unhandled ' + path };
  }
}

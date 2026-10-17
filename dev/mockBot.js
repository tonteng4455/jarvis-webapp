// dev/mockBot.js — fake of the LINE bot Worker's /internal/* endpoints
// for MOCK_MODE. Uploaded photo bytes are kept in memory and served by
// /api/dev/drive-image/[id] so thumbnails actually render offline.

import { mockSupabase } from './mockSupabase';

function store() {
  if (!globalThis.__mockDrive) globalThis.__mockDrive = new Map();
  return globalThis.__mockDrive;
}
export function getMockDriveFile(id) { return store().get(id); }

export async function mockBotInternal(path, payload) {
  switch (path) {
    case '/internal/note-image-upload': {
      if (payload.userId === 'mock-nodrive') {
        return { ok: false, error: 'google_not_connected', connectUrl: 'https://example.invalid/google/connect?mock=1' };
      }
      const id = 'mock' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
      store().set(id, { mimeType: payload.mimeType, base64: payload.base64 });
      return { ok: true, driveFileId: id, name: payload.fileName };
    }
    case '/internal/file-delete': return { ok: true };
    case '/internal/expense-sheet-export':
      if (payload.userId === 'mock-nodrive') return { ok: false, error: 'not_connected', connectUrl: 'https://example.invalid/google/connect?mock=1' };
      return { url: 'https://example.invalid/sheet', count: 2 };
    case '/internal/push-test': {
      const { data } = await mockSupabase().from('push_subscriptions').select('id').eq('user_id', payload.userId);
      return (data || []).length ? { ok: true, sent: data.length } : { ok: false, error: 'no_subscription' };
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

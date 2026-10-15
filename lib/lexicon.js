// lib/lexicon.js — what each person has taught Jarvis (table `user_lexicon`,
// same rows the LINE bot reads: see jarvis-line-bot/user_lexicon.sql).
// Server-only. The rules for what is allowed mirror the bot's, so an entry
// made here behaves exactly like one taught in chat. No AI involved.

export const LEX_MAX_PER_USER = 150;

const norm = s => String(s || '').toLowerCase().replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
const EXPENSE_KEYS = new Set(['food', 'transport', 'bills', 'shopping', 'salary', 'family', 'finance', 'personal', 'other', 'general']);
const NOTE_KEYS = new Set(['work', 'personal', 'idea', 'shopping', 'general']);

// → { kind, scope, trigger, value } or null when it isn't allowed.
export function sanitizeLexEntry(input) {
  const kind = input?.kind;
  const trigger = norm(input?.trigger);
  if (!['category', 'reminder', 'location'].includes(kind)) return null;
  if (trigger.length < 2 || trigger.length > 40 || /^\d+$/.test(trigger)) return null;
  if (kind === 'category') {
    const scope = input.scope === 'note' ? 'note' : 'expense';
    const v = norm(input.value);
    if (!v || v.length > 24 || /\d/.test(v)) return null;
    const known = (scope === 'note' ? NOTE_KEYS : EXPENSE_KEYS).has(v);
    if (!known && !/^[ก-๙a-z _.\-]+$/i.test(v)) return null; // custom names are fine, plain words only
    return { kind, scope, trigger, value: v };
  }
  if (kind === 'reminder') {
    const n = parseInt(input.value, 10);
    if (!(n >= 1 && n <= 40320)) return null;
    return { kind, scope: 'event', trigger, value: String(n) };
  }
  const place = String(input.value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!place) return null;
  return { kind, scope: 'event', trigger, value: place };
}

// "ค่าทางด่วน 50 บาท" → "ค่าทางด่วน" (≤ 4 words, no numbers); null if nothing useful is left.
export function learnTriggerFromText(text) {
  const t = norm(text).replace(/[0-9,.:/฿]+/g, ' ').replace(/บาท|thb|baht|บ\.|จ่าย|ซื้อ/gi, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 30 || t.split(' ').length > 4) return null;
  return t;
}

// Called when someone fixes a category on the web: remember it for next time.
// Never overwrites something the person taught on purpose; never throws.
export async function learnCategory(supabase, userId, scope, text, category) {
  try {
    const trigger = learnTriggerFromText(text);
    const entry = trigger && sanitizeLexEntry({ kind: 'category', scope, trigger, value: category });
    if (!entry) return;
    const { data: existing } = await supabase.from('user_lexicon').select('id, source, kind, scope, trigger').eq('user_id', userId).limit(LEX_MAX_PER_USER + 1);
    const same = (existing || []).find(e => e.kind === 'category' && e.scope === entry.scope && e.trigger === entry.trigger);
    if (same?.source === 'taught') return;
    if (same) { await supabase.from('user_lexicon').update({ value: entry.value, source: 'learned' }).eq('id', same.id).eq('user_id', userId); return; }
    if ((existing || []).length >= LEX_MAX_PER_USER) return;
    await supabase.from('user_lexicon').insert({ user_id: userId, ...entry, source: 'learned' });
  } catch (e) { console.error('learnCategory (non-fatal):', e?.message); }
}

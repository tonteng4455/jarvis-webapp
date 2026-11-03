// tools/persona.cjs — the voice of the text in the app's own source: for a female bot ("Friday") the polite particles are written as a woman says them.
// "ครับ" → "ค่ะ", at the end of a question "คะ", "นะครับ" → "นะคะ". Default (Jarvis): nothing changes. The LINE bot has the same rule at run time (BOT_GENDER);
// keep the two in step (both have a test with the same examples).
const Q_END_RE = /(?:ไหม|มั้ย|หรือไม่|หรือเปล่า|หรือยัง|เหรอ|หรอ|อะไร|ใคร|ที่ไหน|เมื่อไร|เมื่อไหร่|กี่[ก-๙]{0,6}|เท่าไร|เท่าไหร่|อย่างไร|ยังไง|บ้าง|ไหน)\s*$/;
const safeGender = v => (/^(?:female|f|woman|หญิง)$/i.test(String(v == null ? '' : v).trim()) ? 'female' : 'male');
function applyPersona(src, gender) {
  if (safeGender(gender) !== 'female') return src;
  const str = String(src);
  return str.replace(/(นะ)?ครับ(?:ผม)?/g, (m, na, off) => {
    if (na) return 'นะคะ';
    const before = str.slice(Math.max(0, off - 16), off), after = str.slice(off + m.length, off + m.length + 3);
    return Q_END_RE.test(before) || /^\s*[?？]/.test(after) ? 'คะ' : 'ค่ะ';
  });
}
module.exports = { applyPersona, safeGender };

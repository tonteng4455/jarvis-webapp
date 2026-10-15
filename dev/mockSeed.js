// dev/mockSeed.js — starting data for MOCK_MODE. Two users:
//   mock-user  — Google Drive connected (photo upload works)
//   mock-nodrive — Google Drive NOT connected (exercises the connect prompt)

const LONG = [
  'ศร.',
  'พล.ป. ถนน (2+1) ศาลาวงกลม หน่วยในลพบุรีใช้งาน, พัน.ป ลาภปืนใช้ , บ้านพักกำลังพล + ระบายน้ำโซนบ้าน ผบช.',
  'ปตอ.1 พัน.3 ถนนหน้า บก.พัน.ถึงโซนบ้านพัก + ระบายน้ำค่าย(พื้นที่ลุ่มต่ำ น้ำในค่าย ศป. ไหลมารวมกันตรงจุดนี้)',
  'ศป. ถนน 2+1 ( ร้อย นนส.+บก.ไป 7+ สนามกีฬาเอ็มพันธ์) + ระบายน้ำที่ขังในสนามกีฬา',
  'ศบบ. ถนน 3 เส้น ok, ระบบระบายน้ำ น้ำจะท่วมเครื่องบิน',
  'นสศ. ระบายน้ำ(น้ำไม่ท่วมจนเดือดร้อน อาจรอก่อนได้) ถนน พร ร่น 1 เส้น(รอบ บก. และทางเข้า 2 ทาง) รร นสศ. 3 เส้น',
  'ขนส่ง ถนนรอบโรงเก็บ + ลานจอด', 'กองพัน ซบร. ถนนหน้ากองร้อย + ท่อระบายน้ำ', 'หมายเหตุ: รอผลสำรวจเพิ่มเติมจาก ช่าง ภายในสัปดาห์หน้า',
].join('\n\n');

const day = n => new Date(Date.now() + n * 86400000).toISOString();

export function seed() {
  const now = new Date().toISOString();
  const notes = (user, rows) => rows.map((r, i) => ({
    id: globalThis.crypto.randomUUID(), user_id: user, pinned: false, archived: false, images: [],
    color: 'default', category: 'general', sort_order: i, created_at: now, updated_at: now, ...r,
  }));
  return {
    users: [
      { line_user_id: 'mock-user', display_name: 'Mock Tester', picture_url: null, phone_number: null, is_premium: true, used_storage_bytes: 0 },
      { line_user_id: 'mock-nodrive', display_name: 'Mock (no Drive)', picture_url: null, phone_number: null, is_premium: true, used_storage_bytes: 0 },
    ],
    notes: [
      ...notes('mock-user', [
        { title: 'Infrastructure and Drainage Maintenance Plan', content: LONG, category: 'work' },
        { title: 'ซื้อของเข้าบ้าน', content: 'ไข่\nนม\nขนมปัง', category: 'shopping', pinned: true },
        { title: 'สั้น ๆ', content: 'โน้ตสั้นมาก' },
      ]),
      ...notes('mock-nodrive', [{ title: 'Note (no Drive)', content: 'hello' }]),
    ],
    tasks: [
      { id: globalThis.crypto.randomUUID(), user_id: 'mock-user', task_name: 'ส่งรายงาน', category: 'work', priority: 'high', is_done: false, archived: false, recurrence: null, recurrence_time: null, google_event_id: null, created_at: now },
    ],
    expenses: [
      { id: globalThis.crypto.randomUUID(), user_id: 'mock-user', type: 'expense', amount: '120', category: 'food', memo: 'ข้าวกลางวัน', created_at: now },
      { id: globalThis.crypto.randomUUID(), user_id: 'mock-user', type: 'income', amount: '5000', category: 'salary', memo: 'งานเสริม', created_at: now },
    ],
    calendar_events: [
      { id: globalThis.crypto.randomUUID(), user_id: 'mock-user', title: 'ประชุมทีม', start_time: day(1), end_time: day(1), location: 'ห้องประชุม', description: '', status: 'confirmed', reminder_minutes: 15, google_event_id: null, calendar_id: null, created_at: now },
    ],
    user_files: [],
    waitlist: [],
  };
}

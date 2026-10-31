-- นัดหมายซ้ำ (ทุกวัน / ทุกสัปดาห์ / ทุกเดือน)  — รันใน Supabase (โปรเจกต์ ujyvvykxakgtbpwdnsnd) > SQL Editor ครั้งเดียว
-- รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมเสีย
--
-- แนวคิด: นัดซ้ำ = 1 แถวใน calendar_events ที่มีกฎการซ้ำ (recurrence_rule) ไม่ได้สร้างแถวล่วงหน้าเป็นร้อยแถว
--   recurrence_rule : กฎแบบ RRULE ย่อ เช่น FREQ=WEEKLY;BYDAY=MO  (เว้นว่าง = นัดครั้งเดียวธรรมดา)
--   recur_exdates   : วันที่ที่ "ข้าม" เช่น ["2026-11-09"] (ยกเลิกเฉพาะครั้งนั้น)
--   series_id       : นัดที่ถูก "แก้เฉพาะครั้งนี้" จะเป็นแถวแยก ชี้กลับไปที่นัดซ้ำต้นทาง
alter table calendar_events add column if not exists recurrence_rule text;
alter table calendar_events add column if not exists recur_exdates jsonb not null default '[]'::jsonb;
alter table calendar_events add column if not exists series_id uuid;

create index if not exists calendar_events_series_idx on calendar_events (series_id) where series_id is not null;
create index if not exists calendar_events_recur_idx on calendar_events (user_id) where recurrence_rule is not null;

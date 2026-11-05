// app/api/space/enter/route.js — the link behind the bot's "@บอท เว็บ" button: /api/space/enter?g=<group id>
// Signed in (the LIFF page did that) → LINE is asked whether this person is in the group → the group space is selected → /dashboard/calendar.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { SPACE_COOKIE, GROUPS_COOKIE, parseSpace, checkMember, groupInfo, readGroupsCookie, groupsCookieValue } from '../../../../lib/space';

const page = (title, body, status = 403) => new Response(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1.2rem"><h2>${title}</h2><p>${body}</p><p><a href="/dashboard">กลับไปที่ข้อมูลส่วนตัว</a></p></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function GET(request) {
  const url = new URL(request.url);
  const gid = parseSpace('g:' + (url.searchParams.get('g') || ''));
  if (!gid) return page('ลิงก์ไม่ถูกต้อง', 'ขอลิงก์ใหม่ในกลุ่ม โดยพิมพ์ @บอท เว็บ', 400);
  const store = await cookies();
  const session = await getSession(store);
  if (!session) return NextResponse.redirect(new URL('/login', request.url));
  const m = await checkMember(gid, session.lineUserId);
  if (!m.member) return m.error
    ? page('ตรวจสอบกับ LINE ไม่ได้ในตอนนี้', 'ลองใหม่อีกครั้งในอีกสักครู่', 502)
    : page('คุณไม่ได้อยู่ในกลุ่มนี้', /^U/.test(session.lineUserId) ? 'เปิดได้เฉพาะสมาชิกของกลุ่มเท่านั้น' : 'บัญชีนี้เข้าสู่ระบบด้วย Google ซึ่งยังไม่ได้ผูกกับ LINE จึงตรวจการเป็นสมาชิกกลุ่มไม่ได้ — ผูกบัญชี LINE ที่เมนูบัญชีก่อน');
  const to = url.searchParams.get('to') || '';
  const landing = /^\/dashboard(\/[a-z-]+)?$/.test(to) ? to : '/dashboard/calendar';          // where a notification / link lands (only inside the dashboard)
  const info = await groupInfo(gid);
  const list = [{ id: gid, name: info.name }, ...readGroupsCookie(store).filter(g => g.id !== gid)];
  const res = NextResponse.redirect(new URL(landing, request.url));
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(SPACE_COOKIE, `g:${gid}`, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  res.cookies.set(GROUPS_COOKIE, groupsCookieValue(list), { httpOnly: false, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

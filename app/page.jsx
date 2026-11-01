// app/page.jsx — root landing page. Just forwards into the dashboard
// (which itself redirects to /login if there's no session) — the old
// "file manager coming soon" placeholder is gone now that
// /dashboard/files is an actual page.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { START_COOKIE, startPath } from '../lib/startPage';

// Opens on the page the person chose in the settings menu (💬 แชท unless they picked 🏠 วันนี้).
export default async function HomePage() {
  redirect(startPath((await cookies()).get(START_COOKIE)?.value));
}

// app/page.jsx — root landing page. Just forwards into the dashboard
// (which itself redirects to /login if there's no session) — the old
// "file manager coming soon" placeholder is gone now that
// /dashboard/files is an actual page.

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
}

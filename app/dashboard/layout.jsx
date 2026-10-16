// app/dashboard/layout.jsx — shared shell for every dashboard page:
// toasts (with undo), the mobile bottom tab bar, offline banner, and
// service-worker registration (PWA / offline notes).
import { ToastProvider } from './_ui';
import { BottomNav, OfflineBanner, SwRegister } from './_shell';
import { DueBanner } from './_due';

export default function DashboardLayout({ children }) {
  return (
    <ToastProvider>
      <OfflineBanner />
      <DueBanner />
      {children}
      <BottomNav />
      <SwRegister />
    </ToastProvider>
  );
}

// app/layout.jsx — required root layout for the App Router.
import './globals.css';

export const metadata = {
  title: 'Jarvis',
  description: 'Jarvis — jarvis-line-bot web app',
  manifest: '/manifest.webmanifest',
  // iOS "Add to Home Screen": opens full-screen like an app.
  appleWebApp: { capable: true, title: 'Jarvis', statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // (no maximumScale: pinch-zoom stays available for accessibility; inputs
  // are 16px on phones so iOS doesn't auto-zoom on focus.)
  // Required for env(safe-area-inset-*) to resolve to anything other
  // than 0 on iOS — without this, the voice button's safe-area
  // adjustment (globals.css) is a silent no-op and it can end up
  // sitting under the home-indicator bar on notched iPhones.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F1F3' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0C0E' },
  ],
};

// Runs synchronously before the page paints — applies the saved theme
// and text size to <html> BEFORE React hydrates, so there's no flash of
// the wrong theme on load.
const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('jarvis-theme');
    // Only pin a theme the user explicitly chose; otherwise leave
    // data-theme unset so the CSS follows the system's light/dark live.
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
    var fs = localStorage.getItem('jarvis-fs');
    if (fs) document.documentElement.setAttribute('data-fs', fs);
  } catch (e) {}
})();
`;

// suppressHydrationWarning on <html>: themeInitScript sets data-theme
// before React hydrates, so that attribute intentionally differs from
// the server HTML. It only silences this one element's attributes.
export default function RootLayout({ children }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

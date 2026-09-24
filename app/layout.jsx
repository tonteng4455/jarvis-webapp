// app/layout.jsx — required root layout for the App Router.
import './globals.css';

export const metadata = {
  title: 'Jarvis',
  description: 'Jarvis Premium — jarvis-line-bot web app',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Required for env(safe-area-inset-*) to resolve to anything other
  // than 0 on iOS — without this, the voice button's safe-area
  // adjustment (globals.css) is a silent no-op and it can end up
  // sitting under the home-indicator bar on notched iPhones.
  viewportFit: 'cover',
};

// Runs synchronously before the page paints — sets [data-theme] on
// <html> from whatever was saved last time (or the system preference,
// the first time ever) BEFORE React hydrates. Without this, the page
// would render once in light mode, then flip to dark a moment later
// for anyone who'd picked dark — a visible flash on every load.
const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('jarvis-theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

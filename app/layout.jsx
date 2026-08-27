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
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

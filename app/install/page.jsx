// app/install/page.jsx — public "install the app" page. The bot's "📲 ติดตั้งแอป" button opens this in the phone's real browser
// (LINE's own window cannot install a web app), then shows only the steps for that phone.
import '../welcome/welcome.css';
import Install from './Install';

export const metadata = {
  title: 'ติดตั้งแอป Jarvis',
  description: 'ติดตั้งเว็บแอป Jarvis ลงหน้าจอมือถือ Android / iPhone ใน 3 ขั้นตอน',
};

export default function InstallPage() { return <Install />; }

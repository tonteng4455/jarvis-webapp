// app/welcome/page.jsx — public quick-start guide (no sign-in): install the web app, link Google, and the first things to try in LINE.
import './welcome.css';
import Welcome from './Welcome';

export const metadata = {
  title: 'คู่มือเริ่มต้น Jarvis',
  description: 'ติดตั้งเว็บแอป Jarvis บน Android / iPhone ผูกบัญชี Google และเริ่มใช้ใน LINE: สรุปข้อความ สร้างนัด จดรายรับ-รายจ่าย',
};

export default function WelcomePage() { return <Welcome />; }

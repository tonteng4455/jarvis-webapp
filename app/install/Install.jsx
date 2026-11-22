'use client';
// app/install/Install.jsx — detects the phone and whether it is inside LINE's own browser, and shows the right steps.
// Android (Chrome) gets a real "install" button when the browser offers one (beforeinstallprompt); iPhone has no such API, so it gets the Safari steps.

import { useEffect, useState } from 'react';
import { AndroidMenu, IosShare, IosAddHome, HomeScreen } from '../welcome/mocks';

const Step = ({ n, title, children }) => (
  <li className="wc-step"><span className="wc-num" aria-hidden="true">{n}</span><div><b>{title}</b>{children && <div className="wc-step-body">{children}</div>}</div></li>
);

export default function Install() {
  const [env, setEnv] = useState({ ready: false, os: 'other', inLine: false, standalone: false });
  const [promptEvt, setPromptEvt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setEnv({ ready: true, os: ios ? 'ios' : android ? 'android' : 'other', inLine: /\bLine\//i.test(ua), standalone });
    const onPrompt = e => { e.preventDefault(); setPromptEvt(e); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  async function installNow() {
    if (!promptEvt) return;
    promptEvt.prompt();
    try { const r = await promptEvt.userChoice; if (r?.outcome === 'accepted') setInstalled(true); } catch { /* cancelled */ }
    setPromptEvt(null);
  }
  async function copyLink() {
    const url = window.location.origin + '/install';
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  }

  const { ready, os, inLine, standalone } = env;
  const showAndroid = os === 'android' || os === 'other';
  const showIos = os === 'ios' || os === 'other';

  return (
    <main className="wc-page-root">
      <header className="wc-hero">
        <img src="/icon-192.png" alt="" width="84" height="84" />
        <h1>ติดตั้งแอป Jarvis</h1>
        <p>ได้ไอคอนบนหน้าจอ เปิดเต็มจอเหมือนแอปทั่วไป ไม่ต้องโหลดจาก App Store หรือ Play Store</p>
      </header>

      {ready && (standalone || installed) && (
        <section className="wc-sec" data-act="install-done">
          <h2>✅ ติดตั้งแล้ว</h2>
          <p className="wc-lead">เปิดแอป Jarvis จากไอคอนบนหน้าจอ แล้วกด “เข้าสู่ระบบด้วย LINE” อีกหนึ่งครั้ง (แอปที่ติดตั้งใหม่ยังไม่รู้จักบัญชีของคุณ) — ครั้งต่อไปจะเข้าอัตโนมัติ</p>
          <a className="glass-btn" href="/login" style={{ textDecoration: 'none', display: 'inline-block' }}>เข้าสู่ระบบ</a>
        </section>
      )}

      {ready && inLine && !standalone && !installed && (
        <section className="wc-sec" data-act="install-in-line">
          <h2>⚠️ ตอนนี้เปิดอยู่ในหน้าต่างของ LINE</h2>
          <p className="wc-lead">หน้าต่างของ LINE ติดตั้งแอปให้ไม่ได้ ต้องเปิดหน้านี้ในเบราว์เซอร์จริงก่อน:</p>
          <ol className="wc-steps">
            {os === 'ios'
              ? <Step n="1" title="แตะปุ่ม ⋯ (หรือปุ่มแชร์) ของ LINE แล้วเลือก “เปิดใน Safari”" />
              : <Step n="1" title="แตะ ⋮ มุมขวาบนของ LINE แล้วเลือก “เปิดในเบราว์เซอร์” (Chrome)" />}
            <Step n="2" title="ทำตามขั้นตอนด้านล่างในเบราว์เซอร์นั้น">หรือแตะปุ่มด้านล่างเพื่อคัดลอกลิงก์ไปวางเปิดเอง</Step>
          </ol>
          <button type="button" className="glass-btn-outline" onClick={copyLink}>{copied ? '✅ คัดลอกลิงก์แล้ว' : '🔗 คัดลอกลิงก์หน้านี้'}</button>
        </section>
      )}

      {ready && !standalone && !installed && (
        <>
          {showAndroid && (
            <section className="wc-sec" data-os="android">
              <h2>🤖 Android (Chrome)</h2>
              {promptEvt && !inLine && (
                <p style={{ margin: '0 0 0.8rem' }}><button type="button" className="glass-btn" onClick={installNow} data-act="install-now">⬇️ ติดตั้งแอปเลย</button></p>
              )}
              <ol className="wc-steps">
                <Step n="1" title="แตะเมนู ⋮ มุมขวาบนของ Chrome" />
                <Step n="2" title="เลือก “ติดตั้งแอป”">บางเครื่องเขียนว่า “เพิ่มไปยังหน้าจอหลัก”</Step>
                <Step n="3" title="ยืนยัน “ติดตั้ง”">จะมีไอคอน Jarvis บนหน้าจอ</Step>
              </ol>
              <div className="wc-shots"><AndroidMenu /><HomeScreen /></div>
              <p className="wc-tip">💡 ไม่เห็น “ติดตั้งแอป”? รีเฟรชหน้านี้ 1 ครั้ง หรืออัปเดต Chrome เป็นเวอร์ชันล่าสุด</p>
            </section>
          )}
          {showIos && (
            <section className="wc-sec" data-os="ios">
              <h2>🍎 iPhone (Safari)</h2>
              <ol className="wc-steps">
                <Step n="1" title="แตะปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบล่างของ Safari" />
                <Step n="2" title="เลื่อนลงแล้วแตะ “เพิ่มไปยังหน้าจอโฮม”" />
                <Step n="3" title="แตะ “เพิ่ม” มุมขวาบน">จะได้ไอคอน Jarvis บนหน้าจอโฮม</Step>
              </ol>
              <div className="wc-shots"><IosShare /><IosAddHome /><HomeScreen /></div>
              <p className="wc-tip">💡 ต้องเป็น Safari เท่านั้น · การแจ้งเตือนเด้งบน iPhone ใช้ได้เมื่อติดตั้งเป็นแอปแล้ว (iOS 16.4 ขึ้นไป)</p>
            </section>
          )}
          <section className="wc-sec">
            <h2>🔑 ติดตั้งแล้ว ทำอะไรต่อ</h2>
            <ol className="wc-steps">
              <Step n="1" title="เปิดแอป Jarvis จากไอคอนบนหน้าจอ" />
              <Step n="2" title="กด “เข้าสู่ระบบด้วย LINE” หนึ่งครั้ง">แอปที่ติดตั้งใหม่ยังไม่รู้จักบัญชีของคุณ (ข้อมูลทั้งหมดเป็นชุดเดียวกับในแชท) ครั้งต่อไปจะเข้าอัตโนมัติ</Step>
              <Step n="3" title="ผูกบัญชี Google (ไม่บังคับ)">ดูขั้นตอนในคู่มือเริ่มต้นได้ที่ด้านล่าง</Step>
            </ol>
          </section>
        </>
      )}

      <footer className="wc-foot">
        <p className="no-print"><a className="glass-btn-outline" href="/welcome" style={{ textDecoration: 'none' }}>📖 คู่มือเริ่มต้นฉบับเต็ม</a></p>
      </footer>
    </main>
  );
}

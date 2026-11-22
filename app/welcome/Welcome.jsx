'use client';
// app/welcome/Welcome.jsx — the quick-start guide: 1 add the bot, 2 open the web app from the bot + install it, 3 link Google, 4-6 the things to try in LINE.
// Public page (no sign-in) so the link can be sent to anyone; "บันทึกเป็น PDF" prints the same page (see welcome.css @media print).

import { useEffect, useState } from 'react';
import { AndroidMenu, IosShare, IosAddHome, HomeScreen, MenuAccount, LinkGoogle, PickGoogle, ConnectCalendar, GoogleAllow, LineAdd, Chat, MenuCard, LoginLine } from './mocks';

const LINE_OA_URL = process.env.NEXT_PUBLIC_LINE_OA_URL || '';

function Step({ n, title, children }) {
  return (
    <li className="wc-step">
      <span className="wc-num" aria-hidden="true">{n}</span>
      <div><b>{title}</b>{children && <div className="wc-step-body">{children}</div>}</div>
    </li>
  );
}
const Steps = ({ children }) => <ol className="wc-steps">{children}</ol>;
const Shots = ({ children }) => <div className="wc-shots">{children}</div>;
const Tip = ({ children }) => <p className="wc-tip">💡 {children}</p>;
const Try = ({ children }) => <code className="wc-try">{children}</code>;

export default function Welcome() {
  const [os, setOs] = useState('android');
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) setOs('ios'); }, []);

  async function share() {
    const url = window.location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    } catch { /* cancelled */ }
  }

  return (
    <main className="wc-page-root">
      <header className="wc-hero">
        <img src="/icon-192.png" alt="" width="84" height="84" />
        <h1>คู่มือเริ่มต้น Jarvis</h1>
        <p>จดโน้ต นัดหมาย และรายรับ-รายจ่าย ด้วยการพิมพ์ใน LINE แล้วดูทั้งหมดบนเว็บแอป — เริ่มใช้ได้ใน 5 นาที</p>
        <div className="wc-actions no-print">
          <button type="button" className="glass-btn" onClick={() => window.print()}>🖨️ บันทึกเป็น PDF</button>
          <button type="button" className="glass-btn-outline" onClick={share}>{copied ? '✅ คัดลอกลิงก์แล้ว' : '🔗 ส่งต่อคู่มือนี้'}</button>
        </div>
        <nav className="wc-toc no-print" aria-label="ไปยังหัวข้อ">
          <a href="#line-add">💬 เพิ่มเพื่อน</a><a href="#install">📲 เปิดเว็บ+ติดตั้ง</a><a href="#google">🔵 ผูก Google</a>
          <a href="#line-summary">🔎 สรุปข้อความ</a><a href="#line-event">📅 สร้างนัด</a><a href="#line-money">💰 รายรับ-รายจ่าย</a>
        </nav>
      </header>

      {/* ============ 1. add the bot as a friend ============ */}
      <section id="line-add" className="wc-sec">
        <h2><span>1</span> เพิ่ม Jarvis เป็นเพื่อนใน LINE</h2>
        <p className="wc-lead">เริ่มที่ LINE ก่อน — แล้วเปิดเว็บแอปจากในแชทของบอทได้เลย ไม่ต้องจำที่อยู่เว็บหรือสมัครสมาชิก</p>
        <div className="wc-block">
        <Steps>
          <Step n="1" title="เปิดลิงก์เพิ่มเพื่อน หรือค้นหา “Jarvis” ใน LINE">
            {LINE_OA_URL ? (
              <div className="wc-oa-box">
                <img className="wc-qr" src="/line-qr.svg" alt="QR code เพิ่มเพื่อน" width="132" height="132" />
                <div>
                  <small>สแกนด้วยกล้อง หรือแอป LINE (แท็บ “เพิ่มเพื่อน” → QR code)</small>
                  <a className="glass-btn wc-oa-link no-print" href={LINE_OA_URL}>💬 เพิ่ม Jarvis เป็นเพื่อน</a>
                  <div className="wc-url-print">{LINE_OA_URL.replace(/^https?:\/\//, '')}</div>
                </div>
              </div>
            ) : <span>ผู้ดูแลจะส่งลิงก์หรือ QR ให้ — สแกนด้วยกล้องใน LINE (แท็บ “เพิ่มเพื่อน” → QR code)</span>}
          </Step>
          <Step n="2" title="กด “เพิ่มเพื่อน” แล้วเปิดแชท">Jarvis จะทักทายพร้อมเมนู</Step>
          <Step n="3" title="ลองพิมพ์ “เมนู”">ถ้าลืมคำสั่งตอนไหน พิมพ์ “เมนู” ได้เสมอ</Step>
        </Steps>
        <Shots>
          <LineAdd url={LINE_OA_URL} />
          <Chat caption="พิมพ์ “เมนู” Jarvis ตอบเป็นการ์ดพร้อมปุ่ม" messages={[
            { from: 'me', text: 'เมนู' },
            { from: 'bot', text: 'สวัสดีครับ ช่วยจดโน้ต นัดหมาย งาน และรายรับ-รายจ่ายให้ได้\nเลือกจากเมนูด้านล่าง หรือพิมพ์ได้เลยครับ', chips: ['📝 โน้ต', '📅 นัดหมาย', '💰 เงิน', '🌐 เปิดเว็บ'] },
          ]} />
        </Shots>
        <Tip>เท่านี้ก็จดโน้ต นัดหมาย และรายรับ-รายจ่ายในแชทได้แล้ว — เว็บแอปไว้ดู ค้นหา และแก้ไขทั้งหมดในที่เดียว (ขั้นตอนถัดไป)</Tip>
        </div>
      </section>

      {/* ============ 2. open the web app from the bot, then install it ============ */}
      <section id="install" className="wc-sec">
        <h2><span>2</span> เปิดเว็บแอปจากบอท แล้วติดตั้งลงมือถือ</h2>
        <p className="wc-lead">ติดตั้งครั้งเดียวจะได้ไอคอน Jarvis บนหน้าจอ เปิดเต็มจอเหมือนแอปทั่วไป และดูโน้ตล่าสุดได้แม้ไม่มีเน็ต ไม่ต้องโหลดจาก App Store หรือ Play Store</p>

        <div className="wc-block">
        <h3 className="wc-sub">ก. เปิดจากในแชท แล้วส่งไปติดตั้งในเบราว์เซอร์</h3>
        <Steps>
          <Step n="1" title="ในแชท Jarvis พิมพ์ “เมนู” แล้วแตะ “🌐 เปิดเว็บแอป”">เปิดในหน้าต่างของ LINE และเข้าสู่ระบบให้อัตโนมัติ ใช้งานได้ทันที (ปุ่ม “🌐 เปิดเว็บ” ใต้ข้อความตอบกลับก็พาไปหน้าที่ตรงกับเรื่องที่คุยอยู่)</Step>
          <Step n="2" title="อยากได้ไอคอนบนหน้าจอ: กลับแชท แล้วแตะ “📲 ติดตั้งแอป”">หน้าต่างของ LINE ติดตั้งแอปให้ไม่ได้ ปุ่มนี้จึงเปิดหน้าติดตั้งใน Chrome (Android) หรือ Safari (iPhone) ให้เอง และขึ้นขั้นตอนที่ตรงกับมือถือคุณ — พิมพ์ “ติดตั้งแอป” ในแชทก็ได้</Step>
          <Step n="3" title="ทำตามขั้นตอนของเครื่องคุณ (ข. ด้านล่าง)" />
        </Steps>
        <Shots><MenuCard hl="web" caption="แตะ “🌐 เปิดเว็บแอป” เพื่อใช้ในหน้าต่างของ LINE" /><MenuCard hl="install" caption="แตะ “📲 ติดตั้งแอป” เพื่อติดตั้งลงหน้าจอ" /></Shots>
        <div className="wc-os no-print" role="tablist" aria-label="ระบบของมือถือ">
          <button type="button" role="tab" aria-selected={os === 'android'} className={os === 'android' ? 'on' : ''} onClick={() => setOs('android')}>🤖 Android</button>
          <button type="button" role="tab" aria-selected={os === 'ios'} className={os === 'ios' ? 'on' : ''} onClick={() => setOs('ios')}>🍎 iPhone (iOS)</button>
        </div>
        </div>

        <div className={`wc-os-pane wc-block${os === 'android' ? ' show' : ''}`} data-os="android">
          <h3 className="only-print">ข. 🤖 Android</h3>
          <Steps>
            <Step n="1" title="แตะปุ่ม “⬇️ ติดตั้งแอปเลย” ในหน้าที่เปิดขึ้นมา">ถ้าไม่มีปุ่มนี้ ให้แตะเมนู ⋮ มุมขวาบนของ Chrome แล้วเลือก “ติดตั้งแอป” (บางเครื่องเขียนว่า “เพิ่มไปยังหน้าจอหลัก”)</Step>
            <Step n="2" title="ยืนยัน “ติดตั้ง”">รอสักครู่ จะมีไอคอน Jarvis บนหน้าจอ</Step>
          </Steps>
          <Shots><AndroidMenu /><HomeScreen /></Shots>
          <Tip>ถ้าหน้าติดตั้งเปิดค้างอยู่ในหน้าต่างของ LINE ให้แตะ ⋮ มุมขวาบน แล้วเลือก “เปิดในเบราว์เซอร์”</Tip>
        </div>

        <div className={`wc-os-pane wc-block${os === 'ios' ? ' show' : ''}`} data-os="ios">
          <h3 className="only-print">ข. 🍎 iPhone (iOS)</h3>
          <Steps>
            <Step n="1" title="แตะปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบล่างของ Safari" />
            <Step n="2" title="เลื่อนลงแล้วแตะ “เพิ่มไปยังหน้าจอโฮม”" />
            <Step n="3" title="แตะ “เพิ่ม” มุมขวาบน">จะได้ไอคอน Jarvis บนหน้าจอโฮม</Step>
          </Steps>
          <Shots><IosShare /><IosAddHome /><HomeScreen /></Shots>
          <Tip>ต้องเป็น Safari เท่านั้น (ถ้าเปิดค้างในหน้าต่างของ LINE ให้แตะปุ่ม ⋯ แล้วเลือก “เปิดใน Safari”) · การแจ้งเตือนเด้งบน iPhone ใช้ได้เมื่อติดตั้งเป็นแอปแล้ว (iOS 16.4 ขึ้นไป)</Tip>
        </div>

        <div className="wc-block">
        <h3 className="wc-sub">ค. เปิดแอปครั้งแรก</h3>
        <Steps>
          <Step n="1" title="แตะไอคอน Jarvis บนหน้าจอ แล้วกด “เข้าสู่ระบบด้วย LINE”">แอปที่ติดตั้งใหม่ยังไม่รู้จักบัญชีของคุณ จึงต้องกดเข้าสู่ระบบอีกหนึ่งครั้ง (โดยเฉพาะ iPhone) — ข้อมูลทั้งหมดเป็นชุดเดียวกับในแชท ครั้งต่อไปจะเข้าอัตโนมัติ</Step>
          <Step n="2" title="จะเข้าหน้าวันนี้ ใช้แถบเมนูล่างสลับ โน้ต · งาน · นัดหมาย · เงิน · ไฟล์" />
        </Steps>
        <Shots><LoginLine /></Shots>
        </div>
      </section>

      {/* ============ 3. Google ============ */}
      <section id="google" className="wc-sec">
        <h2><span>3</span> ลิงก์บัญชี Google กับเว็บแอป</h2>
        <div className="wc-block">
        <p className="wc-lead">มี 2 อย่างที่ต่างกัน ทำอย่างใดอย่างหนึ่งหรือทั้งสองก็ได้ — ไม่เชื่อมก็ใช้โน้ต งาน และรายรับ-รายจ่ายได้ปกติ (ทำในแอปที่ติดตั้งแล้ว หรือในเว็บก็ได้)</p>
        <div className="wc-two">
          <div className="wc-box"><b>🔵 ผูก Google เพื่อเข้าสู่ระบบ</b><p>เข้าเว็บแอปด้วย Google แทนหรือควบคู่กับ LINE ข้อมูลทั้งหมดเป็นชุดเดียวกัน</p></div>
          <div className="wc-box"><b>📆 เชื่อม Google Calendar + Drive</b><p>นัดที่จดไว้ไปอยู่ในปฏิทินของคุณ (และเตือนบนมือถือ) รูป/ไฟล์เก็บใน Drive ของคุณเอง</p></div>
        </div>

        </div>
        <div className="wc-block">
        <h3 className="wc-sub">ก. ผูก Google เพื่อเข้าสู่ระบบ</h3>
        <Steps>
          <Step n="1" title="ในเว็บแอป แตะรูปโปรไฟล์มุมขวาบน → “👤 บัญชีและการเข้าสู่ระบบ”" />
          <Step n="2" title="ที่แถว Google กด “ผูก Google”" />
          <Step n="3" title="เลือกบัญชี Google ของคุณ">ถ้าขึ้นว่าบัญชีนี้มีข้อมูลอยู่แล้ว จะมีให้เลือก “รวมบัญชี” ได้ (ทำย้อนกลับไม่ได้ แต่ไม่มีข้อมูลหาย)</Step>
        </Steps>
        <Shots><MenuAccount /><LinkGoogle /><PickGoogle /></Shots>
        </div>

        <div className="wc-block">
        <h3 className="wc-sub">ข. เชื่อม Google Calendar และ Drive</h3>
        <Steps>
          <Step n="1" title="หน้าเดียวกัน เลื่อนลงไปที่การ์ด “📆 Google Calendar และ Drive”" />
          <Step n="2" title="กด “🔗 เชื่อม Google Calendar และ Drive” → เลือกบัญชี → กด “อนุญาต”">ทำครั้งเดียว ใช้เวลาไม่ถึงนาที (หรือพิมพ์ “เชื่อมต่อ google” ในแชท LINE ก็ได้)</Step>
          <Step n="3" title="เห็น “🟢 เชื่อมอยู่” แปลว่าเสร็จแล้ว">ต่อไปนัดที่จดจะขึ้นใน Google Calendar เอง</Step>
        </Steps>
        <Shots><ConnectCalendar /><GoogleAllow /></Shots>
        <Tip>ถ้าวันหนึ่งขึ้นว่า “การเชื่อมหมดอายุ” แค่กด “🔗 เชื่อมใหม่” อีกครั้ง ข้อมูลเดิมไม่หาย</Tip>
        </div>
      </section>

      <section id="line-summary" className="wc-sec">
        <h2><span>4</span> สรุปข้อความยาว ๆ</h2>
        <p className="wc-lead">ได้ข้อความยาวจากกลุ่มหรือเพื่อน? ส่งต่อให้ Jarvis แล้วให้สรุปให้</p>
        <div className="wc-block">
        <Steps>
          <Step n="1" title="ส่งต่อ (Forward) หรือคัดลอกข้อความนั้นมาในแชท Jarvis" />
          <Step n="2" title="กดค้างที่ข้อความนั้น แล้วเลือก “ตอบกลับ” (Reply)" />
          <Step n="3" title="พิมพ์ “สรุป” แล้วส่ง"><span>อยากได้แบบเฉพาะ ก็พิมพ์เพิ่มได้ เช่น <Try>สรุป สั้น ๆ 3 ข้อ</Try> <Try>สรุป เป็นภาษาอังกฤษ</Try></span></Step>
        </Steps>
        <Shots>
          <Chat caption="ตัวอย่าง: ตอบกลับข้อความที่ส่งต่อมา แล้วพิมพ์ “สรุป”" messages={[
            { from: 'me', text: 'เรียน ทุกท่าน ด้วยมีกำหนดประชุมโครงการ ในวันศุกร์ที่ 27 พ.ย. เวลา 09:00 น. ณ ห้องประชุมใหญ่ ขอให้เตรียมรายงานความคืบหน้ามาด้วย …' },
            { from: 'me', quote: 'เรียน ทุกท่าน ด้วยมีกำหนดประชุม…', text: 'สรุป' },
            { from: 'bot', text: '🔎 ประชุมโครงการ วันศุกร์ 27 พ.ย. 09:00 น.\n• ห้องประชุมใหญ่\n• เตรียมรายงานความคืบหน้ามาด้วย' },
          ]} />
        </Shots>
        <Tip>ตอบกลับคำสรุปของ Jarvis แล้วถามต่อได้เลย เช่น “ต้องเตรียมอะไรบ้าง” — ส่งรูปเอกสารมาแล้วตอบกลับว่า “สรุป” ก็ได้</Tip>
        </div>
      </section>

      <section id="line-event" className="wc-sec">
        <h2><span>5</span> สร้างนัดหมายจากข้อความ</h2>
        <p className="wc-lead">มี 2 วิธี — พิมพ์เอง หรือให้ Jarvis อ่านวันเวลาจากข้อความที่มีคนส่งมา</p>
        <div className="wc-block">
        <h3 className="wc-sub">วิธีที่ 1: พิมพ์เอง</h3>
        <p className="wc-p">พิมพ์ “นัด” ตามด้วยเรื่อง วัน และเวลา เหมือนพูดกับคน</p>
        <div className="wc-tries"><Try>นัด ประชุมทีม พรุ่งนี้ 10 โมง</Try><Try>นัดหมอฟัน 25 พ.ย. 14:00 ที่คลินิก</Try><Try>นัด ส่งงาน วันศุกร์ 9 โมง เตือนก่อน 1 วัน</Try></div>
        </div>
        <div className="wc-block">
        <h3 className="wc-sub">วิธีที่ 2: ให้ Jarvis อ่านจากข้อความ</h3>
        <Steps>
          <Step n="1" title="ส่งต่อหรือคัดลอกข้อความที่บอกวันเวลาประชุม มาในแชท Jarvis" />
          <Step n="2" title="กดค้าง → “ตอบกลับ” แล้วพิมพ์ “นัด”" />
          <Step n="3" title="Jarvis สร้างนัดให้ พร้อมปุ่มแก้ไข หรือเลิกทำ">ผิดนิดเดียวกด “✏️ แก้” ผิดทั้งหมดกด “↩️ เลิกทำ”</Step>
        </Steps>
        <Shots>
          <Chat caption="พิมพ์เอง: ได้นัดทันที" messages={[
            { from: 'me', text: 'นัด ประชุมทีม พรุ่งนี้ 10 โมง' },
            { from: 'bot', text: '📅 เพิ่มนัดแล้ว: ประชุมทีม\n🕐 23 พ.ย. 2569 10:00\n🔔 ⏰ 1 ชม.ก่อน', chips: ['✏️ แก้', '↩️ เลิกทำ', '📅 ดูนัดหมาย'] },
          ]} />
          <Chat caption="ให้ Jarvis อ่านจากข้อความที่ส่งต่อมา" messages={[
            { from: 'me', text: 'ขออนุญาตแจ้งเปลี่ยนกำหนดการประชุม ย้ายไปวันศุกร์ที่ 27 พ.ย. 69 เวลา 09:00 น. ณ ห้องประชุมใหญ่ ครับ' },
            { from: 'me', quote: 'ขออนุญาตแจ้งเปลี่ยนกำหนดการ…', text: 'นัด' },
            { from: 'bot', text: '📅 เพิ่มนัดแล้ว: ประชุมตามกำหนดการใหม่\n🕐 27 พ.ย. 2569 09:00 · 📍 ห้องประชุมใหญ่\n🔔 ⏰ 1 ชม.ก่อน', chips: ['✏️ แก้', '↩️ เลิกทำ', '📅 ดูนัดหมาย'] },
          ]} />
        </Shots>
        <Tip>ถ้าข้อความไม่บอกเวลา Jarvis จะใส่ 09:00 ให้ก่อน แก้ได้ที่ปุ่ม “✏️ แก้” — เชื่อม Google Calendar ไว้แล้วนัดจะไปขึ้นในปฏิทินของคุณเอง</Tip>
        </div>
      </section>

      <section id="line-money" className="wc-sec">
        <h2><span>6</span> จดรายรับ-รายจ่าย</h2>
        <p className="wc-lead">พิมพ์สั้น ๆ ว่าใช้ไปหรือได้มาเท่าไร Jarvis แยกหมวดให้เอง</p>
        <div className="wc-block">
        <Steps>
          <Step n="1" title="พิมพ์ รายการ + จำนวนเงิน"><span className="wc-tries inline"><Try>ใช้ไป 120 ข้าวกลางวัน</Try><Try>ค่ากาแฟ 65</Try><Try>ได้เงินเดือน 30000</Try></span></Step>
          <Step n="2" title="พิมพ์ผิด? กด “↩️ เลิกทำ” ใต้ข้อความตอบกลับ" />
          <Step n="3" title="พิมพ์ “สรุปเงิน” เพื่อดูยอดสุทธิ หรือกด “💰 เงิน” ในเมนู">รายการทั้งหมดอยู่ในเว็บแอปแท็บ “เงิน” (ค้น เรียง แก้ไข ส่งออก Google Sheets ได้)</Step>
        </Steps>
        <Shots>
          <Chat caption="จดรายจ่ายและรายรับ" messages={[
            { from: 'me', text: 'ใช้ไป 120 ข้าวกลางวัน' },
            { from: 'bot', text: '💸 บันทึกรายจ่าย 120 บาท เรียบร้อย', chips: ['↩️ เลิกทำ', '📊 สรุป'] },
            { from: 'me', text: 'ได้เงินเดือน 30000' },
            { from: 'bot', text: '💵 บันทึกรายรับ 30,000 บาท เรียบร้อย', chips: ['↩️ เลิกทำ', '📊 สรุป'] },
          ]} />
          <Chat caption="พิมพ์ “สรุปเงิน” ดูยอดสุทธิ" messages={[
            { from: 'me', text: 'สรุปเงิน' },
            { from: 'bot', title: '💰 สรุปเงิน', card: [{ k: 'สุทธิ', v: '29,880 บาท' }, { k: 'ได้เงินเดือน', v: '+30,000', cls: 'in' }, { k: 'ใช้ไป ข้าวกลางวัน', v: '-120', cls: 'out' }, { k: 'แตะเพื่อจัดการในเว็บ', v: '›' }] },
          ]} />
        </Shots>
        <Tip>มีใบเสร็จ/สลิป? ส่งรูปมาแล้วตอบกลับรูปนั้นว่า “รายจ่าย” Jarvis อ่านจำนวนเงินจากรูปให้ ตรวจดูแล้วบันทึก</Tip>
        </div>
      </section>

      <footer className="wc-foot">
        <p><b>ลืมคำสั่ง?</b> พิมพ์ “เมนู” ใน LINE หรือเปิด 📖 คู่มือการใช้งานฉบับเต็มในเว็บแอป</p>
        <p className="no-print"><a className="glass-btn" href="/login" style={{ textDecoration: 'none' }}>เปิดเว็บแอป</a></p>
      </footer>
    </main>
  );
}

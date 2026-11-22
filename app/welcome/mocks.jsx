// app/welcome/mocks.jsx — little phone screens drawn with HTML/CSS for the quick-start guide (no screenshots to go stale).
// They look like the real thing without being a copy of anyone's UI. The name "Jarvis" below follows the brand switch at build time.
// Colours are fixed (not theme tokens) so the guide prints and shares the same in light and dark mode.

export function Phone({ children, caption, tone = 'light' }) {
  return (
    <figure className={`wc-fig wc-tone-${tone}`}>
      <div className="wc-phone" aria-hidden="true">
        <div className="wc-notch" />
        <div className="wc-screen">{children}</div>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

// a ring around the thing to tap
export const Hl = ({ children, className = '' }) => <span className={`wc-hl ${className}`}>{children}</span>;

const AppIcon = ({ size = 40 }) => <img src="/icon-192.png" alt="" width={size} height={size} style={{ borderRadius: size * 0.22, display: 'block' }} />;

/* ---------- install: Android (Chrome) ---------- */
export function AndroidMenu() {
  return (
    <Phone caption="เปิดใน Chrome แตะ ⋮ แล้วเลือก “ติดตั้งแอป”">
      <div className="wc-chrome-bar"><span className="wc-url">🔒 เว็บ Jarvis</span><Hl>⋮</Hl></div>
      <div className="wc-page"><AppIcon size={46} /><b>Jarvis</b><small>เข้าสู่ระบบด้วย LINE</small></div>
      <div className="wc-menu">
        <div>➕ แท็บใหม่</div><div>🕘 ประวัติ</div>
        <div className="wc-menu-hl"><Hl className="wide">⬇️ ติดตั้งแอป</Hl></div>
        <div>↗️ แชร์…</div><div>⚙️ การตั้งค่า</div>
      </div>
    </Phone>
  );
}

/* ---------- install: iPhone (Safari) ---------- */
export function IosShare() {
  return (
    <Phone caption="เปิดใน Safari แตะปุ่มแชร์ที่แถบล่าง">
      <div className="wc-page tall"><AppIcon size={46} /><b>Jarvis</b><small>เข้าสู่ระบบด้วย LINE</small></div>
      <div className="wc-safari-bar"><span>‹</span><span>›</span><Hl><svg width="18" height="20" viewBox="0 0 18 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12V2M5.5 5.5 9 2l3.5 3.5M4 8H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1" /></svg></Hl><span>📖</span><span>▢▢</span></div>
    </Phone>
  );
}
export function IosAddHome() {
  return (
    <Phone caption="เลื่อนรายการลง แล้วแตะ “เพิ่มไปยังหน้าจอโฮม”">
      <div className="wc-sheet">
        <div className="wc-sheet-head"><AppIcon size={34} /><div><b>Jarvis</b><small>เว็บ Jarvis</small></div></div>
        <div className="wc-sheet-row">คัดลอก <span>⧉</span></div>
        <div className="wc-sheet-row">เพิ่มลงรายการโปรด <span>☆</span></div>
        <div className="wc-sheet-row hl"><Hl className="wide">เพิ่มไปยังหน้าจอโฮม <span>⊞</span></Hl></div>
        <div className="wc-sheet-row">ค้นหาในหน้า <span>🔍</span></div>
      </div>
    </Phone>
  );
}
export function HomeScreen() {
  const dummy = ['#9aa5b1', '#b8a99a', '#8fb8a8', '#a9a0c4', '#c4a0a0', '#9ab0c4', '#c4c09a'];
  return (
    <Phone caption="เสร็จแล้ว! ไอคอนอยู่บนหน้าจอ เปิดได้เต็มจอเหมือนแอปทั่วไป">
      <div className="wc-home">
        {dummy.slice(0, 3).map((c, i) => <i key={i} style={{ background: c }} />)}
        <div className="wc-home-me"><Hl className="round"><AppIcon size={44} /></Hl><small>Jarvis</small></div>
        {dummy.slice(3).map((c, i) => <i key={i + 3} style={{ background: c }} />)}
      </div>
    </Phone>
  );
}

/* ---------- Google on the web app ---------- */
export function MenuAccount() {
  return (
    <Phone caption="ในเว็บแอป แตะรูปโปรไฟล์มุมขวาบน → “บัญชีและการเข้าสู่ระบบ”">
      <div className="wc-appbar"><b>Jarvis</b><Hl className="round"><span className="wc-avatar">M</span></Hl></div>
      <div className="wc-menu-card">
        <div>ธีม · ขนาดตัวอักษร</div>
        <div className="wc-menu-btn"><Hl className="wide">👤 บัญชีและการเข้าสู่ระบบ</Hl></div>
        <div className="wc-menu-btn plain">🔔 การแจ้งเตือน</div>
        <div className="wc-menu-btn plain">📖 คู่มือการใช้งาน</div>
      </div>
    </Phone>
  );
}
export function LinkGoogle() {
  return (
    <Phone caption="กด “ผูก Google” แล้วเลือกบัญชี — ต่อไปเข้าเว็บด้วย LINE หรือ Google ก็เห็นข้อมูลชุดเดียวกัน">
      <div className="wc-card-title">👤 บัญชีและการเข้าสู่ระบบ</div>
      <div className="wc-acc-row"><span>💬</span><span><b>LINE</b><small>ผูกแล้ว</small></span><em>✓</em></div>
      <div className="wc-acc-row"><span>🔵</span><span><b>Google</b><small>ยังไม่ได้ผูก</small></span><Hl className="btn">ผูก Google</Hl></div>
    </Phone>
  );
}
export function PickGoogle() {
  return (
    <Phone caption="เลือกบัญชี Google ที่ต้องการ แล้วกดอนุญาต (หน้านี้เป็นของ Google)">
      <div className="wc-google">
        <div className="wc-g-logo"><b style={{ color: '#4285f4' }}>G</b>oogle</div>
        <h4>เลือกบัญชี</h4>
        <div className="wc-g-acc"><span className="wc-avatar g">S</span><span><b>somchai@gmail.com</b><small>บัญชีหลัก</small></span></div>
        <div className="wc-g-acc"><span className="wc-avatar g2">+</span><span>ใช้บัญชีอื่น</span></div>
      </div>
    </Phone>
  );
}
export function ConnectCalendar() {
  return (
    <Phone caption="แยกต่างหาก: เชื่อม Google Calendar และ Drive เพื่อให้นัดไปอยู่ในปฏิทินของคุณ">
      <div className="wc-card-title">📆 Google Calendar และ Drive</div>
      <p className="wc-small">ใช้ลงนัดหมายในปฏิทิน และเก็บรูป/ไฟล์ไว้ใน Drive ของคุณ</p>
      <p className="wc-status">⚪ ยังไม่ได้เชื่อม</p>
      <Hl className="btn wide">🔗 เชื่อม Google Calendar และ Drive</Hl>
    </Phone>
  );
}
export function GoogleAllow() {
  return (
    <Phone caption="กด “อนุญาต” (ครั้งเดียว) — Jarvis เข้าถึงเฉพาะปฏิทินและไฟล์ที่ Jarvis สร้างเอง">
      <div className="wc-google">
        <div className="wc-g-logo"><b style={{ color: '#4285f4' }}>G</b>oogle</div>
        <h4>Jarvis ต้องการสิทธิ์</h4>
        <ul className="wc-g-perm"><li>☑ ดูและแก้ไขกิจกรรมในปฏิทิน</li><li>☑ จัดการไฟล์ที่ Jarvis สร้างใน Drive</li></ul>
        <div className="wc-g-btns"><span>ยกเลิก</span><Hl className="btn">อนุญาต</Hl></div>
      </div>
    </Phone>
  );
}

/* ---------- LINE ---------- */
export function LineAdd({ url }) {
  return (
    <Phone caption="เปิดลิงก์ หรือค้นหา “Jarvis” ใน LINE แล้วกด “เพิ่มเพื่อน”" tone="line">
      <div className="wc-oa">
        <div className="wc-oa-cover" />
        <div className="wc-oa-id"><AppIcon size={64} /><b>Jarvis</b><small>ผู้ช่วยจดบันทึก นัดหมาย รายรับ-รายจ่าย</small></div>
        <Hl className="line-btn">+ เพิ่มเพื่อน</Hl>
        {url ? <small className="wc-oa-url">{url.replace(/^https?:\/\//, '')}</small> : null}
      </div>
    </Phone>
  );
}


// the bot's main menu card, with the tile to tap highlighted (hl: 'web' | 'install')
export function MenuCard({ hl = 'web', caption }) {
  const tile = (icon, label, key) => (
    <div className={`wc-tile${key === hl ? ' on' : ''}`}>{key === hl ? <Hl className="wide">{icon} {label}</Hl> : <>{icon} {label}</>}</div>
  );
  return (
    <Phone caption={caption} tone="line">
      <div className="wc-linebar"><span>‹</span><b>Jarvis</b></div>
      <div className="wc-chat">
        <div className="wc-msg me"><div className="wc-bubble-col"><div className="wc-bubble">เมนู</div></div></div>
        <div className="wc-msg bot">
          <AppIcon size={26} />
          <div className="wc-bubble-col">
            <div className="wc-flex wide">
              <div className="wc-flex-head">🏠 เมนูหลัก</div>
              <div className="wc-tiles">
                {tile('📅', 'นัดหมาย')}{tile('📝', 'โน้ต')}{tile('💰', 'เงิน')}{tile('📁', 'ไฟล์')}
                {tile('🌐', 'เปิดเว็บแอป', 'web')}{tile('📲', 'ติดตั้งแอป', 'install')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

// the web app's sign-in page
export function LoginLine() {
  return (
    <Phone caption="เปิดแอปจากไอคอนแล้วกด “เข้าสู่ระบบด้วย LINE” (ครั้งเดียว)">
      <div className="wc-page tall"><AppIcon size={52} /><b>Jarvis</b><small>เข้าสู่ระบบ</small>
        <Hl className="btn line-green">เข้าสู่ระบบด้วย LINE</Hl>
        <span className="wc-or">หรือ</span>
        <span className="wc-btn-plain">เข้าสู่ระบบด้วย Google</span>
      </div>
    </Phone>
  );
}

// a LINE chat: messages = [{ from: 'me' | 'bot', text, quote?, card?: [{ k, v }], title?, chips?: [] }]
export function Chat({ messages, caption }) {
  return (
    <Phone caption={caption} tone="line">
      <div className="wc-linebar"><span>‹</span><b>Jarvis</b></div>
      <div className="wc-chat">
        {messages.map((m, i) => (
          <div key={i} className={`wc-msg ${m.from}`}>
            {m.from === 'bot' && <AppIcon size={26} />}
            <div className="wc-bubble-col">
              {m.quote && <div className="wc-quote">↩ {m.quote}</div>}
              {m.card ? (
                <div className="wc-flex">
                  {m.title && <div className="wc-flex-head">{m.title}</div>}
                  {m.card.map((r, j) => <div key={j} className="wc-flex-row"><span>{r.k}</span><b className={r.cls || ''}>{r.v}</b></div>)}
                </div>
              ) : (
                <div className="wc-bubble">{m.text.split('\n').map((l, j) => <span key={j}>{l}<br /></span>)}</div>
              )}
              {m.chips && <div className="wc-chips">{m.chips.map(c => <span key={c}>{c}</span>)}</div>}
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

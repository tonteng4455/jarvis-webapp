// app/manifest.webmanifest/route.js — the PWA manifest (served at /manifest.webmanifest). A route instead of a static file so the app's
// name follows the brand switch (see tools/brandLoader.cjs: "Jarvis" below becomes NEXT_PUBLIC_BRAND_NAME at build time), and so
// start_url "/" follows the person's choice of start page (💬 แชท / 🏠 วันนี้).

const MANIFEST = {
  "name": "Jarvis — ผู้ช่วยจดบันทึก",
  "short_name": "Jarvis",
  "description": "โน้ต งาน นัดหมาย และรายรับ-รายจ่าย ในที่เดียว",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0B2A5B",
  "theme_color": "#0F9C8F",
  "lang": "th",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "จดโน้ต",
      "url": "/dashboard?new=1"
    },
    {
      "name": "บันทึกเงิน",
      "url": "/dashboard/expenses?new=1"
    },
    {
      "name": "เพิ่มนัดหมาย",
      "url": "/dashboard/calendar?new=1"
    }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "application/x-www-form-urlencoded",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
};

export function GET() {
  return new Response(JSON.stringify(MANIFEST), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

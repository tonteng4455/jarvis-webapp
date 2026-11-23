'use client';
// A bar shown on screen only: print / save as PDF, and back to the list of parts.
export default function PrintBar() {
  return (
    <div className="m-bar">
      <a href="/manual">☰ ทุกส่วน</a>
      <button type="button" onClick={() => window.print()}>🖨️ พิมพ์ / บันทึกเป็น PDF</button>
    </div>
  );
}

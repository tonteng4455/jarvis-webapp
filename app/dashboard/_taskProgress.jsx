'use client';
// app/dashboard/_taskProgress.jsx — how far a task's checklist has got (the "[ ]" lines in its details), in the style the person picks:
// a thin bar · a donut · 2/5 · 40%. Only tasks that HAVE sub-checkboxes show anything. The choice is remembered on this device.

import { useSortPref } from './_sort';
import { checkCounts } from '../../lib/taskChecks';

export const PROGRESS_STYLES = [
  { key: 'bar', icon: '➖', label: 'แถบบางๆ' },
  { key: 'donut', icon: '🍩', label: 'แผนภูมิโดนัท' },
  { key: 'frac', icon: '🔢', label: 'จำนวนข้อ (2/5)' },
  { key: 'pct', icon: '％', label: 'เปอร์เซ็นต์ (40%)' },
];
export const useProgressStyle = () => useSortPref('jarvis_task_progress', PROGRESS_STYLES);

export function TaskProgress({ details, variant = 'bar' }) {
  const { done, total, pct } = checkCounts(details);
  if (!total) return null;
  const full = done === total;
  const say = `ทำแล้ว ${done} จาก ${total} ข้อ (${pct}%)`;
  if (variant === 'donut') {
    const r = 8, c = 2 * Math.PI * r;
    return (
      <span className={`tp tp-donut${full ? ' full' : ''}`} role="img" aria-label={say} title={say} data-act="task-progress">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3.2" className="tp-track" />
          <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3.2" className="tp-arc" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 11 11)" />
        </svg>
      </span>
    );
  }
  if (variant === 'frac') return <span className={`tp tp-txt${full ? ' full' : ''}`} title={say} aria-label={say} data-act="task-progress">{done}/{total}</span>;
  if (variant === 'pct') return <span className={`tp tp-txt${full ? ' full' : ''}`} title={say} aria-label={say} data-act="task-progress">{pct}%</span>;
  return (
    <span className={`tp tp-bar${full ? ' full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={say} title={say} data-act="task-progress"><i style={{ width: `${pct}%` }} /></span>
  );
}

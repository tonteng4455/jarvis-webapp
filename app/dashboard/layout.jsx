'use client';
// app/dashboard/layout.jsx
//
// Wraps every /dashboard/* page. On mobile, the default screen is the
// full-screen "Live" voice UI (VoiceLiveScreen) instead of the normal
// dashboard pages — switching to the normal app is one tap away and
// remembered for the rest of this browser session (sessionStorage),
// so navigating between /dashboard/expenses, /dashboard/notes etc.
// after switching doesn't keep snapping back to the Live screen. On
// desktop the Live screen never shows — normal app is always default
// there, matching how it already worked before this.

import { useState, useEffect } from 'react';
import { VoiceLiveScreen } from './_components';
import { VoiceModeContext } from './_voiceModeContext';

const MODE_KEY = 'jarvis-ui-mode'; // sessionStorage — resets to the mobile default every fresh app open, which is the point (not a permanent account-level setting)
const MOBILE_QUERY = '(max-width: 768px)';

export default function DashboardLayout({ children }) {
  // null = not yet determined on the client. Rendering children (the
  // normal app) during this brief window is the safe SSR-compatible
  // default — it means mobile visitors see a short flash of the
  // normal page before the Live screen takes over, a minor cosmetic
  // tradeoff for not risking a hydration mismatch.
  const [mode, setMode] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);

    function resolveMode() {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!mobile) { setMode('app'); return; }
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor || !window.speechSynthesis) {
        // Can't do voice at all — skip straight to the normal app
        // rather than showing a Live screen whose only real option is
        // "switch to web app" anyway.
        setMode('app');
        return;
      }
      try {
        const saved = sessionStorage.getItem(MODE_KEY);
        if (saved === 'app' || saved === 'voice') { setMode(saved); return; }
      } catch (e) { /* storage disabled — just use the default below */ }
      setMode('voice');
    }

    resolveMode();
    // Recompute on viewport changes too (e.g. rotating a tablet across
    // the breakpoint, or resizing a desktop browser window down for
    // testing) — doesn't override an explicit switch-to-app choice
    // already saved for this session, since resolveMode re-reads it.
    mq.addEventListener('change', resolveMode);
    return () => mq.removeEventListener('change', resolveMode);
  }, []);

  function switchToApp() {
    setMode('app');
    try { sessionStorage.setItem(MODE_KEY, 'app'); } catch (e) { /* best-effort — just won't persist across a page reload this session */ }
  }

  function switchToVoice() {
    setMode('voice');
    try { sessionStorage.setItem(MODE_KEY, 'voice'); } catch (e) { /* best-effort */ }
  }

  if (mode === 'voice') return <VoiceLiveScreen onSwitchToApp={switchToApp} />;
  return (
    <VoiceModeContext.Provider value={{ isMobile, switchToVoice }}>
      {children}
    </VoiceModeContext.Provider>
  );
}

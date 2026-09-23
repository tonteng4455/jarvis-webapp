'use client';
// app/dashboard/_voiceEngine.js
//
// All the non-visual logic for the voice assistant — speech
// recognition, TTS (browser SpeechSynthesis only — see speak() for
// why the server-side Chirp3/PyThaiTTS path was removed), auto-greet
// on open, continuous-conversation auto-listen, the screen wake lock,
// and quota reporting — factored out of the floating FAB component so
// the new full-screen "Live" UI can share the exact same behavior
// instead of a second, drifting copy of it.
// Each caller that mounts this hook gets its OWN SpeechRecognition
// instance, so only ONE of (FAB, Live screen) should ever be mounted
// at a time — app/dashboard/layout.jsx's mode switch guarantees that.

import { useState, useEffect, useRef } from 'react';

export function useVoiceEngine() {
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const turnStartRef = useRef(null); // Date.now() when listening began — used to measure this turn's duration for the time-based quota
  const silenceTimerRef = useRef(null); // 10s no-speech watchdog — see startAutoListen for when this applies
  const voicePrefRef = useRef(null); // { voiceName, voiceLang, voiceStyle, assistantName, assistantGender } loaded once from /api/assistant/preferences — conversation MEMORY itself lives server-side (keyed by userId), so the client doesn't track history at all, just this
  const wakeLockRef = useRef(null); // current Screen Wake Lock, if any — see the effect below

  useEffect(() => {
    fetch('/api/assistant/preferences').then(r => r.json()).then(data => {
      voicePrefRef.current = {
        voiceName: data.voiceName, voiceLang: data.voiceLang, voiceStyle: data.voiceStyle || 'human',
        assistantName: data.assistantName || null, assistantGender: data.assistantGender || null,
      };
      maybeAutoGreet(data.autoGreet !== false);
    }).catch(() => {
      voicePrefRef.current = { voiceName: null, voiceLang: null, voiceStyle: 'human', assistantName: null, assistantGender: null };
      // Preferences fetch failed — fail CLOSED here specifically (the
      // voiceStyle default above fails open to 'human', but an unknown
      // voice suddenly talking on launch if something's wrong
      // server-side is worse than just opening silently like a normal
      // web app that one time).
    });
  }, []);

  // §Screen Wake Lock — keep the phone screen from auto-dimming/
  // locking while the assistant is listening, thinking, or speaking,
  // so a hands-free conversation doesn't get cut off by the screen
  // going dark mid-sentence. Released the moment state drops back to
  // idle. Feature-detected (Screen Wake Lock API isn't universal —
  // notably needs iOS 16.4+ on Safari) and fails silently if
  // unsupported or if the browser refuses the request (e.g. low-power
  // mode) — the voice flow itself works exactly the same either way,
  // this is purely a convenience layered on top.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    const isActive = state === 'listening' || state === 'thinking' || state === 'speaking';
    if (!isActive) return;

    let cancelled = false;
    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) { lock.release().catch(() => {}); return; }
        wakeLockRef.current = lock;
      } catch (e) {
        console.error('wakeLock request failed:', e);
      }
    }
    acquire();

    // The OS/browser releases the lock automatically when the tab is
    // backgrounded (spec behavior) — re-acquire once it's visible
    // again if we're still in an active state, otherwise the screen
    // could lock right as the user glances back mid-conversation.
    function handleVisibility() {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) acquire();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [state]);

  // §Auto-greet on webapp open ("call a secretary" UX) — now fires on
  // EVERY qualifying open, mobile or desktop, installed PWA or a
  // plain browser tab alike (previously restricted to standalone/PWA
  // launches only; that restriction is intentionally removed per this
  // request). Still gated on: (1) the user hasn't turned it off in
  // Settings; (2) this is the first mount since the app was opened —
  // whichever component holds this hook (FAB or Live screen) can
  // remount across navigation, so a plain in-memory ref would re-greet
  // on every page switch. sessionStorage persists across those
  // navigations but clears when the tab/window is actually closed,
  // which is exactly the boundary we want. Dropping the standalone
  // check does mean autoplay is more likely to be blocked in a
  // plain browser tab than in an installed PWA on some
  // browsers/devices — speak()'s existing fallback chain (Chirp3 →
  // browser TTS) already tolerates that; a blocked greeting just means
  // the mic still opens silently on the next step (startAutoListen is
  // still reached from speakBrowser/playChirp3Audio's own error
  // paths) rather than the whole flow breaking.
  function maybeAutoGreet(autoGreetEnabled) {
    if (!autoGreetEnabled) return;
    if (typeof window === 'undefined') return;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor || !window.speechSynthesis) return; // same feature-detection as the recognition-setup effect — checked directly here too since effect ordering shouldn't be relied on
    try {
      if (sessionStorage.getItem('jarvis-auto-greeted')) return;
      sessionStorage.setItem('jarvis-auto-greeted', '1');
    } catch (e) { return; } // storage disabled — skip rather than risk re-greeting on every page nav with no way to remember it already happened
    const name = voicePrefRef.current?.assistantName || 'Jarvis';
    const particle = voicePrefRef.current?.assistantGender === 'female' ? 'ค่ะ' : 'ครับ';
    speak(`สวัสดี${particle} ${name} พร้อมรับคำสั่งแล้ว${particle} มีอะไรให้ช่วยไหม${particle}`, { thenListen: true });
  }

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !window.speechSynthesis) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      clearSilenceTimer();
      const text = event.results[0][0].transcript;
      setTranscript(text);
      sendToAssistant(text);
    };
    recognition.onerror = (event) => {
      clearSilenceTimer();
      finishTurn();
      setState('idle');
      setError(event.error === 'not-allowed' ? 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟนครับ' : 'ฟังไม่ชัดครับ ลองอีกครั้ง');
    };
    recognition.onend = () => {
      clearSilenceTimer();
      setState(prev => (prev === 'listening' ? 'idle' : prev));
    };
    recognitionRef.current = recognition;

    return () => { try { recognition.abort(); } catch (e) { /* already stopped */ } };
  }, []);

  // Reports this turn's elapsed time (from tapping the mic to the
  // reply finishing — listening + thinking + speaking, the whole
  // "using voice" duration) to the time-based daily quota. Called on
  // every path a turn can end: normal completion, recognition error,
  // or a fetch failure — so partial/failed turns still count toward
  // the cap rather than being a free way around it.
  function finishTurn() {
    if (turnStartRef.current === null) return;
    const elapsedSeconds = Math.round((Date.now() - turnStartRef.current) / 1000);
    turnStartRef.current = null;
    if (elapsedSeconds > 0) {
      fetch('/api/assistant/voice-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', seconds: elapsedSeconds }),
      }).catch(() => { /* best-effort — a failed report shouldn't break the UI */ });
    }
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }

  // Opens the mic the same way a tap does, but with a 10-second no-
  // speech watchdog — used after the auto-greet AND after every
  // spoken reply now (see sendToAssistant's speak() call below), so a
  // conversation can continue turn after turn without re-tapping the
  // mic each time. If nothing is heard within 10s, recognition.stop()
  // fires recognition.onend above, which (since no result ever came
  // in) quietly drops state back to 'idle' — no error shown, same as
  // a manual tap-to-stop. That's the whole "stop listening and just
  // sit idle" behavior: nothing to build, the idle UI already IS the
  // normal state (whichever screen — FAB or Live — is showing it).
  function startAutoListen() {
    if (!recognitionRef.current) { setState('idle'); return; }
    turnStartRef.current = Date.now();
    setState('listening');
    try { recognitionRef.current.start(); } catch (e) { turnStartRef.current = null; setState('idle'); return; }
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      try { recognitionRef.current?.stop(); } catch (e) { /* already stopped/ended — harmless */ }
    }, 10000);
  }

  async function sendToAssistant(text) {
    setState('thinking');
    setError(null);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'assistant_error');
      // Guard against an EMPTY reply — silently trying to speak ""
      // produces no sound and no error, which looks identical to "the
      // voice just doesn't work" from the outside. A real fallback
      // message here at least gives the user something audible/visible
      // instead of dead silence with no clue why.
      const replyText = data.reply?.trim() || 'ขอโทษครับ ไม่เข้าใจคำสั่งนี้ ลองพูดอีกครั้งครับ';
      setReply(replyText);
      // thenListen: true — continuous conversation. Every reply now
      // re-opens the mic afterward (10s watchdog, same as the
      // auto-greet flow) instead of dropping back to idle and waiting
      // for another tap, so a back-and-forth exchange can keep going
      // hands-free. Silence for 10s after any turn — including this
      // one — just settles back to idle, same as tapping to stop.
      speak(replyText, { thenListen: true });
    } catch (e) {
      console.error('assistant request failed:', e);
      finishTurn();
      setState('idle');
      setError('ขอโทษครับ ตอนนี้ผู้ช่วยเสียงมีปัญหา ลองอีกครั้งครับ');
    }
  }

  // Robot (browser SpeechSynthesis) voice ONLY — Chirp 3 HD and the
  // self-hosted PyThaiTTS path (both server round-trips) were pulled
  // out entirely: neither was reliable enough on this hardware in
  // practice (PyThaiTTS: single-speaker ONNX model on a shared 4-core
  // box, several seconds to tens of seconds per reply; Chirp3: fine in
  // isolation, but only ever reached as PyThaiTTS's fallback, so it
  // inherited the same "wait, then maybe still get the wrong voice"
  // UX). speakBrowser() is instant (no network round trip) and never
  // silently fails into a worse voice, which is what actually matters
  // for a "tap and hear a reply" assistant.
  async function speak(text, opts = {}) {
    setState('speaking');
    speakBrowser(text, opts);
  }

  function speakBrowser(text, opts = {}) {
    const { thenListen = false } = opts;
    if (!window.speechSynthesis) {
      finishTurn();
      // Auto-greet path: still try to listen even if speech synthesis
      // itself isn't available — the mic can work independently of
      // whether the greeting was actually heard, and silently landing
      // on idle (no error) is the right fallback per the 5s-silence
      // behavior either way.
      if (thenListen) startAutoListen(); else { setState('idle'); setError('เบราว์เซอร์นี้ไม่รองรับการพูดตอบครับ (อ่านคำตอบจากข้อความด้านบนได้)'); }
      return;
    }
    window.speechSynthesis.cancel(); // don't stack multiple replies if tapped again quickly
    // Chrome has a long-standing bug where speechSynthesis can get
    // stuck in a paused state (especially after tab visibility
    // changes or several calls in a row) — resume() is a harmless
    // no-op when not needed, and a known workaround when it is.
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    // Match the saved voice by exact name first (works when this is
    // the same device/browser it was picked on); if not found (e.g. a
    // different device — see settings page's own note on why this
    // happens), fall back to any voice matching the saved language,
    // then finally the browser's own default for 'th-TH'.
    const pref = voicePrefRef.current;
    const available = window.speechSynthesis.getVoices();
    const matched = pref?.voiceName && available.find(v => v.name === pref.voiceName);
    const langMatch = !matched && pref?.voiceLang && available.find(v => v.lang === pref.voiceLang);
    if (matched) utterance.voice = matched;
    else if (langMatch) utterance.voice = langMatch;
    utterance.lang = 'th-TH';
    utterance.onend = () => { finishTurn(); if (thenListen) startAutoListen(); else setState('idle'); };
    utterance.onerror = (ev) => {
      console.error('speechSynthesis error:', ev.error);
      finishTurn();
      // Same reasoning as the "not available" branch above — an
      // auto-greet TTS glitch shouldn't also kill the mic-listening
      // half of the flow.
      if (thenListen) startAutoListen(); else setState('idle');
    };
    window.speechSynthesis.speak(utterance);
  }

  async function handleReset() {
    setTranscript('');
    setReply('');
    setError(null);
    try {
      await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
    } catch (e) { /* best-effort — the server just keeps whatever history it had if this fails, no local state to roll back */ }
  }

  async function handleTap() {
    if (state === 'listening') {
      recognitionRef.current?.stop();
      return;
    }
    if (state === 'speaking') {
      window.speechSynthesis.cancel();
      finishTurn();
      setState('idle');
      return;
    }
    if (state === 'thinking') return; // ignore taps while waiting for a reply

    setTranscript('');
    setReply('');
    setError(null);

    // Time-based daily cap (15 min default) — checked BEFORE starting
    // to listen, not after, so a turn already in progress when the cap
    // is hit is never cut off mid-sentence (see finishTurn/the bot
    // Worker's handleVoiceUsageRequest for the "check before, add
    // after" split).
    try {
      const res = await fetch('/api/assistant/voice-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check' }),
      });
      const data = await res.json();
      if (data.allowed === false) {
        const usedMin = Math.round((data.usedSeconds || 0) / 60);
        const limitMin = Math.round((data.limitSeconds || 900) / 60);
        setError(`ใช้เสียงครบ ${limitMin} นาทีของวันนี้แล้วครับ (${usedMin} นาที) พรุ่งนี้กลับมาใหม่นะครับ`);
        return;
      }
    } catch (e) { /* quota check failed — fail open, same as the server side */ }

    turnStartRef.current = Date.now();
    setState('listening');
    try { recognitionRef.current?.start(); } catch (e) { turnStartRef.current = null; setState('idle'); } // start() throws if already running — harmless, just ignore
  }

  return { supported, state, transcript, reply, error, handleTap, handleReset };
}

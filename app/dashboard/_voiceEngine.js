'use client';
// app/dashboard/_voiceEngine.js
//
// All the non-visual logic for the voice assistant — speech
// recognition, TTS (Chirp 3 HD + browser fallback), the auto-greet-
// on-PWA-launch flow, and quota reporting — factored out of the
// floating FAB component so the new full-screen "Live" UI can share
// the exact same behavior instead of a second, drifting copy of it.
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
  const audioRef = useRef(null); // currently-playing Chirp3 playback handle (a Web Audio AudioBufferSourceNode — see playChirp3Audio below), if any — so the "tap to stop speaking" path can stop it
  const audioCtxRef = useRef(null); // lazily-created shared AudioContext for Chirp3 playback — see the iOS note on why this isn't a plain <audio> element
  const silenceTimerRef = useRef(null); // 5s no-speech watchdog for the auto-greet listening session only — manual tap-to-talk has no timeout, since someone who deliberately tapped the mic is expected to need a moment to think
  const voicePrefRef = useRef(null); // { voiceName, voiceLang, voiceStyle, assistantName, assistantGender } loaded once from /api/assistant/preferences — conversation MEMORY itself lives server-side (keyed by userId), so the client doesn't track history at all, just this

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

  // §Auto-greet on home-screen launch ("call a secretary" UX). Only
  // fires when: (1) the PWA was actually launched from its home-screen
  // icon (display-mode: standalone / iOS's navigator.standalone) —
  // never in a normal browser tab, where a voice suddenly talking on
  // page load would just be startling and where autoplay is far more
  // likely to be blocked anyway; (2) the user hasn't turned it off in
  // Settings; (3) this is the first mount since the app was opened —
  // whichever component holds this hook (FAB or Live screen) can
  // remount across navigation, so a plain in-memory ref would re-greet
  // on every tab switch. sessionStorage persists across those
  // navigations but clears when the PWA window/tab is actually closed,
  // which is exactly the boundary we want.
  function maybeAutoGreet(autoGreetEnabled) {
    if (!autoGreetEnabled) return;
    if (typeof window === 'undefined') return;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor || !window.speechSynthesis) return; // same feature-detection as the recognition-setup effect — checked directly here too since effect ordering shouldn't be relied on
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
    if (!isStandalone) return;
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

  // Opens the mic the same way a tap does, but with a 5-second no-
  // speech watchdog — used ONLY right after the auto-greet finishes
  // speaking. If nothing is heard within 5s, recognition.stop() fires
  // recognition.onend above, which (since no result ever came in)
  // quietly drops state back to 'idle' — no error shown, same as a
  // manual tap-to-stop. That's the whole "fall back to using the app
  // normally" behavior: nothing to build, the idle UI already IS the
  // normal state (whichever screen — FAB or Live — is showing it).
  function startAutoListen() {
    if (!recognitionRef.current) { setState('idle'); return; }
    turnStartRef.current = Date.now();
    setState('listening');
    try { recognitionRef.current.start(); } catch (e) { turnStartRef.current = null; setState('idle'); return; }
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      try { recognitionRef.current?.stop(); } catch (e) { /* already stopped/ended — harmless */ }
    }, 5000);
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
      speak(replyText);
    } catch (e) {
      console.error('assistant request failed:', e);
      finishTurn();
      setState('idle');
      setError('ขอโทษครับ ตอนนี้ผู้ช่วยเสียงมีปัญหา ลองอีกครั้งครับ');
    }
  }

  // Tries Chirp 3 HD first (natural/emotional voice, but capped by the
  // monthly $-cost quota — see tts_usage) — falls back to the
  // browser's own free SpeechSynthesis whenever the server says
  // allowed:false (quota used up this month, no API key configured,
  // or synthesis failed for any reason) or the fetch itself fails
  // (offline, etc.). The fallback is silent — no error shown, no
  // difference in the UI flow, just a lower-quality voice.
  async function speak(text, opts = {}) {
    const { thenListen = false } = opts;
    setState('speaking');
    // 'robot' style skips Chirp 3 HD entirely and goes straight to the
    // free browser voice — an explicit user choice (settings page),
    // distinct from the automatic fallback below which only kicks in
    // when Chirp 3 HD itself fails/is unavailable/quota's used up.
    if (voicePrefRef.current?.voiceStyle === 'robot') {
      speakBrowser(text, opts);
      return;
    }
    try {
      const res = await fetch('/api/assistant/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.allowed && data.audioContent) {
        const played = await playChirp3Audio(data.audioContent, opts);
        if (played) return;
        // decodeAudioData or AudioContext itself failed — fall through
        // to the browser voice below, same as any other Chirp3 failure.
      }
    } catch (e) {
      console.error('Chirp3 speak() failed, falling back to browser TTS:', e);
    }
    speakBrowser(text, opts);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // Plays the Chirp3 mp3 via the Web Audio API (AudioContext +
  // AudioBufferSourceNode) instead of a plain <audio> element.
  //
  // Why: iOS Safari (and every other iOS browser — they're all WebKit
  // under the hood) has a well-documented WebKit bug where playing
  // audio through an HTML5 <audio>/<video> element switches the native
  // AVAudioSession into a playback category, and afterward WebKit
  // often fails to hand the session back to a recording-capable
  // category. The next SpeechRecognition.start() call then goes into
  // a silent deadlock — no onresult, no onerror, no onend, it just
  // hangs — which looks EXACTLY like "the mic stopped working" with
  // no error anywhere to explain why. This hits every reply→listen
  // transition (auto-greet's thenListen, and also just tapping the
  // mic again after hearing a normal reply), so on iPhone specifically
  // this was very likely going to surface constantly. The Web Audio
  // API routes through a different internal path (AVAudioEngine) that
  // doesn't fight the speech-recognition session the same way.
  //
  // Returns true if playback started successfully, false if it should
  // fall back to the browser voice instead.
  async function playChirp3Audio(base64, opts) {
    const { thenListen = false } = opts;
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      // iOS suspends a freshly-created (or backgrounded) AudioContext
      // until it's resumed — usually happens automatically on the next
      // user gesture, but resume() here is a harmless no-op when not
      // needed and a real fix when it is.
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* ignore — playback attempt below will just fail and fall back */ } }
      const audioBuffer = await ctx.decodeAudioData(base64ToArrayBuffer(base64));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      audioRef.current = source; // so handleTap's "speaking → stop" path can stop this
      source.onended = () => { audioRef.current = null; finishTurn(); if (thenListen) startAutoListen(); else setState('idle'); };
      source.start(0);
      return true;
    } catch (e) {
      console.error('Chirp3 Web Audio playback failed:', e);
      audioRef.current = null;
      return false;
    }
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
      if (audioRef.current) {
        // AudioBufferSourceNode (Web Audio API — see playChirp3Audio)
        // uses .stop(), not .pause(); it also throws if called on a
        // node that already finished/was never started, hence the
        // try/catch rather than checking readyState first.
        try { audioRef.current.stop(); } catch (e) { /* already stopped/ended */ }
        audioRef.current = null;
      }
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

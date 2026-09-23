'use client';
// app/dashboard/_voiceModeContext.js
//
// app/dashboard/layout.jsx owns the voice/app mode switch, but the
// button to switch BACK to the Live screen needs to live inside
// DashNav — which is rendered deep inside `children` (each page's own
// JSX), several layers below the layout. Context is the plumbing that
// lets DashNav reach back up to the layout's switchToVoice() without
// threading a prop through every single page component.

import { createContext, useContext } from 'react';

export const VoiceModeContext = createContext({ isMobile: false, switchToVoice: () => {} });

export function useVoiceMode() {
  return useContext(VoiceModeContext);
}

export const PLAYBACK_MODE = import.meta.env.VITE_PLAYBACK_MODE || 'FULL'; 
// 'FULL' uses Spotify Web Playback SDK; 'PREVIEW' uses 30s preview URLs if available.

export const SEGMENT_DURATIONS = {
  round1: 10_000,   // 10s first pass each
  round2: 20_000    // 20s continuation
};

export const ENFORCE_SEGMENT_PAUSE = true; // keep a micro pause if you want between segments
export const TRANSITION_BUFFER = 180;      // ms early scheduling for smoother handoff
export const STAGE_GAP_MS = 250;           // brief gap between segments (set 0 for none)

export const BATTLE_AUTOSTART_NEXT_DELAY = 3000; // ms after winner animation
export const ALLOW_LIVE_VOTING_DURING_ALL_STAGES = true; // set false to lock after final segment
// Playback mode: 'FULL' uses Spotify Web Playback SDK; 'PREVIEW' uses 30s preview URLs (or silence)
// You can override via Vite env: VITE_PLAYBACK_MODE=FULL
export const PLAYBACK_MODE = (import.meta.env.VITE_PLAYBACK_MODE || 'FULL').toUpperCase();

// Segment durations in milliseconds
export const SEGMENT_DURATIONS = {
  round1: 10_000, // first round: 10s each
  round2: 20_000  // second round: additional 20s from 10s offset
};

// Micro scheduling parameters
export const TRANSITION_BUFFER = 180;    // ms before actual boundary to prime next stage
export const STAGE_GAP_MS = 120;         // brief intentional gap between segments (lower = snappier)

// After winner animation, milliseconds before auto next battle (if queue >= 2)
export const BATTLE_AUTOSTART_NEXT_DELAY = 3000;

// Allow voting through entire playback
export const ALLOW_LIVE_VOTING_DURING_ALL_STAGES = true;

// If true we insert a silent tiny pause between segments (visual separation)
export const ENFORCE_SEGMENT_PAUSE = true;

// Internal safety: max drift (ms) tolerated before we reschedule
export const MAX_SCHED_DRIFT = 60;
// Playback configuration and timing constants for battles.

export const PLAYBACK_MODE = (import.meta.env.VITE_PLAYBACK_MODE || 'FULL').toUpperCase();
// 'FULL'  = Spotify Web Playback SDK (requires streaming scopes + active device)
// 'PREVIEW' = 30s previews (or silence) via preview_url

// Segment durations (ms)
export const SEGMENT_DURATIONS = {
  round1: 10_000, // Round 1 segment per track
  round2: 20_000  // Round 2 continuation segment
};

// Micro‑scheduling & behavior
export const TRANSITION_BUFFER = 180;  // ms scheduling buffer before boundary
export const STAGE_GAP_MS = 120;       // small gap between sequential segments
export const BATTLE_AUTOSTART_NEXT_DELAY = 3000;
export const ALLOW_LIVE_VOTING_DURING_ALL_STAGES = true;
export const ENFORCE_SEGMENT_PAUSE = true;
export const MAX_SCHED_DRIFT = 60;

// Exported helper for outside checks
export function isFullPlayback() {
  return PLAYBACK_MODE === 'FULL';
}
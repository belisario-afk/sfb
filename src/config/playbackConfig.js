// Playback configuration
// Modes: 'FULL' (Web Playback SDK) or 'PREVIEW' (30s preview_url).
// If FULL fails (no premium or SDK issue), code will gracefully fall back to PREVIEW per track.
export const PLAYBACK_MODE = 'FULL';

// Segment durations for your battle phases (seconds)
export const SEGMENT_DURATIONS = {
  round1: 10,
  round2: 20
};

// Whether to automatically pause after each segment (true) or just let the track continue (false).
export const ENFORCE_SEGMENT_PAUSE = true;
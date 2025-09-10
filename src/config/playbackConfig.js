// Updated playback configuration to support strict 20s segments and 20s vote windows.

export const PLAYBACK_MODE = (import.meta.env.VITE_PLAYBACK_MODE || 'FULL').toUpperCase();

// Segment durations (ms)
export const ROUND1_SEGMENT_MS = 20_000; // A: 0-20s, B: 0-20s
export const ROUND2_SEGMENT_MS = 20_000; // A: 20-40s, B: 20-40s
export const VOTE_WINDOW_MS   = 20_000;  // Each vote window is 20s

// Winner animation duration (ms) after final tally before finishing
export const WINNER_ANIMATION_MS = 2500;

// Victory play configuration
// After winner is announced, play the winning song from this offset to the end.
export const VICTORY_PLAY_OFFSET_MS = 40_000;
export const VICTORY_MIN_PLAY_MS = 5_000; // if song is shorter than offset, still play at least this

// Scheduling
export const TRANSITION_BUFFER = 180;   // ms early scheduling for playback transitions
export const STAGE_GAP_MS = 120;        // small gap between segments

// Delay before auto-starting the next battle AFTER the winner/victory play has completed
export const BATTLE_AUTOSTART_NEXT_DELAY = 3000;

// Voting behavior
// 'PER_WINDOW' => user can vote once in vote1 and once in vote2 (max 2 votes)
// 'SINGLE_PER_BATTLE' => user can only vote once across the entire battle
export const VOTING_RULE = 'SINGLE_PER_BATTLE';

// Allow a small pause concept if needed (not used during vote windows which already pause)
export const ENFORCE_SEGMENT_PAUSE = true;

export function isFullPlayback() {
  return PLAYBACK_MODE === 'FULL';
}
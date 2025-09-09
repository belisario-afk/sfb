// Playback configuration and interactive battle settings

export const PLAYBACK_MODE = (import.meta.env.VITE_PLAYBACK_MODE || 'FULL').toUpperCase();

// Segment durations (ms)
export const ROUND1_SEGMENT_MS = 20_000; // Each track first pass
export const ROUND2_SEGMENT_MS = 20_000; // Each track second pass (continuation)
export const VOTE_WINDOW_MS   = 10_000;  // Voting window duration

// Winner animation duration (ms) after final tally before finishing
export const WINNER_ANIMATION_MS = 3000;

// Overtime configuration
export const OVERTIME_MS = 8_000;                // Sudden-death extra voting window
export const OVERTIME_GIFT_THRESHOLD = 100;      // Coins to request Overtime
export const OVERTIME_ON_NEAR_TIE_ONLY = true;   // Only allow if margin <= 1

// Golden Hour (visuals buff)
export const GOLDEN_HOUR_MS = 60_000;            // Duration added per trigger
export const GOLDEN_HOUR_THRESHOLD = 500;        // Coins to trigger Golden Hour
export const GOLDEN_HOUR_COOLDOWN_MS = 5 * 60_000;

// Gifts -> time extension
export const GIFT_TIME_PER_COIN_MS = 500;        // Each coin extends vote window by this many ms
export const VOTE_EXTENSION_CAP_MS = 15_000;     // Max extra time per vote window from gifts

// Scheduling
export const TRANSITION_BUFFER = 180;   // ms early scheduling for playback transitions
export const STAGE_GAP_MS = 120;        // small gap between segments

// Delay before auto-starting the next battle AFTER the winner animation has played
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

// Visual palette for sides
export const SIDE_COLORS = {
  a: 0xff2d95, // Neon Magenta
  b: 0x00e7ff, // Cyber Cyan
  neutral: 0x9efcff
};
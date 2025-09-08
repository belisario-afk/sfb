/**
 * Advanced Audio Manager
 * - Uses Web Audio API to satisfy autoplay requirements.
 * - Falls back to an <audio> silent MP3 unlock if context not supported.
 * - Queues preview playback requests until unlocked.
 * - Provides a test beep & force play debug helpers.
 */

let audioContext = null;
let unlocked = false;
let unlocking = false;
const channels = {};              // label -> HTMLAudioElement
let pendingQueue = [];            // functions to run after unlock
let lastError = null;

const SILENT_MP3_DATA =
  'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Expose diagnostics
window.__SFB_AUDIO = {
  get context() { return audioContext; },
  get unlocked() { return unlocked; },
  get unlocking() { return unlocking; },
  get channels() { return channels; },
  get pending() { return pendingQueue.length; },
  get lastError() { return lastError; },
  forcePlay: (url) => {
    unlockAudioSystem().then(() => {
      playPreview('FORCE', url, 10);
    });
  }
};

/**
 * Ensure (lazy create) Web Audio context
 */
function ensureContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    console.warn('[Audio] Web Audio API not supported; will use <audio> fallback only.');
    return null;
  }
  audioContext = new Ctx();
  return audioContext;
}

/**
 * Attempt to unlock audio. Returns a Promise<boolean> indicating success.
 * Should be called from a user gesture (click/keypress).
 */
export async function unlockAudioSystem() {
  if (unlocked) return true;
  if (unlocking) {
    return new Promise(res => {
      const check = () => {
        if (unlocked) res(true);
        else if (!unlocking) res(false);
        else setTimeout(check, 50);
      };
      check();
    });
  }

  unlocking = true;
  console.log('[Audio] Attempting unlock…');

  try {
    const ctx = ensureContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
          console.log('[Audio] AudioContext resumed.');
        } catch (e) {
          console.warn('[Audio] AudioContext resume failed:', e);
        }
      }

      // Create a nearly silent unlock pulse
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // near silent
      osc.frequency.value = 440;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02); // 20ms pulse

      // On some browsers unlock happens async after a short tick
      await new Promise(r => setTimeout(r, 60));
      if (ctx.state === 'running') {
        unlocked = true;
        console.log('[Audio] Unlocked via Web Audio API ✅');
      }
    }

    // Fallback if still locked or context missing:
    if (!unlocked) {
      console.log('[Audio] Falling back to silent MP3 unlock path…');
      await new Promise((resolve) => {
        try {
          const a = new Audio(SILENT_MP3_DATA);
          a.volume = 0;
          a.play()
            .then(() => {
              unlocked = true;
              console.log('[Audio] Unlocked via silent MP3 fallback ✅');
              resolve();
            })
            .catch(e => {
              lastError = e;
              console.warn('[Audio] Silent MP3 unlock rejected:', e);
              resolve();
            });
        } catch (e) {
          lastError = e;
          console.warn('[Audio] Silent MP3 unlock creation error:', e);
          resolve();
        }
      });
    }
  } finally {
    unlocking = false;
  }

  if (unlocked) {
    // Drain queue
    const toRun = [...pendingQueue];
    pendingQueue = [];
    toRun.forEach(fn => {
      try { fn(); } catch (e) { console.error('[Audio] Pending playback error:', e); }
    });
  } else {
    console.warn('[Audio] Unlock attempt failed. A user gesture is still required.');
  }

  return unlocked;
}

export function isAudioUnlocked() {
  return unlocked;
}

/**
 * Test beep to confirm audio path. Uses Web Audio if available; else tries <audio>.
 */
export function playTestBeep(duration = 0.25) {
  if (!unlocked) {
    console.warn('[Audio] Cannot beep before unlock. Attempting unlock automatically…');
    unlockAudioSystem().then(ok => {
      if (ok) playTestBeep(duration);
    });
    return;
  }
  const ctx = ensureContext();
  if (ctx) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
      console.log('[Audio] Test beep played.');
      return;
    } catch (e) {
      console.warn('[Audio] Web Audio beep failed, trying <audio> fallback.', e);
    }
  }
  // fallback small silent beep (same silent mp3, not audible)
  const a = new Audio(SILENT_MP3_DATA);
  a.play().catch(()=>{});
}

/**
 * Play a preview URL for a given duration (seconds)
 */
export function playPreview(label, url, durationSeconds = 10) {
  if (!url) {
    console.warn(`[Audio] Track ${label} has no preview_url. Skipping.`);
    return;
  }

  const action = () => {
    stopChannel(label);

    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.volume = 0.9;

    channels[label] = audio;
    window.__SFB_LAST_PLAY_LABEL = label;
    window.__SFB_LAST_PLAY_URL = url;
    window.__SFB_LAST_TRACKS = window.__SFB_LAST_TRACKS || [];
    window.__SFB_LAST_TRACKS.push({ label, url, ts: Date.now(), dur: durationSeconds });

    const startedAt = Date.now();
    audio.play()
      .then(() => {
        console.log(`[Audio] Playing ${label} (${(durationSeconds)}s) url=${url}`);
      })
      .catch(err => {
        lastError = err;
        console.error('[Audio] play() rejected:', err);
      });

    setTimeout(() => {
      if (channels[label] === audio) {
        try { audio.pause(); } catch(e) {}
        console.log(`[Audio] Auto-stopped ${label} after ${((Date.now()-startedAt)/1000).toFixed(1)}s`);
      }
    }, durationSeconds * 1000);
  };

  if (!unlocked) {
    console.log('[Audio] Not unlocked. Queuing preview for', label);
    pendingQueue.push(action);
    return;
  }

  action();
}

export function stopChannel(label) {
  const a = channels[label];
  if (a) {
    try { a.pause(); } catch(e) {}
    delete channels[label];
    console.log('[Audio] Stopped channel', label);
  }
}

export function stopAll() {
  Object.keys(channels).forEach(k => stopChannel(k));
  console.log('[Audio] Stopped all channels.');
}

// Debug utilities
window.__SFB_PLAY_PREVIEW = (url, secs=10) => {
  unlockAudioSystem().then(() => playPreview('DEBUG', url, secs));
};
window.__SFB_TEST_BEEP = () => { unlockAudioSystem().then(playTestBeep); };
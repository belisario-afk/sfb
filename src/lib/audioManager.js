/**
 * Audio Manager with:
 * - User gesture unlock
 * - Logging
 * - Preview filtering & diagnostics
 */

const channels = {};
let unlocked = false;
let pendingQueue = []; // queued play requests before unlock

// Public diagnostic objects
window.__SFB_AUDIO_CHANNELS = channels;

/**
 * Attempt to unlock audio (call from a click/keypress)
 */
export function unlockAudioSystem() {
  if (unlocked) return true;
  try {
    // Create a silent buffer to satisfy autoplay policies
    const test = new Audio();
    test.src = 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA'; // tiny silent frame
    test.volume = 0;
    test.play()
      .then(() => {
        unlocked = true;
        console.log('[Audio] Unlocked via user gesture.');
        // Drain any pending
        pendingQueue.forEach(fn => fn());
        pendingQueue = [];
      })
      .catch(e => {
        console.warn('[Audio] Unlock attempt rejected:', e);
      });
    return true;
  } catch (e) {
    console.warn('[Audio] Unlock failed:', e);
    return false;
  }
}

export function isAudioUnlocked() {
  return unlocked;
}

/**
 * Core function to play a preview URL
 */
export function playPreview(label, url, durationSeconds = 10) {
  if (!url) {
    console.warn(`[Audio] Track ${label} has no preview_url. Skipping playback.`);
    return;
  }

  const doPlay = () => {
    stopChannel(label);
    const audio = new Audio(url);
    audio.volume = 0.9;
    channels[label] = audio;
    window.__SFB_LAST_PLAY_LABEL = label;
    window.__SFB_LAST_PLAY_URL = url;
    window.__SFB_LAST_TRACKS = window.__SFB_LAST_TRACKS || [];
    window.__SFB_LAST_TRACKS.push({ label, url, ts: Date.now() });

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          console.log(`[Audio] Playing ${label} for ${durationSeconds}s`);
        })
        .catch(err => {
          console.error('[Audio] play() rejected:', err);
        });
    }

    // Safety stop after requested duration
    setTimeout(() => {
      if (channels[label] === audio) {
        audio.pause();
        console.log(`[Audio] Auto-stopped ${label} after ${durationSeconds}s`);
      }
    }, durationSeconds * 1000);
  };

  if (!unlocked) {
    console.log('[Audio] Not unlocked yet; queuing playback request.');
    pendingQueue.push(doPlay);
    return;
  }
  doPlay();
}

export function stopChannel(label) {
  const a = channels[label];
  if (a) {
    try { a.pause(); } catch (e) {}
    delete channels[label];
  }
}

export function stopAll() {
  Object.keys(channels).forEach(k => stopChannel(k));
  console.log('[Audio] Stopped all channels.');
}

/**
 * For debugging from console:
 * window.__SFB_FORCE_PLAY('<url>')
 */
window.__SFB_FORCE_PLAY = (u) => {
  unlockAudioSystem();
  playPreview('DEBUG', u, 15);
};
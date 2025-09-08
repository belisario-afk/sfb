/**
 * audioManager.js
 * Centralized preview audio handling (for PREVIEW mode).
 * Provides minimal logging and avoids repeated "no-preview" spam.
 */
const _logPrefix = '[Audio]';

let unlocked = false;
let lastWarnNoPreviewAt = 0;
const NO_PREVIEW_SPAM_INTERVAL = 4000; // ms

// Map label -> HTMLAudioElement
const previewPool = new Map();

export function unlockAudioSystem() {
  if (unlocked) return Promise.resolve();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // create a silent buffer to unlock
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
    console.log(_logPrefix, 'unlocked-web-audio');
  } catch (e) {
    console.warn(_logPrefix, 'unlock-failed', e);
  }
  return Promise.resolve();
}

export function playPreview(label, url, seconds = 10) {
  if (!url) {
    const now = Date.now();
    if (now - lastWarnNoPreviewAt > NO_PREVIEW_SPAM_INTERVAL) {
      console.warn(_logPrefix, 'no-preview', { label });
      lastWarnNoPreviewAt = now;
    }
    return;
  }
  let el = previewPool.get(label);
  if (!el) {
    el = new Audio();
    previewPool.set(label, el);
  } else {
    el.pause();
  }
  el.src = url;
  el.currentTime = 0;
  el.volume = 1;
  el.play().catch(() => {});
  if (seconds > 0) {
    setTimeout(() => {
      if (!el.paused) el.pause();
    }, seconds * 1000);
  }
}

export function stopAllPreviews() {
  previewPool.forEach(a => {
    try { a.pause(); } catch {}
  });
}

export function stopPreview(label) {
  const el = previewPool.get(label);
  if (el) {
    try { el.pause(); } catch {}
  }
}
/**
 * Audio Manager (Enhanced)
 * - Web Audio unlock
 * - Detailed event logging for previews
 * - Single retry via fetch -> blob if direct URL fails
 * - Diagnostics object window.__SFB_AUDIO
 */

let audioContext = null;
let unlocked = false;
let unlocking = false;
const channels = {};         // label -> HTMLAudioElement
let pendingQueue = [];
let lastError = null;
const eventsLog = [];
const MAX_EVENTS = 250;

// Toggle to force the blob fetch path for ALL previews (debug)
const FORCE_BLOB_PREVIEW = false;

const SILENT_MP3_DATA =
  'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function logEvt(type, data = {}) {
  const entry = { t: Date.now(), type, ...data };
  eventsLog.push(entry);
  if (eventsLog.length > MAX_EVENTS) eventsLog.shift();
  console.log('[Audio]', type, data);
}

// Diagnostics handle
window.__SFB_AUDIO = {
  get context() { return audioContext; },
  get unlocked() { return unlocked; },
  get channels() { return channels; },
  get pending() { return pendingQueue.length; },
  get lastError() { return lastError; },
  get events() { return [...eventsLog]; },
  forcePlay: (url) => unlockAudioSystem().then(() => playPreview('FORCE', url, 12)),
  beep: () => playTestBeep()
};

function ensureContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    logEvt('no-web-audio');
    return null;
  }
  audioContext = new Ctx();
  return audioContext;
}

export async function unlockAudioSystem() {
  if (unlocked) return true;
  if (unlocking) {
    return new Promise(res => {
      const poll = () => {
        if (unlocked) res(true);
        else if (!unlocking) res(false);
        else setTimeout(poll, 50);
      };
      poll();
    });
  }

  unlocking = true;
  logEvt('unlock-start');

  try {
    const ctx = ensureContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
          logEvt('context-resumed');
        } catch (e) {
          logEvt('context-resume-failed', { error: e.message });
        }
      }
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.frequency.value = 440;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.02);
        await new Promise(r => setTimeout(r, 60));
        if (ctx.state === 'running') {
          unlocked = true;
          logEvt('unlocked-web-audio');
        }
      } catch (e) {
        logEvt('osc-unlock-failed', { error: e.message });
      }
    }
    if (!unlocked) {
      // fallback silent mp3
      await new Promise(resolve => {
        try {
          const a = new Audio(SILENT_MP3_DATA);
            a.volume = 0;
          a.play()
            .then(() => {
              unlocked = true;
              logEvt('unlocked-silent-mp3');
              resolve();
            })
            .catch(e => {
              lastError = e;
              logEvt('unlock-mp3-failed', { error: e.message });
              resolve();
            });
        } catch (e) {
          lastError = e;
          logEvt('unlock-mp3-exc', { error: e.message });
          resolve();
        }
      });
    }
  } finally {
    unlocking = false;
  }

  if (unlocked) {
    const toRun = [...pendingQueue];
    pendingQueue = [];
    toRun.forEach(fn => {
      try { fn(); } catch (e) { logEvt('pending-error', { error: e.message }); }
    });
  } else {
    logEvt('unlock-failed');
  }

  return unlocked;
}

export function isAudioUnlocked() {
  return unlocked;
}

export function playTestBeep(duration = 0.25) {
  if (!unlocked) {
    unlockAudioSystem().then(ok => ok && playTestBeep(duration));
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
      logEvt('test-beep');
      return;
    } catch (e) {
      logEvt('test-beep-failed', { error: e.message });
    }
  }
  const a = new Audio(SILENT_MP3_DATA);
  a.play().catch(()=>{});
}

function attachDebugListeners(label, audio, meta) {
  const tag = `[${label}]`;
  audio.addEventListener('loadedmetadata', () => logEvt('loadedmetadata', { label, dur: audio.duration }));
  audio.addEventListener('canplay', () => logEvt('canplay', { label }));
  audio.addEventListener('playing', () => logEvt('playing', { label }));
  audio.addEventListener('ended', () => logEvt('ended', { label }));
  audio.addEventListener('error', () => {
    const err = audio.error;
    logEvt('error', { label, code: err?.code, message: err?.message, ...meta });
  });
}

async function fetchAsBlobURL(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    logEvt('blob-fetch-failed', { error: e.message, url });
    return null;
  }
}

export function playPreview(label, url, durationSeconds = 10) {
  if (!url) {
    logEvt('no-preview', { label });
    return;
  }

  const performPlayback = async () => {
    stopChannel(label);

    let sourceUrl = url;
    let usedBlob = false;

    if (FORCE_BLOB_PREVIEW) {
      const blobUrl = await fetchAsBlobURL(url);
      if (blobUrl) {
        sourceUrl = blobUrl;
        usedBlob = true;
      }
    }

    const audio = new Audio(sourceUrl);
    audio.crossOrigin = 'anonymous';
    audio.volume = 0.9;
    attachDebugListeners(label, audio, { original: url, usedBlob });

    channels[label] = audio;
    window.__SFB_LAST_PLAY_LABEL = label;
    window.__SFB_LAST_PLAY_URL = url;
    window.__SFB_LAST_TRACKS = window.__SFB_LAST_TRACKS || [];
    window.__SFB_LAST_TRACKS.push({ label, url, ts: Date.now(), dur: durationSeconds });

    let startedAt = Date.now();
    audio.play()
      .then(() => {
        logEvt('play-started', { label, dur: durationSeconds, url, usedBlob });
      })
      .catch(async (err) => {
        lastError = err;
        logEvt('play-rejected', { label, error: err.message, usedBlob });
        // Retry once with blob fetch if we didn't already
        if (!usedBlob) {
          const blobUrl = await fetchAsBlobURL(url);
          if (blobUrl) {
            logEvt('retry-blob', { label });
            const retryAudio = new Audio(blobUrl);
            retryAudio.volume = 0.9;
            attachDebugListeners(label + '-retry', retryAudio, { original: url, usedBlob: true });
            channels[label] = retryAudio;
            startedAt = Date.now();
            retryAudio.play()
              .then(() => logEvt('retry-play-started', { label }))
              .catch(e2 => logEvt('retry-failed', { label, error: e2.message }));
            setTimeout(() => {
              if (channels[label] === retryAudio) {
                try { retryAudio.pause(); } catch(e){}
                logEvt('auto-stop', { label, elapsed: (Date.now()-startedAt)/1000 });
              }
            }, durationSeconds * 1000);
          }
        }
      });

    setTimeout(() => {
      if (channels[label] === audio) {
        try { audio.pause(); } catch(e){}
        logEvt('auto-stop', { label, elapsed: (Date.now()-startedAt)/1000 });
      }
    }, durationSeconds * 1000);
  };

  if (!unlocked) {
    logEvt('queue-before-unlock', { label });
    pendingQueue.push(performPlayback);
    return;
  }

  performPlayback();
}

export function stopChannel(label) {
  const a = channels[label];
  if (a) {
    try { a.pause(); } catch(e){}
    delete channels[label];
    logEvt('channel-stopped', { label });
  }
}

export function stopAll() {
  Object.keys(channels).forEach(k => stopChannel(k));
  logEvt('all-stopped');
}

// Debug helpers
window.__SFB_PLAY_PREVIEW = (url, secs=10) => unlockAudioSystem().then(() => playPreview('DEBUG', url, secs));
window.__SFB_TEST_BEEP = () => unlockAudioSystem().then(playTestBeep);
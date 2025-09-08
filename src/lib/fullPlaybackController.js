import { PLAYBACK_MODE, SEGMENT_DURATIONS, ENFORCE_SEGMENT_PAUSE } from '../config/playbackConfig.js';
import { playPreview } from './audioManager.js';
import { ensureFreshToken } from './spotify.js';

// Decide segment duration based on stage
export function getSegmentDuration(stage) {
  if (stage === 'round1A' || stage === 'round1B') return SEGMENT_DURATIONS.round1;
  if (stage === 'round2A' || stage === 'round2B') return SEGMENT_DURATIONS.round2;
  // default fallback
  return 10;
}

/**
 * Attempt full playback; fallback to preview if needed.
 * Params:
 *  - opts: {
 *      clientId, track, stage, sideLabel, spotifyPlayer (hook result),
 *      onFallback()
 *    }
 */
export async function playBattleSegment(opts) {
  const {
    clientId,
    track,
    stage,
    sideLabel,
    spotifyPlayer,
    onFallback
  } = opts;

  const durationSec = getSegmentDuration(stage);
  const durationMs = durationSec * 1000;

  if (!track) {
    console.warn('[BattlePlayback] No track object.');
    return;
  }

  if (PLAYBACK_MODE !== 'FULL') {
    if (track.preview_url) {
      playPreview(sideLabel, track.preview_url, durationSec);
    } else {
      console.log('[BattlePlayback] Preview mode & no preview_url -> silent.');
    }
    return;
  }

  // FULL mode path
  try {
    const tokens = await ensureFreshToken(clientId);
    if (!tokens?.accessToken) {
      console.warn('[BattlePlayback] No valid access token -> fallback preview.');
      return fallbackPreview();
    }
    if (!spotifyPlayer.ready || !spotifyPlayer.deviceId) {
      console.warn('[BattlePlayback] Player not ready -> fallback preview.');
      return fallbackPreview();
    }
    if (!track.uri) {
      console.warn('[BattlePlayback] Track missing URI -> fallback preview.');
      return fallbackPreview();
    }
    console.log('[BattlePlayback] FULL segment start', {
      name: track.name,
      uri: track.uri,
      stage,
      durationSec
    });
    spotifyPlayer.startTrackSegment(tokens.accessToken, track.uri, spotifyPlayer.deviceId, ENFORCE_SEGMENT_PAUSE ? durationMs : 0, (ok) => {
      if (!ok) {
        console.warn('[BattlePlayback] Segment start failed -> fallback preview.');
        fallbackPreview();
      }
    });
  } catch (e) {
    console.warn('[BattlePlayback] Exception -> fallback preview.', e.message);
    fallbackPreview();
  }

  function fallbackPreview() {
    onFallback && onFallback();
    if (track.preview_url) {
      playPreview(sideLabel, track.preview_url, durationSec);
    } else {
      console.log('[BattlePlayback] No preview available (silent).');
    }
  }
}
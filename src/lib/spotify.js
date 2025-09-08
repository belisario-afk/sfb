/**
 * spotify.js
 * Helpers for Spotify auth (PKCE), token refresh, scope checks, and track search.
 *
 * Recent change:
 * - searchTopTrackByQuery now hits the Search API directly with limit=1 and throws on non-OK responses.
 *   This gives clearer errors in the console and avoids fetching unnecessary results.
 */

export const REQUIRED_SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming'
];

const TOKEN_KEY = 'spotifyTokens';
const CODE_VERIFIER_KEY = 'spotify_code_verifier';

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function startSpotifyAuth(clientId) {
  const verifier = randomString(64);
  localStorage.setItem(CODE_VERIFIER_KEY, verifier);

  sha256(verifier).then(challenge => {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: window.location.origin + window.location.pathname,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: REQUIRED_SCOPES.join(' ')
    });
    window.location = 'https://accounts.spotify.com/authorize?' + params.toString();
  });
}

export async function exchangeCodeForToken(code, clientId) {
  const verifier = localStorage.getItem(CODE_VERIFIER_KEY);
  if (!verifier) throw new Error('Missing PKCE verifier');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: window.location.origin + window.location.pathname,
    client_id: clientId,
    code_verifier: verifier
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Token exchange failed: ' + txt);
  }
  const json = await res.json();
  const stored = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in - 30) * 1000,
    scope: json.scope
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
  return stored;
}

export function loadStoredTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function ensureFreshToken(clientId) {
  const tokens = loadStoredTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens;

  if (!tokens.refreshToken) {
    return tokens; // cannot refresh
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: clientId
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    console.warn('[Spotify] refresh failed', res.status);
    return tokens;
  }
  const json = await res.json();
  const updated = {
    ...tokens,
    accessToken: json.access_token || tokens.accessToken,
    expiresAt: Date.now() + ((json.expires_in || 3600) - 30) * 1000,
    scope: json.scope || tokens.scope
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(updated));
  return updated;
}

export function hasRequiredScopes(authState) {
  if (!authState?.scope) return false;
  const granted = authState.scope.split(/\s+/);
  return REQUIRED_SCOPES.every(s => granted.includes(s));
}

/**
 * Search helpers
 * Tip: you can pass a market (e.g., "US") to bias results, but it's optional.
 */

export async function searchTracks(accessToken, query, { limit = 10, market } = {}) {
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('q', query);
  if (market) url.searchParams.set('market', market);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    console.warn('[Spotify] search error', res.status);
    return [];
  }
  const json = await res.json();
  return json.tracks?.items || [];
}

/**
 * Recent change: direct, single-item search with clear errors.
 * Returns the top track for a free-text query, or null if none found.
 */
export async function searchTopTrackByQuery(accessToken, query, { market } = {}) {
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', '1');
  if (market) url.searchParams.set('market', market);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify search failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  const item = data?.tracks?.items?.[0];
  return item || null;
}

export async function getTrackById(accessToken, id) {
  const res = await fetch('https://api.spotify.com/v1/tracks/' + encodeURIComponent(id), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}
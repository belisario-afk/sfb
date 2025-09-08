/**
 * spotify.js
 * (Re-output full for clarity; only add or adjust if needed for player integration)
 * Make sure REQUIRED_SCOPES includes streaming + playback controls for FULL mode.
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
  for (let i=0;i<length;i++) out += chars.charAt(Math.floor(Math.random()*chars.length));
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
    headers: { 'Content-Type':'application/x-www-form-urlencoded' },
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
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
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

// Simple search helpers
export async function searchTracks(accessToken, query) {
  const res = await fetch('https://api.spotify.com/v1/search?' + new URLSearchParams({
    type: 'track',
    limit: '10',
    q: query
  }), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!res.ok) {
    console.warn('[Spotify] search error', res.status);
    return [];
  }
  const json = await res.json();
  return json.tracks?.items || [];
}

export async function searchTopTrackByQuery(accessToken, query) {
  const items = await searchTracks(accessToken, query);
  return items?.[0] || null;
}

export async function getTrackById(accessToken, id) {
  const res = await fetch('https://api.spotify.com/v1/tracks/' + id, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}
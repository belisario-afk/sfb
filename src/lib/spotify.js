import { generateCodeChallenge, generateCodeVerifier } from './pkce.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Expanded scopes for full playback
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state'
];

function getRedirectUri() {
  return window.location.origin + '/sfb/';
}

export function startSpotifyAuth(clientId) {
  const codeVerifier = generateCodeVerifier();
  localStorage.setItem('spotify_code_verifier', codeVerifier);
  const redirectUri = getRedirectUri();
  generateCodeChallenge(codeVerifier).then(codeChallenge => {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge
    });
    window.location.href = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  });
}

export async function exchangeCodeForToken(code, clientId) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  if (!codeVerifier) throw new Error('Missing PKCE code_verifier.');
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: codeVerifier
  });
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error('Token exchange failed: ' + res.status + ' ' + txt);
  }
  const data = await res.json();
  const expires_at = Date.now() + (data.expires_in * 1000) - 60000;
  const tokenObj = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    expires_at,
    scope: data.scope
  };
  localStorage.setItem('spotifyTokens', JSON.stringify(tokenObj));
  return tokenObj;
}

export async function refreshAccessToken(clientId) {
  const stored = JSON.parse(localStorage.getItem('spotifyTokens') || 'null');
  if (!stored?.refreshToken) throw new Error('No refresh token stored.');
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken
  });
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error('Refresh failed: ' + res.status + ' ' + txt);
  }
  const data = await res.json();
  const expires_at = Date.now() + (data.expires_in * 1000) - 60000;
  const newObj = {
    ...stored,
    accessToken: data.access_token,
    expires_at
  };
  localStorage.setItem('spotifyTokens', JSON.stringify(newObj));
  return newObj;
}

export function loadStoredTokens() {
  try {
    return JSON.parse(localStorage.getItem('spotifyTokens') || 'null');
  } catch {
    return null;
  }
}

export async function ensureFreshToken(clientId) {
  const tokens = loadStoredTokens();
  if (!tokens) return null;
  if (tokens.expires_at < Date.now()) {
    try {
      return await refreshAccessToken(clientId);
    } catch (e) {
      console.warn('[Spotify] Refresh failed:', e.message);
      return null;
    }
  }
  return tokens;
}

export function searchTracks(accessToken, query) {
  if (!query) return Promise.resolve([]);
  return fetch(`https://api.spotify.com/v1/search?${new URLSearchParams({
    q: query,
    type: 'track',
    limit: '10'
  })}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
    .then(r => r.ok ? r.json() : { tracks: { items: [] } })
    .then(d => d.tracks.items);
}

export async function searchTopTrackByQuery(accessToken, query) {
  if (!query) return null;
  const items = await searchTracks(accessToken, query);
  return items[0] || null;
}

export function getTrackById(accessToken, id) {
  return fetch(`https://api.spotify.com/v1/tracks/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.ok ? r.json() : null);
}
import { generateCodeChallenge, generateCodeVerifier } from './pkce.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = [
  'user-read-email'
];

function getRedirectUri() {
  // Use trailing slash callback folder so GitHub Pages serves callback/index.html
  return window.location.origin + '/sfb/callback/';
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
    window.location = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  });
}

export async function exchangeCodeForToken(code, clientId) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  const redirectUri = getRedirectUri();
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    throw new Error('Token exchange failed: ' + res.status);
  }
  const data = await res.json();
  const expires_at = Date.now() + (data.expires_in * 1000) - 60000;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    expires_at
  };
}

export function parseAuthCallback() {
  const url = new URL(window.location.href);
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    error: url.searchParams.get('error')
  };
}

export async function searchTracks(accessToken, query) {
  if (!query) return [];
  const res = await fetch(`https://api.spotify.com/v1/search?${new URLSearchParams({
    q: query,
    type: 'track',
    limit: '10'
  }).toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.tracks.items;
}

export async function searchTopTrackByQuery(accessToken, query) {
  const results = await searchTracks(accessToken, query);
  return results[0];
}

export async function getTrackById(accessToken, id) {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}
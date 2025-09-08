/**
 * PKCE helper functions
 */
function dec2hex(dec) {
  return ('0' + dec.toString(16)).substr(-2);
}
export function generateCodeVerifier() {
  const array = new Uint32Array(56/2);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join('');
}
export async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
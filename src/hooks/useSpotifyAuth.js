import { useEffect, useState } from 'react';
import { exchangeCodeForToken, parseAuthCallback } from '../lib/spotify.js';

/**
 * Handles Spotify PKCE tokens and refresh.
 */
export default function useSpotifyAuth(clientId) {
  const [authState, setAuthState] = useState(() => {
    try {
      const stored = localStorage.getItem('spotifyTokens');
      if (stored) {
        const obj = JSON.parse(stored);
        if (obj.expires_at > Date.now()) {
          return obj;
        }
      }
    } catch(e) { /* ignore */ }
    return null;
  });

  // Process callback
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const hasCode = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      console.warn('Spotify auth error', error);
    }
    if (hasCode) {
      (async () => {
        try {
          const code = hasCode;
            const redirectUri = window.location.origin + '/sfb/callback';
          const tokenData = await exchangeCodeForToken(code, clientId, redirectUri);
          setAuthState(tokenData);
          localStorage.setItem('spotifyTokens', JSON.stringify(tokenData));
          // clean URL
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          history.replaceState({}, '', url.toString());
        } catch (err) {
          console.error('Token exchange failed', err);
        }
      })();
    }
  }, [clientId]);

  // Basic expiry check
  useEffect(() => {
    if (!authState) return;
    const interval = setInterval(() => {
      if (authState.expires_at <= Date.now()) {
        localStorage.removeItem('spotifyTokens');
        window.location.reload();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [authState]);

  return authState;
}
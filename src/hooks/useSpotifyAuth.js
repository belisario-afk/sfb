import { useEffect, useState } from 'react';
import { exchangeCodeForToken } from '../lib/spotify.js';

/**
 * Handles Spotify PKCE tokens & expiry.
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      console.warn('Spotify auth error', error);
    }

    if (code) {
      (async () => {
        try {
          const tokenData = await exchangeCodeForToken(code, clientId);
          setAuthState(tokenData);
          localStorage.setItem('spotifyTokens', JSON.stringify(tokenData));
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          history.replaceState({}, '', url.toString());
        } catch (err) {
          console.error('Token exchange failed', err);
        }
      })();
    }
  }, [clientId]);

  // Expiry watcher
  useEffect(() => {
    if (!authState) return;
    const interval = setInterval(() => {
      if (authState.expires_at <= Date.now()) {
        localStorage.removeItem('spotifyTokens');
        // Optional: could auto re-auth flow. For now just clear.
        setAuthState(null);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [authState]);

  return authState;
}
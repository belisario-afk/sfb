/**
 * spotifySdkLoader.js
 * Ensures Spotify Web Playback SDK is loaded exactly once.
 *
 * Exports: loadSpotifySDK(): Promise<void>
 *
 * Handles the required global callback window.onSpotifyWebPlaybackSDKReady
 * so you don't get "onSpotifyWebPlaybackSDKReady is not defined".
 */

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

let loadPromise = null;

export function loadSpotifySDK() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window environment'));
  }
  if (window.Spotify) return Promise.resolve();

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Define the global callback BEFORE injecting the script
    if (!window.onSpotifyWebPlaybackSDKReady) {
      window.onSpotifyWebPlaybackSDKReady = () => {
        // Spotify sets window.Spotify inside this callback
        resolve();
      };
    }

    // If script already exists, rely on callback
    if (document.getElementById('spotify-player-sdk')) {
      return;
    }

    const tag = document.createElement('script');
    tag.id = 'spotify-player-sdk';
    tag.src = SDK_URL;
    tag.async = true;
    tag.onerror = (e) => {
      console.error('[SpotifySDKLoader] Script load error', e);
      reject(new Error('Failed to load Spotify SDK'));
    };
    document.head.appendChild(tag);
  });

  return loadPromise;
}
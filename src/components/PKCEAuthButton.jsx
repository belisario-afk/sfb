import React from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { startSpotifyAuth } from '../lib/spotify.js';

export default function PKCEAuthButton() {
  const { authState, spotifyClientId } = useAppContext();

  const handleLogin = () => {
    startSpotifyAuth(spotifyClientId);
  };

  if (authState?.accessToken) {
    return <button className="btn-outline" onClick={() => window.location.reload()}>Refresh Token</button>;
  }

  return (
    <button className="btn" onClick={handleLogin} title="Spotify Login">
      Login Spotify
    </button>
  );
}
import React from 'react';
import { unlockAudioSystem, isAudioUnlocked, playPreview } from '../lib/audioManager.js';

export default function AudioUnlockButton() {
  const [unlocked, setUnlocked] = React.useState(isAudioUnlocked());

  const handle = () => {
    unlockAudioSystem();
    setTimeout(() => setUnlocked(isAudioUnlocked()), 150);
  };

  if (unlocked) {
    return (
      <button
        className="btn-outline"
        style={{fontSize:'0.65rem'}}
        onClick={() => {
          // Test short blip (will just stop after 1s)
          console.log('[Audio] Test playback triggered.');
          playPreview('TEST', 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA', 1);
        }}
      >
        Audio OK
      </button>
    );
  }

  return (
    <button className="btn" style={{fontSize:'0.65rem'}} onClick={handle}>
      Enable Audio
    </button>
  );
}
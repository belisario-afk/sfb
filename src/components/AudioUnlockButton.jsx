import React from 'react';
import { unlockAudioSystem, isAudioUnlocked, playTestBeep } from '../lib/audioManager.js';

export default function AudioUnlockButton() {
  const [unlocked, setUnlocked] = React.useState(isAudioUnlocked());
  const [busy, setBusy] = React.useState(false);

  const handleUnlock = async () => {
    if (unlocked) {
      playTestBeep(0.2);
      return;
    }
    setBusy(true);
    const ok = await unlockAudioSystem();
    setUnlocked(ok);
    setBusy(false);
    if (ok) {
      // immediate confirmation beep
      playTestBeep(0.18);
    }
  };

  if (unlocked) {
    return (
      <button
        className="btn-outline"
        style={{fontSize:'0.65rem'}}
        onClick={handleUnlock}
        title="Audio system unlocked. Click to play a short test beep."
      >
        Audio OK ✓
      </button>
    );
  }

  return (
    <button
      className="btn"
      disabled={busy}
      style={{fontSize:'0.65rem', opacity: busy ? 0.7 : 1}}
      onClick={handleUnlock}
      title="Enable audio (required once due to browser autoplay policies)"
    >
      {busy ? 'Unlocking…' : 'Enable Audio'}
    </button>
  );
}
import React, { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { PLAYBACK_MODE, SEGMENT_DURATIONS, ENFORCE_SEGMENT_PAUSE } from '../config/playbackConfig.js';

/**
 * Settings Panel
 * - Keeps all original controls (chat mode, relay URL, client ID, utilities)
 * - Adds visibility for Full Playback vs Preview mode
 * - Shows Spotify Web Playback SDK status (device readiness / error)
 * - Provides a "Transfer Playback" button to move playback to the in‑page player device
 *   (useful if Spotify is currently playing on another device)
 */
export default function SettingsPanel() {
  const {
    spotifyClientId, setSpotifyClientId,
    chatMode, setChatMode,
    relayUrl, setRelayUrl,
    addDemoPair,
    nextBattle,
    forceNextStage,
    togglePause,
    // Expect these to be provided by AppContext (ensure AppContext passes them through from useBattleEngine):
    spotifyPlayer,        // { ready, deviceId, error }
    battle
  } = useAppContext();

  const [localClientId, setLocalClientId] = useState(spotifyClientId);
  const [localRelay, setLocalRelay] = useState(relayUrl);
  const [transferStatus, setTransferStatus] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);

  const saveClientId = () => {
    setSpotifyClientId(localClientId.trim());
  };
  const saveRelay = () => {
    setRelayUrl(localRelay.trim());
  };

  const accessToken = (() => {
    try {
      const tok = JSON.parse(localStorage.getItem('spotifyTokens') || 'null');
      return tok?.accessToken;
    } catch {
      return null;
    }
  })();

  const transferPlayback = useCallback(async () => {
    if (!spotifyPlayer?.deviceId || !accessToken) {
      setTransferStatus('No device or token');
      return;
    }
    setTransferBusy(true);
    setTransferStatus(null);
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_ids: [spotifyPlayer.deviceId],
          play: false
        })
      });
      if (res.status === 204) {
        setTransferStatus('Transferred');
      } else {
        const txt = await res.text().catch(()=> '');
        setTransferStatus(`Failed (${res.status}) ${txt.slice(0,120)}`);
      }
    } catch (e) {
      setTransferStatus('Error: ' + e.message);
    } finally {
      setTransferBusy(false);
    }
  }, [spotifyPlayer?.deviceId, accessToken]);

  return (
    <div className="panel" style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'1rem'}}>
      <h3 style={{marginTop:0}}>Settings</h3>

      <section style={{marginBottom:0}}>
        <h4 style={{margin:'0 0 0.4rem'}}>Playback</h4>
        <div style={{fontSize:'0.6rem', lineHeight:'0.9rem', opacity:0.85}}>
          <div>Mode: <strong>{PLAYBACK_MODE}</strong></div>
          <div>Round 1 Segment: {SEGMENT_DURATIONS.round1 || 10}s</div>
          <div>Round 2 Segment: {SEGMENT_DURATIONS.round2 || 20}s</div>
          <div>Enforce Pause: {ENFORCE_SEGMENT_PAUSE ? 'Yes' : 'No'}</div>
          {PLAYBACK_MODE === 'FULL' && (
            <>
              <div style={{marginTop:'0.4rem'}}>
                Player Status:&nbsp;
                {spotifyPlayer?.error && (
                  <span style={{color:'#ff6b6b'}}>Error: {spotifyPlayer.error}</span>
                )}
                {!spotifyPlayer?.error && (
                  <span style={{color: spotifyPlayer?.ready ? '#4ade80' : '#fbbf24'}}>
                    {spotifyPlayer?.ready ? 'Ready' : 'Initializing...'}
                  </span>
                )}
              </div>
              <div style={{fontSize:'0.55rem', opacity:0.7}}>
                Device ID: {spotifyPlayer?.deviceId || '—'}
              </div>
              <div style={{marginTop:'0.4rem', display:'flex', gap:'0.4rem', flexWrap:'wrap'}}>
                <button
                  className="btn-outline"
                  disabled={!spotifyPlayer?.deviceId || !accessToken || transferBusy}
                  onClick={transferPlayback}
                  style={{fontSize:'0.6rem'}}
                  title="Transfer active playback to this in-browser player device"
                >
                  {transferBusy ? 'Transferring…' : 'Transfer Playback'}
                </button>
                <button
                  className="btn-outline"
                  disabled={!accessToken}
                  onClick={() => {
                    // Simple debug: list devices
                    fetch('https://api.spotify.com/v1/me/player/devices', {
                      headers: { Authorization: `Bearer ${accessToken}` }
                    })
                      .then(r=>r.json())
                      .then(d=>console.log('[Spotify] Devices:', d));
                  }}
                  style={{fontSize:'0.6rem'}}
                >
                  List Devices (console)
                </button>
              </div>
              {transferStatus && (
                <div style={{fontSize:'0.55rem', marginTop:'0.3rem', opacity:0.8}}>
                  Transfer: {transferStatus}
                </div>
              )}
              <div style={{fontSize:'0.55rem', marginTop:'0.5rem', opacity:0.55}}>
                If audio still plays on another device, press "Transfer Playback".
              </div>
            </>
          )}
          {PLAYBACK_MODE !== 'FULL' && (
            <div style={{fontSize:'0.55rem', marginTop:'0.3rem', opacity:0.55}}>
              Using 30s previews (or silence if none).
            </div>
          )}
        </div>
      </section>

      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Chat Mode</h4>
        <select
          className="input"
          value={chatMode}
          onChange={e => setChatMode(e.target.value)}
        >
          <option value="simulation">Simulation</option>
            <option value="relay">Relay (WebSocket)</option>
          <option value="direct">Direct (Placeholder)</option>
        </select>
        {chatMode === 'relay' && (
          <div style={{marginTop:'0.4rem'}}>
            <input
              className="input"
              value={localRelay}
              onChange={(e)=>setLocalRelay(e.target.value)}
              placeholder="wss://your-relay.example/ws"
            />
            <button className="btn-outline" style={{marginTop:'0.4rem'}} onClick={saveRelay}>Save Relay URL</button>
          </div>
        )}
        {chatMode === 'relay' && (
          <div style={{fontSize:'0.55rem', opacity:0.55, marginTop:'0.4rem'}}>
            Ensure the path ends with /ws (auto-corrected if omitted).
          </div>
        )}
      </section>

      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Spotify Client ID</h4>
        <input
          className="input"
          value={localClientId}
          onChange={(e)=>setLocalClientId(e.target.value)}
        />
        <button className="btn-outline" style={{marginTop:'0.4rem'}} onClick={saveClientId}>Save Client ID</button>
        <div style={{fontSize:'0.55rem', opacity:0.55, marginTop:'0.4rem'}}>
          Changing Client ID requires re-auth (log out by clearing localStorage spotifyTokens).
        </div>
      </section>

      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Utilities</h4>
        <div style={{display:'flex', flexWrap:'wrap', gap:'0.5rem'}}>
          <button className="btn-outline" onClick={addDemoPair}>Add Demo Tracks</button>
          <button className="btn-outline" onClick={nextBattle}>{battle ? 'Next Battle' : 'Start Battle'}</button>
          <button className="btn-outline" onClick={forceNextStage}>Skip Stage</button>
          <button className="btn-outline" onClick={togglePause}>{battle?.paused ? 'Resume' : 'Pause'}</button>
        </div>
        {battle && (
          <div style={{fontSize:'0.55rem', opacity:0.65, marginTop:'0.4rem'}}>
            Current Stage: {battle.stage} | Votes A: {battle.votes?.a?.size || 0} / B: {battle.votes?.b?.size || 0}
          </div>
        )}
      </section>

      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Help</h4>
        <ul style={{fontSize:'0.65rem', lineHeight:'0.9rem', opacity:0.85, paddingLeft:'1.1rem'}}>
          <li><code>!battle &lt;query|url&gt;</code> add two tracks (will queue until enough)</li>
          <li><code>!vote A</code> / <code>!vote B</code> to vote for current battle</li>
          <li>Keyboard: <code>n</code>=next battle, <code>s</code>=skip stage, <code>q</code>=add demo pair, <code>p</code>=pause</li>
          {PLAYBACK_MODE === 'FULL' && (
            <li>If no audio, click "Transfer Playback" or ensure Premium account.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
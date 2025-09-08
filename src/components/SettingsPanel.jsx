import React, { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { PLAYBACK_MODE, SEGMENT_DURATIONS, ENFORCE_SEGMENT_PAUSE } from '../config/playbackConfig.js';

export default function SettingsPanel() {
  const {
    // Auth & scopes
    authState,
    authError,
    authChecking,
    hasScopes,
    requiredScopes,
    beginSpotifyAuth,
    logoutSpotify,

    // Client ID
    spotifyClientId,
    setSpotifyClientId,

    // Chat / relay
    chatMode, setChatMode,
    relayUrl, setRelayUrl,

    // Battle controls
    addDemoPair,
    nextBattle,
    forceNextStage,
    togglePause,
    battle,

    // Player
    spotifyPlayer
  } = useAppContext();

  const [localClientId, setLocalClientId] = useState(spotifyClientId);
  const [localRelay, setLocalRelay] = useState(relayUrl);
  const [transferStatus, setTransferStatus] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);

  const saveClientId = () => {
    const newId = localClientId.trim();
    setSpotifyClientId(newId);
    localStorage.setItem('customSpotifyClientId', newId);
  };
  const saveRelay = () => {
    setRelayUrl(localRelay.trim());
  };

  const accessToken = (() => {
    try {
      return JSON.parse(localStorage.getItem('spotifyTokens') || 'null')?.accessToken;
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

  const scopeStatus = () => {
    if (!authState) return 'Not Logged In';
    if (authChecking) return 'Checking...';
    if (authError) return 'Error';
    if (!hasScopes) return 'Missing Scopes';
    return 'OK';
  };

  const grantedScopes = authState?.scope ? authState.scope.split(/\s+/) : [];
  const missingScopes = requiredScopes.filter(s => !grantedScopes.includes(s));

  return (
    <div className="panel" style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'1rem'}}>
      <h3 style={{marginTop:0}}>Settings</h3>

      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Spotify Auth</h4>
        <div style={{fontSize:'0.6rem', lineHeight:'0.9rem'}}>
          <div>Status: <strong>{scopeStatus()}</strong></div>
          {authError && (
            <div style={{color:'#ff6b6b', fontSize:'0.55rem', marginTop:'0.25rem'}}>
              {authError}
            </div>
          )}
          <div style={{marginTop:'0.4rem', display:'flex', flexWrap:'wrap', gap:'0.4rem'}}>
            {!authState && (
              <button className="btn-outline" onClick={beginSpotifyAuth} disabled={authChecking || !spotifyClientId}>
                {authChecking ? 'Authorizing...' : 'Login Spotify'}
              </button>
            )}
            {authState && !hasScopes && (
              <button className="btn-outline" onClick={beginSpotifyAuth} disabled={authChecking}>
                Re-Auth (Add Scopes)
              </button>
            )}
            {authState && (
              <button className="btn-outline" onClick={logoutSpotify}>
                Logout
              </button>
            )}
          </div>
          {authState && (
            <div style={{marginTop:'0.5rem'}}>
              <div style={{fontSize:'0.55rem', opacity:0.8, marginBottom:'0.25rem'}}>Granted Scopes:</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:'4px'}}>
                {grantedScopes.map(s => {
                  const ok = requiredScopes.includes(s);
                  return (
                    <span
                      key={s}
                      style={{
                        background: ok ? '#203a2f' : '#27313a',
                        fontSize:'0.55rem',
                        padding:'2px 6px',
                        borderRadius:4
                      }}
                    >{s}</span>
                  );
                })}
              </div>
              {missingScopes.length > 0 && (
                <div style={{marginTop:'0.4rem'}}>
                  <div style={{fontSize:'0.55rem', opacity:0.75, marginBottom:'0.2rem'}}>Missing:</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:'4px'}}>
                    {missingScopes.map(s => (
                      <span key={s} style={{
                        background:'#45222f',
                        fontSize:'0.55rem',
                        padding:'2px 6px',
                        borderRadius:4
                      }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
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
                >
                  {transferBusy ? 'Transferring…' : 'Transfer Playback'}
                </button>
                <button
                  className="btn-outline"
                  disabled={!accessToken}
                  onClick={() => {
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
                If audio still plays elsewhere, press "Transfer Playback".
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
            <div style={{fontSize:'0.55rem', opacity:0.55, marginTop:'0.4rem'}}>
              Will auto-append /ws if missing.
            </div>
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
          After changing Client ID: Logout & Login again to re-auth.
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
            Stage: {battle.stage} | Votes A: {battle.votes?.a?.size || 0} / B: {battle.votes?.b?.size || 0}
          </div>
        )}
      </section>

      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Help</h4>
        <ul style={{fontSize:'0.65rem', lineHeight:'0.9rem', opacity:0.85, paddingLeft:'1.1rem'}}>
          <li><code>!battle &lt;query&gt;</code> add top track of query</li>
          <li><code>!vote A</code> / <code>!vote B</code> vote current battle</li>
          <li>Keys: <code>n</code>=next battle, <code>s</code>=skip stage, <code>q</code>=demo, <code>p</code>=pause</li>
          {PLAYBACK_MODE === 'FULL' && (
            <li>If silent: re-auth for scopes or use Transfer Playback.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
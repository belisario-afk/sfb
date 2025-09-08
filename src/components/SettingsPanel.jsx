import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import {
  PLAYBACK_MODE,
  ROUND1_SEGMENT_MS,
  ROUND2_SEGMENT_MS,
  VOTE_WINDOW_MS,
  VOTING_RULE
} from '../config/playbackConfig.js';

export default function SettingsPanel() {
  const {
    authState,
    authError,
    authChecking,
    hasScopes,
    requiredScopes,
    beginSpotifyAuth,
    logoutSpotify,

    spotifyClientId,
    setSpotifyClientId,

    chatMode, setChatMode,
    relayUrl, setRelayUrl,

    addDemoPair,
    nextBattle,
    forceNextStage,
    togglePause,
    battle,

    spotifyPlayer
  } = useAppContext();

  const [localClientId, setLocalClientId] = useState(spotifyClientId);
  const [localRelay, setLocalRelay] = useState(relayUrl);

  const saveClientId = () => {
    const newId = localClientId.trim();
    setSpotifyClientId(newId);
    localStorage.setItem('customSpotifyClientId', newId);
  };
  const saveRelay = () => setRelayUrl(localRelay.trim());

  function scopeStatus() {
    if (!authState) return 'Not Logged In';
    if (authChecking) return 'Checking...';
    if (authError) return 'Error';
    if (!hasScopes) return 'Missing Scopes';
    return 'OK';
  }

  const grantedScopes = authState?.scope ? authState.scope.split(/\s+/) : [];
  const missingScopes = requiredScopes.filter(s => !grantedScopes.includes(s));

  const votesA = battle?.voteTotals?.a || 0;
  const votesB = battle?.voteTotals?.b || 0;

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
        <h4 style={{margin:'0 0 0.4rem'}}>Playback & Voting</h4>
        <div style={{fontSize:'0.6rem', lineHeight:'0.95rem'}}>
          <div>Mode: <strong>{PLAYBACK_MODE}</strong></div>
          <div>Round 1 Segments: {ROUND1_SEGMENT_MS/1000}s each</div>
          <div>Round 2 Segments: {ROUND2_SEGMENT_MS/1000}s each</div>
          <div>Vote Window: {VOTE_WINDOW_MS/1000}s (two phases)</div>
          <div>Voting Rule: {VOTING_RULE}</div>
        </div>
        {PLAYBACK_MODE === 'FULL' && (
          <div style={{marginTop:'0.55rem', fontSize:'0.6rem', lineHeight:'0.95rem'}}>
            <div>Player Status: <strong>{spotifyPlayer?.status}</strong></div>
            <div>Device ID: {spotifyPlayer?.deviceId || '—'}</div>
            {spotifyPlayer?.error && (
              <div style={{color:'#ff6b6b', fontSize:'0.55rem', marginTop:'0.25rem'}}>
                {spotifyPlayer.error}
              </div>
            )}
            {!spotifyPlayer?.hasStreamingScope && (
              <div style={{color:'#fbbf24', fontSize:'0.55rem', marginTop:'0.3rem'}}>
                Missing streaming / playback scopes. Re-auth needed.
              </div>
            )}
          </div>
        )}
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
          <option value="direct">Direct</option>
        </select>
        {chatMode === 'relay' && (
          <div style={{marginTop:'0.4rem'}}>
            <input
              className="input"
              value={localRelay}
              onChange={(e)=>setLocalRelay(e.target.value)}
              placeholder="wss://your-relay/ws"
            />
            <button className="btn-outline" style={{marginTop:'0.4rem'}} onClick={saveRelay}>Save Relay URL</button>
            <div style={{fontSize:'0.55rem', opacity:0.55, marginTop:'0.4rem'}}>
              /ws appended if missing.
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
          After changing ID: Logout & Re-Login.
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
            Stage: {battle.stage} | A: {votesA} / B: {votesB}
            {battle.winner && <span style={{marginLeft:8, color:'#4ade80'}}>Winner: {battle.winner.toUpperCase()}</span>}
          </div>
        )}
      </section>

      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Help</h4>
        <ul style={{fontSize:'0.65rem', lineHeight:'0.9rem', opacity:0.85, paddingLeft:'1.1rem'}}>
          <li><code>!battle &lt;query&gt;</code> add top track</li>
          <li><code>!vote A</code> / <code>!vote B</code> (only during voting windows)</li>
          <li>Keys: <code>n</code>=next <code>s</code>=skip <code>p</code>=pause <code>q</code>=demo</li>
        </ul>
      </section>
    </div>
  );
}
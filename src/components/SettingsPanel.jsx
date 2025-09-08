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

    spotifyPlayer,
    visualFxEnabled,
    reducedMotion,
    toggleVisualFx,
    toggleReducedMotion
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
    <div className="panel panel-elevated" style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'1rem'}}>
      <h3 style={{marginTop:0}}>Settings</h3>

      <section className="settings-block">
        <h4>Spotify Auth</h4>
        <div className="kv">
          <div className="kv-row"><span>Status</span><span>{scopeStatus()}</span></div>
          {authError && <div className="error-text">{authError}</div>}
        </div>
        <div className="btn-row">
          {!authState && (
            <button className="btn-outline" onClick={beginSpotifyAuth} disabled={authChecking || !spotifyClientId}>
              {authChecking ? 'Authorizing...' : 'Login Spotify'}
            </button>
          )}
          {authState && !hasScopes && (
            <button className="btn-outline" onClick={beginSpotifyAuth} disabled={authChecking}>
              Re-Auth (Scopes)
            </button>
          )}
          {authState && (
            <button className="btn-outline" onClick={logoutSpotify}>
              Logout
            </button>
          )}
        </div>
        {authState && (
          <div style={{marginTop:'0.6rem'}}>
            <div className="sub-label">Granted Scopes</div>
            <div className="chips">
              {grantedScopes.map(s => {
                const ok = requiredScopes.includes(s);
                return <span key={s} className={`chip ${ok ? 'ok' : ''}`}>{s}</span>;
              })}
            </div>
            {missingScopes.length > 0 && (
              <>
                <div className="sub-label" style={{marginTop:'0.4rem'}}>Missing</div>
                <div className="chips">
                  {missingScopes.map(s => <span key={s} className="chip warn">{s}</span>)}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="settings-block">
        <h4>Playback & Voting</h4>
        <div className="kv">
          <div className="kv-row"><span>Mode</span><span>{PLAYBACK_MODE}</span></div>
          <div className="kv-row"><span>Round1 (each)</span><span>{ROUND1_SEGMENT_MS/1000}s</span></div>
          <div className="kv-row"><span>Round2 (each)</span><span>{ROUND2_SEGMENT_MS/1000}s</span></div>
          <div className="kv-row"><span>Vote Window</span><span>{VOTE_WINDOW_MS/1000}s x2</span></div>
          <div className="kv-row"><span>Voting Rule</span><span>{VOTING_RULE}</span></div>
        </div>
        {PLAYBACK_MODE === 'FULL' && (
          <div className="status-box">
            <div className="kv-row"><span>Player</span><span>{spotifyPlayer?.status}</span></div>
            <div className="kv-row"><span>Device</span><span>{spotifyPlayer?.deviceId?.slice(0,8) || '—'}</span></div>
            {spotifyPlayer?.error && <div className="error-text">{spotifyPlayer.error}</div>}
          </div>
        )}
        {battle && (
          <div className="mini-stats">
            Stage: {battle.stage} • A:{votesA} B:{votesB} {battle.winner && <strong style={{color:'#4ade80'}}> Winner: {battle.winner.toUpperCase()}</strong>}
          </div>
        )}
      </section>

      <section className="settings-block">
        <h4>Visual</h4>
        <div className="toggle-row">
          <label className="toggle">
            <input type="checkbox" checked={visualFxEnabled} onChange={toggleVisualFx} />
            <span className="toggle-indicator" />
            <span>Visual FX</span>
          </label>
        </div>
        <div className="toggle-row">
          <label className="toggle">
            <input type="checkbox" checked={reducedMotion} onChange={toggleReducedMotion} />
            <span className="toggle-indicator" />
            <span>Reduced Motion</span>
          </label>
        </div>
        <div className="hint-text">
          FX adds particles, parallax & dynamic light. Disable on low-end devices.
        </div>
      </section>

      <section className="settings-block">
        <h4>Chat Mode</h4>
        <select className="input" value={chatMode} onChange={e=>setChatMode(e.target.value)}>
          <option value="simulation">Simulation</option>
          <option value="relay">Relay (WebSocket)</option>
          <option value="direct">Direct</option>
        </select>
        {chatMode === 'relay' && (
          <div style={{marginTop:'0.5rem'}}>
            <input className="input" value={localRelay} onChange={e=>setLocalRelay(e.target.value)} placeholder="wss://relay/ws" />
            <button className="btn-outline" style={{marginTop:'0.4rem'}} onClick={saveRelay}>Save Relay URL</button>
          </div>
        )}
      </section>

      <section className="settings-block">
        <h4>Spotify Client ID</h4>
        <input className="input" value={localClientId} onChange={e=>setLocalClientId(e.target.value)} />
        <button className="btn-outline" style={{marginTop:'0.4rem'}} onClick={saveClientId}>Save Client ID</button>
        <div className="hint-text">After changing: Logout & Re-Login.</div>
      </section>

      <section className="settings-block">
        <h4>Utilities</h4>
        <div className="btn-row">
          <button className="btn-outline" onClick={addDemoPair}>Demo Tracks</button>
          <button className="btn-outline" onClick={nextBattle}>{battle ? 'Next Battle' : 'Start Battle'}</button>
          <button className="btn-outline" onClick={forceNextStage}>Skip Stage</button>
          <button className="btn-outline" onClick={togglePause}>{battle?.paused ? 'Resume' : 'Pause'}</button>
        </div>
      </section>

      <section className="settings-block">
        <h4>Help</h4>
        <ul className="help-list">
          <li><code>!battle &lt;query&gt;</code> queue track</li>
          <li><code>!vote A</code> / <code>!vote B</code> during voting</li>
          <li>Keys: n(next) s(skip) p(pause) q(demo)</li>
        </ul>
      </section>
    </div>
  );
}
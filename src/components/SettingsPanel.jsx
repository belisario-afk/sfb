import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function SettingsPanel() {
  const {
    spotifyClientId, setSpotifyClientId,
    chatMode, setChatMode,
    relayUrl, setRelayUrl,
    addDemoPair,
    nextBattle,
    forceNextStage,
    togglePause
  } = useAppContext();

  const [localClientId, setLocalClientId] = useState(spotifyClientId);
  const [localRelay, setLocalRelay] = useState(relayUrl);

  const saveClientId = () => {
    setSpotifyClientId(localClientId.trim());
  };
  const saveRelay = () => {
    setRelayUrl(localRelay.trim());
  };

  return (
    <div className="panel" style={{flex:1, overflowY:'auto'}}>
      <h3 style={{marginTop:0}}>Settings</h3>
      <section style={{marginBottom:'1rem'}}>
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
      </section>
      <section style={{marginBottom:'1rem'}}>
        <h4 style={{margin:'0 0 0.4rem'}}>Spotify Client ID</h4>
        <input
          className="input"
          value={localClientId}
          onChange={(e)=>setLocalClientId(e.target.value)}
        />
        <button className="btn-outline" style={{marginTop:'0.4rem'}} onClick={saveClientId}>Save Client ID</button>
      </section>
      <section style={{marginBottom:'1rem'}}>
        <h4 style={{margin:'0 0 0.4rem'}}>Utilities</h4>
        <div style={{display:'flex', flexWrap:'wrap', gap:'0.5rem'}}>
          <button className="btn-outline" onClick={addDemoPair}>Add Demo Tracks</button>
          <button className="btn-outline" onClick={nextBattle}>Start / Next Battle</button>
          <button className="btn-outline" onClick={forceNextStage}>Skip Stage</button>
          <button className="btn-outline" onClick={togglePause}>Pause/Resume</button>
        </div>
      </section>
      <section>
        <h4 style={{margin:'0 0 0.4rem'}}>Help</h4>
        <ul style={{fontSize:'0.65rem', lineHeight:'0.9rem', opacity:0.85, paddingLeft:'1.1rem'}}>
          <li><code>!battle &lt;query|url&gt;</code> to add songs</li>
          <li><code>!vote A</code> / <code>!vote B</code> to vote</li>
          <li>Keyboard: n=next, s=skip, q=demo, p=pause</li>
        </ul>
      </section>
    </div>
  );
}
import React, { useCallback, useEffect } from 'react';
import { useAppContext } from './context/AppContext.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ChatTicker from './components/ChatTicker.jsx';
import SpotifyTrackSearchModal from './components/SpotifyTrackSearchModal.jsx';
import BattleArena from './components/BattleArena.jsx';
import VoteOverlay from './components/VoteOverlay.jsx';
import ParticleField from './components/FX/ParticleField.jsx';

export default function App() {
  const ctx = useAppContext();
  if (!ctx) return <div style={{ padding: '2rem', color: '#fff' }}>Missing AppContext</div>;

  const {
    queue,
    addTrack,
    nextBattle,
    forceNextStage,
    togglePause,
    battle,
    modalOpen,
    setModalOpen,
    authState,
    hasScopes,
    beginSpotifyAuth,
    spotifyPlayer,
    addDemoPair,
    visualFxEnabled
  } = ctx;

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'n') nextBattle();
      else if (e.key === 's') forceNextStage();
      else if (e.key === 'p') togglePause();
      else if (e.key === 'q') addDemoPair();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nextBattle, forceNextStage, togglePause, addDemoPair]);

  const startBattle = useCallback(() => nextBattle(), [nextBattle]);
  const openSearch = () => setModalOpen(true);
  const closeSearch = () => setModalOpen(false);

  const votesA = battle?.voteTotals?.a || 0;
  const votesB = battle?.voteTotals?.b || 0;

  return (
    <div className="app-root">
      {visualFxEnabled && <ParticleField />}
      <div className="app-grid">
        {/* Left Column */}
        <div className="layout-left">
          <SettingsPanel />
        </div>

        {/* Center Column */}
        <div className="layout-center">
            <div className="toolbar glass-soft">
            <button className="btn-outline" onClick={startBattle}>{battle ? 'Next Battle' : 'Start Battle'}</button>
            <button className="btn-outline" onClick={forceNextStage}>Skip Stage</button>
            <button className="btn-outline" onClick={togglePause}>{battle?.paused ? 'Resume' : 'Pause'}</button>
            <button className="btn-outline" onClick={openSearch}>Search Tracks</button>
            <button className="btn-outline" onClick={addDemoPair}>Demo Pair</button>
            {!authState && <button className="btn-outline" onClick={beginSpotifyAuth}>Login Spotify</button>}
            {authState && !hasScopes && <button className="btn-outline" onClick={beginSpotifyAuth}>Re-Auth Scopes</button>}
          </div>

          <div className="arena-wrapper">
            <BattleArena />
            <VoteOverlay />
          </div>

          {battle && (
            <div className="battle-info glass-soft">
              <span><strong>Stage:</strong> {battle.stage}</span>
              <span><strong>A:</strong> {votesA}</span>
              <span><strong>B:</strong> {votesB}</span>
              {battle.voteWindow && <span>Vote Window: {battle.voteWindow}/2</span>}
              {battle.winner && (
                <span className="tag-win">
                  Winner: {battle.winner?.toUpperCase()}
                </span>
              )}
              {battle.paused && <span className="tag-paused">Paused</span>}
              {battle.stage?.startsWith('vote') && battle.voteEndsAt && (
                <span className="tag-vote">
                  {Math.max(0, Math.ceil((battle.voteEndsAt - Date.now()) / 1000))}s
                </span>
              )}
            </div>
          )}

          <QueueView queue={queue} />

          <div className="player-status">
            Player: {spotifyPlayer?.status}
            {spotifyPlayer?.deviceId && ` (Device ${spotifyPlayer.deviceId.slice(0, 8)}...)`}
            {spotifyPlayer?.error && <span className="err"> Error: {spotifyPlayer.error}</span>}
            {' '}Scopes: {hasScopes ? 'OK' : 'Missing'}
          </div>
        </div>

        {/* Right Column */}
        <div className="layout-right">
          <div className="chat-panel glass-surface">
            <div className="chat-header">Chat</div>
            <div className="chat-body">
              <div className="chat-scroll">
                <ChatTicker limit={60} />
              </div>
            </div>
            <div className="chat-footer">
              Commands: !battle &lt;query&gt; | !vote A/B
            </div>
          </div>
        </div>

        {modalOpen && (
          <SpotifyTrackSearchModal
            onClose={closeSearch}
            onSelect={(track) => {
              if (typeof addTrack === 'function') {
                try { addTrack(track); } catch (e) { console.warn('[App] addTrack failed:', e); }
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

/* Queue View */
function QueueView({ queue }) {
  if (!queue?.length) {
    return (
      <div className="queue-empty glass-soft">
        Queue empty (use !battle or Search).
      </div>
    );
  }
  return (
    <div className="queue-list-neo glass-soft">
      <div className="queue-title">Queue ({queue.length})</div>
      {queue.map((t, i) => {
        const img = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url;
        return (
          <div key={t.id || i} className="queue-row">
            <div className="queue-art">
              {img && <img src={img} alt="" />}
            </div>
            <div className="queue-meta">
              <div className="queue-name" title={t.name}>{t.name}</div>
              <div className="queue-artists">
                {(t.artists || []).map(a => a.name).join(', ')}
              </div>
            </div>
            {t._noPreview && <span className="queue-badge">no preview</span>}
          </div>
        );
      })}
    </div>
  );
}
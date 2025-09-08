import React, { useCallback, useEffect } from 'react';
import { useAppContext } from './context/AppContext.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ChatTicker from './components/ChatTicker.jsx';
import SpotifyTrackSearchModal from './components/SpotifyTrackSearchModal.jsx';
import BattleArena from './components/BattleArena.jsx';
import VoteOverlay from './components/VoteOverlay.jsx';

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
    addDemoPair
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
    <div className="app-grid">
      {/* Left Column */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SettingsPanel />
      </div>

      {/* Center Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={startBattle}>{battle ? 'Next Battle' : 'Start Battle'}</button>
          <button className="btn-outline" onClick={forceNextStage}>Skip Stage</button>
          <button className="btn-outline" onClick={togglePause}>{battle?.paused ? 'Resume' : 'Pause'}</button>
          <button className="btn-outline" onClick={openSearch}>Search Tracks</button>
          <button className="btn-outline" onClick={addDemoPair}>Demo Pair</button>
          {!authState && <button className="btn-outline" onClick={beginSpotifyAuth}>Login Spotify</button>}
          {authState && !hasScopes && <button className="btn-outline" onClick={beginSpotifyAuth}>Re-Auth Scopes</button>}
        </div>

        <div style={{ position: 'relative', minHeight: 340 }}>
          <BattleArena />
          <VoteOverlay />
        </div>

        {battle && (
          <div
            style={{
              fontSize: '0.6rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.4rem 0.55rem',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)'
            }}
          >
            <span><strong>Stage:</strong> {battle.stage}</span>
            <span><strong>A Votes:</strong> {votesA}</span>
            <span><strong>B Votes:</strong> {votesB}</span>
            {battle.voteWindow && <span>Vote Window: {battle.voteWindow}/2</span>}
            {battle.winner && (
              <span style={{ color: '#4ade80' }}><strong>Winner:</strong> {battle.winner?.toUpperCase()}</span>
            )}
            {battle.paused && <span style={{ color: '#fbbf24' }}>Paused</span>}
            {battle.stage?.startsWith('vote') && battle.voteEndsAt && (
              <span style={{ color: '#58c7ff' }}>
                Countdown: {Math.max(0, Math.ceil((battle.voteEndsAt - Date.now()) / 1000))}s
              </span>
            )}
          </div>
        )}

        <QueueView queue={queue} />

        <div style={{ fontSize: '0.5rem', opacity: 0.55 }}>
          Player: {spotifyPlayer?.status}
          {spotifyPlayer?.deviceId && ` (Device ${spotifyPlayer.deviceId.slice(0, 8)}...)`}
          {spotifyPlayer?.error && <span style={{ color: '#ff6b6b' }}> Error: {spotifyPlayer.error}</span>}
          {' '}Scopes: {hasScopes ? 'OK' : 'Missing'}
        </div>
      </div>

      {/* Right Column */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: '1rem' }}>
        <div
          style={{
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: '0.6rem',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          <div style={{ fontSize: '0.65rem', fontWeight: 600, marginBottom: '0.35rem' }}>Chat</div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ height: '100%', overflowY: 'auto', paddingRight: 4 }}>
              <ChatTicker limit={60} />
            </div>
          </div>
          <div style={{ fontSize: '0.5rem', opacity: 0.5, marginTop: '0.35rem' }}>
            Commands: !battle &lt;query&gt; | !vote A/B
          </div>
        </div>
      </div>

      {modalOpen && (
        <SpotifyTrackSearchModal
          onClose={closeSearch}
          onSelect={(track) => {
            if (typeof addTrack === 'function') {
              try {
                addTrack(track);
              } catch (e) {
                console.warn('[App] addTrack failed:', e);
              }
            }
          }}
        />
      )}
    </div>
  );
}

/* Queue View */
function QueueView({ queue }) {
  if (!queue?.length) {
    return (
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '0.55rem',
          fontSize: '0.55rem',
            opacity: 0.6
        }}
      >
        Queue empty (use !battle or Search).
      </div>
    );
  }
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '0.55rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        maxHeight: 180,
        overflowY: 'auto'
      }}
    >
      <div style={{ fontSize: '0.6rem', fontWeight: 600, opacity: 0.8 }}>
        Queue ({queue.length})
      </div>
      {queue.map((t, i) => {
        const img = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url;
        return (
          <div
            key={t.id || i}
            style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 4,
                overflow: 'hidden',
                background: '#111',
                flexShrink: 0
              }}
            >
              {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.55rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {t.name}
              </div>
              <div
                style={{
                  fontSize: '0.45rem',
                  opacity: 0.55,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {(t.artists || []).map(a => a.name).join(', ')}
              </div>
            </div>
            {t._noPreview && (
              <span
                style={{
                  fontSize: '0.45rem',
                  background: '#3a2a2a',
                  padding: '2px 4px',
                  borderRadius: 4,
                  opacity: 0.7
                }}
              >
                no preview
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
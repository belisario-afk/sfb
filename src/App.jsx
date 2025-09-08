import React, { useCallback, useEffect, useMemo } from 'react';
import { useAppContext } from './context/AppContext.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ChatTicker from './components/ChatTicker.jsx';
import SpotifyTrackSearchModal from './components/SpotifyTrackSearchModal.jsx';
import VoteOverlay from './components/VoteOverlay.jsx';
import NeoArena from './components/arena/NeoArena.jsx';
import ThreeBackdrop from './components/FX/ThreeBackdrop.jsx';
import ParticleField from './components/FX/ParticleField.jsx';

export default function App() {
  const ctx = useAppContext();
  if (!ctx) return <div style={{ padding: '2rem', color: '#fff' }}>Missing AppContext</div>;

  const {
    queue,
    addTrack,
    tryStartBattle,       // use this directly
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
    visualFxEnabled,
    reducedMotion
  } = ctx;

  useEffect(() => {
    const h = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'n') {
        if (typeof tryStartBattle === 'function') tryStartBattle();
      } else if (e.key === 's') {
        forceNextStage();
      } else if (e.key === 'p') {
        togglePause();
      } else if (e.key === 'q') {
        addDemoPair();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tryStartBattle, forceNextStage, togglePause, addDemoPair]);

  const startBattle = useCallback(() => {
    if (typeof tryStartBattle === 'function') {
      tryStartBattle();
    } else {
      console.warn('[App] tryStartBattle not available');
    }
  }, [tryStartBattle]);

  const openSearch = () => setModalOpen(true);
  const closeSearch = () => setModalOpen(false);

  const votesA = battle?.voteTotals?.a || 0;
  const votesB = battle?.voteTotals?.b || 0;

  const stageLabel = useMemo(() => {
    if (!battle) return 'Ready';
    const s = battle.stage;
    if (s === 'finished') return 'Winner';
    if (s?.startsWith?.('vote')) return 'Voting';
    if (s?.includes?.('r1')) return 'Round 1';
    if (s?.includes?.('r2')) return 'Round 2';
    return s || 'Active';
  }, [battle]);

  // Try to read the current left/right tracks to show "Requested by"
  function getBattleTracks(b) {
    if (!b) return { left: null, right: null };
    // Common shapes to probe
    const candidates = [
      // direct
      { left: b.a, right: b.b },
      // nested track
      { left: b.a?.track, right: b.b?.track },
      { left: b.left?.track, right: b.right?.track },
      // alt keys
      { left: b.left, right: b.right },
      { left: b.trackA, right: b.trackB }
    ];
    for (const c of candidates) {
      const L = c.left; const R = c.right;
      if (L && R && (L.name || L.album) && (R.name || R.album)) {
        return { left: L, right: R };
      }
    }
    return { left: null, right: null };
  }
  const { left: leftTrack, right: rightTrack } = getBattleTracks(battle);

  const requesterLeft = leftTrack?._requestedBy?.name || leftTrack?._requestedBy?.username || '';
  const requesterRight = rightTrack?._requestedBy?.name || rightTrack?._requestedBy?.username || '';

  return (
    <div className="app-root">
      {visualFxEnabled && !reducedMotion && (
        <ThreeBackdrop
          mode={
            !battle ? 'idle'
            : battle.stage === 'finished' ? 'finale'
            : battle.stage?.startsWith?.('vote') ? 'vote'
            : 'play'
          }
        />
      )}
      {visualFxEnabled && reducedMotion && <ParticleField />}

      <div className="app-grid">
        {/* Left Column */}
        <div className="layout-left">
          <SettingsPanel />
        </div>

        {/* Center Column */}
        <div className="layout-center">
          <div className="toolbar glass-soft toolbar-neo">
            <div className="toolbar-left">
              <div className="brand">NEO ARENA</div>
              <div className="stage-chip">{stageLabel}</div>
            </div>
            <div className="toolbar-actions">
              <button className="btn-primary" onClick={startBattle}>{battle ? 'Next Battle' : 'Start Battle'}</button>
              <button className="btn-outline" onClick={forceNextStage}>Skip Stage</button>
              <button className="btn-outline" onClick={togglePause}>{battle?.paused ? 'Resume' : 'Pause'}</button>
              <button className="btn-outline" onClick={openSearch}>Search Tracks</button>
              <button className="btn-outline" onClick={addDemoPair}>Demo Pair</button>
              {!authState && <button className="btn-outline" onClick={beginSpotifyAuth}>Login Spotify</button>}
              {authState && !hasScopes && <button className="btn-outline" onClick={beginSpotifyAuth}>Re-Auth Scopes</button>}
            </div>
          </div>

          <div className="arena-wrapper" style={{ position: 'relative' }}>
            <NeoArena />
            <VoteOverlay />

            {/* Requested-by badges overlay */}
            {battle && (requesterLeft || requesterRight) && (
              <div style={{
                position: 'absolute',
                top: '12px',
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0 24px',
                pointerEvents: 'none',
                zIndex: 5
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  minWidth: '120px',
                  textAlign: 'left',
                  backdropFilter: 'blur(6px)'
                }}>
                  {requesterLeft ? `Requested by ${requesterLeft}` : ''}
                </div>
                <div style={{
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  minWidth: '120px',
                  textAlign: 'right',
                  backdropFilter: 'blur(6px)'
                }}>
                  {requesterRight ? `Requested by ${requesterRight}` : ''}
                </div>
              </div>
            )}

            {battle && (
              <div className="scoreboard glass-surface">
                <div className="score left">
                  <span className="label">A</span>
                  <span className="value">{String(votesA).padStart(2, '0')}</span>
                </div>
                <div className="divider" />
                <div className="score right">
                  <span className="label">B</span>
                  <span className="value">{String(votesB).padStart(2, '0')}</span>
                </div>
              </div>
            )}
          </div>

          {battle && (
            <div className="battle-info glass-soft">
              <span className="info-pill"><strong>Stage:</strong> {battle.stage}</span>
              {battle.voteWindow && <span className="info-pill">Vote Window: {battle.voteWindow}/2</span>}
              {battle.winner && (
                <span className="info-pill tag-win">
                  Winner: {battle.winner?.toUpperCase()}
                </span>
              )}
              {battle.paused && <span className="info-pill tag-paused">Paused</span>}
              {battle.stage?.startsWith?.('vote') && battle.voteEndsAt && (
                <span className="info-pill tag-vote">
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
              Commands: !battle Song Name Artist | !vote A/B
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
        Queue empty (use !battle Song Name Artist or Search).
      </div>
    );
  }
  return (
    <div className="queue-list-neo glass-soft">
      <div className="queue-title">Queue ({queue.length})</div>
      {queue.map((t, i) => {
        const img = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url;
        const requestedBy = t._requestedBy?.name || t._requestedBy?.username || '';
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
              {requestedBy && (
                <div className="queue-requester">Requested by {requestedBy}</div>
              )}
            </div>
            {t._noPreview && <span className="queue-badge">no preview</span>}
          </div>
        );
      })}
    </div>
  );
}
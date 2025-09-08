import React, { useCallback } from 'react';
import { useAppContext } from './context/AppContext.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ChatTicker from './components/ChatTicker.jsx';
import SpotifyTrackSearchModal from './components/SpotifyTrackSearchModal.jsx';

export default function App() {
  const ctx = useAppContext();

  if (!ctx) {
    return (
      <div style={{
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#0c0f14',
        minHeight: '100vh',
        color: '#fff'
      }}>
        <h2 style={{ marginTop: 0 }}>Context Error</h2>
        <p style={{ maxWidth: 480, lineHeight: 1.4 }}>
          App is not wrapped in &lt;AppProvider&gt;. Ensure main.jsx wraps &lt;App /&gt;.
        </p>
      </div>
    );
  }

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
    spotifyPlayer
  } = ctx;

  const startBattle = useCallback(() => {
    nextBattle();
  }, [nextBattle]);

  const openSearch = () => setModalOpen(true);
  const closeSearch = () => setModalOpen(false);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '300px 1fr 340px',
      gap: '1rem',
      height: '100vh',
      padding: '1rem',
      background: '#0c0f14',
      color: '#fafafa',
      boxSizing: 'border-box',
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Left column: Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SettingsPanel />
      </div>

      {/* Center column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={startBattle}>{battle ? 'Next Battle' : 'Start Battle'}</button>
            <button className="btn-outline" onClick={forceNextStage}>Skip Stage</button>
          <button className="btn-outline" onClick={togglePause}>{battle?.paused ? 'Resume' : 'Pause'}</button>
          <button className="btn-outline" onClick={openSearch}>Search Tracks</button>
          {!authState && (
            <button className="btn-outline" onClick={beginSpotifyAuth}>Login Spotify</button>
          )}
          {authState && !hasScopes && (
            <button className="btn-outline" onClick={beginSpotifyAuth}>Re-Auth Scopes</button>
          )}
        </div>

        <BattleView battle={battle} />
        <QueueView queue={queue} />

        <div style={{ fontSize: '0.5rem', opacity: 0.55 }}>
          Player: {spotifyPlayer?.ready ? 'Ready' : 'Not Ready'}
          {spotifyPlayer?.deviceId && ` (${spotifyPlayer.deviceId.slice(0, 8)}...)`}
          {spotifyPlayer?.error && <span style={{ color: '#ff6b6b' }}> Error: {spotifyPlayer.error}</span>}
          {' '}Scopes: {hasScopes ? 'OK' : 'Missing'}
        </div>
      </div>

      {/* Right column: Chat */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: '1rem' }}>
        <div style={{
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10,
          padding: '0.6rem',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}>
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
            } else {
              console.warn('[App] addTrack not available.');
            }
          }}
        />
      )}
    </div>
  );
}

/* --- Subcomponents --- */
function BattleView({ battle }) {
  if (!battle) {
    return (
      <div style={{
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '0.7rem',
        fontSize: '0.65rem',
        opacity: 0.65
      }}>
        No active battle. Queue tracks or start one.
      </div>
    );
  }
  const votesA = battle.votes?.a?.size || 0;
  const votesB = battle.votes?.b?.size || 0;
  return (
    <div style={{
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 10,
      padding: '0.9rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', opacity: 0.75 }}>
        <span>Stage: {battle.stage}</span>
        {battle.round1Leader && <span>Leader: {battle.round1Leader.toUpperCase()}</span>}
        {battle.winner && <span style={{ color: '#4ade80' }}>Winner: {battle.winner.toUpperCase()}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <TrackCard track={battle.a} label="A" votes={votesA} highlight={battle.winner === 'a'} />
        <TrackCard track={battle.b} label="B" votes={votesB} highlight={battle.winner === 'b'} />
      </div>
      <ProgressHint stage={battle.stage} />
    </div>
  );
}

function TrackCard({ track, label, votes, highlight }) {
  if (!track) return null;
  const img = track.album?.images?.[0]?.url;
  return (
    <div style={{
      border: '1px solid ' + (highlight ? '#4ade80' : 'rgba(255,255,255,0.1)'),
      borderRadius: 8,
      padding: '0.55rem',
      display: 'flex',
      gap: '0.55rem',
      alignItems: 'center',
      background: highlight ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)'
    }}>
      <div style={{ width: 46, height: 46, borderRadius: 6, overflow: 'hidden', background: '#111', flexShrink: 0 }}>
        {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5rem', opacity: 0.55 }}>
          <span>Side {label}</span>
          <span>Votes {votes}</span>
        </div>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: '0.85rem' }}>{track.name}</div>
        <div style={{ fontSize: '0.5rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(track.artists || []).map(a => a.name).join(', ')}
        </div>
      </div>
    </div>
  );
}

function ProgressHint({ stage }) {
  const map = {
    intro: 'Battle about to begin...',
    round1A: 'Side A first segment',
    round1B: 'Side B first segment',
    round2A: 'Leader second segment',
    round2B: 'Challenger second segment',
    finished: 'Battle finished'
  };
  const hint = map[stage];
  if (!hint) return null;
  return <div style={{ fontSize: '0.5rem', opacity: 0.5 }}>{hint}</div>;
}

function QueueView({ queue }) {
  if (!queue?.length) {
    return (
      <div style={{
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '0.55rem',
        fontSize: '0.55rem',
        opacity: 0.6
      }}>
        Queue empty (use !battle or Search).
      </div>
    );
  }
  return (
    <div style={{
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10,
      padding: '0.55rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      maxHeight: 180,
      overflowY: 'auto'
    }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 600, opacity: 0.8 }}>
        Queue ({queue.length})
      </div>
      {queue.map((t, i) => {
        const img = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url;
        return (
          <div key={t.id || i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <div style={{ width: 30, height: 30, borderRadius: 4, overflow: 'hidden', background: '#111', flexShrink: 0 }}>
              {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.55rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.name}
              </div>
              <div style={{ fontSize: '0.45rem', opacity: 0.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(t.artists || []).map(a => a.name).join(', ')}
              </div>
            </div>
            {t._noPreview && (
              <span style={{ fontSize: '0.45rem', background: '#3a2a2a', padding: '2px 4px', borderRadius: 4, opacity: 0.7 }}>
                no preview
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from './context/AppContext.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
// Safe import pattern in case ChatTicker is a named export
import ChatTickerDefault, * as ChatTickerModule from './components/ChatTicker.jsx';
import SpotifyTrackSearchModal from './components/SpotifyTrackSearchModal.jsx';
import VoteOverlay from './components/VoteOverlay.jsx';
import WinnerOverlay from './components/WinnerOverlay.jsx';
import WinnerFocus from './components/WinnerFocus.jsx';
import GiftBanner from './components/GiftBanner.jsx';
import HypeMeter from './components/HypeMeter.jsx';
import NeoArena from './components/arena/NeoArena.jsx';
import ThreeBackdrop from './components/FX/ThreeBackdrop.jsx';
import ParticleField from './components/FX/ParticleField.jsx';

const ChatTicker = ChatTickerDefault || ChatTickerModule.ChatTicker || null;

export default function App() {
  const ctx = useAppContext();
  if (!ctx) return <div style={{ padding: '2rem', color: '#fff' }}>Missing AppContext</div>;

  const {
    queue,
    addTrack,
    tryStartBattle,
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
    reducedMotion,
    hypePulse
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

  const openSearch = () => typeof setModalOpen === 'function' && setModalOpen(true);
  const closeSearch = () => typeof setModalOpen === 'function' && setModalOpen(false);

  const votesA = battle?.voteTotals?.a || 0;
  const votesB = battle?.voteTotals?.b || 0;

  const stageLabel = useMemo(() => {
    if (!battle) return 'Ready';
    const s = battle.stage;
    if (s === 'finished') return 'Finished';
    if (s === 'winner') return 'Winner';
    if (s === 'victory_play') return 'Victory Play';
    if (s?.startsWith?.('vote')) return 'Voting';
    if (s?.includes?.('r1')) return 'Round 1';
    if (s?.includes?.('r2')) return 'Round 2';
    return s || 'Active';
  }, [battle]);

  function getBattleTracks(b) {
    if (!b) return { left: null, right: null };
    const candidates = [
      { left: b.a, right: b.b },
      { left: b.a?.track, right: b.b?.track },
      { left: b.left?.track, right: b.right?.track },
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

  const pulseA = (hypePulse?.a || 0) % 2 === 1;
  const pulseB = (hypePulse?.b || 0) % 2 === 1;

  // Chat auto-scroll with MutationObserver for reliability
  const chatScrollRef = useRef(null);
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const scrollToBottom = () => { el.scrollTop = el.scrollHeight; };
    const observer = new MutationObserver(scrollToBottom);
    observer.observe(el, { childList: true, subtree: true });
    scrollToBottom();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-root">
      {visualFxEnabled && !reducedMotion && (
        <ThreeBackdrop
          mode={
            !battle ? 'idle'
            : battle.stage === 'winner' ? 'finale'
            : battle.stage === 'victory_play' ? 'victory'
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
              <div className="brand">SongSmackdown</div>
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

          {/* Larger, centered queue */}
          <QueueView queue={queue} />

          <div className="arena-wrapper" style={{ position: 'relative', marginTop: 12 }}>
            <NeoArena />
            <VoteOverlay />
            <WinnerOverlay />
            <WinnerFocus />
            <GiftBanner />

            {/* Requested-by badges overlay */}
            {battle && (requesterLeft || requesterRight) && (battle.stage?.startsWith?.('r') || battle.stage === 'winner') && (
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
                  <span
                    className="value"
                    style={pulseA ? { textShadow: '0 0 12px rgba(0,231,255,0.9)' } : null}
                  >
                    {String(votesA).padStart(2, '0')}
                  </span>
                </div>
                <div className="divider" />
                <div className="score right">
                  <span className="label">B</span>
                  <span
                    className="value"
                    style={pulseB ? { textShadow: '0 0 12px rgba(255,45,149,0.9)' } : null}
                  >
                    {String(votesB).padStart(2, '0')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Hype meter always visible during an active battle */}
          {battle && <HypeMeter />}

          {battle && (
            <div className="battle-info glass-soft">
              <span className="info-pill"><strong>Stage:</strong> {battle.stage}</span>
              {battle.voteWindow && <span className="info-pill">Vote Window: {battle.voteWindow}/2</span>}
              {battle.winner && (battle.stage === 'winner' || battle.stage === 'finished' || battle.stage === 'victory_play') && (
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

          <div className="player-status">
            Player: {spotifyPlayer?.status}
            {spotifyPlayer?.deviceId && ` (Device ${spotifyPlayer.deviceId.slice(0, 8)}...)`}
            {spotifyPlayer?.error && <span className="err"> Error: {spotifyPlayer.error}</span>}
            {' '}Scopes: {hasScopes ? 'OK' : 'Missing'}
          </div>
        </div>

        {/* Right Column */}
        <div className="layout-right">
          <div className="chat-panel glass-surface" style={{ fontSize: 16 }}>
            <div className="chat-header">Chat</div>
            <div className="chat-body">
              <div className="chat-scroll" ref={chatScrollRef} style={{ maxHeight: '62vh', overflowY: 'auto' }}>
                {ChatTicker ? <ChatTicker limit={80} /> : null}
              </div>
            </div>
            <div className="chat-footer" style={{ fontSize: 14 }}>
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

/* Queue View - centered and larger */
function QueueView({ queue }) {
  if (!queue?.length) {
    return (
      <div className="queue-empty glass-soft" style={{ maxWidth: 900, margin: '8px auto' }}>
        Queue empty (use !battle Song Name Artist or Search).
      </div>
    );
  }
  return (
    <div className="queue-list-neo glass-soft" style={{ maxWidth: 900, margin: '8px auto', padding: '10px 14px', borderRadius: 14 }}>
      <div className="queue-title" style={{ fontWeight: 800, letterSpacing: 0.5, marginBottom: 8 }}>
        Queue ({queue.length})
      </div>
      {queue.map((t, i) => {
        const img = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url;
        const requestedBy = t._requestedBy?.name || t._requestedBy?.username || '';
        return (
          <div key={t.id || i} className="queue-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 6px' }}>
            <div className="queue-art" style={{ width: 54, height: 54, borderRadius: 8, overflow: 'hidden', flex: '0 0 auto' }}>
              {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div className="queue-meta" style={{ flex: 1, minWidth: 0 }}>
              <div className="queue-name" title={t.name} style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.name}
              </div>
              <div className="queue-artists" style={{ fontSize: 13, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(t.artists || []).map(a => a.name).join(', ')}
              </div>
              {requestedBy && (
                <div className="queue-requester" style={{ fontSize: 12, opacity: 0.9 }}>
                  Requested by {requestedBy}
                </div>
              )}
            </div>
            {t._noPreview && <span className="queue-badge" style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.1)' }}>no preview</span>}
          </div>
        );
      })}
    </div>
  );
}
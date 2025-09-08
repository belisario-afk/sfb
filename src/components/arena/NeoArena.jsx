import React, { useMemo, useRef } from 'react';
import { useAppContext } from '../../context/AppContext.jsx';
import useParallaxTilt from '../../hooks/useParallaxTilt.js';

export default function NeoArena() {
  const { battle, visualFxEnabled, reducedMotion } = useAppContext();
  const arenaRef = useRef(null);
  useParallaxTilt(arenaRef, visualFxEnabled && !reducedMotion);

  // Always call hooks before conditional returns to keep hook order stable
  const activeSide = useMemo(() => {
    if (!battle) return null;
    switch (battle.stage) {
      case 'r1A_play': return 'a';
      case 'r1B_play': return 'b';
      case 'r2A_play': return 'a';
      case 'r2B_play': return 'b';
      default: return null;
    }
  }, [battle]);

  let winner = null;
  let loser = null;
  if (battle) {
    winner = battle.stage === 'finished' ? battle.winner : null;
    loser = winner ? (winner === 'a' ? 'b' : 'a') : null;
  }

  if (!battle) {
    return (
      <div className="neo-arena glass-surface" ref={arenaRef}>
        <div className="neo-arena-empty">
          <div className="neo-title">Neo Arena</div>
          <div className="neo-subtitle">Add tracks to start the battle</div>
        </div>
      </div>
    );
  }

  return (
    <div className="neo-arena glass-surface depth-layer" ref={arenaRef}>
      {/* Gradient energy planes */}
      <div className={[
        'energy-backdrop',
        activeSide ? `energy-${activeSide}` : '',
        winner ? 'energy-finale' : '',
        battle.stage.startsWith('vote') ? 'energy-vote' : ''
      ].join(' ')} />
      {/* Center core */}
      <CoreBadge label={
        winner ? 'WINNER' : battle.stage.startsWith('vote') ? 'VOTE' : 'VS'
      } finale={!!winner} voting={battle.stage.startsWith('vote')} />

      {/* Cards */}
      <SideCard
        track={battle.a}
        side="A"
        votes={battle.voteTotals?.a || 0}
        active={activeSide === 'a'}
        winner={winner === 'a'}
        loser={loser === 'a'}
        align="left"
      />
      <SideCard
        track={battle.b}
        side="B"
        votes={battle.voteTotals?.b || 0}
        active={activeSide === 'b'}
        winner={winner === 'b'}
        loser={loser === 'b'}
        align="right"
      />
    </div>
  );
}

function SideCard({ track, side, votes, active, winner, loser, align }) {
  const art = track?.album?.images?.[0]?.url;
  return (
    <div className={`neo-side neo-${align}`}>
      <div className={[
        'neo-card',
        active ? 'is-active' : '',
        winner ? 'is-winner' : '',
        loser ? 'is-loser' : ''
      ].join(' ')}>
        <div className="neo-card-inner">
          <div className="neo-art-wrap">
            {art ? (
              <img src={art} alt={track?.name} className="neo-art" />
            ) : (
              <div className="neo-art-fallback">No Art</div>
            )}
            <div className="neo-art-glow" />
          </div>
          <div className="neo-meta">
            <div className="neo-side-label">
              {side}
              <span className="neo-dot" />
              <span className="neo-votes">{votes} vote{votes === 1 ? '' : 's'}</span>
            </div>
            <div className="neo-title-xl" title={track?.name}>
              {track?.name}
            </div>
            <div className="neo-artists">
              {(track?.artists || []).map(a => a.name).join(', ')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoreBadge({ label, finale, voting }) {
  return (
    <div className={[
      'core-badge',
      finale ? 'is-finale' : '',
      voting ? 'is-voting' : ''
    ].join(' ')}>
      <div className="core-ring" />
      <div className="core-ring second" />
      <div className="core-light" />
      <span className="core-text">{label}</span>
    </div>
  );
}
import React, { useMemo, useRef } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import useParallaxTilt from '../hooks/useParallaxTilt.js';

export default function BattleArena() {
  const { battle, visualFxEnabled, reducedMotion } = useAppContext();
  const arenaRef = useRef(null);
  useParallaxTilt(arenaRef, visualFxEnabled && !reducedMotion);

  if (!battle) {
    return (
      <div className="battle-arena glass-surface" ref={arenaRef}>
        <div className="arena-empty">
          <div className="arena-placeholder">No active battle</div>
        </div>
      </div>
    );
  }

  const activeSide = useMemo(() => {
    switch (battle.stage) {
      case 'r1A_play': return 'a';
      case 'r1B_play': return 'b';
      case 'r2A_play': return 'a';
      case 'r2B_play': return 'b';
      default: return null;
    }
  }, [battle.stage]);

  const winner = battle.stage === 'finished' ? battle.winner : null;
  const loser = winner ? (winner === 'a' ? 'b' : 'a') : null;
  const votesA = battle.voteTotals?.a || 0;
  const votesB = battle.voteTotals?.b || 0;

  return (
    <div className="battle-arena glass-surface depth-layer" ref={arenaRef}>
      <div className={[
        'arena-bg',
        activeSide ? `bg-active-${activeSide}` : '',
        winner ? 'bg-finale' : '',
        battle.stage.startsWith('vote') ? 'bg-vote' : ''
      ].join(' ')} />
      <div className="arena-gradient-overlay" />
      <div className="album-side left">
        <AlbumCard
          track={battle.a}
          side="A"
          isActive={activeSide === 'a'}
          isWinner={winner === 'a'}
          isLoser={loser === 'a'}
          votes={votesA}
        />
      </div>
      <NeonCore
        stage={battle.stage}
        winner={winner}
      />
      <div className="album-side right">
        <AlbumCard
          track={battle.b}
          side="B"
          isActive={activeSide === 'b'}
          isWinner={winner === 'b'}
          isLoser={loser === 'b'}
          votes={votesB}
        />
      </div>
    </div>
  );
}

function AlbumCard({ track, side, isActive, isWinner, isLoser, votes }) {
  const art = track?.album?.images?.[0]?.url;
  return (
    <div className={[
      'album-card',
      isActive ? 'is-active' : '',
      isWinner ? 'is-winner' : '',
      isLoser ? 'is-loser' : ''
    ].join(' ')}>
      <div className="album-inner">
        <div className="album-art-wrap">
          {art
            ? <img src={art} alt={track?.name} className="album-art" />
            : <div className="album-fallback">No Art</div>}
          <div className="album-glow" />
        </div>
        <div className="album-meta">
          <div className="album-side-label">{side} • {votes} vote{votes === 1 ? '' : 's'}</div>
          <div className="album-title" title={track?.name}>{track?.name}</div>
          <div className="album-artists">
            {(track?.artists || []).map(a => a.name).join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}

function NeonCore({ stage, winner }) {
  const label = winner ? 'WIN' : stage.startsWith('vote') ? 'VOTE' : 'VS';
  return (
    <div className={[
      'neon-vs',
      winner ? 'vs-winner' : '',
      stage.startsWith('vote') ? 'vs-vote' : ''
    ].join(' ')}>
      <div className="vs-orb" />
      <div className="vs-orb secondary" />
      <span className="vs-text">{label}</span>
    </div>
  );
}
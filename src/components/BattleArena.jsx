import React, { useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import './battle-animations.css';

export default function BattleArena() {
  const { battle } = useAppContext();

  const activeSide = useMemo(() => {
    if (!battle) return null;
    switch (battle.stage) {
      case 'round1A': return 'a';
      case 'round1B': return 'b';
      case 'round2First': return battle.leader;
      case 'round2Second': return battle.leader === 'a' ? 'b' : 'a';
      default: return null;
    }
  }, [battle]);

  if (!battle) {
    return (
      <div className="arena-empty">
        <div className="arena-placeholder">No active battle</div>
      </div>
    );
  }

  const a = battle.a;
  const b = battle.b;

  const winnerSide = battle.stage === 'finished' ? battle.winner : null;
  const loserSide = winnerSide ? (winnerSide === 'a' ? 'b' : 'a') : null;

  return (
    <div className="battle-arena">
      <BackgroundReactive activeSide={activeSide} winner={winnerSide} />

      <div className="album-side left">
        <AlbumCard
          track={a}
          side="A"
          active={activeSide === 'a'}
          winner={winnerSide === 'a'}
          loser={loserSide === 'a'}
          leader={battle.leader === 'a'}
        />
      </div>

      <NeonVS
        stage={battle.stage}
        leader={battle.leader}
        winner={winnerSide}
      />

      <div className="album-side right">
        <AlbumCard
          track={b}
          side="B"
          active={activeSide === 'b'}
          winner={winnerSide === 'b'}
          loser={loserSide === 'b'}
          leader={battle.leader === 'b'}
        />
      </div>
    </div>
  );
}

function AlbumCard({ track, side, active, winner, loser, leader }) {
  const art = track?.album?.images?.[0]?.url;
  return (
    <div
      className={[
        'album-card',
        active ? 'is-active' : '',
        winner ? 'is-winner' : '',
        loser ? 'is-loser' : '',
        leader && !winner ? 'is-leader' : ''
      ].join(' ')}
    >
      <div className="album-inner">
        <div className="album-art-wrap">
          {art
            ? <img src={art} alt={track?.name} className="album-art" />
            : <div className="album-fallback">No Art</div>}
          <div className="album-glow" />
        </div>
        <div className="album-meta">
          <div className="album-side-label">{side}</div>
          <div className="album-title" title={track?.name}>{track?.name}</div>
          <div className="album-artists">
            {(track?.artists || []).map(a => a.name).join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}

function NeonVS({ stage, leader, winner }) {
  return (
    <div className={[
      'neon-vs',
      stage === 'intro' ? 'vs-intro' : '',
      winner ? 'vs-winner' : '',
      leader && !winner ? 'vs-leader-known' : ''
    ].join(' ')}
    >
      <div className="vs-glow" />
      <span className="vs-text">{winner ? 'WIN' : 'VS'}</span>
    </div>
  );
}

function BackgroundReactive({ activeSide, winner }) {
  // Could hook into audio analyser; here we vary classes
  return (
    <div className={[
      'arena-bg',
      activeSide ? `bg-active-${activeSide}` : '',
      winner ? 'bg-finale' : ''
    ].join(' ')}
    />
  );
}
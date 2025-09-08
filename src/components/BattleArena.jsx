import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

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
      <div className="battle-arena">
        <div className="arena-empty">
          <div className="arena-placeholder">No active battle</div>
        </div>
      </div>
    );
  }

  const winner = battle.stage === 'finished' ? battle.winner : null;
  const loser = winner ? (winner === 'a' ? 'b' : 'a') : null;

  return (
    <div className="battle-arena">
      <div className={[
        'arena-bg',
        activeSide ? `bg-active-${activeSide}` : '',
        winner ? 'bg-finale' : ''
      ].join(' ')} />
      <div className="album-side left">
        <AlbumCard
          track={battle.a}
          side="A"
          isActive={activeSide === 'a'}
          isWinner={winner === 'a'}
          isLoser={loser === 'a'}
          isLeader={battle.leader === 'a'}
          votes={battle.voteCounts?.a ?? battle.votes?.a?.size ?? 0}
        />
      </div>
      <NeonVS
        stage={battle.stage}
        winner={winner}
        leaderKnown={!!battle.leader && !winner}
      />
      <div className="album-side right">
        <AlbumCard
          track={battle.b}
          side="B"
          isActive={activeSide === 'b'}
          isWinner={winner === 'b'}
          isLoser={loser === 'b'}
          isLeader={battle.leader === 'b'}
          votes={battle.voteCounts?.b ?? battle.votes?.b?.size ?? 0}
        />
      </div>
    </div>
  );
}

function AlbumCard({ track, side, isActive, isWinner, isLoser, isLeader, votes }) {
  const art = track?.album?.images?.[0]?.url;
  return (
    <div className={[
      'album-card',
      isActive ? 'is-active' : '',
      isWinner ? 'is-winner' : '',
      isLoser ? 'is-loser' : '',
      isLeader && !isWinner ? 'is-leader' : ''
    ].join(' ')}>
      <div className="album-inner">
        <div className="album-art-wrap">
          {art
            ? <img src={art} alt={track?.name} className="album-art" />
            : <div className="album-fallback">No Art</div>}
          <div className="album-glow" />
        </div>
        <div className="album-meta">
          <div className="album-side-label">{side} • {votes} vote{votes===1?'':'s'}</div>
          <div className="album-title" title={track?.name}>{track?.name}</div>
          <div className="album-artists">
            {(track?.artists || []).map(a => a.name).join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}

function NeonVS({ stage, winner, leaderKnown }) {
  return (
    <div className={[
      'neon-vs',
      stage === 'intro' ? 'vs-intro' : '',
      winner ? 'vs-winner' : '',
      leaderKnown && !winner ? 'vs-leader-known' : ''
    ].join(' ')}>
      <span className="vs-text">{winner ? 'WIN' : 'VS'}</span>
    </div>
  );
}
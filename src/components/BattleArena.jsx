import React from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { NO_PREVIEW_MODE } from '../config/battleConfig.js';

export default function BattleArena() {
  const { battle } = useAppContext();

  if (!battle) {
    return (
      <div className="panel" style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center'}}>
        <div style={{opacity:0.5, fontSize:'0.75rem'}}>Awaiting battle...</div>
      </div>
    );
  }

  const StageOverlay = ({ track, side }) => {
    if (!track?._noPreview) return null;
    let label = 'Silent';
    if (NO_PREVIEW_MODE === 'beep') label = 'Tone Fallback';
    else if (NO_PREVIEW_MODE === 'noise') label = 'Noise Fallback';
    return (
      <div style={{
        position:'absolute',
        top:6,
        right:6,
        background:'rgba(0,0,0,0.45)',
        fontSize:'0.55rem',
        padding:'3px 6px',
        borderRadius:4,
        letterSpacing:'0.5px',
        backdropFilter:'blur(3px)'
      }}>
        {label}
      </div>
    );
  };

  const Card = ({ track, side }) => (
    <div className="battle-card">
      <div style={{position:'relative'}}>
        <img
          src={track.album.images?.[1]?.url || track.album.images?.[0]?.url}
          alt={track.name}
          style={{width:'100%', borderRadius:8}}
        />
        <StageOverlay track={track} side={side} />
      </div>
      <div className="battle-meta">
        <strong>{track.name}</strong>
        <span>{track.artists.map(a=>a.name).join(', ')}</span>
      </div>
    </div>
  );

  return (
    <div className="panel battle-arena">
      <div className="battle-grid">
        <Card track={battle.a} side="a" />
        <Card track={battle.b} side="b" />
      </div>
      <div className="battle-stage-indicator">
        Stage: {battle.stage}
      </div>
    </div>
  );
}
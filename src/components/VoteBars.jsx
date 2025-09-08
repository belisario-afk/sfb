import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function VoteBars({ battle }) {
  const { battle: b } = useAppContext();

  const { aVotes, bVotes, total, percentA, percentB } = useMemo(() => {
    if (!b) return { aVotes:0, bVotes:0, total:0, percentA:0, percentB:0 };
    const a = b.votes.a.size;
    const vB = b.votes.b.size;
    const total = a + vB;
    const pA = total === 0 ? 0 : (a / total) * 100;
    const pB = total === 0 ? 0 : (vB / total) * 100;
    return { aVotes: a, bVotes: vB, total, percentA: pA, percentB: pB };
  }, [b]);

  if (!b?.a || !b?.b) return null;

  return (
    <div style={{display:'flex', flexDirection:'column', gap:'0.35rem'}}>
      <div style={{display:'flex', gap:'0.5rem'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.6rem', letterSpacing:'0.6px'}}>
            <span>A: {b.a.name}</span><span>{aVotes} votes</span>
          </div>
          <div className="health-bar">
            <div className="health-fill" style={{width: percentA + '%'}}>{percentA.toFixed(0)}%</div>
          </div>
        </div>
        <div style={{flex:1}}>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.6rem', letterSpacing:'0.6px'}}>
            <span>B: {b.b.name}</span><span>{bVotes} votes</span>
          </div>
          <div className="health-bar">
            <div className="health-fill" style={{width: percentB + '%'}}>{percentB.toFixed(0)}%</div>
          </div>
        </div>
      </div>
      <div style={{fontSize:'0.55rem', textAlign:'center', opacity:0.7}}>
        Stage: {b.stage} {b.paused && '(Paused)'}
      </div>
    </div>
  );
}
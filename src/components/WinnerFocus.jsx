import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

/**
 * Focused winner visualizer displayed during 'victory_play'.
 * Shows large album art and a simple animated equalizer.
 */
export default function WinnerFocus() {
  const { battle } = useAppContext() || {};
  if (!battle || battle.stage !== 'victory_play' || !battle.winner) return null;

  const winSide = battle.winner; // 'a' or 'b'
  const winTrack = useMemo(() => {
    const t = battle[winSide];
    return t?.track || t || null;
  }, [battle, winSide]);

  const art =
    winTrack?.album?.images?.[0]?.url ||
    winTrack?.album?.images?.[1]?.url ||
    winTrack?.album?.images?.[2]?.url ||
    '';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {art && <img src={art} alt="" style={styles.art} />}
        <div style={styles.title} title={winTrack?.name}>{winTrack?.name}</div>
        <div style={styles.artists}>{(winTrack?.artists || []).map(a => a.name).join(', ')}</div>
        <Bars color={winSide === 'a' ? '#00E7FF' : '#FF2D95'} />
      </div>
    </div>
  );
}

function Bars({ color = '#00E7FF' }) {
  return (
    <div style={styles.barsWrap}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} style={{
          ...styles.bar,
          background: color,
          animationDelay: (i * 60) + 'ms'
        }} />
      ))}
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 12
  },
  card: {
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    padding: '20px 24px',
    borderRadius: '14px',
    minWidth: '280px',
    maxWidth: '80vw',
    textAlign: 'center',
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    animation: 'focusPop 400ms ease-out'
  },
  art: {
    width: '220px',
    height: '220px',
    objectFit: 'cover',
    borderRadius: '10px',
    margin: '6px auto 10px',
    display: 'block',
    boxShadow: '0 10px 26px rgba(0,0,0,0.45)'
  },
  title: {
    fontSize: 18,
    fontWeight: 800
  },
  artists: {
    fontSize: 13,
    opacity: 0.9,
    marginTop: 2,
    marginBottom: 10
  },
  barsWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    height: 40
  },
  bar: {
    width: 6,
    height: 10,
    borderRadius: 3,
    opacity: 0.95,
    animation: 'barDance 600ms ease-in-out infinite alternate'
  }
};

// Inject keyframes once
const styleElId = 'winner-focus-style';
if (typeof document !== 'undefined' && !document.getElementById(styleElId)) {
  const el = document.createElement('style');
  el.id = styleElId;
  el.textContent = `
@keyframes focusPop {
  0% { transform: scale(0.94); opacity: 0; }
  60% { transform: scale(1.02); opacity: 1; }
  100% { transform: scale(1.0); opacity: 1; }
}
@keyframes barDance {
  0% { transform: scaleY(0.6); }
  100% { transform: scaleY(1.8); }
}
`;
  document.head.appendChild(el);
}
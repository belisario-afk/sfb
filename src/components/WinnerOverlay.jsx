import React from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function WinnerOverlay() {
  const { battle } = useAppContext() || {};
  if (!battle || battle.stage !== 'winner') return null;

  const winnerSide = battle.winner; // 'a' | 'b' | null (tie)
  const trackA = battle.a?.track || battle.a;
  const trackB = battle.b?.track || battle.b;

  const isTie = !winnerSide;
  const winTrack = winnerSide === 'a' ? trackA : trackB;
  const requestedBy =
    winTrack?._requestedBy?.name ||
    winTrack?._requestedBy?.username ||
    '';

  const art =
    winTrack?.album?.images?.[1]?.url ||
    winTrack?.album?.images?.[0]?.url ||
    '';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>{isTie ? 'TIE' : 'WINNER!'}</div>
        {!isTie && (
          <>
            {art && <img src={art} alt="" style={styles.art} />}
            <div style={styles.title} title={winTrack?.name}>{winTrack?.name}</div>
            <div style={styles.artists}>
              {(winTrack?.artists || []).map(a => a.name).join(', ')}
            </div>
            {requestedBy && (
              <div style={styles.requested}>
                Requested by {requestedBy}
              </div>
            )}
          </>
        )}
        {isTie && (
          <div style={styles.tieNote}>No winner this round</div>
        )}
      </div>
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
    zIndex: 10
  },
  card: {
    background: 'rgba(0,0,0,0.65)',
    color: '#fff',
    padding: '18px 22px',
    borderRadius: '12px',
    minWidth: '260px',
    maxWidth: '70vw',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    animation: 'winnerPop 350ms ease-out'
  },
  header: {
    fontSize: '28px',
    fontWeight: 800,
    letterSpacing: '1px',
    marginBottom: '8px',
    color: '#7df9ff'
  },
  art: {
    width: '140px',
    height: '140px',
    objectFit: 'cover',
    borderRadius: '8px',
    margin: '8px auto',
    display: 'block',
    boxShadow: '0 6px 18px rgba(0,0,0,0.4)'
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    marginTop: '6px'
  },
  artists: {
    fontSize: '13px',
    opacity: 0.9,
    marginTop: '2px'
  },
  requested: {
    fontSize: '12px',
    opacity: 0.9,
    marginTop: '8px'
  },
  tieNote: {
    fontSize: '14px',
    opacity: 0.95
  }
};

// Inject a minimal keyframe for the pop animation
const styleElId = 'winner-overlay-style';
if (typeof document !== 'undefined' && !document.getElementById(styleElId)) {
  const el = document.createElement('style');
  el.id = styleElId;
  el.textContent = `
@keyframes winnerPop {
  0% { transform: scale(0.94); opacity: 0; }
  60% { transform: scale(1.03); opacity: 1; }
  100% { transform: scale(1.0); opacity: 1; }
}
`;
  document.head.appendChild(el);
}
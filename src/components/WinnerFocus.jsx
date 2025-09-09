import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

/**
 * WinnerFocus: Big celebratory focus during 'victory_play'
 * - Large album art
 * - Requester avatar with crown
 * - Pulsing glow ring + animated equalizer bars
 * - Soft confetti shimmer background
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

  const requester =
    winTrack?._requestedBy?.name ||
    winTrack?._requestedBy?.username ||
    '';

  const avatar =
    winTrack?._requestedBy?.avatar ||
    winTrack?._requestedBy?.image ||
    '';

  const sideColor = winSide === 'a' ? '#00E7FF' : '#FF2D95';
  const sideGrad =
    winSide === 'a'
      ? 'linear-gradient(135deg, #00E7FF 0%, #00FFA3 100%)'
      : 'linear-gradient(135deg, #FF2D95 0%, #A100FF 100%)';

  return (
    <div style={styles.container}>
      {/* shimmer confetti background */}
      <div style={styles.confettiLayer} />
      <div style={{ ...styles.card, borderImage: sideGrad + ' 1' }}>
        <div style={{ ...styles.ring, boxShadow: `0 0 40px ${sideColor}80` }}>
          {art && <img src={art} alt="" style={styles.art} />}
          <div style={{ ...styles.ringPulse, borderColor: sideColor }} />
        </div>

        <div style={styles.metaBlock}>
          <div style={styles.title} title={winTrack?.name}>{winTrack?.name}</div>
          <div style={styles.artists}>{(winTrack?.artists || []).map(a => a.name).join(', ')}</div>

          <div style={styles.requesterRow}>
            {avatar ? (
              <div style={{ ...styles.avatarWrap, boxShadow: `0 0 16px ${sideColor}80` }}>
                <img src={avatar} alt="" style={styles.avatarImg} />
                <div style={styles.crown}>👑</div>
              </div>
            ) : (
              <div style={styles.crownOnly}>👑</div>
            )}
            {requester && <div style={styles.requesterName}>Requested by {requester}</div>}
          </div>
        </div>

        <Bars color={sideColor} />
      </div>
    </div>
  );
}

function Bars({ color = '#00E7FF' }) {
  return (
    <div style={styles.barsWrap}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{
          ...styles.bar,
          background: color,
          animationDelay: (i * 40) + 'ms',
          height: 10 + (i % 5) * 4
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
    zIndex: 14
  },
  confettiLayer: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%), repeating-linear-gradient(60deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 8px)',
    filter: 'blur(0.2px)'
  },
  card: {
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    padding: '24px 28px',
    borderRadius: '16px',
    minWidth: '340px',
    maxWidth: '88vw',
    textAlign: 'center',
    boxShadow: '0 10px 44px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(10px)',
    border: '2px solid transparent',
    animation: 'focusPop 420ms ease-out'
  },
  ring: {
    position: 'relative',
    width: 280,
    height: 280,
    margin: '4px auto 12px',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06), rgba(255,255,255,0) 65%)'
  },
  ringPulse: {
    position: 'absolute',
    inset: -10,
    borderRadius: '50%',
    border: '2px solid #00E7FF',
    animation: 'pulse 1500ms ease-out infinite'
  },
  art: {
    width: 240,
    height: 240,
    objectFit: 'cover',
    borderRadius: '12px',
    boxShadow: '0 14px 34px rgba(0,0,0,0.5)'
  },
  metaBlock: {
    marginTop: 6,
    marginBottom: 12
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1.1
  },
  artists: {
    fontSize: 14,
    opacity: 0.9,
    marginTop: 4
  },
  requesterRow: {
    marginTop: 10,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarWrap: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: '50%',
    overflow: 'hidden',
    border: '2px solid rgba(255,255,255,0.6)',
    background: 'rgba(255,255,255,0.06)'
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  crown: {
    position: 'absolute',
    top: -8,
    right: -8,
    fontSize: 18,
    transform: 'rotate(20deg)'
  },
  crownOnly: {
    fontSize: 18
  },
  requesterName: {
    fontSize: 13,
    opacity: 0.95
  },
  barsWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    height: 50,
    marginTop: 2
  },
  bar: {
    width: 7,
    borderRadius: 3,
    opacity: 0.95,
    animation: 'barDance 640ms ease-in-out infinite alternate'
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
  100% { transform: scaleY(1.9); }
}
@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.6; }
  70% { transform: scale(1.08); opacity: 0.1; }
  100% { transform: scale(1.12); opacity: 0; }
}
`;
  document.head.appendChild(el);
}
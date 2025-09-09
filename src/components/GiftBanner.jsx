import React from 'react';
import { useAppContext } from '../context/AppContext.jsx';

/**
 * Shows a celebratory banner when a Money Gun (or 500+ coin) gift promotes a song.
 * Expects the PNGs to be placed in:
 *   public/gifts/moneygun.png
 *   public/gifts/coin.png
 */
export default function GiftBanner() {
  const { giftBanner } = useAppContext() || {};
  if (!giftBanner) return null;

  const coinUrl = '/gifts/coin.png';
  const gunUrl = '/gifts/moneygun.png';

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.left}>
          <img src={gunUrl} alt="Money Gun" style={styles.gun} onError={(e) => e.currentTarget.style.display = 'none'} />
        </div>
        <div style={styles.center}>
          <div style={styles.title}>Request Boosted!</div>
          <div style={styles.subtitle}>
            {giftBanner.username || 'Viewer'} sent 500+ and moved their song to the front
          </div>
        </div>
        <div style={styles.right}>
          <div style={styles.coinWrap}>
            <img src={coinUrl} alt="Coin" style={styles.coin} onError={(e) => e.currentTarget.style.display = 'none'} />
            <span style={styles.coinLabel}>500+</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 20
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
    animation: 'giftSlide 240ms ease-out',
  },
  left: {
    display: 'grid',
    placeItems: 'center'
  },
  center: {
    textAlign: 'left',
    maxWidth: '60vw'
  },
  right: {
    display: 'grid',
    placeItems: 'center'
  },
  gun: {
    width: 48,
    height: 48,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))'
  },
  coinWrap: {
    position: 'relative'
  },
  coin: {
    width: 38,
    height: 38,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))'
  },
  coinLabel: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    fontWeight: 800,
    fontSize: 12,
    background: 'linear-gradient(135deg, #FFD867, #FFB400)',
    color: '#4B2A00',
    padding: '2px 6px',
    borderRadius: 999,
    border: '1px solid rgba(0,0,0,0.2)'
  },
  title: {
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0.3
  },
  subtitle: {
    fontSize: 13,
    opacity: 0.95
  }
};

// Inject CSS keyframes once
const styleElId = 'gift-banner-style';
if (typeof document !== 'undefined' && !document.getElementById(styleElId)) {
  const el = document.createElement('style');
  el.id = styleElId;
  el.textContent = `
@keyframes giftSlide {
  from { transform: translateY(-8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
`;
  document.head.appendChild(el);
}
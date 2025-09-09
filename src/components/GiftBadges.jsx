import React from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function GiftBadges() {
  const { badges } = useAppContext() || {};
  if (!badges?.length) return null;

  return (
    <div style={styles.wrap}>
      {badges.slice(-5).map(b => (
        <div key={b.id} style={styles.badge} className="gift-badge">
          {b.avatar && <img src={b.avatar} alt="" style={styles.avatar} />}
          <div style={styles.texts}>
            <div style={styles.name}>{b.name || 'Viewer'}</div>
            <div style={styles.label}>
              {b.label} {b.value ? `(+${b.value})` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    position: 'absolute',
    right: 14,
    top: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 12,
    pointerEvents: 'none'
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 999,
    padding: '6px 10px',
    color: '#fff',
    fontSize: 12,
    boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
    animation: 'giftPop 240ms ease-out'
  },
  avatar: {
    width: 22, height: 22, borderRadius: '50%', objectFit: 'cover'
  },
  texts: { display: 'flex', flexDirection: 'column', lineHeight: 1.1 },
  name: { fontWeight: 700 },
  label: { opacity: 0.9 }
};

// Inject minimal keyframes
const styleElId = 'gift-badges-style';
if (typeof document !== 'undefined' && !document.getElementById(styleElId)) {
  const el = document.createElement('style');
  el.id = styleElId;
  el.textContent = `
@keyframes giftPop {
  0% { transform: translateY(-6px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
`;
  document.head.appendChild(el);
}
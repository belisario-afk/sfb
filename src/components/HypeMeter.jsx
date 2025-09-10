import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

/**
 * Simple per-side hype meter. Shows A and B bars.
 * - Uses context.hype.{a,b} values
 * - Pulses on gift-triggered updates via context.hypePulse
 */
export default function HypeMeter() {
  const ctx = useAppContext();
  const hypeA = ctx?.hype?.a || 0;
  const hypeB = ctx?.hype?.b || 0;
  const pulseA = (ctx?.hypePulse?.a || 0) % 2 === 1; // change toggles pulse
  const pulseB = (ctx?.hypePulse?.b || 0) % 2 === 1;

  const total = Math.max(1, hypeA + hypeB);
  const pctA = Math.round((hypeA / total) * 100);
  const pctB = 100 - pctA;

  return (
    <div className="hype-meter glass-soft" style={styles.wrap}>
      <div style={styles.labelRow}>
        <span>Hype</span>
        <span style={{ opacity: 0.8, fontSize: 12 }}>A: {hypeA} • B: {hypeB}</span>
      </div>
      <div style={styles.barRow}>
        <div style={{
          ...styles.bar,
          ...styles.barA,
          width: pctA + '%',
          boxShadow: pulseA ? '0 0 16px rgba(0, 231, 255, 0.8)' : 'none',
          transition: 'width 250ms ease, box-shadow 300ms ease'
        }} />
        <div style={{
          ...styles.bar,
          ...styles.barB,
          width: pctB + '%',
          boxShadow: pulseB ? '0 0 16px rgba(255, 45, 149, 0.8)' : 'none',
          transition: 'width 250ms ease, box-shadow 300ms ease'
        }} />
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    marginTop: 10,
    padding: '8px 10px',
    borderRadius: 12
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    marginBottom: 6,
    color: '#cfe7ff'
  },
  barRow: {
    display: 'flex',
    height: 10,
    width: '100%',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden'
  },
  bar: {
    height: '100%'
  },
  barA: {
    background: 'linear-gradient(90deg, #00E7FF, #00FFA3)'
  },
  barB: {
    background: 'linear-gradient(90deg, #FF2D95, #A100FF)'
  }
};
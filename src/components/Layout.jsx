import React from 'react';

export default function Layout({ left, center, right, children }) {
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns:'300px 1fr 320px',
      gridTemplateRows:'1fr',
      gap:'0.75rem',
      position:'absolute',
      inset:'0',
      padding:'0.6rem 0.75rem',
      overflow:'hidden'
    }}>
      <div style={{display:'flex', flexDirection:'column', gap:'0.75rem', minHeight:0}}>
        {left}
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:'0.75rem', minHeight:0}}>
        {center}
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:'0.75rem', minHeight:0}}>
        {right}
      </div>
      {children}
    </div>
  );
}
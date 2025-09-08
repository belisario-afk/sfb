import React from 'react';

export default function QueuePanel({ queue }) {
  return (
    <div style={{overflowY:'auto', marginTop:'0.5rem', flex:1}}>
      {queue.length === 0 && <div style={{opacity:0.5, fontSize:'0.75rem'}}>No tracks queued yet.</div>}
      {queue.map((t, i) => (
        <div className="queue-item" key={t.id + i} title={t._noPreview ? 'No 30s preview available' : ''}>
          <img
            src={t.album.images?.[2]?.url || t.album.images?.[0]?.url}
            alt={t.name}
            className="album-cover"
            style={t._noPreview ? {filter:'grayscale(1) opacity(0.6)'} : {}}
          />
          <div className="meta">
            <strong>{t.name}</strong>
            <span>{t.artists.map(a=>a.name).join(', ')}</span>
            <span style={{opacity:0.6, display:'flex', gap:'0.25rem', alignItems:'center'}}>
              {t.id}
              {t._noPreview && <span style={{
                background:'#45222f', padding:'2px 4px', borderRadius:4, fontSize:'0.55rem', letterSpacing:'0.5px'
              }}>NO PREVIEW</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
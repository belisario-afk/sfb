import React from 'react';

export default function QueuePanel({ queue }) {
  return (
    <div style={{overflowY:'auto', marginTop:'0.5rem', flex:1}}>
      {queue.length === 0 && <div style={{opacity:0.5, fontSize:'0.75rem'}}>No tracks queued yet.</div>}
      {queue.map((t, i) => (
        <div className="queue-item" key={t.id + i}>
          <img src={t.album.images?.[2]?.url || t.album.images?.[0]?.url} alt={t.name} className="album-cover" />
            <div className="meta">
              <strong>{t.name}</strong>
              <span>{t.artists.map(a=>a.name).join(', ')}</span>
              <span style={{opacity:0.6}}>{t.id}</span>
            </div>
        </div>
      ))}
    </div>
  );
}
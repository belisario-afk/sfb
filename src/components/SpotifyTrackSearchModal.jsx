import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { searchTracks } from '../lib/spotify.js';

export default function SpotifyTrackSearchModal({ onClose, onSelect }) {
  const { authState } = useAppContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const doSearch = async (e) => {
    e.preventDefault();
    if (!authState?.accessToken) return;
    setBusy(true);
    try {
      const r = await searchTracks(authState.accessToken, query);
      setResults(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal">
      <h3 style={{marginTop:0}}>Search Track</h3>
      {!authState?.accessToken && <div style={{color:'#ff7171', fontSize:'0.75rem', marginBottom:'0.5rem'}}>Spotify auth required</div>}
      <form onSubmit={doSearch} style={{display:'flex', gap:'0.5rem'}}>
        <input
          className="input"
          placeholder="Song name or artist"
          value={query}
          onChange={e=>setQuery(e.target.value)}
        />
        <button className="btn-outline" disabled={busy || !query}>Search</button>
      </form>
      <div style={{maxHeight:'50vh', overflowY:'auto', marginTop:'0.75rem', display:'flex', flexDirection:'column', gap:'0.4rem'}}>
        {results.map(t => (
          <div key={t.id} className="queue-item" style={{cursor:'pointer'}} onClick={()=>onSelect(t)}>
            <img className="album-cover" src={t.album.images?.[2]?.url || t.album.images?.[0]?.url} />
            <div className="meta">
              <strong>{t.name}</strong>
              <span>{t.artists.map(a=>a.name).join(', ')}</span>
              <span style={{opacity:0.6}}>{t.id}</span>
            </div>
          </div>
        ))}
        {results.length === 0 && !busy && <div style={{opacity:0.5, fontSize:'0.7rem'}}>No results yet.</div>}
      </div>
      <div style={{display:'flex', justifyContent:'flex-end', marginTop:'0.75rem'}}>
        <button className="btn-outline" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { searchTracks } from '../lib/spotify.js';
import { playPreview, unlockAudioSystem } from '../lib/audioManager.js';
import { ALLOW_NO_PREVIEW } from '../config/battleConfig.js';

export default function SpotifyTrackSearchModal({ onClose, onSelect }) {
  const { authState } = useAppContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const doSearch = async (q) => {
    setQuery(q);
    if (!q) {
      setResults([]);
      return;
    }
    if (!authState?.accessToken) return;
    setLoading(true);
    try {
      const items = await searchTracks(authState.accessToken, q);
      setResults(items || []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-panel">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{margin:0}}>Search Spotify Tracks</h3>
          <button className="btn-outline" onClick={onClose}>Close</button>
        </div>
        {!ALLOW_NO_PREVIEW && (
          <div style={{marginTop:'0.4rem', fontSize:'0.55rem', color:'#f88'}}>
            Tracks without previews are currently blocked (ALLOW_NO_PREVIEW=false).
          </div>
        )}
        <input
          className="input"
          style={{marginTop:'0.5rem'}}
          placeholder="Type to search..."
          value={query}
          onChange={(e) => doSearch(e.target.value)}
        />
        {loading && <div style={{fontSize:'0.7rem', opacity:0.6, marginTop:'0.5rem'}}>Searching…</div>}
        <div style={{maxHeight:300, overflowY:'auto', marginTop:'0.75rem'}}>
          {results.map(r => {
            const hasPreview = !!r.preview_url;
            const blocked = !hasPreview && !ALLOW_NO_PREVIEW;
            return (
              <div
                key={r.id}
                style={{
                  display:'flex',
                  alignItems:'center',
                  gap:'0.5rem',
                  padding:'0.4rem 0.2rem',
                  borderBottom:'1px solid rgba(255,255,255,0.05)',
                  opacity: blocked ? 0.4 : 1
                }}
              >
                <img
                  src={r.album.images?.[2]?.url || r.album.images?.[0]?.url}
                  alt={r.name}
                  style={{width:40,height:40,objectFit:'cover',borderRadius:4}}
                />
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:'0.75rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                    {r.name}
                  </div>
                  <div style={{fontSize:'0.6rem', opacity:0.55}}>
                    {r.artists.map(a=>a.name).join(', ')}
                  </div>
                  <div style={{fontSize:'0.55rem', opacity:0.45}}>
                    {r.id}
                  </div>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'0.25rem', alignItems:'flex-end'}}>
                  <span style={{
                    fontSize:'0.55rem',
                    padding:'2px 4px',
                    borderRadius:4,
                    background: hasPreview ? '#203a2f' : '#45222f',
                    letterSpacing:'0.5px'
                  }}>
                    {hasPreview ? 'PREVIEW ✔' : 'NO PREVIEW'}
                  </span>
                  <div style={{display:'flex', gap:'0.3rem'}}>
                    {hasPreview && (
                      <button
                        className="btn-outline"
                        style={{fontSize:'0.55rem'}}
                        onClick={async () => {
                          await unlockAudioSystem();
                          playPreview('TEST-'+r.id.slice(0,4), r.preview_url, 8);
                        }}
                      >Test</button>
                    )}
                    <button
                      className="btn"
                      style={{fontSize:'0.55rem'}}
                      disabled={blocked}
                      onClick={() => onSelect(r)}
                    >Add</button>
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && !results.length && query && (
            <div style={{fontSize:'0.65rem', opacity:0.5, padding:'0.5rem'}}>No results.</div>
          )}
        </div>
        {!authState?.accessToken && (
          <div style={{marginTop:'0.75rem', fontSize:'0.6rem', color:'#e08'}}>
            Spotify not connected.
          </div>
        )}
      </div>
    </div>
  );
}
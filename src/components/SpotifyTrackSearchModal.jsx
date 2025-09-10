import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function SpotifyTrackSearchModal({ onClose, onSelect }) {
  const {
    authState,
    beginSpotifyAuth
  } = useAppContext() || {};

  const accessToken = authState?.accessToken || null;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [nextUrl, setNextUrl] = useState(null);
  const [prevUrl, setPrevUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [touched, setTouched] = useState(false);

  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function normalizeTracks(json) {
    const items = json?.tracks?.items || [];
    return items.map(t => ({
      id: t.id,
      name: t.name,
      artists: (t.artists || []).map(a => ({ id: a.id, name: a.name })),
      album: t.album,
      duration_ms: t.duration_ms,
      uri: t.uri || (t.id ? 'spotify:track:' + t.id : undefined),
      preview_url: t.preview_url
    }));
  }

  async function runSearch(urlOverride) {
    if (!accessToken) return;
    setLoading(true);
    setErr('');
    try {
      const url = urlOverride || `https://api.spotify.com/v1/search?type=track&limit=12&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: 'Bearer ' + accessToken
        }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spotify search failed (${res.status}): ${text}`);
      }
      const json = await res.json();
      const tracks = normalizeTracks(json);
      setResults(tracks);
      setNextUrl(json?.tracks?.next || null);
      setPrevUrl(json?.tracks?.previous || null);
    } catch (e) {
      console.warn('[SearchModal] search error', e?.message || e);
      setErr(e?.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e?.preventDefault?.();
    setTouched(true);
    if (!query.trim()) return;
    runSearch();
  }

  function handlePick(track) {
    try {
      onSelect?.(track);
    } catch (e) {
      console.warn('[SearchModal] onSelect failed:', e);
    }
    onClose?.();
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  }

  const disabled = !accessToken;

  return (
    <div style={styles.backdrop} onMouseDown={handleBackdrop}>
      <div ref={dialogRef} style={styles.modal} role="dialog" aria-modal="true" aria-label="Search tracks">
        <div style={styles.header}>
          <div style={{ fontWeight: 800, letterSpacing: 0.4 }}>Search Tracks</div>
          <button className="btn-outline" style={styles.closeBtn} onClick={onClose}>Close</button>
        </div>

        {!accessToken && (
          <div style={styles.authBlock}>
            <div style={{ marginBottom: 8 }}>
              Login with Spotify to search and add tracks to the queue.
            </div>
            <button className="btn-primary" onClick={beginSpotifyAuth}>Login with Spotify</button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form} onMouseDown={e => e.stopPropagation()}>
          <input
            type="text"
            placeholder="Type a song and/or artist (e.g., Blinding Lights The Weeknd)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            autoFocus
            style={styles.input}
          />
          <button className="btn-primary" type="submit" disabled={disabled || !query.trim() || loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {touched && !loading && results.length === 0 && !!query.trim() && !err && (
          <div style={styles.empty}>No results. Try a different query.</div>
        )}
        {err && <div style={styles.error}>Error: {err}</div>}

        <div style={styles.results}>
          {results.map(t => {
            const img =
              t.album?.images?.[1]?.url ||
              t.album?.images?.[0]?.url ||
              t.album?.images?.[2]?.url ||
              '';
            const artists = (t.artists || []).map(a => a.name).join(', ');
            const ms = Number(t.duration_ms || 0);
            const mm = String(Math.floor(ms / 60000)).padStart(1, '0');
            const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
            return (
              <div key={t.id} style={styles.row} onDoubleClick={() => handlePick(t)}>
                <div style={styles.artWrap}>
                  {img ? <img src={img} alt="" style={styles.art} /> : <div style={styles.artPlaceholder} />}
                </div>
                <div style={styles.meta}>
                  <div style={styles.name} title={t.name}>{t.name}</div>
                  <div style={styles.artists} title={artists}>{artists}</div>
                </div>
                <div style={styles.right}>
                  <div style={styles.time}>{mm}:{ss}</div>
                  <button className="btn-outline" onClick={() => handlePick(t)}>Add</button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.pager}>
          <button
            className="btn-outline"
            disabled={!prevUrl || loading || disabled}
            onClick={() => runSearch(prevUrl)}
          >
            Prev
          </button>
          <button
            className="btn-outline"
            disabled={!nextUrl || loading || disabled}
            onClick={() => runSearch(nextUrl)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 1000,
    display: 'grid',
    placeItems: 'center'
  },
  modal: {
    width: 'min(920px, 92vw)',
    maxHeight: '80vh',
    overflow: 'hidden',
    background: 'rgba(15, 17, 22, 0.92)',
    color: '#fff',
    borderRadius: 14,
    boxShadow: '0 24px 88px rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(8px)',
    padding: '14px 14px 10px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  closeBtn: {
    padding: '6px 10px',
    fontSize: 12
  },
  authBlock: {
    background: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 10
  },
  form: {
    display: 'flex',
    gap: 8,
    marginBottom: 10
  },
  input: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    outline: 'none'
  },
  empty: {
    padding: '10px 12px',
    opacity: 0.9
  },
  error: {
    padding: '10px 12px',
    background: 'rgba(255, 68, 68, 0.15)',
    border: '1px solid rgba(255, 68, 68, 0.35)',
    borderRadius: 10,
    marginBottom: 8
  },
  results: {
    borderRadius: 12,
    overflow: 'auto',
    maxHeight: '54vh',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.06)'
  },
  artWrap: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden', flex: '0 0 auto', background: 'rgba(255,255,255,0.08)' },
  art: { width: '100%', height: '100%', objectFit: 'cover' },
  artPlaceholder: { width: '100%', height: '100%', background: 'rgba(255,255,255,0.08)' },
  meta: { flex: 1, minWidth: 0 },
  name: { fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  artists: { fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  right: { display: 'flex', gap: 10, alignItems: 'center' },
  time: { fontSize: 12, opacity: 0.9, width: 42, textAlign: 'right' },
  pager: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 8
  }
};
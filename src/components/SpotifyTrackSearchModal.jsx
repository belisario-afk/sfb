import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo
} from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import {
  searchTracks,
  getTrackById
} from '../lib/spotify.js';
import {
  playPreview,
  unlockAudioSystem
} from '../lib/audioManager.js';
import { ALLOW_NO_PREVIEW } from '../config/battleConfig.js';
import { PLAYBACK_MODE } from '../config/playbackConfig.js';

/**
 * SpotifyTrackSearchModal
 *
 * Enhancements:
 *  - Debounced search (300ms)
 *  - Handles direct Spotify track URL or raw track ID
 *  - Keyboard navigation (ArrowUp / ArrowDown / Enter)
 *  - Abort stale fetches
 *  - Shows why "Add" is disabled
 *  - Falls back to context.addTrack if onSelect not provided
 *  - Distinguishes between "NO PREVIEW" (but playable in FULL mode) vs blocked by config
 *  - Ability to re-use last 5 queries (simple in-memory history)
 */

export default function SpotifyTrackSearchModal({
  onClose,
  onSelect
}) {
  const {
    authState,
    addTrack // fallback if onSelect not passed
  } = useAppContext();

  const accessToken = authState?.accessToken;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [previewingId, setPreviewingId] = useState(null);
  const [busyAddId, setBusyAddId] = useState(null);
  const [history, setHistory] = useState([]);

  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);

  const isFullPlayback = PLAYBACK_MODE === 'FULL';

  // Focus on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  // Clean up pending search
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
      clearTimeout(debounceRef.current);
    };
  }, []);

  const parseTrackIdFromQuery = (q) => {
    if (!q) return null;
    // Handle full Spotify URL
    // Examples:
    // https://open.spotify.com/track/12345?si=...
    // spotify:track:12345
    const urlMatch = q.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)\b/);
    if (urlMatch) return urlMatch[1];
    const uriMatch = q.match(/spotify:track:([A-Za-z0-9]+)/);
    if (uriMatch) return uriMatch[1];
    // Raw probable track id (22 chars usually) - heuristic
    if (/^[A-Za-z0-9]{10,30}$/.test(q)) return q;
    return null;
  };

  // Debounced search trigger
  const handleQueryChange = (val) => {
    setQuery(val);
    setFetchError(null);
    setResults([]);
    setHighlightIndex(-1);

    clearTimeout(debounceRef.current);
    if (!val) {
      return;
    }
    debounceRef.current = setTimeout(() => {
      performSearch(val);
    }, 300);
  };

  // Core search (or direct track fetch)
  const performSearch = useCallback(async (raw) => {
    if (!accessToken) {
      setFetchError('Not authenticated with Spotify.');
      return;
    }
    const q = raw.trim();
    if (!q) {
      setResults([]);
      setFetchError(null);
      return;
    }

    // If it looks like a track id / URL, fetch that one track
    const maybeTrackId = parseTrackIdFromQuery(q);
    if (maybeTrackId) {
      setLoading(true);
      setFetchError(null);
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const track = await getTrackById(accessToken, maybeTrackId);
        setResults(track ? [track] : []);
        if (!track) {
          setFetchError('Track not found for supplied ID / URL.');
        }
      } catch (e) {
        setFetchError(e.message || 'Error fetching track by ID.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Normal search
    setLoading(true);
    setFetchError(null);
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const items = await searchTracks(accessToken, q);
      if (!controller.signal.aborted) {
        setResults(items || []);
        if ((items || []).length === 0) {
          setFetchError('No results.');
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setFetchError(e.message || 'Search failed.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  // Keep simple search history
  useEffect(() => {
    if (!query || loading) return;
    if (fetchError) return;
    // Add to history after results success
    if (results.length > 0) {
      setHistory(h => {
        const exists = h.includes(query);
        const next = exists ? h : [query, ...h];
        return next.slice(0, 5);
      });
    }
  }, [query, loading, fetchError, results]);

  const doPreview = async (track) => {
    if (!track?.preview_url) return;
    try {
      await unlockAudioSystem();
      setPreviewingId(track.id);
      playPreview('SEARCH-' + track.id.slice(0, 6), track.preview_url, 8);
      setTimeout(() => {
        if (previewingId === track.id) setPreviewingId(null);
      }, 8500);
    } catch (e) {
      console.warn('[Preview Error]', e);
      setPreviewingId(null);
    }
  };

  const handleAddTrack = async (track) => {
    if (!track) return;
    setBusyAddId(track.id);
    try {
      const consumer = typeof onSelect === 'function' ? onSelect : addTrack;
      if (typeof consumer === 'function') {
        consumer(track);
      } else {
        console.warn('[SpotifyTrackSearchModal] No valid onSelect or context addTrack function.');
      }
      // Optionally close after add
      // onClose?.();
    } finally {
      setBusyAddId(null);
    }
  };

  const canAdd = (track) => {
    if (!track) return false;
    const hasPreview = !!track.preview_url;
    if (hasPreview) return true;
    if (ALLOW_NO_PREVIEW) return true;
    // If full playback mode, still allow (if you want to override preview requirement)
    if (isFullPlayback && ALLOW_NO_PREVIEW) return true;
    return false;
  };

  const disabledReason = (track) => {
    if (canAdd(track)) return '';
    if (!track.preview_url && !ALLOW_NO_PREVIEW) {
      return 'Preview disabled by config.';
    }
    return 'Unavailable';
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => {
        const n = (i + 1) % results.length;
        scrollIntoView(n);
        return n;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => {
        const n = (i - 1 + results.length) % results.length;
        scrollIntoView(n);
        return n;
      });
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < results.length) {
        const target = results[highlightIndex];
        if (canAdd(target)) handleAddTrack(target);
      } else if (results.length === 1) {
        if (canAdd(results[0])) handleAddTrack(results[0]);
      }
    } else if (e.key === 'Escape') {
      onClose?.();
    }
  };

  const scrollIntoView = (idx) => {
    const wrap = listRef.current;
    if (!wrap) return;
    const child = wrap.querySelector(`[data-idx="${idx}"]`);
    if (child) {
      const cb = child.getBoundingClientRect();
      const wb = wrap.getBoundingClientRect();
      if (cb.top < wb.top) {
        child.scrollIntoView({ block: 'nearest' });
      } else if (cb.bottom > wb.bottom) {
        child.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  const resultSummary = useMemo(() => {
    if (!query) return 'Type to search Spotify tracks or paste a track URL/ID.';
    if (loading) return 'Searching…';
    if (fetchError) return fetchError;
    if (!results.length) return 'No results.';
    return `${results.length} result${results.length === 1 ? '' : 's'}.`;
  }, [query, loading, fetchError, results]);

  return (
    <div className="modal" onKeyDown={handleKeyDown}>
      <div className="modal-panel" style={{
        width:'min(760px, 92vw)',
        maxHeight:'92vh',
        display:'flex',
        flexDirection:'column'
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.75rem'}}>
          <h3 style={{margin:'0 0 0.25rem'}}>Spotify Track Search</h3>
          <button className="btn-outline" onClick={onClose}>Close</button>
        </div>

        {!accessToken && (
          <div style={{fontSize:'0.6rem', color:'#ff7b9b', marginBottom:'0.5rem'}}>
            Not authenticated. Login in Settings to enable search.
          </div>
        )}

        {!ALLOW_NO_PREVIEW && !isFullPlayback && (
          <div style={{marginBottom:'0.45rem', fontSize:'0.55rem', color:'#f88'}}>
            Tracks without previews are blocked (ALLOW_NO_PREVIEW=false). Enable previews or switch to FULL playback with permission.
          </div>
        )}

        <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
          <input
            ref={inputRef}
            className="input"
            placeholder="Search by track / artist / URL / track ID..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            style={{flex:1}}
            autoFocus
          />
          {query && (
            <button
              className="btn-outline"
              onClick={() => {
                setQuery('');
                setResults([]);
                setFetchError(null);
                setHighlightIndex(-1);
                inputRef.current?.focus();
              }}
              style={{fontSize:'0.55rem'}}
            >Clear</button>
          )}
        </div>

        {history.length > 0 && (
            <div style={{marginTop:'0.4rem', display:'flex', gap:'0.35rem', flexWrap:'wrap'}}>
            {history.map(h => (
              <button
                key={h}
                className="btn-outline"
                style={{fontSize:'0.5rem', padding:'2px 6px'}}
                onClick={() => {
                  setQuery(h);
                  handleQueryChange(h);
                }}
              >{h}</button>
            ))}
          </div>
        )}

        <div style={{marginTop:'0.5rem', fontSize:'0.55rem', opacity:0.65}}>
          {resultSummary}
        </div>

        <div
          ref={listRef}
          style={{
            marginTop:'0.6rem',
            overflowY:'auto',
            flex:1,
            minHeight:0,
            border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:6,
            padding:'0.35rem 0.25rem'
          }}
        >
          {results.map((r, idx) => {
            const hasPreview = !!r.preview_url;
            const addDisabled = !canAdd(r);
            const reason = disabledReason(r);
            const highlighted = idx === highlightIndex;
            const art = r.album?.images?.[2]?.url || r.album?.images?.[1]?.url || r.album?.images?.[0]?.url;
            return (
              <div
                key={r.id}
                data-idx={idx}
                onMouseEnter={() => setHighlightIndex(idx)}
                style={{
                  display:'flex',
                  alignItems:'center',
                  gap:'0.55rem',
                  padding:'0.45rem 0.4rem',
                  borderRadius:6,
                  background: highlighted ? 'rgba(255,255,255,0.08)' : 'transparent',
                  transition:'background 0.15s',
                  cursor: addDisabled ? 'not-allowed' : 'pointer',
                  position:'relative'
                }}
              >
                <div style={{
                  width:46,
                  height:46,
                  borderRadius:6,
                  overflow:'hidden',
                  background:'#111',
                  flexShrink:0,
                  outline: previewingId === r.id ? '2px solid #4ade80' : '1px solid rgba(255,255,255,0.08)'
                }}>
                  {art && <img src={art} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{
                    fontSize:'0.72rem',
                    fontWeight:600,
                    whiteSpace:'nowrap',
                    overflow:'hidden',
                    textOverflow:'ellipsis'
                  }}>{r.name}</div>
                  <div style={{
                    fontSize:'0.58rem',
                    opacity:0.65,
                    whiteSpace:'nowrap',
                    overflow:'hidden',
                    textOverflow:'ellipsis'
                  }}>
                    {(r.artists||[]).map(a=>a.name).join(', ')}
                  </div>
                  <div style={{
                    fontSize:'0.5rem',
                    opacity:0.4,
                    whiteSpace:'nowrap',
                    overflow:'hidden',
                    textOverflow:'ellipsis'
                  }}>{r.id}</div>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'0.3rem', alignItems:'flex-end'}}>
                  <div style={{display:'flex', gap:'0.3rem'}}>
                    {hasPreview && (
                      <button
                        type="button"
                        className="btn-outline"
                        style={{
                          fontSize:'0.5rem',
                          opacity: previewingId === r.id ? 1 : 0.9,
                          background: previewingId === r.id ? 'rgba(74,222,128,0.15)' : undefined
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          doPreview(r);
                        }}
                      >{previewingId === r.id ? 'Playing' : 'Test'}</button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      disabled={addDisabled || busyAddId === r.id}
                      style={{fontSize:'0.55rem'}}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!addDisabled) handleAddTrack(r);
                      }}
                    >
                      {busyAddId === r.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  <div style={{
                    fontSize:'0.45rem',
                    opacity: addDisabled ? 0.5 : 0.55,
                    maxWidth:120,
                    textAlign:'right'
                  }}>
                    {hasPreview
                      ? 'Preview OK'
                      : ALLOW_NO_PREVIEW
                        ? (isFullPlayback
                          ? 'Full playback only'
                          : 'No preview (allowed)')
                        : reason || 'No preview'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{marginTop:'0.55rem', display:'flex', justifyContent:'space-between', fontSize:'0.5rem', opacity:0.55}}>
          <span>Enter to add. Esc to close. ↑/↓ to navigate.</span>
          <span>{isFullPlayback ? 'Mode: FULL' : 'Mode: PREVIEW'}</span>
        </div>
      </div>
    </div>
  );
}
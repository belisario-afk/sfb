import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

/**
 * ChatTicker
 * Displays last N chat messages.
 * Defensive against undefined / null messages to avoid slice errors.
 */
export default function ChatTicker({
  messages: externalMessages,
  limit = 25,
  className = ''
}) {
  const { chat } = useAppContext() || {};

  // Derive a messages source priority:
  // 1. Explicit prop
  // 2. chat.messages (if your hook exposes it)
  // 3. chat.history (fallback if older name)
  // 4. empty array
  const rawMessages =
    (Array.isArray(externalMessages) && externalMessages) ||
    (chat && Array.isArray(chat.messages) && chat.messages) ||
    (chat && Array.isArray(chat.history) && chat.history) ||
    [];

  // Ensure always an array
  const safeMessages = Array.isArray(rawMessages) ? rawMessages : [];

  const recent = useMemo(() => {
    // Slice last N (limit) messages
    return safeMessages.slice(-limit);
  }, [safeMessages, limit]);

  if (recent.length === 0) {
    return (
      <div className={`chat-ticker ${className}`} style={{opacity:0.5, fontSize:'0.6rem'}}>
        No chat yet.
      </div>
    );
  }

  return (
    <div className={`chat-ticker ${className}`}>
      {recent.map((m, i) => {
        // Guard unknown structure
        const user = (m && (m.user || m.username || 'anon')).toString();
        const text = (m && (m.text || m.message || '')).toString();
        const id = m?.id || `${i}-${user}-${text.slice(0,10)}`;
        return (
          <div key={id} className="chat-line" style={{display:'flex', gap:'0.4rem', fontSize:'0.65rem'}}>
            <span style={{color:'#7dd3fc'}}>{user}:</span>
            <span>{text}</span>
          </div>
        );
      })}
    </div>
  );
}
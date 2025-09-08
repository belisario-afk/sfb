import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

/**
 * ChatTicker
 * Displays the most recent chat messages (default last 25).
 * Safe against missing / undefined chat or messages.
 *
 * Props:
 *  - limit (number)  : how many most recent to show (default 25)
 *  - className (string)
 *  - emptyMessage (string) : custom placeholder when no messages
 *
 * Message object shape expected (flexible):
 *  {
 *    id?: string
 *    user | username: string
 *    text | message: string
 *    ts?: number
 *  }
 */
export default function ChatTicker({
  limit = 25,
  className = '',
  emptyMessage = 'No chat yet.'
}) {
  const { chat } = useAppContext();

  // Derive messages safely
  const base = Array.isArray(chat?.messages) ? chat.messages : [];

  const recent = useMemo(() => {
    if (!base.length) return [];
    return base.slice(-limit);
  }, [base, limit]);

  if (!recent.length) {
    return (
      <div
        className={`chat-ticker ${className}`}
        style={{ opacity: 0.5, fontSize: '0.6rem', padding: '0.25rem 0' }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`chat-ticker ${className}`} style={{display:'flex', flexDirection:'column', gap:'2px'}}>
      {recent.map((m, i) => {
        const user = (m?.user || m?.username || 'anon').toString();
        const text = (m?.text || m?.message || '').toString();
        const key = m?.id || `${i}-${user}-${text.slice(0,10)}`;
        return (
          <div
            key={key}
            className="chat-line"
            style={{
              display:'flex',
              gap:'0.4rem',
              fontSize:'0.65rem',
              whiteSpace:'nowrap',
              overflow:'hidden',
              textOverflow:'ellipsis'
            }}
            title={`${user}: ${text}`}
          >
            <span style={{ color:'#7dd3fc', flexShrink:0 }}>{user}:</span>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}
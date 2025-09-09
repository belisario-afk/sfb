import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function ChatTicker({ limit = 60 }) {
  const { chat } = useAppContext();
  const [lines, setLines] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    if (!chat?.subscribe) return;
    const unsub = chat.subscribe((msg) => {
      setLines(prev => {
        const next = [...prev, {
          id: `${msg.platform}:${msg.userId}:${msg.ts}`,
          name: msg.displayName || msg.username || 'viewer',
          avatar: msg.avatarUrl || msg.avatar || msg.profilePictureUrl || '',
          text: msg.text || ''
        }];
        if (next.length > limit) next.shift();
        return next;
      });
    });
    return () => unsub && unsub();
  }, [chat, limit]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight + 200;
  }, [lines]);

  return (
    <div className="chat-ticker" ref={listRef}>
      {lines.map((l) => (
        <div key={l.id} className="chat-line row">
          <div className="chat-avatar">
            {l.avatar
              ? <img src={l.avatar} alt="" />
              : <div className="chat-avatar-fallback" />}
          </div>
          <div className="chat-msg">
            <span className="chat-name">{l.name}</span>
            <span className="chat-text">{l.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
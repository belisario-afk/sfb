import React from 'react';
import { useAppContext } from '../context/AppContext.jsx';

export default function ChatTicker() {
  const { chatMessages } = useAppContext();
  return (
    <div className="chat-ticker">
      {chatMessages.slice(-100).map((m, i) => (
        <div key={i} style={{display:'flex', gap:'0.4rem'}}>
          <span style={{color:'#7aa2ff'}}>{m.username}</span>
          <span style={{color:'#cdd3e1'}}>{m.message}</span>
        </div>
      ))}
    </div>
  );
}
import { useEffect, useState, useRef } from 'react';
import { startSimulation, stopSimulation } from '../lib/demoChatSimulator.js';
import { connectRelay, disconnectRelay } from '../lib/tiktokClient.js';

/**
 * Provides unified chat ingestion with command parsing.
 * onCommand({ type:'battle'|'vote', ... })
 */
export default function useChat({ mode, relayUrl, onCommand }) {
  const [messages, setMessages] = useState([]);
  const relayRef = useRef(null);

  const pushMessage = (msg) => {
    setMessages(m => [...m.slice(-199), msg]);
    parseCommand(msg);
  };

  const parseCommand = (msg) => {
    const mLower = msg.message.trim();
    if (mLower.startsWith('!battle ')) {
      const arg = mLower.slice('!battle '.length).trim();
      if (!arg) return;
      // track id or link?
      let spotifyId = null;
      if (arg.includes('open.spotify.com/track/')) {
        const parts = arg.split('track/')[1].split(/[?&]/)[0];
        spotifyId = parts;
      } else if (/^spotify:track:/.test(arg)) {
        spotifyId = arg.split(':')[2];
      }
      onCommand({
        type: 'battle',
        query: spotifyId ? null : arg,
        spotifyId,
        username: msg.username
      });
    } else if (mLower === '!vote a') {
      onCommand({ type:'vote', choice:'a', username: msg.username });
    } else if (mLower === '!vote b') {
      onCommand({ type:'vote', choice:'b', username: msg.username });
    }
  };

  useEffect(() => {
    if (mode === 'simulation') {
      startSimulation(pushMessage);
      return () => stopSimulation();
    } else {
      stopSimulation();
    }
    if (mode === 'relay') {
      relayRef.current = connectRelay(relayUrl, pushMessage);
      return () => disconnectRelay(relayRef.current);
    } else {
      disconnectRelay(relayRef.current);
    }
  }, [mode, relayUrl]);

  return { messages };
}
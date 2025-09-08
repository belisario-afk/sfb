import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import useSpotifyAuth from '../hooks/useSpotifyAuth.js';
import useBattleEngine from '../hooks/useBattleEngine.js';
import useChat from '../hooks/useChat.js';
import { searchTopTrackByQuery, getTrackById } from '../lib/spotify.js';
import { generateDemoTracks } from '../lib/demoChatSimulator.js';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [spotifyClientId, setSpotifyClientId] = useState(
    () => localStorage.getItem('spotifyClientId') || '927fda6918514f96903e828fcd6bb576'
  );
  const [chatMode, setChatMode] = useState(() => localStorage.getItem('chatMode') || 'simulation');
  const [relayUrl, setRelayUrl] = useState(() => localStorage.getItem('relayUrl') || 'ws://localhost:4000/ws');
  const [modalOpen, setModalOpen] = useState(false);

  const authState = useSpotifyAuth(spotifyClientId);
  const battleEngine = useBattleEngine();
  const chat = useChat({
    mode: chatMode,
    relayUrl,
    onCommand: (cmd) => handleChatCommand(cmd),
  });

  const handleChatCommand = useCallback(async (cmd) => {
    if (cmd.type === 'battle') {
      let track = null;
      if (!authState?.accessToken) return; // cannot search without token
      if (cmd.spotifyId) {
        track = await getTrackById(authState.accessToken, cmd.spotifyId);
      } else if (cmd.query) {
        track = await searchTopTrackByQuery(authState.accessToken, cmd.query);
      }
      if (track) battleEngine.addTrack(track);
    } else if (cmd.type === 'vote') {
      battleEngine.vote(cmd.choice, cmd.username);
    }
  }, [authState, battleEngine]);

  useEffect(() => {
    localStorage.setItem('spotifyClientId', spotifyClientId);
  }, [spotifyClientId]);

  useEffect(() => {
    localStorage.setItem('chatMode', chatMode);
  }, [chatMode]);

  useEffect(() => {
    localStorage.setItem('relayUrl', relayUrl);
  }, [relayUrl]);

  const addTrackFromSearch = (track) => {
    battleEngine.addTrack(track);
  };

  const addDemoPair = () => {
    if (!authState?.accessToken) return;
    const list = generateDemoTracks();
    list.forEach(t => battleEngine.addTrack(t));
  };

  const forceNextStage = () => battleEngine.forceNextStage();
  const nextBattle = () => battleEngine.tryStartBattle();
  const togglePause = () => battleEngine.togglePause();

  const value = {
    spotifyClientId, setSpotifyClientId,
    authState,
    queue: battleEngine.queue,
    battle: battleEngine.currentBattle,
    addTrackFromSearch,
    chatMessages: chat.messages,
    chatMode, setChatMode,
    relayUrl, setRelayUrl,
    modalOpen, setModalOpen,
    addDemoPair,
    forceNextStage,
    nextBattle,
    togglePause,
    votes: battleEngine.votes
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);
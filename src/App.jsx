import React, { useEffect } from 'react';
import { AppProvider, useAppContext } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import BattleArena from './components/BattleArena.jsx';
import QueuePanel from './components/QueuePanel.jsx';
import ChatTicker from './components/ChatTicker.jsx';
import SpotifyTrackSearchModal from './components/SpotifyTrackSearchModal.jsx';
import PKCEAuthButton from './components/PKCEAuthButton.jsx';
import VoteBars from './components/VoteBars.jsx';
import { AnimatePresence, motion } from 'framer-motion';

const Hotkeys = () => {
  const { battle, forceNextStage, nextBattle, addDemoPair, togglePause } = useAppContext();

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'n') nextBattle();
      if (e.key === 's') forceNextStage();
      if (e.key === 'q') addDemoPair();
      if (e.key === 'p') togglePause();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [battle]);
  return null;
};

const CoreApp = () => {
  const {
    modalOpen,
    setModalOpen,
    queue,
    battle,
    addTrackFromSearch,
    authState,
    chatMode,
    votes
  } = useAppContext();

  return (
    <Layout
      left={
        <>
          <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h3 style={{margin:0}}>Queue</h3>
              <button className="btn-outline" onClick={() => setModalOpen(true)} style={{fontSize:'0.7rem'}}>Add Track</button>
            </div>
            <QueuePanel queue={queue} />
          </div>
          <div className="panel" style={{ maxHeight: 300, minHeight: 200 }}>
            <h3 style={{marginTop:0}}>Chat</h3>
            <ChatTicker />
          </div>
        </>
      }
      center={
        <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem'}}>
            <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
              <img src="./logo.svg" alt="Logo" height={34} />
              <span className="status-pill">{chatMode.toUpperCase()}</span>
              {authState?.accessToken ? <span className="status-pill" style={{background:'#233642'}}>Spotify OK</span> : <span className="status-pill" style={{background:'#45222f'}}>No Spotify</span>}
            </div>
            <div style={{display:'flex', gap:'0.5rem'}}>
              <PKCEAuthButton />
              <button className="btn-outline" onClick={() => setModalOpen(true)}>Search</button>
            </div>
          </div>
          <div style={{flex:1, position:'relative', minHeight:0}}>
            <BattleArena />
            <div style={{position:'absolute', left:0, right:0, bottom:0, padding:'0.5rem 0.75rem', pointerEvents:'none'}}>
              <VoteBars battle={battle} />
            </div>
          </div>
        </>
      }
      right={
        <>
          <SettingsPanel />
        </>
      }
    >
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="overlay"
            initial={{opacity:0}}
            animate={{opacity:1}}
            exit={{opacity:0}}
          >
            <SpotifyTrackSearchModal
              onClose={()=>setModalOpen(false)}
              onSelect={(t) => { addTrackFromSearch(t); setModalOpen(false); }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <Hotkeys />
      <div className="footer">
        Song Fight Battle &copy; 2025 • MIT Licensed
      </div>
    </Layout>
  );
};

export default function App() {
  return (
    <AppProvider>
      <CoreApp />
    </AppProvider>
  );
}
/**
 * Generates pseudo chat events for simulation mode
 */
let interval = null;
const demoUsers = ['alpha','bravo','charlie','delta','echo','foxtrot','gamer','viewer','musicfan','beatlover'];

const sampleTracks = [
  {
    id:'demo1',
    name:'Cyber Pulse',
    artists:[{name:'AI Artist'}],
    album:{ images:[{url:'https://i.scdn.co/image/ab6761610000e5eb5c3d72fe'}, {url:'https://i.scdn.co/image/ab6761610000e5eb5c3d72fe'}, {url:'https://i.scdn.co/image/ab6761610000e5eb5c3d72fe'}]},
    preview_url:'https://p.scdn.co/mp3-preview/9f9ebf2a9ad3'
  },
  {
    id:'demo2',
    name:'Neon Drift',
    artists:[{name:'Sim Artist'}],
    album:{ images:[{url:'https://i.scdn.co/image/ab676161000051740c6aff11'}, {url:'https://i.scdn.co/image/ab676161000051740c6aff11'}, {url:'https://i.scdn.co/image/ab676161000051740c6aff11'}]},
    preview_url:'https://p.scdn.co/mp3-preview/9f9ebf2a9ad3'
  },
  {
    id:'demo3',
    name:'Bass Catalyst',
    artists:[{name:'Demo Producer'}],
    album:{ images:[{url:'https://i.scdn.co/image/ab67616d0000b273789ab'}, {url:'https://i.scdn.co/image/ab67616d0000b273789ab'}, {url:'https://i.scdn.co/image/ab67616d0000b273789ab'}]},
    preview_url:'https://p.scdn.co/mp3-preview/9f9ebf2a9ad3'
  }
];

export function generateDemoTracks() {
  return sampleTracks.map(t => ({...t}));
}

export function startSimulation(push) {
  stopSimulation();
  let tick = 0;
  interval = setInterval(() => {
    tick++;
    const user = demoUsers[Math.floor(Math.random()*demoUsers.length)] + Math.floor(Math.random()*200);
    if (tick % 10 === 1) {
      // send a battle
      const trackName = ['aurora nights', 'galaxy waves', 'vibe engine', 'retro echo'][Math.floor(Math.random()*4)];
      push({ username: user, message: `!battle ${trackName}` });
    } else {
      // vote
      const choice = Math.random() > 0.5 ? 'A' : 'B';
      push({ username: user, message: `!vote ${choice}` });
    }
  }, 1800);
}

export function stopSimulation() {
  if (interval) clearInterval(interval);
  interval = null;
}
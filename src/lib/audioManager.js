const channels = {};

export function playPreview(label, url, durationSeconds=10) {
  stopChannel(label);
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = 0.85;
  audio.play().catch(()=>{});
  channels[label] = audio;
  setTimeout(() => {
    if (channels[label] === audio) {
      audio.pause();
    }
  }, durationSeconds * 1000);
}
export function stopChannel(label) {
  const a = channels[label];
  if (a) {
    try { a.pause(); } catch(e) {}
    delete channels[label];
  }
}
export function stopAll() {
  Object.keys(channels).forEach(k => stopChannel(k));
}
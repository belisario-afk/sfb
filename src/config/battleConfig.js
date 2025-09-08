// Central config for battle behavior regarding tracks without preview.
export const ALLOW_NO_PREVIEW = true;          // Set false to block adding tracks lacking preview_url
// What to do when a track has no preview and is allowed:
// 'silent'  -> nothing plays
// 'beep'    -> short soft tone (duration matches requested segment time)
// 'noise'   -> gentle filtered noise bed for ambience
export const NO_PREVIEW_MODE = 'silent';
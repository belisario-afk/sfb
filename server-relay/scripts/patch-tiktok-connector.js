/**
 * Postinstall hardening for tiktok-live-connector v2.0.7-beta1
 * Fixes crash when webcastObject.giftDetails is undefined in legacy data-converter.
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'tiktok-live-connector',
  'dist',
  'lib',
  '_legacy',
  'data-converter.js'
);

function safeReplace(content) {
  let modified = content;
  modified = modified.replace(
    /webcastObject\.giftDetails\.giftImage/g,
    '(webcastObject.giftDetails && webcastObject.giftDetails.giftImage)'
  );
  modified = modified.replace(
    /if\s*\(\s*webcastObject\.giftDetails\.([a-zA-Z0-9_]+)\s*\)/g,
    'if (webcastObject.giftDetails && webcastObject.giftDetails.$1)'
  );
  return modified;
}

function run() {
  try {
    if (!fs.existsSync(targetFile)) {
      console.log('[Patch] data-converter not found; skipping:', targetFile);
      return;
    }
    const original = fs.readFileSync(targetFile, 'utf8');
    if (original.includes('webcastObject.giftDetails && webcastObject.giftDetails.giftImage')) {
      console.log('[Patch] Already guarded (giftImage); skipping.');
      return;
    }
    const updated = safeReplace(original);
    if (updated !== original) {
      fs.writeFileSync(targetFile, updated, 'utf8');
      console.log('[Patch] Applied guard to legacy data-converter (giftDetails null-safe).');
    } else {
      console.log('[Patch] No changes applied.');
    }
  } catch (e) {
    console.error('[Patch] Failed to patch tiktok-live-connector:', e?.message || e);
    process.exitCode = 0;
  }
}
run();
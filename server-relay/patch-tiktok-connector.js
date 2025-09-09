/**
 * Postinstall hardening for tiktok-live-connector v2.0.7-beta1
 * Fixes crash when webcastObject.giftDetails is undefined in legacy data-converter.
 *
 * This script is intentionally surgical and idempotent. If the code was already
 * patched or the path changes in a future version, it will safely no-op.
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

  // Guard the exact crash site: ".giftDetails.giftImage"
  // Convert: webcastObject.giftDetails.giftImage
  // Into:   (webcastObject.giftDetails && webcastObject.giftDetails.giftImage)
  modified = modified.replace(
    /webcastObject\.giftDetails\.giftImage/g,
    '(webcastObject.giftDetails && webcastObject.giftDetails.giftImage)'
  );

  // Additionally guard common direct accesses that may appear near the crash site.
  // Only replace when used in an "if (...)" condition by adding the lhs existence check.
  // These are safe no-ops if they never appear.
  modified = modified.replace(
    /if\s*\(\s*webcastObject\.giftDetails\.([a-zA-Z0-9_]+)\s*\)/g,
    'if (webcastObject.giftDetails && webcastObject.giftDetails.$1)'
  );

  return modified;
}

function run() {
  try {
    if (!fs.existsSync(targetFile)) {
      console.log('[Patch] tiktok-live-connector data-converter not found; skipping patch:', targetFile);
      return;
    }
    const original = fs.readFileSync(targetFile, 'utf8');
    if (original.includes('webcastObject.giftDetails && webcastObject.giftDetails.giftImage')) {
      console.log('[Patch] Connector already guarded (giftImage); skipping.');
      return;
    }
    const updated = safeReplace(original);
    if (updated !== original) {
      fs.writeFileSync(targetFile, updated, 'utf8');
      console.log('[Patch] Applied guard to tiktok-live-connector legacy data-converter (giftDetails null-safe).');
    } else {
      console.log('[Patch] No changes applied (patterns not found).');
    }
  } catch (e) {
    console.error('[Patch] Failed to patch tiktok-live-connector:', e?.message || e);
    process.exitCode = 0; // Don’t fail install
  }
}

run();
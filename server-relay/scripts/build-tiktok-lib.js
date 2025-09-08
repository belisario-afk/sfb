/**
 * Attempts to build the GitHub-installed tiktok-live-connector if dist/ is missing.
 * This is a best-effort approach and may fail if upstream changes.
 */
const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

function log(msg) {
  console.log('[postinstall]', msg);
}

function run(cmd, cwd) {
  log(`Running: ${cmd} (cwd=${cwd})`);
  execSync(cmd, { stdio: 'inherit', cwd });
}

(function main() {
  try {
    const depPath = join(__dirname, '..', 'node_modules', 'tiktok-live-connector');
    const distIndex = join(depPath, 'dist', 'index.js');
    if (existsSync(distIndex)) {
      log('tiktok-live-connector already built.');
      return;
    }
    if (!existsSync(depPath)) {
      log('tiktok-live-connector dependency not found; skipping build.');
      return;
    }
    // Attempt build
    run('npm install', depPath);
    // Some repos use `build`, some use `compile`
    try {
      run('npm run build', depPath);
    } catch {
      try {
        run('npm run compile', depPath);
      } catch {
        log('No build/compile script worked. Relay will run without TikTok.');
      }
    }
    if (existsSync(distIndex)) {
      log('Build complete: dist/index.js present.');
    } else {
      log('Build did not produce dist/index.js; TikTok relay may not function.');
    }
  } catch (e) {
    log('Build script failed: ' + e.message);
  }
})();
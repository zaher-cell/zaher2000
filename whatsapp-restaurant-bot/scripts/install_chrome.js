const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function isExecutableName(name) {
  const lower = name.toLowerCase();
  return (
    lower === 'chrome' ||
    lower === 'chrome-stable' ||
    lower === 'chrome.exe' ||
    lower === 'headless_shell'
  );
}

function chmodExecutables(startDir) {
  if (!fs.existsSync(startDir)) return 0;
  let count = 0;
  const stack = [startDir];
  const max = 20000;
  let visited = 0;
  while (stack.length && visited < max) {
    const cur = stack.pop();
    visited++;
    let entries;
    try {
      entries = fs.readdirSync(cur);
    } catch (e) {
      continue;
    }
    for (const name of entries) {
      const full = path.join(cur, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (isExecutableName(name)) {
        try {
          fs.chmodSync(full, 0o755);
          console.log(`✅ Set executable perms for ${full}`);
          count++;
        } catch (e) {
          console.warn(`⚠️ Failed setting perms for ${full}: ${e.message}`);
        }
      }
    }
  }
  return count;
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.resolve(repoRoot, '.cache', 'puppeteer');
  ensureDir(cacheDir);

  console.log(`ℹ️ Installing Chrome into cache path: ${cacheDir}`);

  const cmd = 'npx';
  const args = ['puppeteer', 'browsers', 'install', 'chrome', '--path', cacheDir];

  const res = spawnSync(cmd, args, { stdio: 'inherit', timeout: 10 * 60 * 1000 });
  if (res.error) {
    console.error('❌ Failed to run puppeteer browser install:', res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error('❌ puppeteer browsers install exited with status', res.status);
    process.exit(res.status || 1);
  }

  console.log('🔍 Fixing permissions for chrome binaries (if any)...');
  const fixed = chmodExecutables(cacheDir);
  console.log(`🔧 Fixed ${fixed} chrome binary file(s)`);

  // Also try to chmod puppeteer's local chromium if present inside node_modules
  const nmChromium = path.resolve(repoRoot, 'node_modules', 'puppeteer', '.local-chromium');
  const fixed2 = chmodExecutables(nmChromium);
  if (fixed2) console.log(`🔧 Fixed ${fixed2} puppeteer .local-chromium binary file(s)`);

  console.log('✅ install_chrome script finished successfully');
}

main().catch((e) => {
  console.error('❌ install_chrome failed:', e && e.stack ? e.stack : e);
  process.exit(1);
});

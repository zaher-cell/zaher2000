const fs = require("fs");
const path = require("path");

/**
 * Runtime-only Chrome/Chromium detection.
 * This function DOES NOT perform any network downloads or installs.
 * It checks common environment variables, Puppeteer's reported executable (if available),
 * the Puppeteer cache directory, and system paths. It returns the first candidate that
 * exists and is executable (or readable as a fallback).
 *
 * Returns: string|undefined
 */

function isExecutable(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    // On POSIX, check execute bit. On Windows, assume file exists is enough.
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch (e) {
      // Not executable, but maybe readable
      try {
        fs.accessSync(p, fs.constants.R_OK);
        return true;
      } catch (e2) {
        return false;
      }
    }
  } catch (e) {
    return false;
  }
}

function findChromeInDir(startDir) {
  if (!startDir) return undefined;
  try {
    if (!fs.existsSync(startDir)) return undefined;
  } catch (e) {
    return undefined;
  }

  const stack = [startDir];
  const maxEntries = 2000; // avoid pathological recursion
  let visited = 0;

  while (stack.length && visited < maxEntries) {
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
        // Common folders may contain chrome binaries deeper
        stack.push(full);
        continue;
      }

      // file
      const lower = name.toLowerCase();
      // common binary names for chromium/chrome
      if (lower === "chrome" || lower === "chrome-stable" || lower === "chrome.exe" || lower === "headless_shell") {
        if (isExecutable(full)) return full;
      }

      // Some installs put chrome binary inside a folder named chrome-linux64/chrome
      // The check above will find that because the file name equals "chrome".
    }
  }

  return undefined;
}

function findSystemChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (isExecutable(p)) {
        console.log(`✅ [Chrome] وجدت Chrome/Chromium النظامي/المحدد على: ${p}`);
        return p;
      }
    } catch (e) {
      // ignore
    }
  }

  return undefined;
}

async function ensureChromeInstalled() {
  // 1) If the user/deployer explicitly set PUPPETEER_EXECUTABLE_PATH and it's valid, use it.
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) {
    if (isExecutable(explicit)) {
      console.log(`✅ [Chrome] سيتم استخدام PUPPETEER_EXECUTABLE_PATH المحدد: ${explicit}`);
      return explicit;
    } else {
      console.warn(`⚠️ [Chrome] تم إعداد PUPPETEER_EXECUTABLE_PATH لكن الملف غير موجود أو غير قابل للتنفيذ: ${explicit}`);
      // continue to other resolution strategies
    }
  }

  // 2) If puppeteer is available in node_modules, ask it for the executable path.
  try {
    // Try to require the installed puppeteer package. whatsapp-web.js may bring puppeteer as a dependency.
    const puppeteer = require("puppeteer");
    if (puppeteer && typeof puppeteer.executablePath === "function") {
      try {
        const exe = puppeteer.executablePath();
        if (exe && isExecutable(exe)) {
          console.log(`✅ [Chrome] حصلنا على المسار من puppeteer.executablePath(): ${exe}`);
          return exe;
        } else {
          // Sometimes puppeteer.executablePath() returns a packaged helper path that doesn't exist
          console.warn(`⚠️ [Chrome] puppeteer.executablePath() أعاد مساراً لكنه غير قابل للتنفيذ: ${exe}`);
        }
      } catch (e) {
        console.warn(`⚠️ [Chrome] حدث خطأ عند استدعاء puppeteer.executablePath(): ${e && e.message}`);
      }
    }
  } catch (e) {
    // puppeteer not available synchronously — that's fine
  }

  // 3) If a PUPPETEER_CACHE_DIR is configured (Render build command installs browsers there), inspect it.
  const envCache = process.env.PUPPETEER_CACHE_DIR;
  const projectCache = path.resolve(__dirname, "..", ".cache", "puppeteer");
  const cacheCandidates = [envCache, projectCache].filter(Boolean);

  for (const cacheDir of cacheCandidates) {
    try {
      const resolved = path.resolve(cacheDir);
      const exe = findChromeInDir(resolved);
      if (exe) {
        console.log(`✅ [Chrome] وُجد Chrome ضمن مجلد الكاش: ${exe}`);
        return exe;
      }
    } catch (e) {
      // ignore and continue
    }
  }

  // 4) Fallback: check common system paths
  const system = findSystemChrome();
  if (system) return system;

  console.log("ℹ️ [Chrome] لم يُعثر على Chrome/Chromium النظامي أو في مجلد الكاش أثناء وقت التشغيل. لن نبدأ تثبيت خلال وقت التشغيل.");
  return undefined;
}

module.exports = { ensureChromeInstalled };

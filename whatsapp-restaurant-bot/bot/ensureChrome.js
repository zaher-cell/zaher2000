const fs = require("fs");
const path = require("path");

/**
 * Runtime-only Chrome/Chromium detection.
 * This function DOES NOT perform any network downloads or installs.
 * It checks common environment variables and system paths and returns
 * the first candidate that exists (and preferably is executable).
 *
 * Returns: string|undefined
 */
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
      if (fs.existsSync(p)) {
        try {
          fs.accessSync(p, fs.constants.X_OK);
          console.log(`✅ [Chrome] وجدت Chrome/Chromium النظامي على: ${p}`);
          return p;
        } catch (_) {
          // file exists but not executable; return it as a hint
          try {
            fs.accessSync(p, fs.constants.R_OK);
            console.warn(`⚠️ [Chrome] وجدنا ملف عند ${p} لكنه قد لا يكون قابلاً للتنفيذ (الأذونات). سنعيد المسار كاقتراح.`);
            return p;
          } catch (_) {
            // not readable; skip
          }
        }
      }
    } catch (_) {
      // ignore errors and try next candidate
    }
  }

  return undefined;
}

/**
 * ensureChromeInstalled (runtime-safe)
 * - Quick detection of an existing Chrome/Chromium executable.
 * - DOES NOT download or install browsers at runtime.
 * - Returns executable path string or undefined.
 */
async function ensureChromeInstalled() {
  const p = findSystemChrome();
  if (p) return p;

  console.log("ℹ️ [Chrome] لم يُعثر على Chrome/Chromium النظامي أثناء وقت التشغيل. لن نبدأ تثبيت خلال وقت التشغيل.");
  return undefined;
}

module.exports = { ensureChromeInstalled };

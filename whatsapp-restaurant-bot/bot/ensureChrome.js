const path = require("path");

/**
 * يثبّت متصفح Chrome برمجياً عند إقلاع السيرفر بدل الاعتماد على خطوة منفصلة
 * داخل Build Command.
 */
async function ensureChromeInstalled() {
  const { install, detectBrowserPlatform, computeExecutablePath } = require("@puppeteer/browsers");
  const fs = require("fs");

  const cacheDir =
    process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, "..", ".cache", "puppeteer");

  const buildId = process.env.PUPPETEER_CHROME_BUILD_ID || "146.0.7680.31";

  const platform = detectBrowserPlatform();

  if (!platform) {
    console.error("❌ [Chrome] تعذر تحديد نظام التشغيل الحالي — سيتابع Puppeteer بإعداداته الافتراضية");
    return undefined;
  }

  const expectedPath = computeExecutablePath({
    browser: "chrome",
    buildId,
    cacheDir,
    platform
  });

  if (fs.existsSync(expectedPath)) {
    console.log(`✅ [Chrome] موجود مسبقاً على: ${expectedPath}`);
    return expectedPath;
  }

  console.log(`⏳ [Chrome] غير موجود، جاري التثبيت داخل: ${cacheDir} (قد يستغرق دقيقة أول مرة)...`);

  try {
    let lastLoggedPct = -1;

    const installed = await install({
      cacheDir,
      browser: "chrome",
      buildId,
      platform,
      downloadProgressCallback: (downloadedBytes, totalBytes) => {
        if (!totalBytes) return;

        const pct = Math.floor((downloadedBytes / totalBytes) * 100);

        if (pct >= lastLoggedPct + 20) {
          lastLoggedPct = pct;
          console.log(`   [Chrome] تنزيل: ${pct}%`);
        }
      },
    });

    console.log(`✅ [Chrome] تم التثبيت بنجاح على: ${installed.executablePath}`);

    return installed.executablePath;

  } catch (err) {
    console.error(
      "❌ [Chrome] فشل التثبيت البرمجي:",
      err && err.message ? err.message : err
    );

    return undefined;
  }
}

module.exports = { ensureChromeInstalled };
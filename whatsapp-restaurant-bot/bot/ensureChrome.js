const path = require("path");
const fs = require("fs");

/**
 * يثبّت متصفح Chrome برمجياً عند إقلاع السيرفر.
 *
 * يحاول تنزيل Chrome عبر @puppeteer/browsers لكن يضع حد زمني للتنزيل
 * حتى لا يعلق التطبيق عند 99% في بيئات مثل Render. إذا انتهت المهلة
 * نلغِي المحاولة ونعود undefined حتى يستعمل puppeteer إعداداته الافتراضية
 * أو يستفيد من Chrome النظامي (لو مُحدد عبر PATH أو env).
 *
 * يمكن تغيير المهلة عبر المتغير البيئي PUPPETEER_INSTALL_TIMEOUT_MS (ملليثانية).
 *
 * @returns {Promise<string|undefined>} مسار Chrome التنفيذي إذا نجح التثبيت أو التحقق
 */
async function ensureChromeInstalled() {
  const { install, detectBrowserPlatform, computeExecutablePath, resolveBuildId } = require("@puppeteer/browsers");

  const cacheDir =
    process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, "..", ".cache", "puppeteer");

  const platform = detectBrowserPlatform();
  if (!platform) {
    console.error("❌ [Chrome] تعذر تحديد نظام التشغيل الحالي — سيتابع Puppeteer بإعداداته الافتراضية");
    return undefined;
  }

  let buildId;
  try {
    buildId = await resolveBuildId("chrome", platform, process.env.PUPPETEER_CHROME_CHANNEL || "stable");
    console.log(`ℹ️ [Chrome] القناة المطلوبة "stable" تقابل الإصدار: ${buildId}`);
  } catch (err) {
    // نرجع لرقم إصدار Puppeteer الداخلي فقط إذا فشل تحديد قناة "stable" لأي سبب
    buildId = process.env.PUPPETEER_CHROME_BUILD_ID || "146.0.7680.31";
    console.warn(`⚠️ [Chrome] تعذر تحديد إصدار "stable" (${err.message})، سنجرب: ${buildId}`);
  }

  const INSTALL_TIMEOUT_MS = Number(process.env.PUPPETEER_INSTALL_TIMEOUT_MS) || 2 * 60 * 1000; // 2 minutes default

  const attemptOnce = async () => {
    const expectedPath = computeExecutablePath({ browser: "chrome", buildId, cacheDir, platform });

    if (fs.existsSync(expectedPath)) {
      console.log(`✅ [Chrome] موجود مسبقاً على: ${expectedPath}`);
      return expectedPath;
    }

    // لو كان هناك مجلد ناقص من محاولة سابقة فاشلة، نحذفه أولاً حتى لا يخدع
    // install() ويجعلها تتخطى التنزيل الحقيقي
    const buildFolder = path.dirname(path.dirname(expectedPath));
    if (fs.existsSync(buildFolder)) {
      console.log(`🧹 [Chrome] حذف مجلد ناقص من محاولة سابقة: ${buildFolder}`);
      try {
        fs.rmSync(buildFolder, { recursive: true, force: true });
      } catch (ex) {
        console.warn(`⚠️ [Chrome] تعذر حذف المجلد السابق: ${ex.message}`);
      }
    }

    console.log(`⏳ [Chrome] جاري التثبيت داخل: ${cacheDir} (الإصدار ${buildId})...`);
    let lastLoggedPct = -1;

    // Wrap the install() call with a timeout to avoid indefinite hanging (e.g., stuck at 99%)
    const installPromise = install({
      cacheDir,
      browser: "chrome",
      buildId,
      platform,
      downloadProgressCallback: (downloadedBytes, totalBytes) => {
        if (!totalBytes) return;
        const pct = Math.floor((downloadedBytes / totalBytes) * 100);
        if (pct >= lastLoggedPct + 10) {
          lastLoggedPct = pct;
          console.log(`   [Chrome] تنزيل: ${pct}%`);
        }
        // Log when reaching near completion to indicate extraction phase
        if (pct >= 98 && pct < 100) {
          console.log(`   [Chrome] تنزيل قريب من الاكتمال (${pct}%) — قد يبدأ الآن فك ضغط/التحقق`);
        }
      },
    });

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`install() تجاوز مهلة التنفيذ ${INSTALL_TIMEOUT_MS}ms`));
      }, INSTALL_TIMEOUT_MS);
    });

    try {
      // If install() doesn't finish within the timeout we catch and cleanup
      await Promise.race([installPromise, timeoutPromise]);
    } catch (err) {
      // تنظيف أي بقايا قد تكون خلفت محاولة جزئية
      try {
        if (fs.existsSync(buildFolder)) {
          console.log(`🧹 [Chrome] حذف بقايا بعد فشل التثبيت: ${buildFolder}`);
          fs.rmSync(buildFolder, { recursive: true, force: true });
        }
      } catch (ex) {
        console.warn(`⚠️ [Chrome] تعذر حذف بقايا التثبيت: ${ex.message}`);
      }
      throw err;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    // تحقق فعلي — لا نثق أن install() نجح لمجرد عدم رمي خطأ
    if (fs.existsSync(expectedPath)) {
      console.log(`✅ [Chrome] تم التثبيت والتحقق منه على: ${expectedPath}`);
      return expectedPath;
    }

    let dirListing = "(تعذر القراءة)";
    try {
      dirListing = fs.existsSync(buildFolder) ? JSON.stringify(fs.readdirSync(buildFolder)) : "(المجلد غير موجود بعد install)";
    } catch (_) {}
    throw new Error(`اكتمل install() لكن الملف التنفيذي غير موجود فعلياً في ${expectedPath} — محتوى المجلد: ${dirListing}`);
  };

  try {
    return await attemptOnce();
  } catch (err) {
    console.error("❌ [Chrome] فشلت المحاولة الأولى:", err.message);
    console.log("🔁 [Chrome] إعادة محاولة أخيرة...");
    try {
      return await attemptOnce();
    } catch (err2) {
      console.error("❌ [Chrome] فشلت إعادة المحاولة أيضاً:", err2.message);
      console.log("⚠️ [Chrome] لن نوقف السيرفر، سنواصل بدون مسار Chrome مخصّص — دع Puppeteer يحاول استخدام Chrome النظامي أو المسار الافتراضي.");
      return undefined;
    }
  }
}

module.exports = { ensureChromeInstalled };
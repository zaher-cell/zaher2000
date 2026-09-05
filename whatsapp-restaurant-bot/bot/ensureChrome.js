const path = require("path");
const fs = require("fs");

/**
 * تحقق سريع من وجود Chrome/Chromium النظامي في متغيرات البيئة أو مسارات شائعة.
 * يعيد المسار لو وُجد وقابل للتنفيذ، وإلا undefined.
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
          console.log(`✅ [Chrome] وجدت Chrome النظامي على: ${p}`);
          return p;
        } catch (_) {
          try {
            fs.accessSync(p, fs.constants.R_OK);
            console.warn(`⚠️ [Chrome] وجدنا ملف Chrome عند ${p} لكنه قد لا يكون قابلًا للتنفيذ (الأذونات). سنحاول استخدامه.`);
            return p;
          } catch (_) {
            // تجاهل وانتقل للمرشح التالي
          }
        }
      }
    } catch (_) {}
  }

  return undefined;
}

/**
 * يثبّت متصفح Chrome برمجياً عند إقلاع السيرفر.
 * أولاً: حاول استخدام Chrome النظامي إن وُجد. إن لم يوجد، حاول التنزيل (بمهلة أطول، وسجلات أوضح).
 */
async function ensureChromeInstalled() {
  const { install, detectBrowserPlatform, computeExecutablePath, resolveBuildId } = require("@puppeteer/browsers");

  // 1) تحقق سريع من Chrome النظامي أولاً
  const sys = findSystemChrome();
  if (sys) return sys;

  const cacheDir =
    process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, "..", ".cache", "puppeteer");

  // تأكد أن مجلد الـcache موجود وقابل للكتابة (تخزين الملفات المؤقتة)
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    console.warn(`⚠️ [Chrome] تعذر إنشاء مجلد cache ${cacheDir}: ${err.message}`);
  }

  const platform = detectBrowserPlatform();
  if (!platform) {
    console.error("❌ [Chrome] تعذر تحديد نظام التشغيل الحالي — سيتابع Puppeteer بإعداداته الافتراضية");
    return undefined;
  }

  let buildId;
  try {
    buildId = await resolveBuildId("chrome", platform, process.env.PUPPETEER_CHROME_CHANNEL || "stable");
    console.log(`ℹ️ [Chrome] القناة المطلوبة \"stable\" تقابل الإصدار: ${buildId}`);
  } catch (err) {
    buildId = process.env.PUPPETEER_CHROME_BUILD_ID || "146.0.7680.31";
    console.warn(`⚠️ [Chrome] تعذر تحديد إصدار \"stable\" (${err.message})، سنجرب: ${buildId}`);
  }

  // نجعل المهلة أكبر (افتراضي 10 دقائق = 600000 ms). يمكن تغييره عبر env PUPPETEER_INSTALL_TIMEOUT_MS
  const INSTALL_TIMEOUT_MS = Number(process.env.PUPPETEER_INSTALL_TIMEOUT_MS) || 10 * 60 * 1000;

  const attemptOnce = async () => {
    const expectedPath = computeExecutablePath({ browser: "chrome", buildId, cacheDir, platform });

    if (fs.existsSync(expectedPath)) {
      console.log(`✅ [Chrome] موجود مسبقاً على: ${expectedPath}`);
      return expectedPath;
    }

    // نحذف مجلد جزئي سابق إن وجد
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

    const installPromise = install({
      cacheDir,
      browser: "chrome",
      buildId,
      platform,
      downloadProgressCallback: (downloadedBytes, totalBytes) => {
        if (!totalBytes) return;
        const pct = Math.floor((downloadedBytes / totalBytes) * 100);
        // سجل كل 5% لتتبع أدق
        if (pct >= lastLoggedPct + 5) {
          lastLoggedPct = pct;
          console.log(`   [Chrome] تنزيل: ${pct}%`);
        }
        // توضيح أن المرحلة التالية قد تكون فك ضغط/التحقق
        if (pct >= 95 && pct < 100) {
          console.log(`   [Chrome] تنزيل قريب من الاكتمال (${pct}%) — قد يبدأ الآن فك ضغط/التحقق (قد يستغرق وقتًا)`);
        }
      },
    });

    // مهلة أطول + تنظيف بقايا عند الفشل
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`install() تجاوز مهلة التنفيذ ${INSTALL_TIMEOUT_MS}ms`));
      }, INSTALL_TIMEOUT_MS);
    });

    try {
      await Promise.race([installPromise, timeoutPromise]);
    } catch (err) {
      // عند الفشل سجّل محتوى buildFolder لمزيد من التشخيص ثم نظّف
      try {
        if (fs.existsSync(buildFolder)) {
          try {
            const listing = fs.readdirSync(buildFolder);
            console.error(`❌ [Chrome] محتوى buildFolder عند الفشل: ${JSON.stringify(listing)}`);
          } catch (_) {}
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

    // تحقق فعلي
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
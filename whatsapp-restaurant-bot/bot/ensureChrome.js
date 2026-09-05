const path = require("path");
const fs = require("fs");

/**
 * يثبّت متصفح Chrome برمجياً عند إقلاع السيرفر.
 *
 * اكتشفنا من سجلات Render الفعلية (وليس تخميناً) أن مكتبة @puppeteer/browsers
 * تتحقق فقط من وجود مجلد المتصفح، لا من وجود الملف التنفيذي داخله، قبل أن
 * تقرر تخطي التنزيل. فإذا فشل تنزيل سابق (أثناء البناء مثلاً) وترك مجلداً
 * ناقصاً، كل محاولة تالية (بما فيها محاولتنا هنا وقت التشغيل) "تنجح" فوراً
 * بصمت دون تنزيل أي شيء حقيقي، لأنها ترى المجلد موجوداً وتتوقف عند هذا الحد.
 * لذلك: نحذف أي مجلد ناقص قبل إعادة المحاولة، ونتحقق فعلياً من وجود الملف
 * التنفيذي بعد كل محاولة تثبيت، ولا نثق بنجاح install() لمجرد أنه لم يرمِ خطأ.
 *
 * كما نستخدم قناة "stable" الموثوقة بدل رقم إصدار محدد مسبقاً، لأن الإصدار
 * المحدد سلفاً (الذي طلبه Puppeteer المثبت) قد لا تكون له نسخة كاملة منشورة
 * بعد على كل الأنظمة. بما أننا نمرر executablePath صراحة لاحقاً، لا مشكلة
 * في استخدام أي نسخة Chrome تعمل — puppeteer-core لا يفرض تطابقاً صارماً
 * طالما زودناه بالمسار مباشرة.
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
      fs.rmSync(buildFolder, { recursive: true, force: true });
    }

    console.log(`⏳ [Chrome] جاري التثبيت داخل: ${cacheDir} (الإصدار ${buildId})...`);
    let lastLoggedPct = -1;
    await install({
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
      return undefined;
    }
  }
}

module.exports = { ensureChromeInstalled };
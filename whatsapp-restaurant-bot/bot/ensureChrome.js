/**
 * يجهز Chrome/Chromium بطريقة موثوقة على Render دون الاعتماد إطلاقاً على تنزيل
 * Puppeteer التلقائي من الإنترنت — تلك الطريقة فشلت بشكل متكرر ومختلف في كل
 * مرة (أحياناً تتخطى التنزيل بصمت، وأحياناً تصل 99% ثم تفشل في فك الضغط أو
 * التحقق)، والسبب أن Chrome-for-Testing يُنزَّل من شبكة خارجية أثناء البناء
 * أو التشغيل، وهذا غير موثوق على بيئة Render.
 *
 * البديل المعتمد هنا: حزمة @sparticuz/chromium التي توزّع Chromium كاملاً
 * مضغوطاً *داخل* حزمة npm نفسها. تُثبَّت تلقائياً وبشكل موثوق 100% مع
 * "npm install" العادي (نفس الآلية التي نجحت في كل مرة على Render)، ثم
 * تُستخرج محلياً من القرص عند أول استخدام — بدون أي تنزيل شبكي، بدون انتظار
 * طويل، بدون احتمال فشل شبكة أو Timeout.
 *
 * نتحقق هنا فعلياً (وليس بالافتراض) من: وجود الملف، صلاحية التنفيذ، وقدرته
 * على تشغيل متصفح حقيقي فعلاً (launch كامل ثم إغلاق) قبل السماح لواتساب
 * بالبدء. إذا فشل أي جزء، نرمي خطأ واضحاً فوراً — لا حلقات انتظار، لا محاولات
 * متكررة على أمل نجاح مختلف.
 *
 * @returns {Promise<{executablePath: string, args: string[]}>}
 * @throws {Error} رسالة واضحة ومحددة إذا تعذر توفير متصفح صالح وقابل للتشغيل فعلياً
 */
async function ensureChromeReady() {
  const fs = require("fs");
  const chromium = require("@sparticuz/chromium").default;
  const puppeteerCore = require("puppeteer-core");

  console.log("⏳ [Chrome] استخراج Chromium المرفق مع الحزمة (محلي بالكامل، بدون إنترنت)...");
  const executablePath = await chromium.executablePath();

  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error(`[Chrome] لم يُعثر على الملف التنفيذي بعد الاستخراج (المسار: ${executablePath})`);
  }

  const stat = fs.statSync(executablePath);
  if ((stat.mode & 0o111) === 0) {
    throw new Error(`[Chrome] الملف موجود لكنه غير قابل للتنفيذ (صلاحيات ناقصة): ${executablePath}`);
  }
  console.log(
    `✅ [Chrome] الملف التنفيذي موجود وصالح: ${executablePath} (${Math.round(stat.size / 1024 / 1024)}MB)`
  );

  // نستثني --single-process تحديداً: موصى بها من @sparticuz/chromium أصلاً
  // لبيئات serverless قصيرة العمر (طلب واحد ثم إغلاق)، لكن جلسة واتساب عندنا
  // تبقى تعمل لساعات/أيام — وهذا الخيار معروف بتسببه في تجمّد أو انهيار صامت
  // للصفحة بعد فترة طويلة من الاستخدام (البوت يبدو متصلاً لكن يتوقف عن
  // استقبال الرسائل). كل الخيارات الأخرى الموصى بها تبقى كما هي.
  const args = [...chromium.args.filter((a) => a !== "--single-process"), "--disable-dev-shm-usage"];

  console.log("⏳ [Chrome] تجربة تشغيل فعلية للتأكد قبل تشغيل واتساب...");
  const testBrowser = await puppeteerCore.launch({ executablePath, args, headless: true });
  const version = await testBrowser.version();
  await testBrowser.close();
  console.log(`✅ [Chrome] تم تشغيله فعلياً بنجاح (${version}) — جاهز لواتساب`);

  return { executablePath, args };
}

module.exports = { ensureChromeReady };

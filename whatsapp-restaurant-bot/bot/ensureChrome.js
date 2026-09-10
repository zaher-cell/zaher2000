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
 * @returns {Promise<{executablePath: string, args: string[], headless: boolean|string, defaultViewport: object|null}>}
 * @throws {Error} رسالة واضحة ومحددة إذا تعذر توفير متصفح صالح وقابل للتشغيل فعلياً
 */
async function ensureChromeReady() {
  const fs = require("fs");
  const chromium = require("@sparticuz/chromium").default;
  const puppeteerCore = require("puppeteer-core");

  // يجب ضبط هذا *قبل* قراءة chromium.args أو chromium.executablePath()، لأن
  // القيمتين تعتمدان على وضع الرسوميات. تعطيل GPU إلزامي على سيرفر بدون
  // كرت شاشة (مثل Render) — بدونه قد يحاول Chromium تهيئة GPU process فتفشل
  // بصمت أو يتجمد المتصفح لاحقاً أثناء تحميل صفحة ثقيلة مثل واتساب ويب.
  chromium.setGraphicsMode = false;

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

  const args = [...chromium.args, "--disable-dev-shm-usage"];
  // مهم جداً: @sparticuz/chromium يوزّع نسخة "headless shell" خاصة، ويجب
  // تشغيلها بالوضع الذي بُنيت من أجله (chromium.headless) وليس true/false
  // عادية — القيمة الخاطئة هنا معروفة بأنها تجعل الصفحات الثقيلة (مثل
  // واتساب ويب) تتجمد أو تتعطل بصمت بعد التحميل الأولي بدل أن تفشل بوضوح.
  const headless = chromium.headless;
  const defaultViewport = chromium.defaultViewport;

  console.log("⏳ [Chrome] تجربة تشغيل فعلية للتأكد قبل تشغيل واتساب...");
  const testBrowser = await puppeteerCore.launch({ executablePath, args, headless, defaultViewport });
  const version = await testBrowser.version();
  await testBrowser.close();
  console.log(`✅ [Chrome] تم تشغيله فعلياً بنجاح (${version}) — جاهز لواتساب`);

  return { executablePath, args, headless, defaultViewport };
}

module.exports = { ensureChromeReady };

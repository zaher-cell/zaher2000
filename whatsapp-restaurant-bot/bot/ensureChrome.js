const fs = require("fs");
const chromium = require("@sparticuz/chromium").default;
const puppeteerCore = require("puppeteer-core");

/**
 * يجهز Chrome/Chromium بطريقة موثوقة على Render دون الاعتماد إطلاقاً على تنزيل
 * Puppeteer التلقائي من الإنترنت.
 */
async function ensureChromeReady() {
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

  console.log("⏳ [Chrome] تجربة تشغيل فعلية للتأكد قبل تشغيل واتساب...");
  const testBrowser = await puppeteerCore.launch({
    executablePath,
    args,
    headless: true,
  });

  const version = await testBrowser.version();
  await testBrowser.close();

  console.log(`✅ [Chrome] تم تشغيله فعلياً بنجاح (${version}) — جاهز لواتساب`);

  return { executablePath, args };
}

module.exports = { ensureChromeReady };

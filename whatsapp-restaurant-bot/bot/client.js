const { Client, RemoteAuth } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const qrcode = require("qrcode");
const mongoose = require("mongoose");
const { ensureChromeInstalled } = require("./ensureChrome");

// حالة الاتصال الحالية، تُقرأ من الـ API لعرضها في الـ Dashboard
const state = {
  status: "starting",
  qrDataUrl: null,
  lastMessage: "جاري بدء تشغيل البوت...",
};

let client = null;

/**
 * ينشئ عميل واتساب ويربطه بقاعدة البيانات لحفظ الجلسة (RemoteAuth)
 */
async function createClient() {
  const store = new MongoStore({ mongoose });

  // نتأكد برمجياً من وجود Chrome ونحصل على مساره الفعلي
  let executablePath;
  try {
    // لا نجعل ensureChromeInstalled يوقف التشغيل لأكثر من 60s
    const installPromise = ensureChromeInstalled();
    executablePath = await Promise.race([
      installPromise,
      new Promise((resolve) => setTimeout(() => resolve(undefined), 60 * 1000)),
    ]);

    if (executablePath) {
      try {
        const fs = require("fs");
        fs.accessSync(executablePath, fs.constants.X_OK);
        console.log(`ℹ️ [Chrome] سيتم استخدام المتصفح على: ${executablePath}`);
      } catch (err) {
        console.warn(`⚠️ [Chrome] المسار المُعطى غير قابل للتنفيذ أو غير موجود: ${executablePath} — سنتجاهله`);
        executablePath = undefined;
      }
    } else {
      console.log("ℹ️ [Chrome] لم يُعثر على مسار Chrome أو انتهت مهلة التثبيت — سيحاول puppeteer استخدام المتصفح النظامي أو الإعداد الافتراضي.");
    }
  } catch (err) {
    console.error("❌ [Chrome] فشل التحقق/التثبيت بدون تعطيل السيرفر:", err.message || err);
    executablePath = undefined;
  }

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      backupSyncIntervalMs: 5 * 60 * 1000,
    }),

    puppeteer: {
      headless: true,

      ...(executablePath ? { executablePath } : {}),

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", async (qr) => {
    state.status = "qr";
    state.lastMessage = "امسح رمز QR من صفحة /qr في الداشبورد لربط الواتساب";
    state.qrDataUrl = await qrcode.toDataURL(qr);

    console.log("📱 كود QR جاهز — افتح /qr في المتصفح لمسحه");
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
    state.lastMessage = "تم تسجيل الدخول، جاري تجهيز البوت...";

    console.log("🔐 تم تسجيل الدخول بنجاح");
  });

  client.on("remote_session_saved", () => {
    console.log("💾 تم حفظ جلسة الواتساب في قاعدة البيانات");
  });

  client.on("ready", () => {
    state.status = "ready";
    state.qrDataUrl = null;
    state.lastMessage = "البوت يعمل الآن ومتصل بواتساب ✅";

    console.log("✅ بوت واتساب جاهز ويستقبل الطلبات");
  });

  client.on("disconnected", (reason) => {
    state.status = "disconnected";
    state.lastMessage = `انقطع الاتصال: ${reason}`;

    console.log("⚠️ انقطع اتصال واتساب:", reason);
  });

  client.on("auth_failure", (msg) => {
    state.status = "disconnected";
    state.lastMessage = `فشل تسجيل الدخول: ${msg}`;

    console.log("❌ فشل تسجيل الدخول:", msg);
  });

  return client;
}

function getClient() {
  return client;
}

function getState() {
  return state;
}

module.exports = {
  createClient,
  getClient,
  getState,
};

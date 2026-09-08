const { Client, RemoteAuth } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const qrcode = require("qrcode");
const mongoose = require("mongoose");
const { ensureChromeReady } = require("./ensureChrome");

// حالة الاتصال الحالية، تُقرأ من الـ API لعرضها في الـ Dashboard
const state = {
  status: "starting", // starting | qr | authenticated | ready | disconnected
  qrDataUrl: null,
  lastMessage: "جاري بدء تشغيل البوت...",
};

let client = null;

/**
 * ينشئ عميل واتساب ويربطه بقاعدة البيانات لحفظ الجلسة (RemoteAuth)
 * هذا مهم على Render لأن القرص المحلي يُمسح عند كل إعادة نشر،
 * فحفظ الجلسة في MongoDB يمنعك من مسح كود QR في كل مرة.
 */
async function createClient() {
  // نجهز Chrome ونتحقق أنه يعمل فعلياً *قبل* إنشاء عميل واتساب — لو فشل هذا،
  // نرمي الخطأ فوراً وواضحاً ولا ننشئ عميل واتساب بمسار غير صالح إطلاقاً.
  let executablePath, args;
  try {
    const chrome = await ensureChromeReady();
    executablePath = chrome.executablePath;
    args = chrome.args;
  } catch (err) {
    state.status = "disconnected";
    state.lastMessage = `فشل تجهيز المتصفح: ${err.message}`;
    throw err;
  }

  const store = new MongoStore({ mongoose });

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      backupSyncIntervalMs: 5 * 60 * 1000, // نسخ احتياطي للجلسة كل 5 دقائق
    }),
    puppeteer: {
      headless: true,
      executablePath,
      args,
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

module.exports = { createClient, getClient, getState };

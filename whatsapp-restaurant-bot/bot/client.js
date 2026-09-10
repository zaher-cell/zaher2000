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
  // كود الاقتران (Pairing Code) — طريقة ثانية للربط بجانب QR، عبر رقم الهاتف
  pairingCode: null,
  pairingPhoneNumber: null,
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
  let executablePath, args, headless, defaultViewport;
  try {
    const chrome = await ensureChromeReady();
    executablePath = chrome.executablePath;
    args = chrome.args;
    headless = chrome.headless;
    defaultViewport = chrome.defaultViewport;
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
      headless,
      executablePath,
      args,
      defaultViewport,
    },
  });

  client.on("qr", async (qr) => {
    state.status = "qr";
    state.lastMessage = "امسح رمز QR من صفحة /qr في الداشبورد لربط الواتساب";
    state.qrDataUrl = await qrcode.toDataURL(qr);
    console.log("📱 كود QR جاهز — افتح /qr في المتصفح لمسحه");
  });

  // يصدر عند طلب/تجديد كود الاقتران عبر requestPairingCode — نبقي الحالة متزامنة
  // مع ما يعرضه واتساب فعلياً (بدل الاعتماد فقط على القيمة المُعادة من الطلب).
  client.on("code", (code) => {
    state.pairingCode = code;
    state.status = "qr";
    state.lastMessage = `أدخل الكود ${code} في واتساب: الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف`;
    console.log("🔢 كود الاقتران جاهز:", code);
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
    state.pairingCode = null;
    state.pairingPhoneNumber = null;
    state.lastMessage = "تم تسجيل الدخول، جاري تجهيز البوت...";
    console.log("🔐 تم تسجيل الدخول بنجاح");
  });

  client.on("remote_session_saved", () => {
    console.log("💾 تم حفظ جلسة الواتساب في قاعدة البيانات");
  });

  client.on("ready", () => {
    state.status = "ready";
    state.qrDataUrl = null;
    state.pairingCode = null;
    state.pairingPhoneNumber = null;
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

  // يعرض تقدّم تحميل واجهة واتساب داخل Chromium — مفيد جداً لمعرفة هل توقف
  // التحميل عند نسبة معينة (دليل تجمّد/تعطّل المتصفح) بدل الاختفاء الصامت.
  client.on("loading_screen", (percent, message) => {
    state.lastMessage = `جاري تحميل واتساب... ${percent}% ${message || ""}`.trim();
    console.log(`⏳ [تحميل واتساب] ${percent}% ${message || ""}`);
  });

  // تغييرات الحالة الداخلية لبروتوكول واتساب (مثل CONFLICT أو UNPAIRED) —
  // تسجيلها فقط لأغراض التشخيص، لا تغيّر منطق التطبيق.
  client.on("change_state", (newState) => {
    console.log("🔄 [حالة واتساب الداخلية] تغيّرت إلى:", newState);
  });

  // whatsapp-web.js لا يصدر عادة حدث "error" عاماً، لكن نسجله دفاعياً إن حدث.
  client.on("error", (err) => {
    console.error("❌ [خطأ من عميل واتساب]:", err);
  });

  return client;
}

function getClient() {
  return client;
}

function getState() {
  return state;
}

/**
 * يطلب كود اقتران (Pairing Code) من واتساب فعلياً لرقم هاتف معيّن، كطريقة
 * ثانية للربط بجانب QR. الكود يتولّد ديناميكياً من client.requestPairingCode
 * (وليس كوداً ثابتاً)، ويصلح فقط قبل إتمام تسجيل الدخول.
 * @param {string} phoneNumber رقم الهاتف الدولي بدون + أو مسافات (مثال: 9665xxxxxxxx)
 */
async function requestPairingCode(phoneNumber) {
  if (!client) throw new Error("عميل واتساب غير جاهز بعد، انتظر قليلاً وحاول مجدداً");
  if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber)) {
    throw new Error("رقم الهاتف غير صالح — أدخله بصيغة دولية بدون + أو رموز (مثال: 9665xxxxxxxx)");
  }
  if (state.status === "ready" || state.status === "authenticated") {
    throw new Error("الحساب مرتبط بالفعل بواتساب");
  }

  const code = await client.requestPairingCode(phoneNumber);
  state.pairingCode = code;
  state.pairingPhoneNumber = phoneNumber;
  state.status = "qr";
  state.lastMessage = `أدخل الكود ${code} في واتساب: الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف`;
  return code;
}

/** يلغي طلب كود الاقتران الحالي إن كان مدعوماً في هذا الإصدار. */
async function cancelPairingCode() {
  if (!client) throw new Error("عميل واتساب غير جاهز بعد");
  if (typeof client.cancelPairingCode === "function") {
    await client.cancelPairingCode();
  }
  state.pairingCode = null;
  state.pairingPhoneNumber = null;
}

module.exports = { createClient, getClient, getState, requestPairingCode, cancelPairingCode };
